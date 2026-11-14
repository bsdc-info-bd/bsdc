package bd.info.bsdc.app.feature.discover

import org.junit.Assert.assertEquals
import org.junit.Test

class ProjectDetailLogicTest {
    @Test
    fun webUrlUsesTheSiteAddressAndEncodesTheSlug() {
        assertEquals("https://www.bsdc.info.bd/projects/rust-cli", ProjectDetailLogic.webUrl(" rust-cli "))
        assertEquals("https://www.bsdc.info.bd/projects/a%20b%2Fc", ProjectDetailLogic.webUrl("a b/c"))
    }

    @Test
    fun shareTextIncludesTaglineWhenPresent() {
        val url = "https://www.bsdc.info.bd/projects/rust-cli"
        assertEquals("Rust CLI — Fast tools\n$url", ProjectDetailLogic.shareText("Rust CLI", " Fast tools ", url))
    }

    @Test
    fun shareTextFallsBackToNameAndLinkWithoutTagline() {
        val url = "https://www.bsdc.info.bd/projects/x"
        assertEquals("Rust CLI\n$url", ProjectDetailLogic.shareText("Rust CLI", "   ", url))
        assertEquals("BSDC\n$url", ProjectDetailLogic.shareText("  ", "", url))
    }

    @Test
    fun techChipsAreCleanedAndDeduplicatedKeepingOrder() {
        assertEquals(
            listOf("Kotlin", "compose", "Rust"),
            ProjectDetailLogic.techChips(listOf(" Kotlin", "compose", "", "KOTLIN ", "Rust")),
        )
    }
}
