package bd.info.bsdc.app.feature.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcCodeTextStyle
import bd.info.bsdc.app.core.designsystem.BsdcPalette
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens

private sealed interface MarkdownBlock {
    data class Heading(val level: Int, val text: String) : MarkdownBlock
    data class Quote(val text: String) : MarkdownBlock
    data class Bullet(val text: String) : MarkdownBlock
    data class CodeFence(val language: String, val code: String) : MarkdownBlock
    data class Paragraph(val text: String) : MarkdownBlock
}

@Composable
fun PostMarkdownRenderer(
    markdown: String,
    modifier: Modifier = Modifier,
) {
    val tokens = BsdcThemeTokens.colors
    val primaryText = MaterialTheme.colorScheme.onSurface
    val blocks = remember(markdown) { parseMarkdownBlocks(markdown) }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        blocks.forEach { block ->
            when (block) {
                is MarkdownBlock.Heading -> {
                    val style = when (block.level) {
                        1 -> MaterialTheme.typography.headlineMedium
                        2 -> MaterialTheme.typography.titleLarge
                        else -> MaterialTheme.typography.titleMedium
                    }
                    Text(
                        text = renderInlineMarkdown(block.text, tokens.brandStrong),
                        style = style,
                        color = primaryText,
                    )
                }

                is MarkdownBlock.Quote -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(tokens.surfaceElevated)
                            .border(1.dp, tokens.border, RoundedCornerShape(8.dp))
                            .padding(start = 12.dp, top = 10.dp, end = 12.dp, bottom = 10.dp),
                    ) {
                        Text(
                            text = renderInlineMarkdown(block.text, tokens.brandStrong),
                            style = MaterialTheme.typography.bodyMedium.copy(fontStyle = FontStyle.Italic),
                            color = tokens.mutedText,
                        )
                    }
                }

                is MarkdownBlock.Bullet -> {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Text(
                            text = "•",
                            style = MaterialTheme.typography.bodyLarge,
                            color = tokens.brandStrong,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = renderInlineMarkdown(block.text, tokens.brandStrong),
                            style = MaterialTheme.typography.bodyLarge,
                            color = primaryText,
                        )
                    }
                }

                is MarkdownBlock.CodeFence -> {
                    BsdcCodeSnippetBlock(
                        code = block.code,
                        language = block.language,
                    )
                }

                is MarkdownBlock.Paragraph -> {
                    Text(
                        text = renderInlineMarkdown(block.text, tokens.brandStrong),
                        style = MaterialTheme.typography.bodyLarge,
                        color = primaryText,
                    )
                }
            }
        }
    }
}

@Composable
fun BsdcCodeSnippetBlock(
    code: String,
    language: String,
    modifier: Modifier = Modifier,
) {
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BsdcPalette.LightGreen900),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFF0F291E))
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = language.ifBlank { "code" }.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = BsdcPalette.LightGreen300,
                fontWeight = FontWeight.SemiBold,
            )
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable {
                        clipboard.setText(AnnotatedString(code))
                        copied = true
                    }
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(
                    imageVector = if (copied) Icons.Rounded.Check else Icons.Rounded.ContentCopy,
                    contentDescription = "Copy code",
                    tint = if (copied) BsdcPalette.LightGreen300 else Color(0xFFCBD5E1),
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = if (copied) "Copied" else "Copy",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (copied) BsdcPalette.LightGreen300 else Color(0xFFCBD5E1),
                )
            }
        }
        Text(
            text = code,
            style = BsdcCodeTextStyle,
            color = Color(0xFFE9F2ED),
            modifier = Modifier
                .horizontalScroll(rememberScrollState())
                .padding(14.dp),
        )
    }
}

private fun parseMarkdownBlocks(raw: String): List<MarkdownBlock> {
    if (raw.isBlank()) return emptyList()
    val lines = raw.replace("\r\n", "\n").lines()
    val out = mutableListOf<MarkdownBlock>()
    val paraBuffer = mutableListOf<String>()
    var inCode = false
    var codeLang = ""
    val codeBuffer = mutableListOf<String>()

    fun flushPara() {
        if (paraBuffer.isNotEmpty()) {
            out += MarkdownBlock.Paragraph(paraBuffer.joinToString("\n"))
            paraBuffer.clear()
        }
    }

    for (line in lines) {
        val trimmed = line.trim()
        if (trimmed.startsWith("```")) {
            if (inCode) {
                out += MarkdownBlock.CodeFence(codeLang, codeBuffer.joinToString("\n"))
                codeBuffer.clear()
                codeLang = ""
                inCode = false
            } else {
                flushPara()
                inCode = true
                codeLang = trimmed.removePrefix("```").trim()
            }
            continue
        }
        if (inCode) {
            codeBuffer += line
            continue
        }
        if (trimmed.isEmpty()) {
            flushPara()
            continue
        }
        when {
            trimmed.startsWith("### ") -> {
                flushPara()
                out += MarkdownBlock.Heading(3, trimmed.removePrefix("### ").trim())
            }
            trimmed.startsWith("## ") -> {
                flushPara()
                out += MarkdownBlock.Heading(2, trimmed.removePrefix("## ").trim())
            }
            trimmed.startsWith("# ") -> {
                flushPara()
                out += MarkdownBlock.Heading(1, trimmed.removePrefix("# ").trim())
            }
            trimmed.startsWith("> ") -> {
                flushPara()
                out += MarkdownBlock.Quote(trimmed.removePrefix("> ").trim())
            }
            trimmed.startsWith("- ") || trimmed.startsWith("* ") -> {
                flushPara()
                out += MarkdownBlock.Bullet(trimmed.drop(2).trim())
            }
            else -> paraBuffer += line
        }
    }

    if (inCode && codeBuffer.isNotEmpty()) {
        out += MarkdownBlock.CodeFence(codeLang, codeBuffer.joinToString("\n"))
    }
    flushPara()
    return out
}

private fun renderInlineMarkdown(text: String, accentColor: Color): AnnotatedString = buildAnnotatedString {
    var i = 0
    while (i < text.length) {
        if (text.startsWith("**", i)) {
            val end = text.indexOf("**", i + 2)
            if (end > i + 2) {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                    append(text.substring(i + 2, end))
                }
                i = end + 2
                continue
            }
        }
        if (text[i] == '`') {
            val end = text.indexOf('`', i + 1)
            if (end > i + 1) {
                withStyle(
                    SpanStyle(
                        fontFamily = FontFamily.Monospace,
                        color = accentColor,
                        fontWeight = FontWeight.Medium,
                    ),
                ) {
                    append(text.substring(i + 1, end))
                }
                i = end + 1
                continue
            }
        }
        append(text[i])
        i += 1
    }
}
