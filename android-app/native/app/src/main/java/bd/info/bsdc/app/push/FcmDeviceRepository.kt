package bd.info.bsdc.app.push

import android.content.Context
import com.google.firebase.auth.FirebaseUser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.UUID

class FcmDeviceRepository(context: Context, private val baseUrl: String, private val publishableKey: String) {
    private val preferences = context.applicationContext.getSharedPreferences("bsdc_fcm_device", Context.MODE_PRIVATE)
    fun configured(): Boolean = baseUrl.startsWith("https://") && publishableKey.isNotBlank()
    private fun deviceId(): String = preferences.getString("device_id", null) ?: UUID.randomUUID().toString().also { preferences.edit().putString("device_id", it).apply() }

    suspend fun register(user: FirebaseUser, fcmToken: String) = withContext(Dispatchers.IO) {
        val idToken = user.getIdToken(false).await().token ?: error("Could not refresh the account token.")
        rpc("register_fcm_device", idToken, JSONObject().put("p_device_id", deviceId()).put("p_token", fcmToken).put("p_language", if (java.util.Locale.getDefault().language == "en") "en" else "bn"))
    }

    suspend fun unregister(user: FirebaseUser) = withContext(Dispatchers.IO) {
        val idToken = user.getIdToken(false).await().token ?: error("Could not refresh the account token.")
        rpc("unregister_fcm_device", idToken, JSONObject().put("p_device_id", deviceId()))
    }

    private suspend fun rpc(name: String, idToken: String, body: JSONObject) {
        require(baseUrl.startsWith("https://") && publishableKey.isNotBlank()) { "Notification registration is not configured." }
        val conn = (URL("${baseUrl.trimEnd('/')}/rest/v1/rpc/$name").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; connectTimeout = 10_000; readTimeout = 15_000; doOutput = true
            setRequestProperty("apikey", publishableKey); setRequestProperty("Authorization", "Bearer $idToken")
            setRequestProperty("Content-Type", "application/json"); setRequestProperty("Accept", "application/json")
        }
        try {
            conn.outputStream.use { it.write(body.toString().toByteArray(StandardCharsets.UTF_8)) }
            val status = conn.responseCode
            if (status !in 200..299) {
                conn.errorStream?.use { it.readBytes() }
                error(if (status == 401 || status == 403) "Sign in again to update notification devices." else "Could not update this device's notification registration.")
            }
            conn.inputStream?.use { it.readBytes() }
        } finally { conn.disconnect() }
    }

}
