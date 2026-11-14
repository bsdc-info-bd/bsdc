package bd.info.bsdc.app.core.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import bd.info.bsdc.app.core.database.BsdcDatabase
import bd.info.bsdc.app.core.database.BsdcDatabaseMappers
import bd.info.bsdc.app.core.media.ImgbbUrlAllowlist
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.FeedPost
import bd.info.bsdc.app.core.model.PollOptionModel
import bd.info.bsdc.app.core.model.PostAuthorSummary
import bd.info.bsdc.app.core.model.PostKind
import bd.info.bsdc.app.core.model.PostMediaModel
import bd.info.bsdc.app.core.network.BsdcHttpClientFactory
import bd.info.bsdc.app.core.network.SupabaseRestClient
import coil3.ImageLoader
import coil3.request.ImageRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
private data class JoinedPostAuthorDto(
    val uid: String = "",
    val username: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
)

@Serializable
private data class PostTagDto(
    @SerialName("tag_slug") val tagSlug: String = "",
)

@Serializable
private data class PollOptionDto(
    val id: String = "",
    val label: String = "",
    val votes: Int = 0,
    val position: Int = 0,
)

@Serializable
private data class MediaAssetSnippetDto(
    val url: String = "",
    @SerialName("thumb_url") val thumbUrl: String = "",
    val width: Int? = null,
    val height: Int? = null,
)

@Serializable
private data class PostMediaJoinDto(
    @SerialName("media_id") val mediaId: String = "",
    val position: Int = 0,
    @SerialName("alt_text") val altText: String = "",
    @SerialName("media_assets") val mediaAssets: MediaAssetSnippetDto? = null,
)

@Serializable
private data class JoinedPostDto(
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
    val profiles: JoinedPostAuthorDto? = null,
    @SerialName("post_tags") val postTags: List<PostTagDto>? = null,
    @SerialName("poll_options") val pollOptions: List<PollOptionDto>? = null,
    @SerialName("post_media") val postMedia: List<PostMediaJoinDto>? = null,
)

/**
 * Coordinates offline Room feed prefetching, lightweight ImgBB thumbnail disk cache
 * warming, and idempotent outbox flushing on connectivity restoration.
 */
class FeedPrefetchService(
    private val context: Context,
    private val supabase: SupabaseRestClient,
    private val database: BsdcDatabase,
    private val imageLoader: ImageLoader,
    private val prefsStore: OfflineSyncPreferencesStore,
) {
    private val json = BsdcHttpClientFactory.sharedJson

    companion object {
        const val POST_SELECT_COMPACT =
            "*,profiles:author_uid(uid,username,display_name,avatar_url),post_tags(tag_slug),poll_options(id,label,votes,position),post_media(media_id,position,alt_text,media_assets(url,thumb_url,width,height))"
    }

    suspend fun runSyncPass(forceManual: Boolean = false): Int = withContext(Dispatchers.IO) {
        val settings = prefsStore.getSettings()
        if (!forceManual) {
            val (connected, metered) = networkSnapshot()
            if (!OfflineSyncPolicy.shouldRunAutoSync(settings.policy, connected, metered, false)) {
                return@withContext 0
            }
        }

        val posts = fetchPublishedPosts(OfflineSyncPolicy.DEFAULT_PREFETCH_POST_LIMIT)
        if (posts.isNotEmpty()) {
            val now = System.currentTimeMillis()
            val entities = posts.mapIndexed { index, post ->
                BsdcDatabaseMappers.toEntity(post, algorithm = "latest", feedOrder = index, cachedAtEpochMs = now)
            }
            database.postDao().clearAlgorithm("latest")
            database.postDao().upsertAll(entities)
            database.postDao().pruneOlderThan(OfflineSyncPolicy.pruneCutoffEpochMs(now))

            if (settings.prefetchThumbnails) {
                prefetchThumbnails(posts.take(OfflineSyncPolicy.DEFAULT_IMAGE_WARM_LIMIT))
            }
            prefsStore.recordSyncCompletion(now, posts.size)
        }

        flushPendingOutbox()
        posts.size
    }

    suspend fun fetchPublishedPosts(limit: Int): List<FeedPost> {
        val raw = runCatching {
            supabase.getJsonText(
                table = "posts",
                queryPairs = listOf(
                    "select" to POST_SELECT_COMPACT,
                    "status" to "eq.published",
                    "deleted_at" to "is.null",
                    "order" to "published_at.desc.nullslast",
                    "limit" to limit.toString(),
                ),
                requireAuth = false,
            )
        }.getOrNull() ?: return emptyList()

        val dtos = runCatching { json.decodeFromString<List<JoinedPostDto>>(raw) }
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

    private fun prefetchThumbnails(posts: List<FeedPost>) {
        val urls = buildSet {
            for (post in posts) {
                post.media.firstOrNull()?.let { m ->
                    val chosen = ImgbbUrlAllowlist.selectResponsiveUrl(m.url, m.thumbUrl, 640)
                    if (ImgbbUrlAllowlist.isAllowedImageUrl(chosen)) add(chosen)
                }
                if (post.coverUrl.isNotBlank() && ImgbbUrlAllowlist.isAllowedImageUrl(post.coverUrl)) {
                    add(post.coverUrl)
                }
            }
        }

        for (url in urls) {
            val req = ImageRequest.Builder(context)
                .data(url)
                .size(640)
                .build()
            imageLoader.enqueue(req)
        }
    }

    suspend fun flushPendingOutbox() {
        val pending = database.outboxMessageDao().listFlushable()
        if (pending.isEmpty()) return

        var sentAny = false
        for (item in pending) {
            database.outboxMessageDao().updateStatus(item.clientMessageId, "SENDING", item.retryCount)
            val params = buildJsonObject {
                put("p_conversation_id", item.conversationId)
                put("p_client_id", item.clientMessageId)
                put("p_body", item.body)
                put("p_kind", item.kind)
                put("p_media_url", item.mediaUrl)
                put("p_media_name", item.mediaName)
                put("p_code_language", item.codeLanguage)
                put("p_reply_to", item.replyToMessageId?.let { JsonPrimitive(it) } ?: JsonNull)
            }
            val result = runCatching {
                supabase.rpcText("send_message_once", params, requireAuth = true)
            }
            if (result.isSuccess) {
                sentAny = true
                database.outboxMessageDao().remove(item.clientMessageId)
            } else {
                database.outboxMessageDao().updateStatus(item.clientMessageId, "FAILED", item.retryCount + 1)
            }
        }
        if (sentAny) {
            supabase.wakePushDelivery("outbox-flush")
        }
    }

    private fun networkSnapshot(): Pair<Boolean, Boolean> {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return false to false
        val active = cm.activeNetwork ?: return false to false
        val caps = cm.getNetworkCapabilities(active) ?: return false to false
        val connected = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        val unmetered = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        return connected to !unmetered
    }
}
