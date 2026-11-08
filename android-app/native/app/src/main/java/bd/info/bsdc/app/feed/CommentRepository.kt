package bd.info.bsdc.app.feed

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.UUID

class CommentRepository(private val baseUrl: String, private val key: String, private val token: suspend () -> String?) {
    suspend fun list(postId: String): List<FeedComment> = withContext(Dispatchers.IO) {
        checkUuid(postId)
        val select = "select=id,post_id,author_uid,parent_id,depth,body,created_at,likes_count,replies_count,profiles:author_uid(display_name,username)"
        val rows = request("GET", "/rest/v1/comments?$select&post_id=eq.$postId&deleted_at=is.null&order=created_at.asc&limit=200") as? JSONArray ?: JSONArray()
        (0 until rows.length()).mapNotNull { rows.optJSONObject(it)?.let(::toComment) }
    }

    suspend fun create(postId: String, uid: String, body: String, parentId: String? = null): FeedComment = withContext(Dispatchers.IO) {
        checkUuid(postId)
        require(body.trim().isNotEmpty() && body.trim().length <= 4000) { "Write a comment of up to 4,000 characters." }
        val data = JSONObject().put("post_id", postId).put("author_uid", uid).put("body", body.trim())
        if (parentId != null) { checkUuid(parentId); data.put("parent_id", parentId) }
        val created = request("POST", "/rest/v1/comments?select=id,post_id,author_uid,parent_id,depth,body,created_at,likes_count,replies_count,profiles:author_uid(display_name,username)", data.toString(), representation = true) as? JSONArray
            ?: error("BSDC did not confirm your comment.")
        toComment(created.optJSONObject(0) ?: error("BSDC did not confirm your comment."))
    }

    suspend fun toggleLike(commentId: String): Pair<Boolean, Int> = withContext(Dispatchers.IO) {
        checkUuid(commentId)
        val data = JSONObject().put("p_comment_id", commentId)
        val response = request("POST", "/rest/v1/rpc/toggle_comment_reaction", data.toString()) as? JSONArray
            ?: error("BSDC did not confirm your reaction.")
        val row = response.optJSONObject(0) ?: error("BSDC did not confirm your reaction.")
        row.optBoolean("reacted") to row.optInt("total")
    }

    private suspend fun request(method: String, path: String, body: String? = null, representation: Boolean = false): Any? {
        require(baseUrl.startsWith("https://") && key.isNotBlank()) { "Comments are not configured in this build." }
        val idToken = token()?.takeIf(String::isNotBlank)
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method; connectTimeout = 10_000; readTimeout = 20_000
            setRequestProperty("apikey", key)
            if (idToken != null) setRequestProperty("Authorization", "Bearer $idToken") else if (!key.startsWith("sb_")) setRequestProperty("Authorization", "Bearer $key")
            setRequestProperty("Accept", "application/json"); setRequestProperty("Content-Type", "application/json")
            if (representation) setRequestProperty("Prefer", "return=representation")
            if (body != null) doOutput = true
        }
        try {
            if (body != null) connection.outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
            val code = connection.responseCode
            val payload = (if (code in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code !in 200..299) error(when (code) { 401, 403 -> "Sign in to use this feature."; 404 -> "Comments aren't available for this post."; in 500..599 -> "BSDC is temporarily unavailable."; else -> "Couldn't complete that request." })
            if (payload.isBlank()) return null
            return JSONArray(payload)
        } finally { connection.disconnect() }
    }

    private fun toComment(row: JSONObject): FeedComment {
        val profile = row.optJSONObject("profiles")
        return FeedComment(row.optString("id"), row.optString("author_uid"), profile?.optString("display_name")?.takeIf(String::isNotBlank) ?: "BSDC member", row.optString("body"), row.optInt("depth"), row.optInt("likes_count"), row.optInt("replies_count"))
    }

    private fun checkUuid(value: String) { require(runCatching { UUID.fromString(value) }.isSuccess) { "Invalid BSDC identifier." } }
}

data class FeedComment(val id: String, val authorUid: String, val author: String, val body: String, val depth: Int, val likes: Int, val replies: Int)
