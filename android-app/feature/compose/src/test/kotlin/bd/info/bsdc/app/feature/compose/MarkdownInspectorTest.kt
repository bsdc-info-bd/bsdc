package bd.info.bsdc.app.feature.compose

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The composer's read of a Markdown body.
 *
 * What matters here is not the arithmetic but the *boundaries*: what the inspector calls a heading,
 * what it stays quiet about inside a code fence, and what it warns about because the app's own reader
 * will not render it. Those rules exist so the strip can say something useful before publishing; a
 * wrong one makes the composer cry wolf, which is worse than no strip at all.
 */
class MarkdownInspectorTest {
    private fun notes(body: String) = MarkdownInspector.analyze(body).notes.map { it.kind to it.line }

    @Test
    fun anEmptyBodyIsNotAProblem() {
        val empty = MarkdownInspector.analyze("")
        assertEquals(0, empty.words)
        assertEquals(0, empty.readingMinutes)
        assertTrue(empty.notes.isEmpty())
        assertEquals(0, MarkdownInspector.analyze("   \n  ").words)
    }

    @Test
    fun countsAreWordsCharactersAndMinutes() {
        val body = (1..250).joinToString(" ") { "w$it" }
        val report = MarkdownInspector.analyze(body)
        assertEquals(250, report.words)
        assertEquals(body.length, report.characters)
        // 200 wpm, rounded up, and a single word is still "1 min" rather than "0 min".
        assertEquals(2, report.readingMinutes)
        assertEquals(1, MarkdownInspector.analyze("hello").readingMinutes)
    }

    @Test
    fun theOutlineIsWhatTheReaderTurnsIntoAHeading() {
        val body = "# One\ntext\n\n### Three\nplain\n"
        val report = MarkdownInspector.analyze(body)
        assertEquals(
            listOf(
                MarkdownHeading(1, "One", 1),
                MarkdownHeading(3, "Three", 4),
            ),
            report.headings,
        )
        assertTrue(report.notes.isEmpty())
    }

    @Test
    fun aFourthLevelIsNotAHeadingHere() {
        assertEquals(
            listOf(MarkdownNoteKind.HEADING_TOO_DEEP to 1),
            notes("#### Deep\ncontent"),
        )
        // The reader only ever styles three levels, so the report must not pretend otherwise.
        assertTrue(MarkdownInspector.analyze("#### Deep\ncontent").headings.isEmpty())
    }

    @Test
    fun codeFencesAreLeftAlone() {
        val body = "```sql\nselect '\nfrom t\n-- # not a heading\n| a | b |\n**odd stars\n```\ndone"
        val report = MarkdownInspector.analyze(body)
        assertTrue("nothing inside a fence may be judged: ${report.notes}", report.notes.isEmpty())
        assertTrue(report.headings.isEmpty())
    }

    @Test
    fun anUnclosedFenceIsNamedByTheLineThatOpenedIt() {
        assertEquals(
            listOf(MarkdownNoteKind.UNCLOSED_FENCE to 3),
            notes("para\n\n```\nstill open\n"),
        )
    }

    @Test
    fun emphasisIsCheckedForPairsNotForStyle() {
        assertTrue(notes("a **bold** word").isEmpty())
        assertTrue(notes("a ***bold italic*** word").isEmpty())
        assertEquals(listOf(MarkdownNoteKind.UNBALANCED_BOLD to 2), notes("fine\n**open run here"))
    }

    @Test
    fun syntaxTheReaderHasNoBlockForIsNamed() {
        // Every line of the list is named: the reader shows no list at all, so a note on line 1 only
        // would leave the member fixing one row and still seeing plain text.
        // Numbered items and task boxes used to be reported here. The reader learned both rules, so
        // the strip must stay quiet about them: a note about syntax that now renders is a false alarm,
        // and false alarms are how a warning strip stops being read at all.
        assertTrue(notes("1. first\n2. second").isEmpty())
        assertTrue(notes("- [ ] buy milk").isEmpty())
        assertTrue(notes("+ plus bullet").isEmpty())
        assertEquals(listOf(MarkdownNoteKind.TABLE to 1), notes("| a | b |"))
        assertEquals(listOf(MarkdownNoteKind.EMPTY_HEADING to 1), notes("##   "))
        assertEquals(listOf(MarkdownNoteKind.IMAGE_WITHOUT_URL to 2), notes("look\n![no address]()"))
        // A normal bullet and a quote are supported and must stay quiet.
        assertTrue(notes("- plain bullet\n> quoted line").isEmpty())
    }

    @Test
    fun notesReadTopDown() {
        val report = MarkdownInspector.analyze("| a | b |\n\n| a | b |\nplain line\n")
        assertEquals(listOf(1, 3), report.notes.map { it.line })
        assertEquals(2, report.notes.count { it.kind == MarkdownNoteKind.TABLE })
    }

    @Test
    fun aHeadingLineResolvesToItsOwnCharacters() {
        val body = "intro\n# One\nmore"
        val (from, to) = MarkdownInspector.lineRange(body, 2)
        assertEquals("# One", body.substring(from, to))
        val (firstStart, firstEnd) = MarkdownInspector.lineRange(body, 1)
        assertEquals("intro", body.substring(firstStart, firstEnd))
        val (lastStart, lastEnd) = MarkdownInspector.lineRange(body, 3)
        assertEquals("more", body.substring(lastStart, lastEnd))
        // A line past the end lands on the last line rather than running off, because the strip is
        // recomputed on every keystroke and the document can shrink between the tap and the read.
        val (farStart, farEnd) = MarkdownInspector.lineRange(body, 99)
        assertEquals("more", body.substring(farStart, farEnd))
        assertEquals(0 to 0, MarkdownInspector.lineRange("", 1))
    }

    @Test
    fun everyNoteKindHasCopyInBothLanguages() {
        // A new kind without copy would render a blank line in the strip, which is the kind of gap a
        // compiler cannot see and an exhaustive `when` can.
        MarkdownNoteKind.entries.forEach { kind ->
            val en = markdownNoteText(kind, 7, bn = false)
            val bng = markdownNoteText(kind, 7, bn = true)
            assertFalse("$kind has no English copy", en.isBlank())
            assertFalse("$kind has no Bengali copy", bng.isBlank())
            assertTrue("$kind must name the line: $en", en.contains("7"))
            assertTrue("$kind must name the line: $bng", bng.contains("7"))
        }
    }

    @Test
    fun aLongDocumentKeepsItsPlace() {
        val body = (1..200).joinToString("\n") { if (it % 50 == 0) "## Section $it" else "line $it" }
        val report = MarkdownInspector.analyze(body)
        assertEquals(listOf(50, 100, 150, 200), report.headings.map { it.line })
        assertEquals(4, report.headings.size)
        report.headings.forEach { heading ->
            val (from, to) = MarkdownInspector.lineRange(body, heading.line)
            assertEquals("## Section ${heading.line}", body.substring(from, to))
        }
    }
}
