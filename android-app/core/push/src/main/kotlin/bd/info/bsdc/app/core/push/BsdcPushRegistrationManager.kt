package bd.info.bsdc.app.core.push

import android.content.Context
import android.os.Build
import bd.info.bsdc.app.core.database.BsdcDatabase
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.network.BsdcHttpClientFactory
import bd.info.bsdc.app.core.network.SupabaseRestClient
import com.google.firebase.FirebaseApp
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

interface PushRuntimeDependencies {
    fun provideSupabaseRestClient(): SupabaseRestClient
    fun provideDatabase(): BsdcDatabase
    fun providePushRegistrationManager(): BsdcPushRegistrationManager
}

@Serializable
data class RegisteredFcmDevice(
    @SerialName("token_hash") val tokenHash: String = "",
    val platform: String = "android",
    @SerialName("user_agent") val userAgent: String = "",
    val language: String = "bn",
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("last_used_at") val lastUsedAt: String? = null,
    val state: String = "live",
)

/**
 * Registers the native Android FCM token with Postgres `register_fcm_token('android')`,
 * maintains best-effort Firestore device parity (`devices/{uid}/tokens/{hash}`),
 * and cleanly unregisters on sign-out / account switch.
 */
class BsdcPushRegistrationManager(
    private val appContext: Context,
    private val supabase: SupabaseRestClient,
) {
    private val json = BsdcHttpClientFactory.sharedJson

    @Volatile
    private var lastRegisteredUid: String? = null

    @Volatile
    private var lastToken: String? = null

    suspend fun registerCurrentDevice(
        uid: String,
        language: AppLanguage,
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            PushChannelManager.ensureChannels(appContext)
            if (FirebaseApp.getApps(appContext).isEmpty()) {
                error("Firebase is not initialized in this build")
            }
            val token = FirebaseMessaging.getInstance().token.await()
            require(token.length >= 20) { "Invalid FCM token received" }
            registerRawToken(uid, token, language)
        }
    }

    suspend fun registerRawToken(
        uid: String,
        token: String,
        language: AppLanguage,
    ): String = withContext(Dispatchers.IO) {
        val ua = "BSDC-Android/${Build.VERSION.RELEASE} (${Build.MANUFACTURER} ${Build.MODEL})"
        val langTag = if (language == AppLanguage.EN) "en" else "bn"
        val rawHash = supabase.rpcText(
            functionName = "register_fcm_token",
            params = buildJsonObject {
                put("p_token", token)
                put("p_platform", "android")
                put("p_user_agent", ua.take(400))
                put("p_language", langTag)
            },
            requireAuth = true,
        )
        val tokenHash = rawHash.trim().trim('"')
        lastRegisteredUid = uid
        lastToken = token
        syncFirestoreDeviceBestEffort(uid, tokenHash, langTag)
        tokenHash
    }

    suspend fun unregisterOnSignOut(previousUid: String?) = withContext(Dispatchers.IO) {
        val token = lastToken ?: runCatching {
            if (FirebaseApp.getApps(appContext).isNotEmpty()) {
                FirebaseMessaging.getInstance().token.await()
            } else null
        }.getOrNull()

        if (!token.isNullOrBlank()) {
            runCatching {
                supabase.rpcText(
                    functionName = "forget_fcm_token",
                    params = buildJsonObject { put("p_token", token) },
                    requireAuth = true,
                )
            }
        }
        lastToken = null
        lastRegisteredUid = null
    }

    suspend fun listMyDevices(): List<RegisteredFcmDevice> = withContext(Dispatchers.IO) {
        val raw = supabase.rpcText("my_fcm_devices", requireAuth = true)
        json.decodeFromString<List<RegisteredFcmDevice>>(raw)
    }

    suspend fun forgetDeviceByHash(tokenHash: String) = withContext(Dispatchers.IO) {
        supabase.rpcText(
            functionName = "forget_fcm_device",
            params = buildJsonObject { put("p_token_hash", tokenHash) },
            requireAuth = true,
        )
        val uid = lastRegisteredUid
        if (!uid.isNullOrBlank() && FirebaseApp.getApps(appContext).isNotEmpty()) {
            runCatching {
                FirebaseFirestore.getInstance()
                    .collection("devices")
                    .document(uid)
                    .collection("tokens")
                    .document(tokenHash)
                    .delete()
                    .await()
            }
        }
    }

    private suspend fun syncFirestoreDeviceBestEffort(
        uid: String,
        tokenHash: String,
        languageTag: String,
    ) {
        if (tokenHash.isBlank() || FirebaseApp.getApps(appContext).isEmpty()) return
        runCatching {
            val data = mapOf(
                "tokenHash" to tokenHash,
                "platform" to "android",
                "language" to languageTag,
                "updatedAt" to FieldValue.serverTimestamp(),
            )
            FirebaseFirestore.getInstance()
                .collection("devices")
                .document(uid)
                .collection("tokens")
                .document(tokenHash)
                .set(data, SetOptions.merge())
                .await()
        }
    }
}
