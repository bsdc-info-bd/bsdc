package bd.info.bsdc.app.links

import java.net.URI

/** Only approved BSDC URLs can become in-app destinations. Never trust intent extras. */
sealed interface IncomingLink {
    data class Internal(val path: String) : IncomingLink
    data class News(val url: String) : IncomingLink
    data object Ignore : IncomingLink
}

object IncomingLinkParser {
    private val appHosts = setOf("www.bsdc.info.bd", "bsdc.info.bd", "vf.main.bsdc.info.bd")
    private const val NEWS_HOST = "news.bsdc.info.bd"

    fun parse(raw: String?): IncomingLink {
        if (raw.isNullOrBlank()) return IncomingLink.Ignore
        val uri = runCatching { URI(raw.trim()) }.getOrNull() ?: return IncomingLink.Ignore
        if (uri.scheme.equals("bsdc", ignoreCase = true)) {
            val path = listOfNotNull(uri.host?.takeIf(String::isNotBlank), uri.rawPath?.trimStart('/'))
                .filter(String::isNotBlank).joinToString("/").let { "/$it" }
            return internal(path)
        }
        if (!uri.scheme.equals("https", ignoreCase = true) || uri.rawUserInfo != null || uri.port != -1) return IncomingLink.Ignore
        val host = uri.host?.lowercase() ?: return IncomingLink.Ignore
        val path = uri.rawPath?.ifBlank { "/" } ?: "/"
        if (host == NEWS_HOST) return IncomingLink.News(uri.toString())
        if (host !in appHosts) return IncomingLink.Ignore
        return internal(path + (uri.rawQuery?.let { "?$it" } ?: "") + (uri.rawFragment?.let { "#$it" } ?: ""))
    }

    private fun internal(path: String): IncomingLink.Internal {
        val clean = path.ifBlank { "/" }.let { if (it.startsWith('/')) it else "/$it" }
        return IncomingLink.Internal(if (clean.startsWith("/post/")) clean.replaceFirst("/post/", "/p/") else clean)
    }
}
