package bd.info.bsdc.app.core.network

import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.BsdcBackendConfig
import bd.info.bsdc.app.core.model.MemberProfile
import bd.info.bsdc.app.core.model.NotificationPrefs
import bd.info.bsdc.app.core.model.PrivacyPrefs
import io.ktor.client.HttpClient
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

class SupabaseApiException(
    val statusCode: Int,
    val pgCode: String? = null,
    override val message: String,
) : Exception(message)

@Serializable
private data class PostgrestErrorBody(
    val code: String? = null,
    val message: String? = null,
    val details: String? = null,
    val hint: String? = null,
)

class SupabaseRestClient(
    private val config: BsdcBackendConfig,
    private val httpClient: HttpClient,
    private val tokenProvider: suspend () -> String?,
) {
    private val json = BsdcHttpClientFactory.sharedJson
    val backendConfig: BsdcBackendConfig
        get() = config
    private val baseRestUrl: String
        get() = config.supabaseUrl.trim().trimEnd('/') + "/rest/v1"

    suspend fun currentToken(): String? = tokenProvider()

    private fun ensureConfigured() {
        if (!config.isSupabaseConfigured) {
            throw SupabaseApiException(503, null, "Supabase is not configured in this build")
        }
    }

    suspend fun getJsonText(
        table: String,
        queryPairs: List<Pair<String, String>> = emptyList(),
        requireAuth: Boolean = false,
    ): String {
        ensureConfigured()
        val token = tokenProvider()
        if (requireAuth && token.isNullOrBlank()) {
            throw SupabaseApiException(401, null, "auth/required")
        }
        val response = httpClient.get("$baseRestUrl/$table") {
            applySupabaseHeaders(token)
            url {
                queryPairs.forEach { (k, v) -> parameters.append(k, v) }
            }
        }
        return unwrapBody(response)
    }

    suspend fun postJson(
        table: String,
        body: JsonElement,
        queryPairs: List<Pair<String, String>> = emptyList(),
        prefer: String? = null,
        requireAuth: Boolean = true,
    ): String {
        ensureConfigured()
        val token = tokenProvider()
        if (requireAuth && token.isNullOrBlank()) {
            throw SupabaseApiException(401, null, "auth/required")
        }
        val response = httpClient.post("$baseRestUrl/$table") {
            applySupabaseHeaders(token)
            if (!prefer.isNullOrBlank()) header("Prefer", prefer)
            url {
                queryPairs.forEach { (k, v) -> parameters.append(k, v) }
            }
            contentType(ContentType.Application.Json)
            setBody(body.toString())
        }
        return unwrapBody(response)
    }

    suspend fun patchJson(
        table: String,
        body: JsonObject,
        queryPairs: List<Pair<String, String>>,
        prefer: String = "return=representation",
    ): String {
        ensureConfigured()
        val token = tokenProvider()
        if (token.isNullOrBlank()) {
            throw SupabaseApiException(401, null, "auth/required")
        }
        val response = httpClient.patch("$baseRestUrl/$table") {
            applySupabaseHeaders(token)
            header("Prefer", prefer)
            url {
                queryPairs.forEach { (k, v) -> parameters.append(k, v) }
            }
            contentType(ContentType.Application.Json)
            setBody(body.toString())
        }
        return unwrapBody(response)
    }

    suspend fun deleteRows(
        table: String,
        queryPairs: List<Pair<String, String>>,
    ): String {
        ensureConfigured()
        val token = tokenProvider()
        if (token.isNullOrBlank()) {
            throw SupabaseApiException(401, null, "auth/required")
        }
        val response = httpClient.delete("$baseRestUrl/$table") {
            applySupabaseHeaders(token)
            header("Prefer", "return=minimal")
            url {
                queryPairs.forEach { (k, v) -> parameters.append(k, v) }
            }
        }
        return unwrapBody(response)
    }

    suspend fun rpcText(
        functionName: String,
        params: JsonObject = buildJsonObject { },
        requireAuth: Boolean = true,
    ): String {
        ensureConfigured()
        val token = tokenProvider()
        if (requireAuth && token.isNullOrBlank()) {
            throw SupabaseApiException(401, null, "auth/required")
        }
        val response = httpClient.post("$baseRestUrl/rpc/$functionName") {
            applySupabaseHeaders(token)
            contentType(ContentType.Application.Json)
            setBody(params.toString())
        }
        return unwrapBody(response)
    }

    inline fun <reified T> decode(raw: String): T = BsdcHttpClientFactory.sharedJson.decodeFromString(raw)

    private fun io.ktor.client.request.HttpRequestBuilder.applySupabaseHeaders(token: String?) {
        val key = config.supabasePublishableKey.trim()
        header("apikey", key)
        if (!token.isNullOrBlank()) {
            header("Authorization", "Bearer $token")
        } else if (!key.startsWith("sb_")) {
            header("Authorization", "Bearer $key")
        }
        header("Accept", "application/json")
    }

    private suspend fun unwrapBody(response: HttpResponse): String {
        val text = response.bodyAsText()
        if (response.status.isSuccess()) return text
        if (response.status == HttpStatusCode.NotAcceptable) {
            throw SupabaseApiException(406, "PGRST116", "No rows found")
        }
        val parsed = runCatching { json.decodeFromString<PostgrestErrorBody>(text) }.getOrNull()
        throw SupabaseApiException(
            statusCode = response.status.value,
            pgCode = parsed?.code,
            message = parsed?.message ?: text.ifBlank { "HTTP ${response.status.value}" },
        )
    }
}

