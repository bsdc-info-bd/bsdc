package bd.info.bsdc.app.feature.compose

import bd.info.bsdc.app.core.database.BsdcDatabase
import bd.info.bsdc.app.core.database.PendingDraftEntity
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.PostKind
import bd.info.bsdc.app.core.network.BsdcHttpClientFactory
import bd.info.bsdc.app.core.network.SupabaseRestClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonNull
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
private data class TagSlugDto(val slug: String = "")

@Serializable
private data class ProfileUidDto(val uid: String = "")

@Serializable
private data class PostSavedDto(
    val id: String = "",
    val slug: String = "",
    @SerialName("published_at") val publishedAt: String? = null,
)

@Serializable
private data class ExistingPublishedAtDto(
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

    suspend fun savePost(
        authorUid: String,
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
        val statusWire = if (publish) "published" else "draft"

        var postId = draft.remotePostId
        var postSlug = generatedSlug

        if (!postId.isNullOrBlank()) {
            val existingRaw = runCatching {
                supabase.getJsonText(
                    table = "posts",
                    queryPairs = listOf("select" to "published_at", "id" to "eq.$postId", "limit" to "1"),
                    requireAuth = true,
                )
            }.getOrDefault("[]")
            val existingPub = runCatching {
                json.decodeFromString<List<ExistingPublishedAtDto>>(existingRaw).firstOrNull()?.publishedAt
            }.getOrNull()

            val updatePayload = buildJsonObject {
                put("kind", kindWire)
                put("status", statusWire)
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
                if (publish) {
                    put("published_at", existingPub ?: Instant.now().toString())
                } else {
                    put("published_at", JsonNull)
                }
            }

            val updatedRaw = supabase.patchJson(
                table = "posts",
                body = updatePayload,
                queryPairs = listOf("id" to "eq.$postId", "select" to "id,slug"),
                prefer = "return=representation",
            )
            val saved = json.decodeFromString<List<PostSavedDto>>(updatedRaw).first()
            postSlug = saved.slug
        } else {
            val insertPayload = buildJsonObject {
                put("author_uid", authorUid)
                put("slug", generatedSlug)
                put("kind", kindWire)
                put("status", statusWire)
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
                if (publish) put("published_at", Instant.now().toString()) else put("published_at", JsonNull)
            }

            val insertedRaw = supabase.postJson(
                table = "posts",
                body = insertPayload,
                queryPairs = listOf("select" to "id,slug"),
                prefer = "return=representation",
                requireAuth = true,
            )
            val saved = json.decodeFromString<List<PostSavedDto>>(insertedRaw).first()
            postId = saved.id
            postSlug = saved.slug
        }

        val resolvedPostId = requireNotNull(postId)
        syncTags(resolvedPostId, draft.tags)
        syncMedia(resolvedPostId, draft.media)
        syncMentions(resolvedPostId, cleanBody)
        if (draft.kind == PostKind.POLL) {
            syncPollOptions(resolvedPostId, draft.pollOptions)
        }
        database.pendingDraftDao().remove(draft.localDraftId)
        if (publish) {
            supabase.wakePushDelivery("post-published")
        }
        PublishedResult(id = resolvedPostId, slug = postSlug)
    }

    private suspend fun syncTags(postId: String, tags: List<String>) {
        supabase.deleteRows("post_tags", listOf("post_id" to "eq.$postId"))
        val slugs = tags.map { ComposerValidationEngine.normalizeTag(it) }.filter { it.length >= 2 }.distinct()
        if (slugs.isEmpty()) return

        val inClause = slugs.joinToString(",", prefix = "(", postfix = ")")
        val knownRaw = supabase.getJsonText(
            table = "tags",
            queryPairs = listOf("select" to "slug", "slug" to "in.$inClause"),
            requireAuth = false,
        )
        val knownSlugs = json.decodeFromString<List<TagSlugDto>>(knownRaw).map { it.slug }
        if (knownSlugs.isEmpty()) return

        val body = buildJsonArray {
            knownSlugs.forEach { slug ->
                add(
                    buildJsonObject {
                        put("post_id", postId)
                        put("tag_slug", slug)
                    },
                )
            }
        }
        supabase.postJson("post_tags", body, prefer = "return=minimal", requireAuth = true)
    }

    private suspend fun syncMedia(postId: String, media: List<ComposerMediaAttachment>) {
        supabase.deleteRows("post_media", listOf("post_id" to "eq.$postId"))
        val ready = media.filter { it.isReady }
        if (ready.isEmpty()) return

        val body = buildJsonArray {
            ready.forEachIndexed { idx, item ->
                add(
                    buildJsonObject {
                        put("post_id", postId)
                        put("media_id", item.mediaId)
                        put("position", idx)
                        put("alt_text", item.altText.trim())
                    },
                )
            }
        }
        supabase.postJson("post_media", body, prefer = "return=minimal", requireAuth = true)
    }

    private suspend fun syncMentions(postId: String, bodyText: String) {
        supabase.deleteRows("post_mentions", listOf("post_id" to "eq.$postId"))
        val handles = ComposerValidationEngine.extractMentions(bodyText)
        if (handles.isEmpty()) return

        val inClause = handles.joinToString(",", prefix = "(", postfix = ")")
        val raw = supabase.getJsonText(
            table = "profiles",
            queryPairs = listOf("select" to "uid", "username" to "in.$inClause"),
            requireAuth = false,
        )
        val uids = json.decodeFromString<List<ProfileUidDto>>(raw).map { it.uid }.filter { it.isNotBlank() }
        if (uids.isEmpty()) return

        val payload = buildJsonArray {
            uids.forEach { uid ->
                add(
                    buildJsonObject {
                        put("post_id", postId)
                        put("mentioned_uid", uid)
                    },
                )
            }
        }
        supabase.postJson("post_mentions", payload, prefer = "return=minimal", requireAuth = true)
    }

    private suspend fun syncPollOptions(postId: String, options: List<String>) {
        supabase.deleteRows("poll_options", listOf("post_id" to "eq.$postId"))
        val labels = options.map { it.trim() }.filter { it.isNotEmpty() }
        if (labels.isEmpty()) return

        val body = buildJsonArray {
            labels.forEachIndexed { idx, label ->
                add(
                    buildJsonObject {
                        put("post_id", postId)
                        put("position", idx)
                        put("label", label)
                    },
                )
            }
        }
        supabase.postJson("poll_options", body, prefer = "return=minimal", requireAuth = true)
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
