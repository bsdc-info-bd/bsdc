package bd.info.bsdc.app.core.database

import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.FeedPost
import bd.info.bsdc.app.core.model.PollOptionModel
import bd.info.bsdc.app.core.model.PostAuthorSummary
import bd.info.bsdc.app.core.model.PostKind
import bd.info.bsdc.app.core.model.PostMediaModel
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object BsdcDatabaseMappers {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    fun toEntity(
        post: FeedPost,
        algorithm: String,
        feedOrder: Int,
        cachedAtEpochMs: Long = System.currentTimeMillis(),
    ): CachedPostEntity = CachedPostEntity(
        postId = post.id,
        algorithm = algorithm,
        feedOrder = feedOrder,
        slug = post.slug,
        kind = post.kind.name,
        title = post.title,
        body = post.body,
        excerpt = post.excerpt,
        coverUrl = post.coverUrl,
        code = post.code,
        codeLanguage = post.codeLanguage,
        language = post.language.tag,
        readingTime = post.readingTime,
        views = post.views,
        likes = post.likes,
        comments = post.comments,
        isSensitive = post.isSensitive,
        allowComments = post.allowComments,
        publishedAt = post.publishedAt,
        createdAt = post.createdAt,
        authorUid = post.author?.uid.orEmpty(),
        authorUsername = post.author?.username.orEmpty(),
        authorDisplayName = post.author?.displayName.orEmpty(),
        authorAvatarUrl = post.author?.avatarUrl.orEmpty(),
        tagsJson = json.encodeToString(post.tags),
        mediaJson = json.encodeToString(post.media),
        pollJson = json.encodeToString(post.poll),
        cachedAtEpochMs = cachedAtEpochMs,
    )

    fun toDomain(entity: CachedPostEntity): FeedPost {
        val kind = runCatching { PostKind.valueOf(entity.kind) }.getOrDefault(PostKind.POST)
        val lang = if (entity.language == "en") AppLanguage.EN else AppLanguage.BN
        val tags = runCatching { json.decodeFromString<List<String>>(entity.tagsJson) }.getOrDefault(emptyList())
        val media = runCatching { json.decodeFromString<List<PostMediaModel>>(entity.mediaJson) }.getOrDefault(emptyList())
        val poll = runCatching { json.decodeFromString<List<PollOptionModel>>(entity.pollJson) }.getOrDefault(emptyList())

        val author = if (entity.authorUid.isNotBlank()) {
            PostAuthorSummary(
                uid = entity.authorUid,
                username = entity.authorUsername,
                displayName = entity.authorDisplayName.ifBlank { "Member" },
                avatarUrl = entity.authorAvatarUrl,
            )
        } else {
            null
        }

        return FeedPost(
            id = entity.postId,
            slug = entity.slug,
            kind = kind,
            title = entity.title,
            body = entity.body,
            excerpt = entity.excerpt,
            coverUrl = entity.coverUrl,
            code = entity.code,
            codeLanguage = entity.codeLanguage,
            language = lang,
            readingTime = entity.readingTime,
            views = entity.views,
            likes = entity.likes,
            comments = entity.comments,
            isSensitive = entity.isSensitive,
            allowComments = entity.allowComments,
            publishedAt = entity.publishedAt,
            createdAt = entity.createdAt,
            author = author,
            tags = tags,
            media = media,
            poll = poll,
        )
    }
}
