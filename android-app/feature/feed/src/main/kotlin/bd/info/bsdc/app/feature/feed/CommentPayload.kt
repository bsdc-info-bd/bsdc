package bd.info.bsdc.app.feature.feed

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The row a comment becomes when it is inserted.
 *
 * It is a separate function for one reason: the shape of this object is what the
 * database accepts or refuses (migration 0120). `image_url` has to be a URL this
 * member uploaded — the trigger checks it against `media_assets` and raises
 * `42501` for anything else — and `image_width`/`image_height` have to arrive as
 * a pair, because half of one is a row the layout cannot reserve space for. Both
 * rules are cheaper to test here than to discover on a phone.
 */
internal object CommentPayload {

    fun build(
        postId: String,
        authorUid: String,
        body: String,
        parentId: String? = null,
        image: CommentImage? = null,
    ): JsonObject = buildJsonObject {
        put("post_id", postId)
        put("author_uid", authorUid)
        put("body", body.trim())
        if (parentId != null) put("parent_id", parentId) else put("parent_id", JsonNull)
        if (image != null) {
            put("image_url", image.url)
            // The database substitutes the original for an empty variant; sending
            // the fallback anyway keeps a client that reads this row honest.
            put("image_thumb_url", image.thumbUrl.ifBlank { image.url })
            put("image_alt", image.alt)
            image.width?.let { put("image_width", it) }
            image.height?.let { put("image_height", it) }
        }
    }
}
