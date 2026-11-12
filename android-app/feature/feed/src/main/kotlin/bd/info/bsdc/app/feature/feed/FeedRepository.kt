package bd.info.bsdc.app.feature.feed

import bd.info.bsdc.app.core.database.BookmarkEntity
import bd.info.bsdc.app.core.database.BsdcDatabase
import bd.info.bsdc.app.core.database.BsdcDatabaseMappers
import bd.info.bsdc.app.core.media.ImgbbUrlAllowlist
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.FeedPost
import bd.info.bsdc.app.core.model.PollOptionModel
import bd.info.bsdc.app.core.model.PostAuthorSummary
import bd.info.bsdc.app.core.model.PostKind
import bd.info.bsdc.app.core.model.PostMediaModel
import bd.info.bsdc.app.core.model.ReactionKind
import bd.info.bsdc.app.core.network.BsdcHttpClientFactory
import bd.info.bsdc.app.core.network.SupabaseRestClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant

@Serializable
private data class CandidateRpcRow(
    @SerialName("post_id") val postId: String = "",
    @SerialName("author_uid") val authorUid: String = "",
    @SerialName("published_at") val publishedAt: String? = null,
    @SerialName("likes_count") val likesCount: Int = 0,
    @SerialName("comments_count") val commentsCount: Int = 0,
    @SerialName("views_count") val viewsCount: Int = 0,
    val language: String = "bn",
    @SerialName("is_sensitive") val isSensitive: Boolean = false,
    val kind: String = "post",
    @SerialName("author_followed") val authorFollowed: Boolean = false,
    val affinity: Double = 0.0,
    @SerialName("already_seen") val alreadySeen: Boolean = false,
    val tags: List<String> = emptyList(),
)

@Serializable
private data class AuthorJoinDto(
    val uid: String = "",
    val username: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
)

@Serializable
private data class TagJoinDto(@SerialName("tag_slug") val tagSlug: String = "")

@Serializable
private data class PollOptDto(
    val id: String = "",
    val label: String = "",
    val votes: Int = 0,
    val position: Int = 0,
)

@Serializable
private data class MediaSnippetDto(
    val url: String = "",
    @SerialName("thumb_url") val thumbUrl: String = "",
    val width: Int? = null,
    val height: Int? = null,
)

@Serializable
private data class PostMediaDto(
    @SerialName("media_id") val mediaId: String = "",
    val position: Int = 0,
    @SerialName("alt_text") val altText: String = "",
    @SerialName("media_assets") val mediaAssets: MediaSnippetDto? = null,
)

@Serializable
private data class PostJoinedDto(
    val id: String = "",
    val slug: String = "",
    val kind: String = "post",
    val title: String = "",
    val body: String = "",
    val excerpt: String = "",
    @SerialName("cover_url") val coverUrl: String = "",
    val code: String = "",
    @SerialName("code_language") val codeLanguage: String = "",
    val language: String = "bn",
    @SerialName("reading_time") val readingTime: Int = 1,
    @SerialName("views_count") val viewsCount: Int = 0,
    @SerialName("likes_count") val likesCount: Int = 0,
    @SerialName("comments_count") val commentsCount: Int = 0,
    @SerialName("is_sensitive") val isSensitive: Boolean = false,
    @SerialName("allow_comments") val allowComments: Boolean = true,
    @SerialName("published_at") val publishedAt: String? = null,
    @SerialName("created_at") val createdAt: String = "",
    val profiles: AuthorJoinDto? = null,
    @SerialName("post_tags") val postTags: List<TagJoinDto>? = null,
    @SerialName("poll_options") val pollOptions: List<PollOptDto>? = null,
    @SerialName("post_media") val postMedia: List<PostMediaDto>? = null,
)

@Serializable
private data class InteractionStateDto(
    @SerialName("post_id") val postId: String = "",
    val reaction: String? = null,
    val bookmarked: Boolean = false,
)

@Serializable
private data class ToggleReactionDto(
    val reacted: Boolean = false,
    val reaction: String = "like",
    val total: Int = 0,
)

@Serializable
private data class CommentJoinedDto(
    val id: String = "",
    @SerialName("post_id") val postId: String = "",
    @SerialName("parent_id") val parentId: String? = null,
    val depth: Int = 0,
    val body: String = "",
    @SerialName("likes_count") val likesCount: Int = 0,
    @SerialName("replies_count") val repliesCount: Int = 0,
    @SerialName("is_answer") val isAnswer: Boolean = false,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("edited_at") val editedAt: String? = null,
    val profiles: AuthorJoinDto? = null,
)

