package bd.info.bsdc.app.feature.discover

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * What the group editor may write, and what it must leave alone.
 *
 * The interesting failures here are not "the name was rejected" — that is a message. They are the
 * silent ones: an edit that clears the cover image, or an untouched rules field that overwrites the
 * group's rules with an empty string. Both are a `null` versus `""` decision in [GroupEditLogic],
 * which is why the mapping is tested and the sheet contains none.
 */
class GroupEditLogicTest {
    private fun form(
        name: String = "BSDC Developers",
        description: String = "A room for builders",
        rules: String = "Be kind",
        privacy: GroupPrivacy = GroupPrivacy.PUBLIC,
        language: String = "bn",
        avatarUrl: String = "https://cdn/avatar.png",
        coverUrl: String = "https://cdn/cover.png",
    ) = GroupEditForm(name, description, rules, privacy, language, avatarUrl, coverUrl)

    @Test
    fun untouchedOptionalFieldsAreNotRewritten() {
        val payload = GroupEditLogic.toPayload(form(rules = "   ", avatarUrl = ""))
        // Blank is *not* "erase my rules": the web sends null for the same input, and `update_group`
        // reads null as "leave this column alone".
        assertNull(payload.rules)
        assertNull(payload.avatarUrl)
        assertEquals("BSDC Developers", payload.name)
        assertEquals("public", payload.privacy)
        assertEquals("bn", payload.language)
    }

    @Test
    fun clearingTheCoverIsARealEdit() {
        // The web's cover field submits `coverUrl.trim()`, blank included — so an empty box is how a
        // moderator removes a cover. The app has to do the same or the two clients would disagree
        // about one click.
        assertEquals("", GroupEditLogic.toPayload(form(coverUrl = "  ")).coverUrl)
        assertEquals("https://cdn/x.png", GroupEditLogic.toPayload(form(coverUrl = "  https://cdn/x.png  ")).coverUrl)
    }

    @Test
    fun nameIsTrimmedBeforeItIsJudged() {
        assertTrue(GroupEditLogic.isValid(form(name = "  Abc  ")))
        assertEquals("Abc", GroupEditLogic.toPayload(form(name = "  Abc  ")).name)
        assertEquals(listOf("Group name must be between 3 and 80 characters."), GroupEditLogic.validate(form(name = "  Ab ")))
    }

    @Test
    fun theLimitsAreTheCreateFormLimits() {
        // 80 and 2000 are not this screen's opinion: they are what `validateGroupDraft` refuses at
        // creation and what the create form's own copy promises. A rename must not be looser than a
        // registration, or "make it longer" becomes "you may not have that name".
        val longName = "x".repeat(81)
        assertTrue(GroupEditLogic.validate(form(name = longName)).isNotEmpty())
        assertTrue(GroupEditLogic.isValid(form(name = "x".repeat(80))))
        assertTrue(GroupEditLogic.validate(form(description = "y".repeat(2001))).isNotEmpty())
        assertTrue(GroupEditLogic.isValid(form(description = "y".repeat(2000))))

        val engine = readComposeEngine()
        assertTrue(
            "the create form's name limit moved; GroupEditLogic.NAME_MIN/NAME_MAX must follow it",
            engine.contains("between ${GroupEditLogic.NAME_MIN} and ${GroupEditLogic.NAME_MAX} characters"),
        )
        assertTrue(
            "the create form's description limit moved; GroupEditLogic.DESCRIPTION_MAX must follow it",
            engine.contains("exceed ${GroupEditLogic.DESCRIPTION_MAX} characters"),
        )
    }

    @Test
    fun privacyKnowsOnlyTheThreeTheEnumHas() {
        // `bsdc_group_privacy` (0011) is exactly public | private | secret; a fourth value here would
        // be a write the database rejects with a raw enum error.
        assertEquals(listOf("public", "private", "secret"), GroupPrivacy.entries.map { it.wire })
        assertEquals(GroupPrivacy.SECRET, GroupPrivacy.fromWire("secret"))
        assertEquals(GroupPrivacy.PUBLIC, GroupPrivacy.fromWire("sideways"))
        assertEquals(GroupPrivacy.PUBLIC, GroupPrivacy.fromWire(null))
    }

    @Test
    fun dirtyMeansThePayloadChangedNotTheTextBox() {
        val base = form()
        assertFalse("trailing spaces are not an edit", GroupEditLogic.isDirty(base, form(name = "  BSDC Developers  ")))
        assertFalse("clearing a field that was already blank is not an edit", GroupEditLogic.isDirty(form(rules = ""), form(rules = "   ")))
        assertTrue(GroupEditLogic.isDirty(base, form(privacy = GroupPrivacy.SECRET)))
        assertTrue(GroupEditLogic.isDirty(base, form(coverUrl = "")))
    }

    @Test
    fun aFormSeedsFromTheGroupItWasGiven() {
        val group = GroupDetailDto(
            id = "g1",
            slug = "bsdcland",
            name = "BSDCLand",
            description = null,
            privacy = "secret",
            language = "en",
            rules = null,
        )
        val seeded = GroupEditLogic.formFrom(group)
        assertEquals("secret", seeded.privacy.wire)
        assertEquals("", seeded.description)
        assertEquals("", seeded.rules)
        assertEquals("en", seeded.language)
        // A group stored with a language the picker has no option for still renders, as Bengali.
        assertEquals("bn", GroupEditLogic.formFrom(group.copy(language = "fr")).language)
    }

    @Test
    fun aClosedDoorIsSaidOnceAndPolitely() {
        assertTrue(
            GroupEditLogic.editFailureMessage(RuntimeException("permission denied for groups/not-owner"), false)
                .contains("no longer have permission"),
        )
        assertTrue(
            GroupEditLogic.editFailureMessage(RuntimeException("groups/not-mod"), true)
                .contains("অনুমতি"),
        )
        assertEquals("Could not save the group.", GroupEditLogic.editFailureMessage(RuntimeException("boom"), false))
    }

    private fun readComposeEngine(): String {
        // The create form's validator is Java in a sibling module, so the numbers can only be pinned by
        // reading them. Walk up from the module directory rather than trusting how Gradle was invoked.
        var dir: File? = File(System.getProperty("user.dir")).absoluteFile
        val relative = listOf(
            // Gradle runs a module's tests with that module as the working directory, so the sibling is
            // one level up; the other two spellings cover a run started from `android-app` or the repo
            // root, which is how the same suite is launched by an IDE.
            "../compose/src/main/java/bd/info/bsdc/app/feature/compose/ComposerValidationEngine.java",
            "feature/compose/src/main/java/bd/info/bsdc/app/feature/compose/ComposerValidationEngine.java",
            "android-app/feature/compose/src/main/java/bd/info/bsdc/app/feature/compose/ComposerValidationEngine.java",
        )
        repeat(6) {
            val root = dir ?: return@repeat
            for (part in relative) {
                val candidate = root.resolve(part)
                if (candidate.isFile) return candidate.readText()
            }
            dir = root.parentFile
        }
        error("could not find ComposerValidationEngine.java above ${System.getProperty("user.dir")}")
    }
}
