package bd.info.bsdc.app.feature.compose

/**
 * The text window a formatting button acts on, and the window it produces.
 *
 * These are pure functions so the composer's toolbar can be tested on the JVM
 * without a device: the screen only has to put the result back into the field and
 * move the cursor.
 */
data class MarkdownEdit(val text: String, val start: Int, val end: Int)

object MarkdownInsert {
    private fun clamp(text: String, start: Int, end: Int): Pair<Int, Int> {
        val limit = text.length
        val safeStart = start.coerceIn(0, limit)
        val safeEnd = end.coerceIn(safeStart, limit)
        return safeStart to safeEnd
    }

    private fun select(text: String, start: Int, end: Int): MarkdownEdit {
        val (safeStart, safeEnd) = clamp(text, start, end)
        return MarkdownEdit(text, safeStart, safeEnd)
    }

    /** Wraps the selection, or unwraps it when it is already wrapped. */
    fun wrap(
        text: String,
        start: Int,
        end: Int,
        before: String,
        after: String,
        placeholder: String = "",
    ): MarkdownEdit {
        val (from, to) = clamp(text, start, end)
        val wrapped =
            from >= before.length &&
                text.substring(from - before.length, from) == before &&
                text.substring(to, minOf(to + after.length, text.length)) == after

        if (wrapped) {
            val innerStart = from - before.length
            val innerEnd = to + after.length
            val unwrapped = text.substring(0, innerStart) + text.substring(from, to) + text.substring(innerEnd)
            return select(unwrapped, innerStart, innerStart + (to - from))
        }

        val selected = text.substring(from, to)
        val body = if (selected.isNotEmpty()) selected else placeholder
        val next = text.substring(0, from) + before + body + after + text.substring(to)
        return select(next, from + before.length, from + before.length + body.length)
    }

    /** Adds the prefix to every touched line, or removes it when all carry it. */
    fun linePrefix(text: String, start: Int, end: Int, prefix: String): MarkdownEdit {
        val (from, to) = clamp(text, start, end)
        val lineStart = if (from == 0) 0 else text.lastIndexOf('\n', from - 1) + 1
        val nextBreak = text.indexOf('\n', to)
        val lineEnd = if (nextBreak == -1) text.length else nextBreak

        val block = text.substring(lineStart, lineEnd)
        val lines = block.split('\n')
        val meaningful = lines.filter { it.isNotBlank() }
        val everyCarries = meaningful.isNotEmpty() && meaningful.all { it.startsWith(prefix) }

        val nextLines = lines.map { line ->
            when {
                everyCarries -> line.removePrefix(prefix)
                line.isBlank() -> line
                else -> prefix + line
            }
        }
        val nextBlock = nextLines.joinToString("\n")
        val next = text.substring(0, lineStart) + nextBlock + text.substring(lineEnd)
        return select(next, lineStart, lineStart + nextBlock.length)
    }

    /** Turns the selection into a link label and selects the url. */
    fun link(text: String, start: Int, end: Int, url: String = ""): MarkdownEdit {
        val (from, to) = clamp(text, start, end)
        val label = text.substring(from, to)
        if (label.isEmpty()) {
            val inserted = "[link text]($url)"
            val next = text.substring(0, from) + inserted + text.substring(to)
            return select(next, from + 1, from + 10)
        }
        val inserted = "[$label]($url)"
        val next = text.substring(0, from) + inserted + text.substring(to)
        val urlStart = from + label.length + 3
        return select(next, urlStart, urlStart + url.length)
    }

    /** Inserts an image reference on its own line. */
    fun image(text: String, start: Int, url: String, alt: String = ""): MarkdownEdit {
        val (from, _) = clamp(text, start, start)
        val prefix = if (from == 0 || text[from - 1] == '\n') "" else "\n\n"
        val inserted = "$prefix![$alt]($url)\n"
        val next = text.substring(0, from) + inserted + text.substring(from)
        val caret = from + inserted.length
        return select(next, caret, caret)
    }

    /** Fences the selection as a code block. */
    fun codeBlock(text: String, start: Int, end: Int, language: String = ""): MarkdownEdit {
        val (from, to) = clamp(text, start, end)
        val body = text.substring(from, to)
        val inserted = "```$language\n$body\n```"
        val next = text.substring(0, from) + inserted + text.substring(to)
        return if (body.isEmpty()) {
            select(next, from + 3 + language.length + 1, from + 3 + language.length + 1)
        } else {
            select(next, from + inserted.length, from + inserted.length)
        }
    }

    /**
     * Continues a list item when Enter is pressed at its end, and ends the list
     * on an empty item. Null means "let Enter do what it always does".
     */
    fun continueList(text: String, start: Int, end: Int): MarkdownEdit? {
        if (start != end) return null
        val caret = start.coerceIn(0, text.length)
        val lineStart = if (caret == 0) 0 else text.lastIndexOf('\n', caret - 1) + 1
        val line = text.substring(lineStart, caret)

        val ordered = Regex("^(\\s*)(\\d+)\\.\\s(.*)$").find(line)
        val unordered = Regex("^(\\s*)([-*+])\\s(.*)$").find(line)
        val quote = Regex("^(\\s*)(>)\\s?(.*)$").find(line)
        val match = ordered ?: unordered ?: quote ?: return null

        val indent = match.groupValues[1]
        val marker = match.groupValues[2]
        val rest = match.groupValues[3]
        if (rest.isBlank()) {
            val next = text.removeRange(lineStart, caret)
            return select(next, lineStart, lineStart)
        }

        val nextMarker = if (ordered != null) "${marker.toInt() + 1}." else marker
        val inserted = "\n$indent$nextMarker "
        val next = text.substring(0, caret) + inserted + text.substring(caret)
        val nextCaret = caret + inserted.length
        return select(next, nextCaret, nextCaret)
    }
}
