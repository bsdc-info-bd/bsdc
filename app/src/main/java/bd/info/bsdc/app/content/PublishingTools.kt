package bd.info.bsdc.app.content

/**
 * Small, dependency-free publishing helpers. Markdown remains the portable source of truth;
 * the Android client deliberately does not execute HTML, JavaScript, or arbitrary embeds.
 */
data class FrontmatterResult(
    val metadata: Map<String, String>,
    val content: String,
    val hasFrontmatter: Boolean
)

data class PostEmbed(
    val type: String = "link",
    val url: String = "",
    val label: String? = null
)

object PublishingTools {
    private const val delimiter = "---"
    private val embedPattern = Regex(
        """\{\{\s*(?:embed\s+)?(gist|codepen|youtube|twitter|x)\s+(?:url\s*=\s*)?[\"']?([^\s\}"']+)[\"']?\s*}}""",
        RegexOption.IGNORE_CASE
    )

    /** Accepts simple YAML-like key/value frontmatter and leaves malformed source untouched. */
    fun splitFrontmatter(source: String): FrontmatterResult {
        val normalized = source.replace("\r\n", "\n")
        if (!normalized.startsWith("$delimiter\n")) return FrontmatterResult(emptyMap(), source, false)
        val close = normalized.indexOf("\n$delimiter\n", startIndex = delimiter.length + 1)
        if (close < 0) return FrontmatterResult(emptyMap(), source, false)
        val header = normalized.substring(delimiter.length + 1, close)
        val metadata = linkedMapOf<String, String>()
        header.lineSequence().forEach { line ->
            val separator = line.indexOf(':')
            if (separator > 0) {
                val key = normalizeMetadataKey(line.substring(0, separator))
                val value = line.substring(separator + 1).trim().trim('"')
                if (key != null && value.isNotBlank()) metadata[key] = value.take(280)
            }
        }
        return FrontmatterResult(metadata, normalized.substring(close + delimiter.length + 2), true)
    }

    fun withFrontmatter(content: String, metadata: Map<String, String>): String {
        val cleanContent = splitFrontmatter(content).content.trimStart()
        val fields = metadata.entries
            .mapNotNull { (rawKey, rawValue) ->
                val key = normalizeMetadataKey(rawKey) ?: return@mapNotNull null
                val value = rawValue.trim().replace("\n", " ").take(280)
                if (value.isBlank()) null else "$key: ${quoteWhenNeeded(value)}"
            }
            .take(12)
        return if (fields.isEmpty()) cleanContent else buildString {
            append(delimiter).append('\n')
            fields.forEach { append(it).append('\n') }
            append(delimiter).append("\n\n")
            append(cleanContent)
        }
    }

    fun parseMetadataLines(lines: String): Map<String, String> = lines.lineSequence()
        .mapNotNull { line ->
            val separator = line.indexOf(':')
            if (separator <= 0) return@mapNotNull null
            val key = normalizeMetadataKey(line.substring(0, separator)) ?: return@mapNotNull null
            val value = line.substring(separator + 1).trim().trim('"').take(280)
            if (value.isBlank()) null else key to value
        }
        .take(12)
        .toMap(linkedMapOf())

    fun metadataLines(metadata: Map<String, String>): String = metadata.entries
        .sortedBy { it.key }
        .joinToString("\n") { "${it.key}: ${it.value}" }

    fun extractEmbeds(source: String): List<PostEmbed> = embedPattern.findAll(source)
        .mapNotNull { match ->
            val type = match.groupValues[1].lowercase().let { if (it == "x") "twitter" else it }
            val url = match.groupValues[2].trim()
            if (isAllowedEmbed(type, url)) PostEmbed(type = type, url = url) else null
        }
        .distinctBy { "${it.type}|${it.url}" }
        .take(8)
        .toList()

    fun liquidTag(type: String, url: String): String? {
        val normalized = type.lowercase().let { if (it == "x") "twitter" else it }
        return if (isAllowedEmbed(normalized, url.trim())) "{{${normalized} url=\"${url.trim()}\"}}" else null
    }

    fun isAllowedEmbed(type: String, url: String): Boolean {
        val uri = runCatching { java.net.URI(url) }.getOrNull() ?: return false
        if (uri.scheme?.lowercase() != "https") return false
        val host = uri.host?.lowercase() ?: return false
        val expectedHosts = when (type.lowercase()) {
            "gist" -> listOf("gist.github.com")
            "codepen" -> listOf("codepen.io")
            "youtube" -> listOf("youtube.com", "www.youtube.com", "youtu.be")
            "twitter", "x" -> listOf("x.com", "www.x.com", "twitter.com", "www.twitter.com")
            else -> emptyList()
        }
        return expectedHosts.any { host == it || host.endsWith(".$it") }
    }

    private fun normalizeMetadataKey(raw: String): String? {
        val key = raw.trim().lowercase().replace(' ', '-')
        return key.takeIf { it.matches(Regex("[a-z][a-z0-9_-]{0,47}")) }
    }

    private fun quoteWhenNeeded(value: String): String =
        if (value.contains(':') || value.contains('#') || value.startsWith(' ') || value.endsWith(' ')) "\"${value.replace("\"", "'")}\"" else value
}
