package bd.info.bsdc.app.feature.discover

import bd.info.bsdc.app.core.model.BsdcHosts
import java.net.URLEncoder

/** Pure rules for the project screen: the public address, the share text, and the tech chips. */
object ProjectDetailLogic {
    /** The same address the website uses for a project, so a shared link opens the same page. */
    fun webUrl(slug: String): String {
        val encoded = URLEncoder.encode(slug.trim(), Charsets.UTF_8.name()).replace("+", "%20")
        return "${BsdcHosts.SITE_ORIGIN}/projects/$encoded"
    }

    /** Share text: the name, the tagline when there is one, then the link. Never blank. */
    fun shareText(name: String, tagline: String, url: String): String {
        val title = name.trim().ifBlank { "BSDC" }
        val line = tagline.trim()
        return if (line.isEmpty()) "$title\n$url" else "$title — $line\n$url"
    }

    /** Tech chips: trimmed, blanks dropped, case-insensitive duplicates removed, order kept. */
    fun techChips(tech: List<String>): List<String> =
        tech.map { it.trim() }.filter { it.isNotEmpty() }.distinctBy { it.lowercase() }
}
