package bd.info.bsdc.app.core.network

import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.BsdcBackendConfig
import bd.info.bsdc.app.core.model.BsdcRole
import bd.info.bsdc.app.core.model.MemberProfile
import bd.info.bsdc.app.core.model.PrivacyPrefs
import bd.info.bsdc.app.core.model.ProfileDraft
import bd.info.bsdc.app.core.model.ProfileStats
import bd.info.bsdc.app.core.model.ReverseGeoResult
import io.ktor.client.HttpClient
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class ClaimsMintResponse(
    val uid: String = "",
    val project: String = "",
)

@Serializable
private data class MyRoleRow(
    val role: String? = null,
)

@Serializable
private data class UsernameLookupRow(
    val username: String? = null,
    val uid: String? = null,
)

@Serializable
private data class ProfileStatsRow(
    @SerialName("followers_count") val followersCount: Int? = null,
    @SerialName("following_count") val followingCount: Int? = null,
    @SerialName("posts_count") val postsCount: Int? = null,
    val reputation: Int? = null,
)

class BsdcPlatformApi(
    private val config: BsdcBackendConfig,
    private val httpClient: HttpClient,
    val supabase: SupabaseRestClient,
) {
    private val json = BsdcHttpClientFactory.sharedJson
    private val siteOrigin: String
        get() = config.siteUrl.trim().trimEnd('/')

    /**
     * Calls POST /api/auth/claims on main-site Cloudflare Pages to mint `role = "authenticated"`
     * and database-derived `bsdc_role` onto the member's Firebase ID token.
     */
    suspend fun mintAuthClaims(
        idToken: String,
        uid: String,
        bootstrapRole: BsdcRole,
    ): ClaimsMintResponse {
        val payload = buildJsonObject {
            put("uid", uid)
            put("role", bootstrapRole.wireValue)
            put("vendor", false)
            put("staff", false)
        }
        val response = httpClient.post("$siteOrigin/api/auth/claims") {
            header("Authorization", "Bearer $idToken")
            contentType(ContentType.Application.Json)
            setBody(payload.toString())
        }
        val body = response.bodyAsText()
        if (!response.status.isSuccess()) {
            throw SupabaseApiException(response.status.value, null, "auth/claims-failed: $body")
        }
        return json.decodeFromString(body)
    }

    /**
     * Rounds coordinates on-device to 2 decimals (~1.1 km) before requesting city/country
     * lookup via POST /api/geo/reverse.
     */
    suspend fun reverseGeocode(
        latitude: Double,
        longitude: Double,
        language: AppLanguage,
    ): ReverseGeoResult {
        GeoCoordinatePrivacy.validateCoordinates(latitude, longitude)
        val roundedLat = GeoCoordinatePrivacy.roundTwoDecimals(latitude)
        val roundedLon = GeoCoordinatePrivacy.roundTwoDecimals(longitude)
        val payload = buildJsonObject {
            put("latitude", roundedLat)
            put("longitude", roundedLon)
            put("language", language.tag)
        }
        val response = httpClient.post("$siteOrigin/api/geo/reverse") {
            contentType(ContentType.Application.Json)
            setBody(payload.toString())
        }
        val text = response.bodyAsText()
        if (!response.status.isSuccess()) {
            throw SupabaseApiException(response.status.value, null, "geo/reverse-failed")
        }
        return json.decodeFromString(text)
    }

    suspend fun fetchMyRole(): BsdcRole? {
        val raw = runCatching { supabase.rpcText("my_role", requireAuth = true) }.getOrNull()
            ?: return null
        val trimmed = raw.trim()
        val roleString = when {
            trimmed.startsWith("[") -> {
                json.decodeFromString<List<MyRoleRow>>(trimmed).firstOrNull()?.role
            }
            trimmed.startsWith("{") -> {
                json.decodeFromString<MyRoleRow>(trimmed).role
            }
            else -> null
        }
        return roleString?.let { BsdcRole.fromWire(it) }
    }

    suspend fun fetchProfile(uid: String): MemberProfile? {
        val raw = supabase.getJsonText(
            table = "profiles",
            queryPairs = listOf("select" to "*", "uid" to "eq.$uid", "limit" to "1"),
        )
        val rows = json.decodeFromString<List<ProfileRowDto>>(raw)
        return rows.firstOrNull()?.let { ProfileRowCoercer.coerce(it) }
    }

    suspend fun fetchProfileByUsername(username: String): MemberProfile? {
        val normalized = username.trim().lowercase()
        val raw = supabase.getJsonText(
            table = "profiles",
            queryPairs = listOf("select" to "*", "username" to "eq.$normalized", "limit" to "1"),
        )
        val rows = json.decodeFromString<List<ProfileRowDto>>(raw)
        return rows.firstOrNull()?.let { ProfileRowCoercer.coerce(it) }
    }

    suspend fun isUsernameAvailable(username: String): Boolean = coroutineScope {
        val normalized = username.trim().lowercase()
        val reservedDeferred = async {
            supabase.getJsonText(
                table = "reserved_usernames",
                queryPairs = listOf("select" to "username", "username" to "eq.$normalized", "limit" to "1"),
            )
        }
        val takenDeferred = async {
            supabase.getJsonText(
                table = "profiles",
                queryPairs = listOf("select" to "uid", "username" to "eq.$normalized", "limit" to "1"),
            )
        }
        val reservedRows = json.decodeFromString<List<UsernameLookupRow>>(reservedDeferred.await())
        val takenRows = json.decodeFromString<List<UsernameLookupRow>>(takenDeferred.await())
        reservedRows.isEmpty() && takenRows.isEmpty()
    }

    /**
     * Ensures the foreign-key target row exists in `public.profiles` on first sign-in,
     * keeping `username = null` until onboarding completes.
     */
    suspend fun ensureProfile(uid: String, displayName: String, avatarUrl: String = "") {
        val safeName = displayName.trim().take(60).ifEmpty { "Member" }
        val safeAvatar = avatarUrl.trim()
        val payload = buildJsonObject {
            put("uid", uid)
            put("username", JsonNull)
            put("display_name", safeName)
            if (safeAvatar.startsWith("https://")) {
                put("avatar_url", safeAvatar)
            }
        }
        supabase.postJson(
            table = "profiles",
            body = payload,
            queryPairs = listOf("on_conflict" to "uid"),
            prefer = "resolution=ignore-duplicates,return=minimal",
            requireAuth = true,
        )
    }

    /**
     * Exact onboarding write contract matching main-site/src/lib/profile/supabase-backend.ts
     * and migration 0037 allowlist (never includes role/verified/stats columns).
     */
    suspend fun saveOnboardingProfile(uid: String, draft: ProfileDraft): MemberProfile {
        val insertPayload = buildJsonObject {
            put("uid", uid)
            put("username", JsonNull)
            put("display_name", draft.displayName.trim().take(60))
            put("bio", draft.bio.trim().take(280))
            put("avatar_url", draft.avatarUrl.trim())
            put("cover_url", draft.coverUrl.trim())
            put("location", draft.location.trim().take(80))
            put("website", draft.website.trim())
            put("skills", stringJsonArray(draft.skills))
            put("interests", stringJsonArray(draft.interests))
            put("language", draft.language.tag)
            put("onboarding_complete", draft.onboardingComplete)
            put(
                "notifications",
                buildJsonObject {
                    put("followers", true)
                    put("comments", true)
                    put("mentions", true)
                    put("messages", true)
                    put("digest", true)
                },
            )
            put(
                "privacy",
                buildJsonObject {
                    put("discoverable", true)
                    put("showActivity", true)
                    put("showEmail", false)
                    put("showFollowers", true)
                },
            )
        }

        supabase.postJson(
            table = "profiles",
            body = insertPayload,
            queryPairs = listOf("on_conflict" to "uid"),
            prefer = "resolution=ignore-duplicates,return=minimal",
            requireAuth = true,
        )

        val updatePayload = buildJsonObject {
            put("display_name", draft.displayName.trim().take(60))
            put("bio", draft.bio.trim().take(280))
            put("avatar_url", draft.avatarUrl.trim())
            put("cover_url", draft.coverUrl.trim())
            put("location", draft.location.trim().take(80))
            put("website", draft.website.trim())
            put("skills", stringJsonArray(draft.skills))
            put("interests", stringJsonArray(draft.interests))
            put("language", draft.language.tag)
            put("onboarding_complete", draft.onboardingComplete)
        }

        supabase.patchJson(
            table = "profiles",
            body = updatePayload,
            queryPairs = listOf("uid" to "eq.$uid"),
            prefer = "return=minimal",
        )

        val claimRaw = supabase.rpcText(
            functionName = "claim_username",
            params = buildJsonObject {
                put("p_username", draft.username.trim().lowercase())
            },
            requireAuth = true,
        )

        val claimedDto = if (claimRaw.trim().startsWith("[")) {
            json.decodeFromString<List<ProfileRowDto>>(claimRaw).firstOrNull()
        } else {
            json.decodeFromString<ProfileRowDto>(claimRaw)
        }
        return claimedDto?.let { ProfileRowCoercer.coerce(it) }
            ?: throw SupabaseApiException(500, null, "profile/save-failed")
    }

    suspend fun updatePrivacyPrefs(uid: String, privacy: PrivacyPrefs) {
        val body = buildJsonObject {
            put(
                "privacy",
                buildJsonObject {
                    put("discoverable", privacy.discoverable)
                    put("showActivity", privacy.showActivity)
                    put("showEmail", privacy.showEmail)
                    put("showFollowers", privacy.showFollowers)
                },
            )
        }
        supabase.patchJson(
            table = "profiles",
            body = body,
            queryPairs = listOf("uid" to "eq.$uid"),
            prefer = "return=minimal",
        )
    }

    suspend fun fetchStats(uid: String): ProfileStats {
        val raw = supabase.getJsonText(
            table = "profiles",
            queryPairs = listOf(
                "select" to "followers_count,following_count,posts_count,reputation",
                "uid" to "eq.$uid",
                "limit" to "1",
            ),
        )
        val row = json.decodeFromString<List<ProfileStatsRow>>(raw).firstOrNull()
        return ProfileStats(
            followers = (row?.followersCount ?: 0).coerceAtLeast(0),
            following = (row?.followingCount ?: 0).coerceAtLeast(0),
            posts = (row?.postsCount ?: 0).coerceAtLeast(0),
            reputation = (row?.reputation ?: 0).coerceAtLeast(0),
        )
    }

    private fun stringJsonArray(values: List<String>): JsonArray = buildJsonArray {
        values.map { it.trim().take(32) }
            .filter { it.isNotEmpty() }
            .distinctBy { it.lowercase() }
            .take(20)
            .forEach { add(JsonPrimitive(it)) }
    }
}
