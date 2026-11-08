package bd.info.bsdc.app.verification

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.Locale
import java.util.UUID

sealed interface VerificationLookup {
    data class Code(val code: String) : VerificationLookup
    data class Report(val id: String) : VerificationLookup
}

object QrPayloadParser {
    private val acceptedHosts = setOf("vf.main.bsdc.info.bd", "vf.bsdc.info.bd")
    private val codePattern = Regex("BSDC-[A-Z]{2}-[0-9A-Z]{8}-[0-9]")

    fun parse(raw: String?): VerificationLookup? {
        val value = raw?.trim()?.takeIf { it.isNotEmpty() && it.length <= 2048 } ?: return null
        if (codePattern.matches(value.uppercase(Locale.ROOT))) return VerificationLookup.Code(value.uppercase(Locale.ROOT))
        val uri = runCatching { URI(value) }.getOrNull() ?: return null
        if (uri.scheme != "https" || uri.host?.lowercase(Locale.ROOT) !in acceptedHosts || uri.rawUserInfo != null || uri.port != -1 || uri.rawFragment != null) return null
        if (uri.rawPath.orEmpty().trimEnd('/') !in setOf("", "/")) return null
        val query = uri.rawQuery ?: return null
        val pairs = runCatching {
            query.split('&').map { pair ->
                val parts = pair.split('=', limit = 2)
                require(parts.size == 2)
                URLDecoder.decode(parts[0], StandardCharsets.UTF_8) to URLDecoder.decode(parts[1], StandardCharsets.UTF_8)
            }
        }.getOrNull() ?: return null
        if (pairs.map { it.first }.distinct().size != pairs.size || pairs.size != 1) return null
        val params = pairs.toMap()
        val code = params["code"] ?: params["c"]
        if (code != null && codePattern.matches(code.uppercase(Locale.ROOT))) return VerificationLookup.Code(code.uppercase(Locale.ROOT))
        val report = params["report"]?.lowercase(Locale.ROOT)
        if (report != null && runCatching { UUID.fromString(report).toString() == report }.getOrDefault(false)) return VerificationLookup.Report(report)
        return null
    }
}
