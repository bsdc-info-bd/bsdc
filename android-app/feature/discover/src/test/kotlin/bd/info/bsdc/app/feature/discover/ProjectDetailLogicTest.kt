package bd.info.bsdc.app.feature.discover

import org.junit.Assert.assertEquals
import org.junit.Test

class ProjectDetailLogicTest {

    @Test
    fun webUrl_matchesTheWebsiteAddress() {
        assertEquals("https://www.bsdc.info.bd/projects/bsdc-app", ProjectDetailLogic.webUrl("bsdc-app"))
        assertEquals(
            "https://www.bsdc.info.bd/projects/two%20words",
            ProjectDetailLogic.webUrl(" two words "),
        )
    }

    @Test
    fun shareText_includesTaglineWhenPresent() {
        assertEquals(
            "BSDC — a community app\nhttps://www.bsdc.info.bd/projects/bsdc",
            ProjectDetailLogic.shareText("BSDC", "a community app", "https://www.bsdc.info.bd/projects/bsdc"),
        )
        assertEquals(
            "BSDC\nhttps://www.bsdc.info.bd/projects/bsdc",
            ProjectDetailLogic.shareText("BSDC", "  ", "https://www.bsdc.info.bd/projects/bsdc"),
        )
        assertEquals(
            "BSDC\nhttps://www.bsdc.info.bd/projects/x",
            ProjectDetailLogic.shareText("   ", "", "https://www.bsdc.info.bd/projects/x"),
        )
    }

    @Test
    fun techChips_trimsDedupesAndKeepsOrder() {
        assertEquals(
            listOf("Kotlin", "compose", "SQL"),
            ProjectDetailLogic.techChips(listOf(" Kotlin ", "compose", "", "KOTLIN", "SQL")),
        )
    }

    @Test
    fun galleryUrls_ordersByPositionAndDropsBlanksAndDuplicates() {
        val media = listOf(
            ProjectDetailLogic.ProjectGalleryItem("https://i.ibb.co/b.png", "https://i.ibb.co/b-thumb.png", "b", 2),
            ProjectDetailLogic.ProjectGalleryItem("https://i.ibb.co/a.png", "https://i.ibb.co/a-thumb.png", "a", 1),
            ProjectDetailLogic.ProjectGalleryItem("", "", "blank", 0),
            ProjectDetailLogic.ProjectGalleryItem("https://i.ibb.co/a.png", "https://i.ibb.co/a-thumb.png", "a again", 3),
        )
        val out = ProjectDetailLogic.galleryUrls(media)
        assertEquals(2, out.size)
        assertEquals("https://i.ibb.co/a.png", out[0].url)
        assertEquals("https://i.ibb.co/b.png", out[1].url)
    }

    @Test
    fun galleryUrls_borrowsTheFullUrlWhenNoThumbnailExists() {
        val out = ProjectDetailLogic.galleryUrls(
            listOf(ProjectDetailLogic.ProjectGalleryItem("https://i.ibb.co/only.png", "")),
        )
        assertEquals("https://i.ibb.co/only.png", out.single().thumbUrl)
    }

    @Test
    fun screenshotLabel_readsCorrectlyInBothLanguages() {
        assertEquals("1 image", ProjectDetailLogic.screenshotLabel(1, false))
        assertEquals("4 images", ProjectDetailLogic.screenshotLabel(4, false))
        assertEquals("4টি ছবি", ProjectDetailLogic.screenshotLabel(4, true))
    }
}