@Serializable
private data class CommentLikeRowDto(@SerialName("comment_id") val commentId: String = "")

@Serializable
private data class ToggleCommentReactionDto(
    val reacted: Boolean = false,
    val total: Int = 0,
)

@Serializable
private data class TrashDto(
    val kind: String = "post",
    val id: String = "",
    @SerialName("post_id") val postId: String = "",
    val title: String? = null,
    val preview: String? = null,
    @SerialName("deleted_at") val deletedAt: String = "",
    @SerialName("expires_at") val expiresAt: String = "",
    val restorable: Boolean = false,
    val moderated: Boolean = false,
)

class FeedRepository(
    private val supabase: SupabaseRestClient,
    private val database: BsdcDatabase,
) {
    private val json = BsdcHttpClientFactory.sharedJson

    companion object {
        private const val POST_SELECT =
            "*,profiles:author_uid(uid,username,display_name,avatar_url),post_tags(tag_slug),poll_options(id,label,votes,position),post_media(media_id,position,alt_text,media_assets(url,thumb_url,width,height))"
        private const val COMMENT_SELECT =
            "id,post_id,author_uid,parent_id,root_id,depth,body,status,likes_count,replies_count,is_answer,edited_at,created_at,updated_at,profiles:author_uid(uid,username,display_name,avatar_url)"
    }

    suspend fun loadFeed(
        tab: FeedTab,
        viewerUid: String?,
        hideSeen: Boolean = false,
    ): FeedLoadBundle = withContext(Dispatchers.IO) {
        val cacheKey = tab.name.lowercase()
        val remoteAttempt = runCatching {
            when (tab) {
                FeedTab.FOR_YOU, FeedTab.FOLLOWING, FeedTab.LATEST -> {
                    val algorithm = when (tab) {
                        FeedTab.FOR_YOU -> "ranked"
                        FeedTab.FOLLOWING -> "following"
                        else -> "latest"
                    }
                    val candidatesRaw = supabase.rpcText(
                        "feed_candidates",
                        buildJsonObject {
                            put("p_limit", 45)
                            put("p_before", JsonNull)
                        },
                        requireAuth = false,
                    )
                    val candidates = json.decodeFromString<List<CandidateRpcRow>>(candidatesRaw)
                        .map { row ->
                            FeedRankingEngine.Candidate(
                                row.postId,
                                row.authorUid,
                                row.publishedAt.orEmpty(),
                                row.likesCount,
                                row.commentsCount,
                                row.viewsCount,
                                row.language,
                                row.isSensitive,
                                row.kind,
                                row.authorFollowed,
                                row.affinity,
                                row.alreadySeen,
                                row.tags,
                            )
                        }
                    val prefs = FeedRankingEngine.Preferences(
                        algorithm,
                        listOf("bn", "en"),
                        emptyList(),
                        false,
                        hideSeen,
                    )
                    var outcome = FeedRankingEngine.rankFeed(
                        candidates,
                        prefs,
                        viewerUid,
                        System.currentTimeMillis(),
                    )
                    if (outcome.ranked.isEmpty() && outcome.emptyReason == FeedRankingEngine.EmptyReason.ALL_SEEN) {
                        val fallbackPrefs = FeedRankingEngine.Preferences(
                            algorithm,
                            listOf("bn", "en"),
                            emptyList(),
                            false,
                            false,
                        )
                        outcome = FeedRankingEngine.rankFeed(
                            candidates,
                            fallbackPrefs,
                            viewerUid,
                            System.currentTimeMillis(),
                        )
                    }
                    val orderedIds = outcome.ranked.map { it.candidate.postId }
                    val reasonsMap = outcome.ranked.associate { it.candidate.postId to it.reasons.toList() }
                    val hydrated = hydratePostsByIds(orderedIds)
                    Triple(hydrated, reasonsMap, outcome.emptyReason)
                }

                FeedTab.QUESTIONS, FeedTab.POLLS, FeedTab.SNIPPETS -> {
                    val kindFilter = when (tab) {
                        FeedTab.QUESTIONS -> "question"
                        FeedTab.POLLS -> "poll"
                        FeedTab.SNIPPETS -> "snippet"
                        else -> "post"
                    }
                    val raw = supabase.getJsonText(
                        table = "posts",
                        queryPairs = listOf(
                            "select" to POST_SELECT,
                            "status" to "eq.published",
                            "deleted_at" to "is.null",
                            "kind" to "eq.$kindFilter",
                            "order" to "published_at.desc.nullslast",
                            "limit" to "35",
                        ),
                        requireAuth = false,
                    )
                    val posts = decodeJoinedPosts(raw)
                    Triple(posts, emptyMap(), FeedRankingEngine.EmptyReason.NONE)
                }
            }
        }

        remoteAttempt.onSuccess { (posts, reasons, emptyReason) ->
            val now = System.currentTimeMillis()
            val entities = posts.mapIndexed { idx, post ->
                BsdcDatabaseMappers.toEntity(post, cacheKey, idx, now)
            }
            database.postDao().clearAlgorithm(cacheKey)
            if (entities.isNotEmpty()) {
                database.postDao().upsertAll(entities)
            }
            val interactions = if (viewerUid != null && posts.isNotEmpty()) {
                fetchInteractionState(posts.map { it.id })
            } else {
                emptyMap()
            }
            return@withContext FeedLoadBundle(
                posts = posts,
                interactions = interactions,
                reasonsByPostId = reasons,
                isFromOfflineCache = false,
                emptyReason = emptyReason,
            )
        }

        // Offline fallback from Room cache
        val cached = database.postDao().listFeed(cacheKey, 45)
            .ifEmpty { database.postDao().listFeed("latest", 45) }
            .map { BsdcDatabaseMappers.toDomain(it) }
        val filteredCached = when (tab) {
            FeedTab.QUESTIONS -> cached.filter { it.kind == PostKind.QUESTION }
            FeedTab.POLLS -> cached.filter { it.kind == PostKind.POLL }
            FeedTab.SNIPPETS -> cached.filter { it.kind == PostKind.SNIPPET }
            else -> cached
        }
        FeedLoadBundle(
            posts = filteredCached,
            interactions = emptyMap(),
            reasonsByPostId = emptyMap(),
            isFromOfflineCache = true,
        )
    }

    suspend fun hydratePostsByIds(ids: List<String>): List<FeedPost> {
        if (ids.isEmpty()) return emptyList()
        val inClause = ids.joinToString(",", prefix = "(", postfix = ")")
        val raw = supabase.getJsonText(
            table = "posts",
            queryPairs = listOf(
                "select" to POST_SELECT,
                "id" to "in.$inClause",
            ),
            requireAuth = false,
        )
        val posts = decodeJoinedPosts(raw)
        val order = ids.withIndex().associate { it.value to it.index }
        return posts.sortedBy { order[it.id] ?: Int.MAX_VALUE }
    }

    suspend fun fetchPostBySlugOrId(slugOrId: String): FeedPost? = withContext(Dispatchers.IO) {
        val clean = slugOrId.trim().removePrefix("/p/").trim()
        if (clean.isEmpty()) return@withContext null

        val isUuid = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
            .matches(clean)

        val remote = runCatching {
            val raw = supabase.getJsonText(
                table = "posts",
                queryPairs = listOf(
                    "select" to POST_SELECT,
                    (if (isUuid) "id" else "slug") to "eq.$clean",
                    "deleted_at" to "is.null",
                    "limit" to "1",
                ),
                requireAuth = false,
            )
            decodeJoinedPosts(raw).firstOrNull()
        }.getOrNull()

        if (remote != null) {
            runCatching {
                supabase.rpcText("increment_post_view", buildJsonObject { put("p_post_id", remote.id) }, requireAuth = false)
            }
            return@withContext remote
        }

        database.postDao().findById(clean)?.let { BsdcDatabaseMappers.toDomain(it) }
    }

    suspend fun fetchNewPostCount(sinceIso: String): Int = withContext(Dispatchers.IO) {
        if (sinceIso.isBlank()) return@withContext 0
        runCatching {
            val raw = supabase.rpcText(
                "feed_new_count",
                buildJsonObject { put("p_since", sinceIso) },
                requireAuth = false,
            )
            raw.trim().toIntOrNull() ?: 0
        }.getOrDefault(0)
    }

    suspend fun fetchInteractionState(postIds: List<String>): Map<String, PostInteractionState> {
        if (postIds.isEmpty()) return emptyMap()
        return runCatching {
            val raw = supabase.rpcText(
                "post_interaction_state",
                buildJsonObject {
                    put("p_post_ids", buildJsonArray { postIds.forEach { add(JsonPrimitive(it)) } })
                },
                requireAuth = true,
            )
            val rows = json.decodeFromString<List<InteractionStateDto>>(raw)
            rows.associate { row ->
                val kind = ReactionKind.entries.firstOrNull {
                    it.wireName.equals(row.reaction, ignoreCase = true)
                }
                row.postId to PostInteractionState(reaction = kind, bookmarked = row.bookmarked)
            }
        }.getOrDefault(emptyMap())
    }

    suspend fun toggleReaction(postId: String, reaction: ReactionKind): Triple<Boolean, ReactionKind, Int> =
        withContext(Dispatchers.IO) {
            val raw = supabase.rpcText(
                "toggle_reaction",
                buildJsonObject {
                    put("p_post_id", postId)
                    put("p_reaction", reaction.wireName)
                },
                requireAuth = true,
            )
            val row = json.decodeFromString<List<ToggleReactionDto>>(raw).firstOrNull()
            val kind = ReactionKind.entries.firstOrNull {
                it.wireName.equals(row?.reaction, ignoreCase = true)
            } ?: reaction
            if (row?.reacted == true) supabase.wakePushDelivery("reaction")
            Triple(row?.reacted == true, kind, row?.total ?: 0)
        }

    suspend fun toggleBookmark(post: FeedPost): Boolean = withContext(Dispatchers.IO) {
        val raw = supabase.rpcText(
            "toggle_bookmark",
            buildJsonObject { put("p_post_id", post.id) },
            requireAuth = true,
        )
        val bookmarked = raw.trim().equals("true", ignoreCase = true)
        if (bookmarked) {
            supabase.wakePushDelivery("bookmark")
            database.bookmarkDao().upsert(
                BookmarkEntity(
                    postId = post.id,
                    slug = post.slug,
                    title = post.title,
                    excerpt = post.excerpt,
                    bodyMarkdown = post.body,
                    coverUrl = post.coverUrl,
                    authorDisplayName = post.author?.displayName ?: "Member",
                    authorUsername = post.author?.username.orEmpty(),
                    savedAtEpochMs = System.currentTimeMillis(),
                ),
            )
        } else {
            database.bookmarkDao().remove(post.id)
        }
        bookmarked
    }

    suspend fun castPollVote(postId: String, optionId: String) = withContext(Dispatchers.IO) {
        supabase.rpcText(
            "cast_poll_vote",
            buildJsonObject {
                put("p_post_id", postId)
                put("p_option_id", optionId)
            },
            requireAuth = true,
        )
        supabase.wakePushDelivery("poll-vote")
    }

    suspend fun recordShare(postId: String, channel: String = "native") = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "record_share",
                buildJsonObject {
                    put("p_post_id", postId)
                    put("p_channel", channel)
                },
                requireAuth = false,
            )
            supabase.wakePushDelivery("share")
        }
    }

    suspend fun fetchComments(postId: String, viewerUid: String?): List<FeedComment> =
        withContext(Dispatchers.IO) {
            val raw = supabase.getJsonText(
                table = "comments",
                queryPairs = listOf(
                    "select" to COMMENT_SELECT,
                    "post_id" to "eq.$postId",
                    "deleted_at" to "is.null",
                    "order" to "created_at.asc",
                    "limit" to "500",
                ),
                requireAuth = false,
            )
            val rows = json.decodeFromString<List<CommentJoinedDto>>(raw)
            val likedIds: Set<String> = if (viewerUid != null && rows.isNotEmpty()) {
                val idsClause = rows.joinToString(",", prefix = "(", postfix = ")") { it.id }
                val likesRaw = runCatching {
                    supabase.getJsonText(
                        table = "comment_reactions",
                        queryPairs = listOf(
                            "select" to "comment_id",
                            "uid" to "eq.$viewerUid",
                            "comment_id" to "in.$idsClause",
                        ),
                        requireAuth = true,
                    )
                }.getOrDefault("[]")
                json.decodeFromString<List<CommentLikeRowDto>>(likesRaw).mapTo(HashSet()) { it.commentId }
            } else {
                emptySet()
            }

            rows.map { row ->
                FeedComment(
                    id = row.id,
                    postId = row.postId,
                    parentId = row.parentId,
                    depth = row.depth,
                    body = row.body,
                    likes = row.likesCount,
                    replies = row.repliesCount,
                    isAnswer = row.isAnswer,
                    liked = likedIds.contains(row.id),
                    createdAt = row.createdAt,
                    editedAt = row.editedAt,
                    author = row.profiles?.takeIf { it.uid.isNotBlank() }?.let { prof ->
                        PostAuthorSummary(
                            uid = prof.uid,
                            username = prof.username.orEmpty(),
                            displayName = prof.displayName?.ifBlank { "Member" } ?: "Member",
                            avatarUrl = prof.avatarUrl.orEmpty(),
                        )
                    },
                )
            }
        }

    suspend fun createComment(
        postId: String,
        authorUid: String,
        body: String,
        parentId: String? = null,
    ): FeedComment = withContext(Dispatchers.IO) {
        val payload = buildJsonObject {
            put("post_id", postId)
            put("author_uid", authorUid)
            put("body", body.trim())
            if (parentId != null) put("parent_id", parentId) else put("parent_id", JsonNull)
        }
        val raw = supabase.postJson(
            table = "comments",
            body = payload,
            queryPairs = listOf("select" to COMMENT_SELECT),
            prefer = "return=representation",
            requireAuth = true,
        )
        val row = json.decodeFromString<List<CommentJoinedDto>>(raw).first()
        supabase.wakePushDelivery("comment")
        FeedComment(
            id = row.id,
            postId = row.postId,
            parentId = row.parentId,
            depth = row.depth,
            body = row.body,
            likes = row.likesCount,
            replies = row.repliesCount,
            isAnswer = row.isAnswer,
            liked = false,
            createdAt = row.createdAt,
            editedAt = row.editedAt,
            author = row.profiles?.takeIf { it.uid.isNotBlank() }?.let { prof ->
                PostAuthorSummary(
                    uid = prof.uid,
                    username = prof.username.orEmpty(),
                    displayName = prof.displayName?.ifBlank { "Member" } ?: "Member",
                    avatarUrl = prof.avatarUrl.orEmpty(),
                )
            },
        )
    }

    suspend fun toggleCommentLike(commentId: String): Pair<Boolean, Int> = withContext(Dispatchers.IO) {
        val raw = supabase.rpcText(
            "toggle_comment_reaction",
            buildJsonObject { put("p_comment_id", commentId) },
            requireAuth = true,
        )
        val row = json.decodeFromString<List<ToggleCommentReactionDto>>(raw).firstOrNull()
        if (row?.reacted == true) supabase.wakePushDelivery("comment-reaction")
        (row?.reacted == true) to (row?.total ?: 0)
    }

    suspend fun markAcceptedAnswer(commentId: String): Boolean = withContext(Dispatchers.IO) {
        val raw = supabase.rpcText(
            "mark_answer",
            buildJsonObject { put("p_comment_id", commentId) },
            requireAuth = true,
        )
        val accepted = raw.trim().equals("true", ignoreCase = true)
        if (accepted) supabase.wakePushDelivery("answer-accepted")
        accepted
    }

    suspend fun movePostToTrash(postId: String) = withContext(Dispatchers.IO) {
        supabase.patchJson(
            table = "posts",
            body = buildJsonObject { put("deleted_at", Instant.now().toString()) },
            queryPairs = listOf("id" to "eq.$postId"),
            prefer = "return=minimal",
        )
    }

    suspend fun moveCommentToTrash(commentId: String) = withContext(Dispatchers.IO) {
        supabase.patchJson(
            table = "comments",
            body = buildJsonObject { put("deleted_at", Instant.now().toString()) },
            queryPairs = listOf("id" to "eq.$commentId"),
            prefer = "return=minimal",
        )
    }

    suspend fun fetchTrash(limit: Int = 40): List<FeedTrashItem> = withContext(Dispatchers.IO) {
        val raw = supabase.rpcText(
            "my_deleted_content",
            buildJsonObject { put("p_limit", limit) },
            requireAuth = true,
        )
        json.decodeFromString<List<TrashDto>>(raw).map { row ->
            FeedTrashItem(
                kind = if (row.kind == "comment") "comment" else "post",
                id = row.id,
                postId = row.postId,
                title = row.title.orEmpty(),
                preview = row.preview.orEmpty(),
                deletedAt = row.deletedAt,
                expiresAt = row.expiresAt,
                restorable = row.restorable,
                moderated = row.moderated,
            )
        }
    }

    suspend fun restoreTrashItem(item: FeedTrashItem) = withContext(Dispatchers.IO) {
        val table = if (item.kind == "comment") "comments" else "posts"
        supabase.patchJson(
            table = table,
            body = buildJsonObject { put("deleted_at", JsonNull) },
            queryPairs = listOf("id" to "eq.${item.id}"),
            prefer = "return=minimal",
        )
    }

    suspend fun followUser(followerUid: String, followeeUid: String) = withContext(Dispatchers.IO) {
        supabase.postJson(
            table = "follows",
            body = buildJsonObject {
                put("follower_uid", followerUid)
                put("followee_uid", followeeUid)
            },
            queryPairs = listOf("on_conflict" to "follower_uid,followee_uid"),
            prefer = "resolution=ignore-duplicates,return=minimal",
            requireAuth = true,
        )
        supabase.wakePushDelivery("follow")
    }

    suspend fun blockUser(blockerUid: String, blockedUid: String) = withContext(Dispatchers.IO) {
        supabase.postJson(
            table = "blocks",
            body = buildJsonObject {
                put("blocker_uid", blockerUid)
                put("blocked_uid", blockedUid)
            },
            queryPairs = listOf("on_conflict" to "blocker_uid,blocked_uid"),
            prefer = "resolution=ignore-duplicates,return=minimal",
            requireAuth = true,
        )
    }

    suspend fun submitReport(
        reporterUid: String,
        subjectType: String,
        subjectId: String,
        reason: ReportReason,
        details: String,
    ) = withContext(Dispatchers.IO) {
        supabase.postJson(
            table = "reports",
            body = buildJsonObject {
                put("reporter_uid", reporterUid)
                put("subject_type", subjectType)
                put("subject_id", subjectId)
                put("reason", reason.wireValue)
                put("details", details.trim().take(500))
            },
            prefer = "return=minimal",
            requireAuth = true,
        )
        supabase.wakePushDelivery("report")
    }

    private fun decodeJoinedPosts(raw: String): List<FeedPost> {
        val dtos = runCatching { json.decodeFromString<List<PostJoinedDto>>(raw) }
            .getOrDefault(emptyList())
        return dtos.filter { it.id.isNotBlank() }.map { dto ->
            val kind = PostKind.entries.firstOrNull {
                it.name.equals(dto.kind, ignoreCase = true)
            } ?: PostKind.POST
            val media = dto.postMedia.orEmpty()
                .sortedBy { it.position }
                .mapNotNull { item ->
                    val url = item.mediaAssets?.url?.trim().orEmpty()
                    if (url.isEmpty() || !ImgbbUrlAllowlist.isAllowedImageUrl(url)) return@mapNotNull null
                    val thumb = item.mediaAssets?.thumbUrl?.trim().orEmpty().ifEmpty { url }
                    PostMediaModel(
                        mediaId = item.mediaId,
                        url = url,
                        thumbUrl = thumb,
                        altText = item.altText,
                        position = item.position,
                        width = item.mediaAssets?.width,
                        height = item.mediaAssets?.height,
                    )
                }

            FeedPost(
                id = dto.id,
                slug = dto.slug,
                kind = kind,
                title = dto.title,
                body = dto.body,
                excerpt = dto.excerpt,
                coverUrl = dto.coverUrl.takeIf { ImgbbUrlAllowlist.isAllowedImageUrl(it) }.orEmpty(),
                code = dto.code,
                codeLanguage = dto.codeLanguage,
                language = if (dto.language == "en") AppLanguage.EN else AppLanguage.BN,
                readingTime = dto.readingTime.coerceAtLeast(1),
                views = dto.viewsCount.coerceAtLeast(0),
                likes = dto.likesCount.coerceAtLeast(0),
                comments = dto.commentsCount.coerceAtLeast(0),
                isSensitive = dto.isSensitive,
                allowComments = dto.allowComments,
                publishedAt = dto.publishedAt.orEmpty(),
                createdAt = dto.createdAt,
                author = dto.profiles?.takeIf { it.uid.isNotBlank() }?.let { prof ->
                    PostAuthorSummary(
                        uid = prof.uid,
                        username = prof.username.orEmpty(),
                        displayName = prof.displayName?.ifBlank { "Member" } ?: "Member",
                        avatarUrl = prof.avatarUrl.orEmpty(),
                    )
                },
                tags = dto.postTags.orEmpty().map { it.tagSlug }.filter { it.isNotBlank() },
                media = media,
                poll = dto.pollOptions.orEmpty().sortedBy { it.position }.map { opt ->
                    PollOptionModel(opt.id, opt.label, opt.votes.coerceAtLeast(0), opt.position)
                },
            )
        }
    }
}
