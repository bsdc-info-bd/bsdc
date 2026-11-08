package bd.info.bsdc.app.feed

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.UUID

/** Minimal native adapter to BSDC's existing feed_candidates and toggle_reaction contracts. */
class FeedRepository(
    private val supabaseUrl: String,
    private val publishableKey: String,
    private val token: suspend () -> String?,
) {
    suspend fun load(): List<FeedPost> = withContext(Dispatchers.IO) {
        require(supabaseUrl.startsWith("https://") && publishableKey.isNotBlank()) { "The BSDC feed is not configured in this build." }
        val candidates = request("POST", "/rest/v1/rpc/feed_candidates", """{"p_limit":30,"p_before":null}""") as? JSONArray
            ?: error("The feed response was unavailable.")
        val ids = (0 until candidates.length()).mapNotNull { candidates.optJSONObject(it)?.optString("post_id")?.takeIf(::isUuid) }
        if (ids.isEmpty()) return@withContext emptyList()
        val query = "select=id,author_uid,kind,title,body,excerpt,created_at,published_at,likes_count,comments_count,profiles:author_uid(display_name,username)&id=in.(${ids.joinToString(",")})"
        val rows = request("GET", "/rest/v1/posts?$query") as? JSONArray ?: error("The feed posts could not be loaded.")
        val byId = (0 until rows.length()).mapNotNull { index ->
            rows.optJSONObject(index)?.let(::toFeedPost)?.let { it.id to it }
        }.toMap()
        ids.mapNotNull(byId::get)
    }

    suspend fun toggleLike(postId: String): ReactionResult = withContext(Dispatchers.IO) {
        require(isUuid(postId)) { "Invalid post." }
        val result = request("POST", "/rest/v1/rpc/toggle_reaction", """{"p_post_id":"$postId","p_reaction":"like"}""") as? JSONArray
            ?: error("BSDC did not confirm the reaction.")
        val row = result.optJSONObject(0) ?: error("BSDC did not confirm the reaction.")
        ReactionResult(row.optBoolean("reacted"), row.optInt("total"))
    }

    private suspend fun request(method: String, path: String, body: String? = null): Any? {
        val base = supabaseUrl.trimEnd('/')
        val idToken = token()?.takeIf(String::isNotBlank)
        val connection = (URL(base + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 20_000
            setRequestProperty("apikey", publishableKey)
            if (idToken != null) setRequestProperty("Authorization", "Bearer $idToken")
            else if (!publishableKey.startsWith("sb_")) setRequestProperty("Authorization", "Bearer $publishableKey")
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json")
            if (body != null) doOutput = true
        }
        try {
            if (body != null) connection.outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val payload = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                // Never display provider response text; it can include schema detail.
                error(when (status) {
                    401, 403 -> "Sign in to use this BSDC feature."
                    404 -> "This BSDC feature is not available yet."
                    in 500..599 -> "BSDC is temporarily unavailable. Try again shortly."
                    else -> "Couldn't complete that request. Please try again."
                })
            }
            if (payload.isBlank()) return null
            return if (payload.trimStart().startsWith("[")) JSONArray(payload) else JSONObject(payload)
        } finally { connection.disconnect() }
    }

    private fun toFeedPost(row: JSONObject): FeedPost {
        val profile = row.optJSONObject("profiles")
        val id = row.optString("id")
        require(isUuid(id)) { "BSDC returned an invalid post identifier." }
        val body = row.optString("excerpt").ifBlank { row.optString("body") }
        return FeedPost(
            id = id,
            author = profile?.optString("display_name")?.takeIf(String::isNotBlank) ?: "BSDC member",
            handle = profile?.optString("username")?.takeIf(String::isNotBlank) ?: "member",
            text = body,
            time = row.optString("published_at").ifBlank { row.optString("created_at") },
            likes = row.optInt("likes_count"),
            comments = row.optInt("comments_count"),
            kind = row.optString("kind").replaceFirstChar { it.uppercase() },
        )
    }

    private fun isUuid(value: String): Boolean = runCatching { UUID.fromString(value) }.isSuccess
}

data class FeedPost(val id: String, val author: String, val handle: String, val text: String, val time: String, val likes: Int, val comments: Int, val kind: String)
data class ReactionResult(val reacted: Boolean, val total: Int)
