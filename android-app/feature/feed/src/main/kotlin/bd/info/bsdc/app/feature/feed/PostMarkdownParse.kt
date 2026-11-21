package bd.info.bsdc.app.feature.feed

/**
 * The block grammar a post is read with, on the app's side.
 *
 * This used to be a private function inside the renderer file, which is a polite way of saying it had
 * no tests: proving anything about it needed a device, and a device is not something this repository
 * can assert. The model and the parser now live here, and the renderer only paints what they return.
 *
 * Two block types are new. `1.` items and `- [ ]` boxes have both been valid Markdown that the
 * website renders properly — and the app printed as an ordinary paragraph, or as a bullet whose text
 * was literally "[x] buy milk". The composer's own toolbar has been offering a "1." button the whole
 * time, so the app was handing members a tool that produced syntax it could not read.
 */
internal sealed interface MarkdownBlock {
    data class Heading(val level: Int, val text: String) : MarkdownBlock
    data class Quote(val text: String) : MarkdownBlock
    data class Bullet(val text: String) : MarkdownBlock

    /**
     * An `1.` item. The author's number is kept rather than renumbered from one, because a reader who
     * wrote "3. deploy" and sees "1. deploy" loses the step they meant.
     */
    data class Ordered(val index: Int, val text: String) : MarkdownBlock

    /** A `- [x]` item, with the box actually drawn instead of the brackets left in the text. */
    data class Task(val checked: Boolean, val text: String) : MarkdownBlock

    data class CodeFence(val language: String, val code: String) : MarkdownBlock
    data class Paragraph(val text: String) : MarkdownBlock
}

/**
 * `1.` / `1)` items. The pattern is matched against the trimmed line, because the reader has always
 * trimmed before it looked for a marker; a stricter rule here would be a grammar the rest of this
 * function does not have.
 */
private val ORDERED_ITEM = Regex("""^(\d{1,9})[.)]\s+(.*)$""")

/** `- [ ]` / `* [x]` task items, tried before the bullet rule or the box is swallowed as text. */
private val TASK_ITEM = Regex("""^[-*+]\s*\[([ xX])]\s*(.*)$""")

internal fun parseMarkdownBlocks(raw: String): List<MarkdownBlock> {
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
            TASK_ITEM.matches(trimmed) -> {
                flushPara()
                val match = TASK_ITEM.matchEntire(trimmed)!!
                out += MarkdownBlock.Task(
                    checked = match.groupValues[1].lowercase() == "x",
                    text = match.groupValues[2].trim(),
                )
            }
            trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("+ ") -> {
                flushPara()
                out += MarkdownBlock.Bullet(trimmed.drop(2).trim())
            }
            ORDERED_ITEM.matches(trimmed) -> {
                flushPara()
                val match = ORDERED_ITEM.matchEntire(trimmed)!!
                out += MarkdownBlock.Ordered(
                    index = match.groupValues[1].toIntOrNull() ?: 1,
                    text = match.groupValues[2].trim(),
                )
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
