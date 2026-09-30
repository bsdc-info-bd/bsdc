package bd.info.bsdc.app.content

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PublishingToolsTest {
    @Test
    fun `frontmatter is serialized at the beginning and read back`() {
        val source = PublishingTools.withFrontmatter(
            content = "# Welcome\n\nA Bangladeshi developer note.",
            metadata = linkedMapOf("title" to "Welcome", "reading-time" to "3 min")
        )

        val parsed = PublishingTools.splitFrontmatter(source)
        assertTrue(parsed.hasFrontmatter)
        assertEquals("Welcome", parsed.metadata["title"])
        assertEquals("3 min", parsed.metadata["reading-time"])
        assertTrue(parsed.content.startsWith("# Welcome"))
    }

    @Test
    fun `only supported https hosts become liquid embeds`() {
        val source = "{{gist url=\"https://gist.github.com/bsdcbot/abcd\"}}\n{{youtube https://evil.example/video}}"
        val embeds = PublishingTools.extractEmbeds(source)

        assertEquals(1, embeds.size)
        assertEquals("gist", embeds.single().type)
        assertFalse(PublishingTools.isAllowedEmbed("youtube", "https://evil.example/video"))
        assertFalse(PublishingTools.isAllowedEmbed("gist", "http://gist.github.com/user/example"))
    }
}
