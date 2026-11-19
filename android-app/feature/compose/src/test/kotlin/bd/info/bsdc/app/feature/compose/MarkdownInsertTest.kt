package bd.info.bsdc.app.feature.compose

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The Android composer's formatting buttons, tested on the JVM.
 *
 * The same rules the web editor follows (`main-site/src/lib/content/markdown-edit.ts`)
 * — a toggle that toggles back, a placeholder that is typed over, lists that
 * continue and end — because a member switching from the browser to the phone
 * should not have to learn a second editor.
 */
class MarkdownInsertTest {
    @Test
    fun `wrap selects the wrapped text`() {
        val edit = MarkdownInsert.wrap("say hello now", 4, 9, "**", "**")
        assertEquals("say **hello** now", edit.text)
        assertEquals("hello", edit.text.substring(edit.start, edit.end))
    }

    @Test
    fun `wrap unwraps what is already wrapped`() {
        val edit = MarkdownInsert.wrap("say **hello** now", 6, 11, "**", "**")
        assertEquals("say hello now", edit.text)
        assertEquals("hello", edit.text.substring(edit.start, edit.end))
    }

    @Test
    fun `wrap inserts a placeholder that is selected`() {
        val edit = MarkdownInsert.wrap("say  now", 4, 4, "*", "*", "emphasis")
        assertEquals("say *emphasis* now", edit.text)
        assertEquals("emphasis", edit.text.substring(edit.start, edit.end))
    }

    @Test
    fun `a stale selection cannot move outside the text`() {
        val edit = MarkdownInsert.wrap("abc", 99, 120, "**", "**", "x")
        assertEquals("abc**x**", edit.text)
    }

    @Test
    fun `linePrefix adds a heading and removes it again`() {
        val added = MarkdownInsert.linePrefix("title", 0, 0, "## ")
        assertEquals("## title", added.text)

        val removed = MarkdownInsert.linePrefix("## title", 0, 7, "## ")
        assertEquals("title", removed.text)
    }

    @Test
    fun `linePrefix leaves a blank line between list items alone`() {
        val edit = MarkdownInsert.linePrefix("one\n\ntwo", 0, 8, "- ")
        assertEquals("- one\n\n- two", edit.text)
    }

    @Test
    fun `link selects the url`() {
        val edit = MarkdownInsert.link("the docs", 0, 8)
        assertEquals("[the docs]()", edit.text)
        assertEquals(11, edit.start)
        assertEquals(11, edit.end)
    }

    @Test
    fun `image is inserted on its own line`() {
        val edit = MarkdownInsert.image("a paragraph", 11, "https://i.ibb.co/x.jpg", "A desk")
        assertEquals("a paragraph\n\n![A desk](https://i.ibb.co/x.jpg)\n", edit.text)
    }

    @Test
    fun `codeBlock fences the selection`() {
        val edit = MarkdownInsert.codeBlock("const a = 1;", 0, 12)
        assertEquals("```\nconst a = 1;\n```", edit.text)
    }

    @Test
    fun `enter continues an unordered list`() {
        val edit = MarkdownInsert.continueList("- first", 7, 7)
        assertEquals("- first\n- ", edit?.text)
    }

    @Test
    fun `enter numbers the next ordered item`() {
        val edit = MarkdownInsert.continueList("1. first", 8, 8)
        assertEquals("1. first\n2. ", edit?.text)
    }

    @Test
    fun `enter on an empty item ends the list`() {
        val edit = MarkdownInsert.continueList("- ", 2, 2)
        assertEquals("", edit?.text)
    }

    @Test
    fun `enter leaves ordinary text alone`() {
        assertNull(MarkdownInsert.continueList("a paragraph", 11, 11))
    }

    @Test
    fun `enter is untouched when a range is selected`() {
        assertNull(MarkdownInsert.continueList("a\nb", 0, 3))
    }
}
