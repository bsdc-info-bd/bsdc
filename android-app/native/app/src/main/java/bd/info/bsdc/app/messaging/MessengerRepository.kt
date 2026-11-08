package bd.info.bsdc.app.messaging

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.UUID

class MessengerRepository(private val baseUrl: String, private val key: String, private val token: suspend () -> String?) {
    suspend fun inbox(): List<ConversationSummary> = withContext(Dispatchers.IO) {
        val rows = rpc("conversation_inbox", JSONObject().put("p_limit", 50)) as? JSONArray ?: JSONArray()
        (0 until rows.length()).mapNotNull { i -> rows.optJSONObject(i)?.let { row ->
            ConversationSummary(row.optString("id"), row.optString("kind"), row.optString("title"), row.optString("last_message_preview"), row.optInt("unread_count"), row.optString("other_uid").takeUnless { it == "null" }.orEmpty(), row.optString("other_name").takeUnless { it == "null" }.orEmpty())
        } }
    }

    suspend fun openDirect(otherUid: String): String = withContext(Dispatchers.IO) {
        require(otherUid.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "Invalid BSDC member." }
        val response = rpc("open_direct_conversation", JSONObject().put("p_other_uid", otherUid))
        val id = when (response) { is JSONArray -> response.optString(0); is JSONObject -> response.optString("open_direct_conversation"); else -> response?.toString()?.trim('"').orEmpty() }
        require(runCatching { UUID.fromString(id) }.isSuccess) { "BSDC did not return a valid conversation." }
        id
    }

    suspend fun messages(conversationId: String): List<ChatMessage> = withContext(Dispatchers.IO) {
        requireUuid(conversationId)
        val raw = rpc("conversation_messages_page", JSONObject().put("p_conversation_id", conversationId).put("p_before", JSONObject.NULL).put("p_before_id", JSONObject.NULL).put("p_limit", 80)) as? JSONArray ?: JSONArray()
        val rows = (0 until raw.length()).mapNotNull { raw.optJSONObject(it) }
        val ids = rows.map { it.optString("sender_uid") }.filter { it.isNotBlank() }.distinct()
        val names = if (ids.isEmpty()) emptyMap() else profiles(ids)
        rows.asReversed().map { row -> ChatMessage(row.optString("id"), row.optString("sender_uid"), names[row.optString("sender_uid")] ?: "BSDC member", row.optString("body"), row.optString("created_at"), row.optString("deleted_at").takeUnless { it == "null" || it.isBlank() } != null) }
    }

    suspend fun send(conversationId: String, body: String, clientId: String): ChatMessage = withContext(Dispatchers.IO) {
        requireUuid(conversationId)
        val clean = body.trim(); require(clean.isNotEmpty() && clean.length <= 20_000) { "Message must be between 1 and 20,000 characters." }
        requireUuid(clientId)
        val row = rpc("send_message_once", JSONObject().put("p_conversation_id", conversationId).put("p_client_id", clientId).put("p_body", clean).put("p_kind", "text").put("p_media_url", "").put("p_media_name", "").put("p_code_language", "").put("p_reply_to", JSONObject.NULL)) as? JSONObject ?: error("BSDC did not confirm your message.")
        ChatMessage(row.optString("id"), row.optString("sender_uid"), "You", row.optString("body"), row.optString("created_at"), false)
    }

    suspend fun markRead(conversationId: String) = withContext(Dispatchers.IO) {
        requireUuid(conversationId); rpc("mark_conversation_read", JSONObject().put("p_conversation_id", conversationId))
    }

    private suspend fun profiles(uids: List<String>): Map<String, String> {
        val safe = uids.filter { it.matches(Regex("[A-Za-z0-9_-]{1,128}")) }
        if (safe.isEmpty()) return emptyMap()
        val rows = call("GET", "/rest/v1/profiles?select=uid,display_name&uid=in.(${safe.joinToString(",")})") as? JSONArray ?: JSONArray()
        return (0 until rows.length()).mapNotNull { rows.optJSONObject(it)?.let { r -> r.optString("uid") to r.optString("display_name") } }.toMap()
    }

    private suspend fun rpc(name: String, body: JSONObject): Any? = call("POST", "/rest/v1/rpc/$name", body.toString())
    private suspend fun call(method: String, path: String, body: String? = null): Any? {
        require(baseUrl.startsWith("https://") && key.isNotBlank()) { "Messaging is not configured in this build." }
        val idToken = token()?.takeIf(String::isNotBlank)
        val conn = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method; connectTimeout = 10_000; readTimeout = 20_000
            setRequestProperty("apikey", key)
            if (idToken != null) setRequestProperty("Authorization", "Bearer $idToken") else if (!key.startsWith("sb_")) setRequestProperty("Authorization", "Bearer $key")
            setRequestProperty("Content-Type", "application/json"); setRequestProperty("Accept", "application/json")
            if (body != null) doOutput = true
        }
        try {
            if (body != null) conn.outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code !in 200..299) error(when (code) { 401, 403 -> "Sign in or join this conversation to continue."; in 500..599 -> "BSDC is temporarily unavailable."; else -> "Couldn't complete the messaging request." })
            if (text.isBlank()) return null
            return when (text.trimStart().firstOrNull()) { '[' -> JSONArray(text); '{' -> JSONObject(text); else -> text.trim().trim('"') }
        } finally { conn.disconnect() }
    }
    private fun requireUuid(value: String) { require(runCatching { UUID.fromString(value) }.isSuccess) { "Invalid conversation." } }
}

data class ConversationSummary(val id: String, val kind: String, val title: String, val preview: String, val unread: Int, val otherUid: String, val otherName: String)
data class ChatMessage(val id: String, val senderUid: String, val senderName: String, val body: String, val createdAt: String, val deleted: Boolean)
