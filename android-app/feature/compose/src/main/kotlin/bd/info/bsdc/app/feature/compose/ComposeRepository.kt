package bd.info.bsdc.app.feature.compose

import bd.info.bsdc.app.core.database.BsdcDatabase
import bd.info.bsdc.app.core.database.PendingDraftEntity
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.PostKind
import bd.info.bsdc.app.core.network.BsdcHttpClientFactory
import bd.info.bsdc.app.core.network.SupabaseApiException
import bd.info.bsdc.app.core.network.SupabaseRestClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant

@Serializable
private data class TagRowDto(
    val slug: String = "",
    @SerialName("name_en") val nameEn: String = "",
    @SerialName("name_bn") val nameBn: String = "",
    @SerialName("posts_count") val postsCount: Int = 0,
)

@Serializable
private data class StoredPollOptionDto(
    val position: Int = 0,
    val label: String = "",
    val votes: Int = 0,
)

@Serializable
private data class PostSavedDto(
    val id: String = "",
    val slug: String = "",
    @SerialName("published_at") val publishedAt: String? = null,
)

@Serializable
private data class SlugResponseDto(val slug: String = "")

@Serializable
private data class ProjectSavedDto(val id: String = "", val slug: String = "")

@Serializable
private data class PersistedMediaSnippet(
    val mediaId: String,
    val url: String,
    val thumbUrl: String,
    val altText: String,
)

