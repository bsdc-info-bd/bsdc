package bd.info.bsdc.app.feature.compose

/**
 * What the composer's Markdown is made of, and what the app's reader will not render.
 *
 * The editor is only half a promise: a member can write anything, but the post is *read* through
 * [bd.info.bsdc.app.feature.feed.parseMarkdownBlocks], whose grammar is deliberately small — three
 * heading levels, bullets, numbered items, task boxes, a quote, a fence, paragraphs. An editor that
 * silently accepts `####` or a pipe table has written a cheque the reader cannot cash: the post looks
 * right in the composer and arrives as a wall of plain text.
 *
 * Numbered items and task boxes are not on that list any more. They were, which is why this file once
 * warned about them; the reader learned both rules, so the warning went.
 *
 * So the inspector reads the body against the reader's own rules and says, before publishing, what
 * will render as-is and what will show as plain text. It is pure and total: no document is refused,
 * nothing is rewritten, and no syntax is invented that the reader does not already honour.
 */

/** One heading, with the line it sits on (1-based) so the outline can move the caret there. */
data class MarkdownHeading(val level: Int, val text: String, val line: Int)

/** Something the reader will treat differently than the member meant. */
enum class MarkdownNoteKind {
    /** A ``` fence that is never closed; the reader renders the rest of the post as code. */
    UNCLOSED_FENCE,

    /** `**` in odd numbers — one half of a bold run, which the reader prints literally. */
    UNBALANCED_BOLD,

    /** `####` and deeper: the reader styles three levels and treats the rest as a paragraph. */
    HEADING_TOO_DEEP,

    /** A pipe table, which the reader has no block for. */
    TABLE,

    /** A heading marker with nothing after it. */
    EMPTY_HEADING,

    /** `![alt]()` — an image with no address. */
    IMAGE_WITHOUT_URL,
    ;
}

data class MarkdownNote(val kind: MarkdownNoteKind, val line: Int)

/** The composer's read of the body: enough to show, and only that. */
data class MarkdownReport(
    val words: Int = 0,
    val characters: Int = 0,
    val readingMinutes: Int = 0,
    val headings: List<MarkdownHeading> = emptyList(),
    val notes: List<MarkdownNote> = emptyList(),
) {
    val hasNotes: Boolean get() = notes.isNotEmpty()

    companion object {
        val EMPTY = MarkdownReport()
    }
}

object MarkdownInspector {
    /** Words per minute, the same convention the post row uses for its reading time. */
    private const val WORDS_PER_MINUTE = 200

    // Leading whitespace of any width, because the reader `trim()`s each line before it looks for a
    // marker — mirroring that is the point, and CommonMark's three-space limit is not what this app does.
    private val HEADING = Regex("""^\s*(#{1,3})\s+(.*)$""")
    private val DEEP_HEADING = Regex("""^\s*(#{4,})\s*(.*)$""")
    private val TABLE_ROW = Regex("""^\s*\|.*\|""")
    private val TABLE_DIVIDER = Regex("""^\s*\|?[\s:|-]{3,}\|?\s*$""")
    private val EMPTY_IMAGE = Regex("""!\[[^\]]*]\(\s*\)""")

    /**
     * Reads [body] line by line, tracking fences the way the reader does.
     *
     * Inside a fence nothing is judged — the reader prints the block verbatim, and a note about a
     * "broken" table in someone's SQL sample would be the inspector lying about code.
     */
    fun analyze(body: String): MarkdownReport {
        if (body.isBlank()) return MarkdownReport(characters = body.length)

        val lines = body.split('\n')
        val headings = mutableListOf<MarkdownHeading>()
        val notes = mutableListOf<MarkdownNote>()
        var openFenceLine: Int? = null
        var inFence = false
        var words = 0

        lines.forEachIndexed { index, raw ->
            val line = raw.trim()
            val number = index + 1
            if (line.startsWith("```")) {
                inFence = !inFence
                openFenceLine = if (inFence) number else null
                return@forEachIndexed
            }
            if (inFence) {
                words += countWords(line)
                return@forEachIndexed
            }

            words += countWords(line)

            HEADING.matchEntire(line)?.let { match ->
                val text = match.groupValues[2].trim()
                if (text.isEmpty()) {
                    notes += MarkdownNote(MarkdownNoteKind.EMPTY_HEADING, number)
                } else {
                    headings += MarkdownHeading(match.groupValues[1].length, text, number)
                }
            }
            if (DEEP_HEADING.matches(line)) {
                notes += MarkdownNote(MarkdownNoteKind.HEADING_TOO_DEEP, number)
            }
            val looksLikeTable = TABLE_ROW.matches(line) || (line.contains('|') && TABLE_DIVIDER.matches(line))
            if (looksLikeTable) {
                notes += MarkdownNote(MarkdownNoteKind.TABLE, number)
            }
            if (EMPTY_IMAGE.containsMatchIn(line)) {
                notes += MarkdownNote(MarkdownNoteKind.IMAGE_WITHOUT_URL, number)
            }
            // `***` is triple emphasis, not a broken bold: remove it first so an odd count really
            // means one half of a pair was left behind.
            val doubles = line.replace("***", "").split("**").size - 1
            if (doubles % 2 != 0) {
                notes += MarkdownNote(MarkdownNoteKind.UNBALANCED_BOLD, number)
            }
        }

        openFenceLine?.let { notes += MarkdownNote(MarkdownNoteKind.UNCLOSED_FENCE, it) }

        val minutes = if (words <= 0) 0 else maxOf(1, (words + WORDS_PER_MINUTE - 1) / WORDS_PER_MINUTE)
        return MarkdownReport(
            words = words,
            characters = body.length,
            readingMinutes = minutes,
            headings = headings,
            // Ordered by line so the strip reads top-down like the document does, and never repeats
            // the same complaint about the same line twice.
            notes = notes.sortedWith(compareBy({ it.line }, { it.kind.ordinal }))
                .distinctBy { it.kind to it.line },
        )
    }

    /**
     * Words in a line.
     *
     * Whitespace-split rather than `\b`-based: Bengali, English and code samples all have to count,
     * and a word-boundary regex is an English-shaped assumption.
     */
    private fun countWords(line: String): Int =
        if (line.isBlank()) 0 else line.split(Regex("\\s+")).count { it.isNotBlank() }

    /**
     * The half-open character range of a 1-based line, clamped to the document.
     *
     * The outline chips need this: tapping a heading moves the field's selection to that line, which
     * is only honest if the offsets are computed the same way the report counted them.
     */
    fun lineRange(body: String, line: Int): Pair<Int, Int> {
        if (body.isEmpty() || line < 1) return 0 to 0
        var start = 0
        var remaining = line - 1
        while (remaining > 0) {
            val next = body.indexOf('\n', start)
            if (next < 0) break
            start = next + 1
            remaining--
        }
        if (start > body.length) return body.length to body.length
        val end = body.indexOf('\n', start).takeIf { it >= 0 } ?: body.length
        return start to end
    }
}
