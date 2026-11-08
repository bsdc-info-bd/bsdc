package bd.info.bsdc.app.social

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

class SocialRepository(private val baseUrl: String, private val key: String, private val token: suspend () -> String?) {
    suspend fun searchMembers(query: String): List<MemberResult> = withContext(Dispatchers.IO) {
        val cleaned = query.trim().take(100)
        if (cleaned.length < 2) return@withContext emptyList()
        val response = call("POST", "/rest/v1/rpc/global_search", JSONObject().put("p_query", cleaned).put("p_kinds", JSONArray().put("person")).put("p_limit", 20).toString()) as? JSONArray ?: JSONArray()
        (0 until response.length()).mapNotNull { index -> response.optJSONObject(index)?.takeIf { it.optString("kind") == "person" }?.let {
            MemberResult(it.optString("id"), it.optString("slug"), it.optString("title").ifBlank { "BSDC member" }, it.optString("subtitle"), it.optString("image_url"))
        } }
    }

    suspend fun following(viewerUid: String, ids: List<String>): Set<String> = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) return@withContext emptySet()
        requireMemberUid(viewerUid)
        ids.forEach(::requireMemberUid)
        val rows = call("GET", "/rest/v1/follows?select=followee_uid&follower_uid=eq.$viewerUid&followee_uid=in.(${ids.distinct().joinToString(",")})") as? JSONArray ?: JSONArray()
        (0 until rows.length()).mapNotNull { rows.optJSONObject(it)?.optString("followee_uid") }.toSet()
    }

    suspend fun setFollowing(viewerUid: String, targetUid: String, follow: Boolean) = withContext(Dispatchers.IO) {
        requireMemberUid(viewerUid); requireMemberUid(targetUid); require(viewerUid != targetUid) { "You cannot follow your own account." }
        if (follow) {
            call("POST", "/rest/v1/follows?on_conflict=follower_uid,followee_uid", JSONObject().put("follower_uid", viewerUid).put("followee_uid", targetUid).toString(), upsert = true)
        } else {
            call("DELETE", "/rest/v1/follows?follower_uid=eq.$viewerUid&followee_uid=eq.$targetUid")
        }
    }

    private suspend fun call(method: String, path: String, body: String? = null, upsert: Boolean = false): Any? {
        require(baseUrl.startsWith("https://") && key.isNotBlank()) { "Member search is not configured in this build." }
        val idToken = token()?.takeIf(String::isNotBlank)
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method; connectTimeout = 10_000; readTimeout = 20_000
            setRequestProperty("apikey", key)
            if (idToken != null) setRequestProperty("Authorization", "Bearer $idToken") else if (!key.startsWith("sb_")) setRequestProperty("Authorization", "Bearer $key")
            setRequestProperty("Accept", "application/json"); setRequestProperty("Content-Type", "application/json")
            if (upsert) setRequestProperty("Prefer", "resolution=ignore-duplicates,return=minimal")
            if (body != null) doOutput = true
        }
        try {
            if (body != null) connection.outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
            val code = connection.responseCode
            val payload = (if (code in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code !in 200..299) error(when (code) { 401, 403 -> "Sign in is required for that action."; in 500..599 -> "BSDC is temporarily unavailable."; else -> "Couldn't complete the request." })
            if (payload.isBlank()) return null
            return if (payload.trimStart().startsWith("[")) JSONArray(payload) else JSONObject(payload)
        } finally { connection.disconnect() }
    }

    private fun requireMemberUid(value: String) { require(value.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "Invalid BSDC member identifier." } }
}

data class MemberResult(val uid: String, val username: String, val displayName: String, val bio: String, val avatarUrl: String)