class ComposeRepository(
    private val supabase: SupabaseRestClient,
    private val database: BsdcDatabase,
) {
    private val json = BsdcHttpClientFactory.sharedJson

    fun observeLocalDrafts(): Flow<List<PendingDraftEntity>> =
        database.pendingDraftDao().observeAll()

    suspend fun saveLocalDraft(draft: PostComposerDraft) = withContext(Dispatchers.IO) {
        val persistedMedia = draft.media.filter { it.isReady }.map {
            PersistedMediaSnippet(it.mediaId, it.url, it.thumbUrl, it.altText)
        }
        database.pendingDraftDao().upsert(
            PendingDraftEntity(
                localId = draft.localDraftId,
                remotePostId = draft.remotePostId,
                kind = draft.kind.name,
                title = draft.title,
                bodyMarkdown = draft.body,
                code = draft.code,
                codeLanguage = draft.codeLanguage,
                language = draft.language.tag,
                tagsJson = json.encodeToString(draft.tags),
                uploadedMediaJson = json.encodeToString(persistedMedia),
                pollOptionsJson = json.encodeToString(draft.pollOptions),
                updatedAtEpochMs = System.currentTimeMillis(),
            ),
        )
    }

    suspend fun deleteLocalDraft(localId: String) = withContext(Dispatchers.IO) {
        database.pendingDraftDao().remove(localId)
    }

    fun restoreFromEntity(entity: PendingDraftEntity): PostComposerDraft {
        val kind = runCatching { PostKind.valueOf(entity.kind) }.getOrDefault(PostKind.POST)
        val tags = runCatching { json.decodeFromString<List<String>>(entity.tagsJson) }.getOrDefault(emptyList())
        val pollOptions = runCatching { json.decodeFromString<List<String>>(entity.pollOptionsJson) }
            .getOrDefault(listOf("", ""))
        val media = runCatching { json.decodeFromString<List<PersistedMediaSnippet>>(entity.uploadedMediaJson) }
            .getOrDefault(emptyList())
            .map {
                ComposerMediaAttachment(
                    mediaId = it.mediaId,
                    url = it.url,
                    thumbUrl = it.thumbUrl,
                    altText = it.altText,
                    progressPct = 100,
                    stage = AttachmentUploadStage.READY,
                )
            }
        return PostComposerDraft(
            localDraftId = entity.localId,
            remotePostId = entity.remotePostId,
            kind = kind,
            language = if (entity.language == "en") AppLanguage.EN else AppLanguage.BN,
            title = entity.title,
            body = entity.bodyMarkdown,
            code = entity.code,
            codeLanguage = entity.codeLanguage,
            tags = tags,
            pollOptions = if (pollOptions.size >= 2) pollOptions else listOf("", ""),
            media = media,
        )
    }

    suspend fun fetchCuratedTags(limit: Int = 50): List<CuratedTagItem> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.getJsonText(
                table = "tags",
                queryPairs = listOf(
                    "select" to "slug,name_en,name_bn,posts_count",
                    "order" to "posts_count.desc",
                    "limit" to limit.toString(),
                ),
                requireAuth = false,
            )
            json.decodeFromString<List<TagRowDto>>(raw).map {
                CuratedTagItem(it.slug, it.nameEn.ifBlank { it.slug }, it.nameBn, it.postsCount)
            }
        }.getOrDefault(emptyList())
    }

    /**
     * Saves a post — the row, its tags, its pictures, its mentions and its poll —
     * in one call, in one transaction (0123).
     *
     * This used to be up to nine requests: the post, then each of the four
     * attachments. A save that failed at the fourth one left the post published
     * without the picture, without the tags and without the mention notification,
     * while the member was shown an error for a post that existed. The function
     * is that same write in one statement, so a save either happened or did not.
     *
     * The author is the signed-in member (`bsdc.current_uid()` inside the
     * function), never a parameter this app chooses.
     */
    suspend fun savePost(
        draft: PostComposerDraft,
        publish: Boolean,
    ): PublishedResult = withContext(Dispatchers.IO) {
        require(draft.media.all { it.isReady }) {
            "media.errors.recordFailed"
        }

        val cleanTitle = draft.title.trim()
        val cleanBody = draft.body.trim()
        val kindWire = draft.kind.name.lowercase()
        val fallbackSlug = if (draft.kind == PostKind.SNIPPET) "snippet" else kindWire
        val slugBase = if (cleanTitle.isNotEmpty()) cleanTitle else ComposerValidationEngine.toExcerpt(cleanBody, 48)
        val generatedSlug = ComposerValidationEngine.uniqueSlug(slugBase, fallbackSlug)
        val excerpt = ComposerValidationEngine.toExcerpt(if (cleanBody.isNotEmpty()) cleanBody else cleanTitle, 180)
        val readingTime = ComposerValidationEngine.readingTimeMinutes("$cleanTitle $cleanBody ${draft.code}")

        // Decided before anything is written, so a poll somebody voted on is
        // refused with a sentence rather than by a constraint. The database
        // refuses the delete as well, for every other client.
        val pollPlan = if (draft.kind == PostKind.POLL) {
            PollOptionsLogic.decide(readPollOptions(draft.remotePostId), draft.pollOptions)
        } else {
            null
        }

        val tagSlugs = draft.tags
            .map { ComposerValidationEngine.normalizeTag(it) }
            .filter { it.length >= 2 }
            .distinct()
        val readyMedia = draft.media.filter { it.isReady }

        val payload = buildJsonObject {
            put("p_id", draft.remotePostId)
            put("p_slug", generatedSlug)
            put(
                "p_post",
                buildJsonObject {
                    put("kind", kindWire)
                    put("status", if (publish) "published" else "draft")
                    put("visibility", draft.visibility)
                    put("title", cleanTitle)
                    put("body", cleanBody)
                    put("excerpt", excerpt)
                    put("cover_url", draft.coverUrl)
                    put("language", draft.language.tag)
                    put("code", draft.code)
                    put("code_language", if (draft.kind == PostKind.SNIPPET) draft.codeLanguage else "")
                    put("reading_time", readingTime)
                    put("is_sensitive", draft.isSensitive)
                    put("allow_comments", draft.allowComments)
                },
            )
            put("p_tags", buildJsonArray { tagSlugs.forEach { add(it) } })
            put(
                "p_media",
                buildJsonArray {
                    readyMedia.forEachIndexed { idx, item ->
                        add(
                            buildJsonObject {
                                put("media_id", item.mediaId)
                                put("position", idx)
                                put("alt_text", item.altText.trim())
                            },
                        )
                    }
                },
            )
            put(
                "p_mentions",
                buildJsonArray {
                    ComposerValidationEngine.extractMentions(cleanBody).forEach { add(it) }
                },
            )
            when (pollPlan) {
                // No poll, or the poll is exactly what is stored: leave it alone.
                null, PollWrite.Unchanged -> put("p_poll", JsonNull)
                PollWrite.Locked -> throw PollOptionsLockedException()
                is PollWrite.Replace -> put(
                    "p_poll",
                    buildJsonArray { pollPlan.labels.forEach { add(it) } },
                )
            }
        }

        val saved = json.decodeFromString<PostSavedDto>(
            supabase.rpcText("save_post", payload, requireAuth = true),
        )
        if (saved.id.isBlank()) throw SupabaseApiException(500, null, "data/insert-failed")

        database.pendingDraftDao().remove(draft.localDraftId)
        if (publish) {
            supabase.wakePushDelivery("post-published")
        }
        PublishedResult(id = saved.id, slug = saved.slug)
    }

    /** The poll options the post already carries, with their ballots. */
    private suspend fun readPollOptions(postId: String?): List<StoredPollOption> {
        if (postId.isNullOrBlank()) return emptyList()

        val raw = runCatching {
            supabase.getJsonText(
                table = "poll_options",
                queryPairs = listOf(
                    "select" to "position,label,votes",
                    "post_id" to "eq.$postId",
                ),
                requireAuth = true,
            )
        }.getOrElse { return emptyList() }

        return runCatching {
            json.decodeFromString<List<StoredPollOptionDto>>(raw).map {
                StoredPollOption(position = it.position, label = it.label, votes = it.votes)
            }
        }.getOrDefault(emptyList())
    }

    suspend fun createEvent(hostUid: String, draft: EventDraftInput): String = withContext(Dispatchers.IO) {
        val raw = supabase.postJson(
            table = "events",
            body = buildJsonObject {
                put("slug", ComposerValidationEngine.uniqueSlug(draft.title, "event"))
                put("title", draft.title.trim())
                put("description", draft.description.trim())
                put("mode", draft.mode)
                put("venue", draft.venue.trim())
                put("city", draft.city.trim())
                put("join_url", draft.joinUrl.trim())
                put("cover_url", draft.coverUrl.trim())
                put("starts_at", draft.startsAtIso.trim())
                put("ends_at", draft.endsAtIso.trim())
                put("timezone", "Asia/Dhaka")
                val cap = draft.capacityText.trim().toIntOrNull()
                if (cap != null) put("capacity", cap) else put("capacity", JsonNull)
                put("host_uid", hostUid)
                put("group_id", JsonNull)
            },
            queryPairs = listOf("select" to "slug"),
            prefer = "return=representation",
            requireAuth = true,
        )
        supabase.wakePushDelivery("event-created")
        json.decodeFromString<List<SlugResponseDto>>(raw).firstOrNull()?.slug.orEmpty()
    }

    suspend fun createJob(posterUid: String, draft: JobDraftInput): String = withContext(Dispatchers.IO) {
        val skills = parseCommaList(draft.skillsText)
        val raw = supabase.postJson(
            table = "jobs",
            body = buildJsonObject {
                put("slug", ComposerValidationEngine.uniqueSlug("${draft.company}-${draft.title}", "job"))
                put("title", draft.title.trim())
                put("company", draft.company.trim())
                put("description", draft.description.trim())
                put("job_type", draft.jobType)
                put("work_mode", draft.workMode)
                put("level", draft.level)
                put("city", draft.city.trim())
                put("country", "BD")
                val min = draft.salaryMinText.trim().toIntOrNull()
                val max = draft.salaryMaxText.trim().toIntOrNull()
                if (min != null) put("salary_min", min) else put("salary_min", JsonNull)
                if (max != null) put("salary_max", max) else put("salary_max", JsonNull)
                put("salary_currency", "BDT")
                put("salary_period", draft.salaryPeriod)
                put("skills", json.parseToJsonElement(json.encodeToString(skills)))
                put("apply_url", draft.applyUrl.trim())
                put("status", "open")
                put("poster_uid", posterUid)
                put("published_at", Instant.now().toString())
            },
            queryPairs = listOf("select" to "slug"),
            prefer = "return=representation",
            requireAuth = true,
        )
        supabase.wakePushDelivery("job-created")
        json.decodeFromString<List<SlugResponseDto>>(raw).firstOrNull()?.slug.orEmpty()
    }

    suspend fun createGig(clientUid: String, draft: GigDraftInput): String = withContext(Dispatchers.IO) {
        val skills = parseCommaList(draft.skillsText)
        val raw = supabase.postJson(
            table = "gigs",
            body = buildJsonObject {
                put("slug", ComposerValidationEngine.uniqueSlug(draft.title, "gig"))
                put("title", draft.title.trim())
                put("description", draft.description.trim())
                val min = draft.budgetMinText.trim().toIntOrNull()
                val max = draft.budgetMaxText.trim().toIntOrNull()
                val days = draft.durationDaysText.trim().toIntOrNull()
                if (min != null) put("budget_min", min) else put("budget_min", JsonNull)
                if (max != null) put("budget_max", max) else put("budget_max", JsonNull)
                put("currency", "BDT")
                put("is_hourly", draft.isHourly)
                if (days != null) put("duration_days", days) else put("duration_days", JsonNull)
                put("skills", json.parseToJsonElement(json.encodeToString(skills)))
                put("status", "open")
                put("client_uid", clientUid)
                put("published_at", Instant.now().toString())
            },
            queryPairs = listOf("select" to "slug"),
            prefer = "return=representation",
            requireAuth = true,
        )
        supabase.wakePushDelivery("gig-created")
        json.decodeFromString<List<SlugResponseDto>>(raw).firstOrNull()?.slug.orEmpty()
    }

    suspend fun createProjectWithScreenshots(
        ownerUid: String,
        draft: ProjectDraftInput,
        screenshots: List<ComposerMediaAttachment>,
    ): String = withContext(Dispatchers.IO) {
        val tech = parseCommaList(draft.techText)
        val raw = supabase.postJson(
            table = "projects",
            body = buildJsonObject {
                put("slug", ComposerValidationEngine.uniqueSlug(draft.name, "project"))
                put("name", draft.name.trim())
                put("tagline", draft.tagline.trim())
                put("description", draft.description.trim())
                put("repo_url", draft.repoUrl.trim())
                put("demo_url", draft.demoUrl.trim())
                put("cover_url", draft.coverUrl.trim())
                put("tech", json.parseToJsonElement(json.encodeToString(tech)))
                put("license", draft.license.trim())
                put("looking_for_contributors", draft.lookingForContributors)
                put("owner_uid", ownerUid)
            },
            queryPairs = listOf("select" to "id,slug"),
            prefer = "return=representation",
            requireAuth = true,
        )
        val created = json.decodeFromString<List<ProjectSavedDto>>(raw).first()
        val readyShots = screenshots.filter { it.isReady }
        if (readyShots.isNotEmpty() && created.id.isNotBlank()) {
            runCatching {
                val payload = buildJsonArray {
                    readyShots.forEachIndexed { idx, shot ->
                        add(
                            buildJsonObject {
                                put("project_id", created.id)
                                put("media_id", shot.mediaId)
                                put("position", idx)
                                put("alt_text", shot.altText.trim())
                            },
                        )
                    }
                }
                supabase.postJson("project_media", payload, prefer = "return=minimal", requireAuth = true)
            }
        }
        supabase.wakePushDelivery("project-created")
        created.slug
    }

    suspend fun createGroupListing(draft: GroupDraftInput): String = withContext(Dispatchers.IO) {
        val slug = draft.slug.trim().lowercase()
        supabase.rpcText(
            "create_group",
            buildJsonObject {
                put("p_slug", slug)
                put("p_name", draft.name.trim())
                put("p_description", draft.description.trim())
                put("p_privacy", draft.privacy)
                put("p_language", draft.language)
            },
            requireAuth = true,
        )
        supabase.wakePushDelivery("group-created")
        slug
    }

    private fun parseCommaList(raw: String): List<String> =
        raw.split(",").map { it.trim() }.filter { it.isNotEmpty() }.distinct().take(20)
}