@Serializable
data class ProfileRowDto(
    val uid: String? = null,
    val username: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    val bio: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("cover_url") val coverUrl: String? = null,
    val location: String? = null,
    val website: String? = null,
    val skills: JsonElement? = null,
    val interests: JsonElement? = null,
    val language: String? = null,
    @SerialName("onboarding_complete") val onboardingComplete: Boolean? = null,
    val notifications: JsonElement? = null,
    val privacy: JsonElement? = null,
    @SerialName("followers_count") val followersCount: Int? = null,
    @SerialName("following_count") val followingCount: Int? = null,
    @SerialName("posts_count") val postsCount: Int? = null,
    val reputation: Int? = null,
    val verified: Boolean? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

/**
 * Coerces a raw Postgres profile row into MemberProfile without dropping valid fields
 * when optional arrays or timestamps have unexpected shapes — mirroring coerceProfile().
 */
object ProfileRowCoercer {
    private const val MAX_DISPLAY_NAME = 60
    private const val MAX_BIO = 280
    private const val MAX_LOCATION = 80
    private const val MAX_LIST_ITEMS = 20
    private const val MAX_ITEM_LENGTH = 32

    fun coerce(row: ProfileRowDto): MemberProfile? {
        val uid = row.uid?.trim().orEmpty()
        if (uid.isEmpty()) return null

        return MemberProfile(
            uid = uid,
            username = row.username?.trim()?.lowercase().orEmpty(),
            displayName = coerceText(row.displayName, MAX_DISPLAY_NAME, "Member"),
            bio = coerceText(row.bio, MAX_BIO, ""),
            avatarUrl = row.avatarUrl?.trim().orEmpty(),
            coverUrl = row.coverUrl?.trim().orEmpty(),
            location = coerceText(row.location, MAX_LOCATION, ""),
            website = row.website?.trim().orEmpty(),
            skills = coerceList(row.skills),
            interests = coerceList(row.interests),
            language = if (row.language == "en") AppLanguage.EN else AppLanguage.BN,
            onboardingComplete = row.onboardingComplete == true,
            notifications = coerceNotifications(row.notifications),
            privacy = coercePrivacy(row.privacy),
            followersCount = (row.followersCount ?: 0).coerceAtLeast(0),
            followingCount = (row.followingCount ?: 0).coerceAtLeast(0),
            postsCount = (row.postsCount ?: 0).coerceAtLeast(0),
            reputation = (row.reputation ?: 0).coerceAtLeast(0),
            verified = row.verified == true,
            createdAt = row.createdAt.orEmpty(),
            updatedAt = row.updatedAt.orEmpty(),
        )
    }

    private fun coerceText(raw: String?, maxLen: Int, fallback: String): String {
        val trimmed = raw?.trim().orEmpty()
        if (trimmed.isEmpty()) return fallback
        return if (trimmed.length > maxLen) trimmed.take(maxLen) else trimmed
    }

    private fun coerceList(element: JsonElement?): List<String> {
        val array = element as? JsonArray ?: return emptyList()
        val seen = HashSet<String>()
        val result = ArrayList<String>(MAX_LIST_ITEMS)
        for (entry in array) {
            val raw = (entry as? JsonPrimitive)?.contentOrNull?.trim().orEmpty()
            val item = if (raw.length > MAX_ITEM_LENGTH) raw.take(MAX_ITEM_LENGTH) else raw
            if (item.isEmpty()) continue
            if (seen.add(item.lowercase())) {
                result.add(item)
                if (result.size >= MAX_LIST_ITEMS) break
            }
        }
        return result
    }

    private fun coerceNotifications(element: JsonElement?): NotificationPrefs {
        val obj = element as? JsonObject ?: return NotificationPrefs()
        return NotificationPrefs(
            followers = obj.boolOrDefault("followers", true),
            comments = obj.boolOrDefault("comments", true),
            mentions = obj.boolOrDefault("mentions", true),
            messages = obj.boolOrDefault("messages", true),
            digest = obj.boolOrDefault("digest", true),
        )
    }

    private fun coercePrivacy(element: JsonElement?): PrivacyPrefs {
        val obj = element as? JsonObject ?: return PrivacyPrefs()
        return PrivacyPrefs(
            discoverable = obj.boolOrDefault("discoverable", true),
            showActivity = obj.boolOrDefault("showActivity", true),
            showEmail = obj.boolOrDefault("showEmail", false),
        )
    }

    private fun JsonObject.boolOrDefault(key: String, default: Boolean): Boolean {
        val primitive = (this[key] as? JsonPrimitive) ?: return default
        return primitive.booleanOrNull
            ?: when (primitive.contentOrNull?.lowercase()) {
                "true" -> true
                "false" -> false
                else -> default
            }
    }

    fun JsonArray.toJsonArrayStrings(values: List<String>): JsonArray = buildJsonArray {
        values.forEach { add(JsonPrimitive(it)) }
    }
}
