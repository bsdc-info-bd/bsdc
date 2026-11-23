package bd.info.bsdc.app.feature.feed

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The block grammar, tested where it is decided.
 *
 * The renderer needs a device; the parser does not. That separation is the reason the two live in
 * different files now — and it is what lets the two rules this app was missing be proven instead of
 * eyeballed in a screenshot.
 */
class PostMarkdownParseTest {
    private fun blocks(raw: String) = parseMarkdownBlocks(raw)

    @Test
    fun nothingIsAnEmptyList() {
        assertTrue(blocks("").isEmpty())
        assertTrue(blocks("   \n\t\n").isEmpty())
    }

    @Test
    fun theThreeHeadingLevelsTheAppStyles() {
        assertEquals(
            listOf(
                MarkdownBlock.Heading(1, "One"),
                MarkdownBlock.Heading(2, "Two"),
                MarkdownBlock.Heading(3, "Three"),
            ),
            blocks("# One\n## Two\n### Three"),
        )
        // A fourth level is not a heading here, and is not silently downgraded to one either: it stays
        // a paragraph, which is what the composer now warns about before publishing.
        assertEquals(
            listOf(MarkdownBlock.Paragraph("#### Four")),
            blocks("#### Four"),
        )
    }

    @Test
    fun markersAreRecognisedAfterIndentation() {
        // The reader trims each line before matching, so an indented bullet is still a bullet. Changing
        // that would be a grammar change, not a formatting one — hence the test.
        assertEquals(
            listOf(MarkdownBlock.Bullet("item"), MarkdownBlock.Quote("said")),
            blocks("   - item\n\t> said"),
        )
    }

    @Test
    fun bulletsAndQuotesAndParagraphs() {
        assertEquals(
            listOf(
                MarkdownBlock.Bullet("first"),
                MarkdownBlock.Bullet("second"),
                MarkdownBlock.Quote("quoted"),
                MarkdownBlock.Paragraph("line one\nline two"),
            ),
            blocks("- first\n* second\n> quoted\nline one\nline two"),
        )
    }

    @Test
    fun numberedItemsKeepTheNumberTheAuthorWrote() {
        // Every item keeps the number the author wrote, gaps included: a list that silently
        // renumbers "1, 3" into "1, 2" has changed what the steps were.
        assertEquals(
            listOf(
                MarkdownBlock.Ordered(1, "plan"),
                MarkdownBlock.Ordered(2, "cook"),
                MarkdownBlock.Ordered(3, "deploy"),
            ),
            blocks("1. plan\n2. cook\n3. deploy"),
        )
        // `1)` is the other spelling a person reaches for without looking it up.
        assertEquals(listOf(MarkdownBlock.Ordered(2, "ship")), blocks("2) ship"))
    }

    @Test
    fun taskBoxesBecomeBoxesNotBracketText() {
        assertEquals(
            listOf(
                MarkdownBlock.Task(checked = false, text = "buy milk"),
                MarkdownBlock.Task(checked = true, text = "ship it"),
                MarkdownBlock.Task(checked = true, text = "X uppercase"),
            ),
            blocks("- [ ] buy milk\n- [x] ship it\n* [X] X uppercase"),
        )
        // An empty box is still a box — a checklist with an unfinished line is the normal case.
        assertEquals(listOf(MarkdownBlock.Task(checked = false, text = "")), blocks("- [ ]"))
    }

    @Test
    fun fencesHoldEverythingVerbatim() {
        val raw = "```kotlin\nval one = 1\n\n# not a heading\n1. not a list\n- [ ] not a box\n```"
        assertEquals(listOf(MarkdownBlock.CodeFence("kotlin", "val one = 1\n\n# not a heading\n1. not a list\n- [ ] not a box")), blocks(raw))
    }

    @Test
    fun anOpenFenceStillRendersAsCode() {
        // Losing the rest of a post to a missing backtick line would be worse than the typo, so the
        // reader closes the fence at the end of the document.
        assertEquals(
            listOf(MarkdownBlock.Paragraph("before"), MarkdownBlock.CodeFence("", "still code")),
            blocks("before\n```\nstill code"),
        )
    }

    @Test
    fun windowsNewlinesDoNotLeaveCarriageReturnsInText() {
        assertEquals(
            listOf(MarkdownBlock.Heading(1, "Title"), MarkdownBlock.Bullet("point")),
            blocks("# Title\r\n- point\r\n"),
        )
    }

    @Test
    fun aFenceCutsAParagraphInTwo() {
        assertEquals(
            listOf(
                MarkdownBlock.Paragraph("intro"),
                MarkdownBlock.CodeFence("sql", "select 1"),
                MarkdownBlock.Paragraph("outro"),
            ),
            blocks("intro\n```sql\nselect 1\n```\noutro"),
        )
    }
}
