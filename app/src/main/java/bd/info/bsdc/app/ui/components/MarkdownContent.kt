package bd.info.bsdc.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.content.PostEmbed
import bd.info.bsdc.app.content.PublishingTools

/** Native, deliberately conservative Markdown display. No HTML or JavaScript executes in-app. */
@Composable
fun MarkdownDocument(
    source: String,
    modifier: Modifier = Modifier,
    maxLines: Int = Int.MAX_VALUE,
    showEmbeds: Boolean = true
) {
    val parsed = PublishingTools.splitFrontmatter(source)
    val lines = parsed.content.lines()
    var code = false
    var used = 0
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        lines.forEach { raw ->
            if (used >= maxLines) return@forEach
            val line = raw.trimEnd()
            when {
                line.startsWith("```") -> {
                    code = !code
                    used++
                }
                code -> {
                    Text(
                        line,
                        modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)).padding(10.dp),
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.bodySmall
                    )
                    used++
                }
                line.startsWith("# ") -> { Text(line.removePrefix("# "), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold); used++ }
                line.startsWith("## ") -> { Text(line.removePrefix("## "), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold); used++ }
                line.startsWith("### ") -> { Text(line.removePrefix("### "), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold); used++ }
                line.startsWith("> ") -> {
                    val quote = line.removePrefix("> ")
                    Text("“$quote”", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyLarge)
                    used++
                }
                line.startsWith("- ") || line.startsWith("* ") -> { Text("• ${line.drop(2)}", style = MaterialTheme.typography.bodyLarge); used++ }
                line.matches(Regex("\\d+\\. .*")) -> { Text(line, style = MaterialTheme.typography.bodyLarge); used++ }
                line.isNotBlank() && !line.startsWith("{{") -> { MarkdownLine(line); used++ }
            }
        }
        if (showEmbeds) PublishingTools.extractEmbeds(source).forEach { EmbedCard(it) }
    }
}

@Composable
private fun MarkdownLine(line: String) {
    // Keep Markdown source transparent while adding small readability cues for inline code.
    val hasCode = line.contains('`')
    Text(
        line.replace("**", "").replace("__", "").replace("*", ""),
        style = MaterialTheme.typography.bodyLarge,
        fontFamily = if (hasCode && line.startsWith('`')) FontFamily.Monospace else FontFamily.Default
    )
}

@Composable
fun EmbedCard(embed: PostEmbed) {
    val uriHandler = LocalUriHandler.current
    val label = when (embed.type) {
        "gist" -> "GitHub Gist"
        "codepen" -> "CodePen"
        "youtube" -> "YouTube link"
        "twitter" -> "X / Twitter post"
        else -> "External link"
    }
    Card(
        modifier = Modifier.fillMaxWidth().clickable { uriHandler.openUri(embed.url) },
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
        shape = RoundedCornerShape(14.dp)
    ) {
        Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Icons.Outlined.Code, contentDescription = null)
            Column(Modifier.weight(1f)) {
                Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                Text(embed.url, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (embed.type == "youtube") Text(
                    "Opens externally — BSDC does not upload or play video media.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer
                )
            }
            Icon(Icons.Outlined.OpenInNew, contentDescription = "Open $label")
        }
    }
}
