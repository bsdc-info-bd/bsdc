package bd.info.bsdc.app.verification

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

class VerificationRepository(private val baseUrl: String, private val publishableKey: String) {
    suspend fun check(lookup: VerificationLookup): VerificationResult = withContext(Dispatchers.IO) {
        when (lookup) {
            is VerificationLookup.Code -> {
                val rows = call("verify_code", JSONObject().put("p_code", lookup.code)) as? JSONArray ?: JSONArray()
                val row = rows.optJSONObject(0) ?: return@withContext VerificationResult.NotFound
                VerificationResult.Document(
                    code = row.optString("code"), kind = row.optString("kind"), state = row.optString("state"),
                    valid = row.optBoolean("valid"), subject = row.optString("subject").nullIfNull(),
                    detail = row.optString("detail").nullIfNull(), issuer = row.optString("issuer").nullIfNull(),
                    issuedOn = row.optString("issued_on").nullIfNull(), expiresOn = row.optString("expires_on").nullIfNull(),
                )
            }
            is VerificationLookup.Report -> {
                val rows = call("verify_performance_report", JSONObject().put("p_id", lookup.id)) as? JSONArray ?: JSONArray()
                val row = rows.optJSONObject(0) ?: return@withContext VerificationResult.NotFound
                val sections = row.optJSONArray("sections") ?: JSONArray()
                VerificationResult.Report(
                    receiptId = row.optString("receipt_id"), app = row.optString("app"), days = row.optInt("days"),
                    title = row.optString("title"), sections = (0 until sections.length()).mapNotNull { sections.optString(it).takeIf(String::isNotBlank) },
                    generatedAt = row.optString("generated_at"), sha256 = row.optString("sha256"),
                )
            }
        }
    }

    private suspend fun call(name: String, body: JSONObject): Any? {
        require(baseUrl.startsWith("https://") && publishableKey.isNotBlank()) { "Verification isn't configured in this build." }
        val connection = (URL("${baseUrl.trimEnd('/')}/rest/v1/rpc/$name").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; connectTimeout = 10_000; readTimeout = 15_000; doOutput = true
            setRequestProperty("apikey", publishableKey)
            if (!publishableKey.startsWith("sb_")) setRequestProperty("Authorization", "Bearer $publishableKey")
            setRequestProperty("Content-Type", "application/json"); setRequestProperty("Accept", "application/json")
        }
        try {
            connection.outputStream.use { it.write(body.toString().toByteArray(StandardCharsets.UTF_8)) }
            val status = connection.responseCode
            val text = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) error(when (status) { in 500..599 -> "BSDC verification is temporarily unavailable."; else -> "The verification request could not be completed." })
            return if (text.isBlank()) JSONArray() else JSONArray(text)
        } finally { connection.disconnect() }
    }

    private fun String.nullIfNull(): String? = takeUnless { it.isBlank() || it == "null" }
}

sealed interface VerificationResult {
    data object NotFound : VerificationResult
    data class Document(val code: String, val kind: String, val state: String, val valid: Boolean, val subject: String?, val detail: String?, val issuer: String?, val issuedOn: String?, val expiresOn: String?) : VerificationResult
    data class Report(val receiptId: String, val app: String, val days: Int, val title: String, val sections: List<String>, val generatedAt: String, val sha256: String) : VerificationResult
}
