package bd.info.bsdc.app.feature.discover

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * What the gig editor may write, and what the numbers behind it have to stay equal to.
 *
 * Two kinds of failure matter here. The loud one is a save the database would refuse reaching the
 * database at all — the checklist and [GigEditLogic.validate] exist to stop it, so their sentences are
 * asserted, not just their pass/fail. The quiet one is an editor that damages a row it was only asked
 * to rename: a blank budget box must send `null` and not `0`, a cover the member did not touch must be
 * sent back unchanged, and skills must go out in the one form the column and the skill filters use.
 *
 * The last test is the one that keeps this file honest: the limits are the create form's limits, held
 * in `ComposerValidationEngine` on this side and in `CREATE_LIMITS` on the website, and a copy that is
 * allowed to drift is worse than no copy, because it looks like a rule.
 */
class GigEditLogicTest {
    private fun form(
        title: String = "Redesign a landing page",
        description: String = "One responsive page, mobile first, with the copy we supply to you.",
        budgetMin: String = "12000",
        budgetMax: String = "20000",
        hourly: Boolean = false,
        days: String = "14",
        skills: List<String> = listOf("Kotlin", "Compose"),
        cover: String = "",
    ) = GigEditForm(
        title = title,
        description = description,
        budgetMinText = budgetMin,
        budgetMaxText = budgetMax,
        isHourly = hourly,
        durationDaysText = days,
        skills = skills,
        coverUrl = cover,
    )

    @Test
    fun aWellFormedEditPassesAndSendsExactlyWhatTheBoxesSay() {
        val payload = GigEditLogic.toPayload(form())
        assertEquals("Redesign a landing page", payload.title)
        assertEquals(12000, payload.budgetMin)
        assertEquals(20000, payload.budgetMax)
        assertEquals(14, payload.durationDays)
        assertFalse(payload.isHourly)
        assertTrue(GigEditLogic.validate(form()).isEmpty())
    }

    @Test
    fun anEmptyBudgetBoxIsNotZero() {
        // `update_gig` reads null as "not stated" and 0 as "this gig pays nothing". Only one of those
        // is what an empty box means, and getting it wrong would quietly rewrite a live budget.
        val payload = GigEditLogic.toPayload(form(budgetMin = "  ", budgetMax = "", days = ""))
        assertNull(payload.budgetMin)
        assertNull(payload.budgetMax)
        assertNull(payload.durationDays)
        assertTrue(GigEditLogic.validate(form(budgetMin = "", budgetMax = "", days = "")).isEmpty())
    }

    @Test
    fun theRulesSpeakTheCreateFormsOwnSentences() {
        assertEquals(
            listOf("Gig title must be between 3 and 140 characters."),
            GigEditLogic.validate(form(title = "  Ab  ")),
        )
        assertEquals(
            listOf("Gig scope must be at least 20 characters."),
            GigEditLogic.validate(form(description = "too short")),
        )
        assertEquals(
            listOf("Budget values cannot be negative."),
            GigEditLogic.validate(form(budgetMin = "-1")),
        )
        assertEquals(
            listOf("Maximum budget cannot be lower than minimum budget."),
            GigEditLogic.validate(form(budgetMin = "30000", budgetMax = "20000")),
        )
        assertEquals(
            listOf("Duration must be between 1 and 3650 days."),
            GigEditLogic.validate(form(days = "4000")),
        )
        assertEquals(
            listOf("Select at most ${GigEditLogic.SKILLS_MAX} skills."),
            GigEditLogic.validate(form(skills = (1..21).map { "skill $it" })),
        )
    }

    @Test
    fun aCoverIsEitherOurHostOrNothingAtAll() {
        assertTrue(GigEditLogic.coverAllowed(""))
        assertTrue(GigEditLogic.coverAllowed("https://i.ibb.co/abc/cover.png"))
        assertFalse(GigEditLogic.coverAllowed("https://evil.example/cover.png"))
        assertEquals(
            listOf(GigEditLogic.coverRefusal),
            GigEditLogic.validate(form(cover = "ftp://i.ibb.co/abc.png")),
        )
    }

    @Test
    fun skillsLeaveInTheFormTheColumnStoresThemIn() {
        // The chips keep the member's own capitalisation; the wire carries the canonical form that
        // `normaliseSkills` puts on it in `opportunity-repository.ts`, because migration 0103 put the
        // column in that shape and the skill filters match against it.
        val payload = GigEditLogic.toPayload(
            form(skills = listOf(" Kotlin ", "compose", "Kotlin", "Figma ", "  ", "android   studio")),
        )
        assertEquals(listOf("android studio", "compose", "figma", "kotlin"), payload.skills)
    }

    @Test
    fun theCapRefusesRatherThanDroppingWhatTheMemberTyped() {
        // Twenty is the ceiling `update_gig` enforces and the ceiling the tag field counts against, so
        // one number serves both. Above it the editor says so and Save stays dark — it does not quietly
        // send the first twenty, which is the difference between a refusal and a silent edit.
        assertEquals(20, GigEditLogic.SKILLS_MAX)
        val overflow = form(skills = (1..25).map { "Skill $it" })
        assertEquals(listOf("Select at most 20 skills."), GigEditLogic.validate(overflow))
        assertEquals(25, GigEditLogic.toPayload(overflow).skills.size)
    }

    @Test
    fun savingIsOfferedOnlyWhenARowWouldActuallyChange() {
        val published = form()
        assertFalse(GigEditLogic.isDirty(published, published))
        // Same meaning, different spelling: re-ordering the chips or leaning on the space bar must not
        // light Save up, because the row after the write would be identical.
        assertFalse(
            GigEditLogic.isDirty(
                GigEditForm(skills = listOf("kotlin", "compose")),
                GigEditForm(skills = listOf("Compose", " Kotlin")),
            ),
        )
        assertTrue(GigEditLogic.isDirty(published, form(title = "Redesign two landing pages")))
        assertTrue(GigEditLogic.isDirty(published, form(budgetMax = "25000")))
    }

    @Test
    fun thePublishedRowSeedsEveryBox() {
        val gig = GigDto(
            id = "g1",
            slug = "redesign-a-landing-page",
            title = "Redesign a landing page",
            description = "One responsive page.",
            budgetMin = 12000,
            budgetMax = null,
            isHourly = true,
            durationDays = 7,
            skills = listOf("Figma", " ", "SEO"),
            coverUrl = "https://i.ibb.co/x/cover.png",
        )
        val seeded = GigEditLogic.formFrom(gig)
        assertEquals("12000", seeded.budgetMinText)
        assertEquals("", seeded.budgetMaxText)
        assertTrue(seeded.isHourly)
        assertEquals("7", seeded.durationDaysText)
        assertEquals(listOf("Figma", "SEO"), seeded.skills)
        assertEquals("https://i.ibb.co/x/cover.png", seeded.coverUrl)
        // An editor that is not dirty the instant it opens is the difference between "Save changes"
        // sitting greyed out and a member being invited to rewrite a row they never touched.
        assertFalse(GigEditLogic.isDirty(seeded, seeded))
    }

    @Test
    fun theBudgetLineSaysWhatTheRowWillSay() {
        assertEquals("BDT 12000 – 20000", GigEditLogic.budgetLine(form(), "BDT"))
        assertEquals("BDT 12000 – 20000 /hr", GigEditLogic.budgetLine(form(hourly = true), "BDT"))
        assertEquals("from BDT 12000", GigEditLogic.budgetLine(form(budgetMax = ""), "BDT"))
        assertEquals("up to BDT 20000", GigEditLogic.budgetLine(form(budgetMin = ""), "BDT"))
        assertEquals("Negotiable", GigEditLogic.budgetLine(form(budgetMin = "", budgetMax = ""), "BDT"))
    }

    @Test
    fun theChecklistOpensOnTheFieldsThatAreNotRightYet() {
        val items = GigEditLogic.checklist(form(title = "ab", days = "9000"), bn = false)
        assertFalse(items.first().done)
        assertEquals(1, items.count { !it.done && it.blocking })
        assertTrue(GigEditLogic.checklist(form(), bn = true).all { it.done })
    }

    @Test
    fun everyRefusalTheRoutineCanAnswerWithIsSaidInBothLanguages() {
        val cases = listOf(
            "authentication required" to "Sign in again to save the gig.",
            "gig not found" to "That gig no longer exists.",
            "only the client of this gig may change it" to "You cannot edit this gig.",
            "a gig needs a title of at least 3 characters" to "The title needs at least 3 characters.",
            "a gig description must be between 20 and 20000 characters" to
                "The scope must be between 20 and 20,000 characters.",
            "a budget cannot be negative" to "A budget cannot be negative.",
            "the maximum budget cannot be below the minimum" to "The maximum budget is below the minimum.",
            "a duration must be between 1 and 3650 days" to "The duration must be between 1 and 3,650 days.",
            "a gig can carry at most 20 skills" to "A gig can carry at most 20 skills.",
            "cover images must be hosted on the BSDC image host" to
                "A cover has to be a BSDC image-host link. Upload it, then paste the address.",
            "connection reset by peer" to "Could not save the gig.",
        )
        cases.forEach { (wire, english) ->
            val failure = IllegalStateException(wire)
            assertEquals(english, GigEditLogic.editFailureMessage(failure, bn = false))
            val bangla = GigEditLogic.editFailureMessage(failure, bn = true)
            assertTrue("no Bangla for: $wire", bangla.isNotEmpty() && bangla != english)
        }
    }

    @Test
    fun theNumbersAreTheCreateFormsOwn() {
        val engine = readRepoFile(
            "android-app", "feature", "compose", "src", "main", "java",
            "bd", "info", "bsdc", "app", "feature", "compose", "ComposerValidationEngine.java",
        )
        val web = readRepoFile("main-site", "src", "lib", "create", "create-types.ts")
        // The create validator's numbers, the website's numbers, and this editor's numbers, in one
        // place. A gig that can be published under one set of limits and corrected under another is
        // how a saved value ends up outside what either client would accept.
        assertEquals(constFrom(engine, "TITLE_MIN"), GigEditLogic.TITLE_MIN)
        assertEquals(constFrom(engine, "TITLE_MAX"), GigEditLogic.TITLE_MAX)
        assertEquals(constFrom(engine, "DESCRIPTION_MIN"), GigEditLogic.DESCRIPTION_MIN)
        assertEquals(constFrom(engine, "DESCRIPTION_MAX"), GigEditLogic.DESCRIPTION_MAX)
        assertEquals(constFrom(engine, "DURATION_DAYS_MAX"), GigEditLogic.DURATION_DAYS_MAX)
        assertEquals(constFrom(engine, "SKILLS_MAX"), GigEditLogic.SKILLS_MAX)
        assertEquals(literalFrom(web, "titleMin"), GigEditLogic.TITLE_MIN)
        assertEquals(literalFrom(web, "titleMax"), GigEditLogic.TITLE_MAX)
        assertEquals(literalFrom(web, "descriptionMin"), GigEditLogic.DESCRIPTION_MIN)
        assertEquals(literalFrom(web, "descriptionMax"), GigEditLogic.DESCRIPTION_MAX)
        assertEquals(literalFrom(web, "skillsMax"), GigEditLogic.SKILLS_MAX)
        assertEquals(literalFrom(web, "durationDaysMax"), GigEditLogic.DURATION_DAYS_MAX)
        assertEquals(1, GigEditLogic.DURATION_DAYS_MIN)
    }

    private fun constFrom(source: String, name: String): Int {
        val matcher = java.util.regex.Pattern.compile("int $name = ([0-9_]+);").matcher(source)
        assertTrue("$name is not in the create validator any more", matcher.find())
        return matcher.group(1).replace("_", "").toInt()
    }

    private fun literalFrom(source: String, name: String): Int {
        val matcher = java.util.regex.Pattern.compile("$name: ([0-9_]+),").matcher(source)
        assertTrue("$name is not in CREATE_LIMITS any more", matcher.find())
        return matcher.group(1).replace("_", "").toInt()
    }

    /** Gradle runs a module's tests with that module as the working directory, so walk up to the root. */
    private fun readRepoFile(vararg parts: String): String {
        var dir: File? = File(System.getProperty("user.dir")).absoluteFile
        repeat(6) {
            val candidate = dir?.let { base -> parts.fold(base) { acc, part -> File(acc, part) } }
            if (candidate != null && candidate.isFile) {
                return candidate.readText()
            }
            dir = dir?.parentFile
        }
        error("could not find ${parts.joinToString("/")} from ${System.getProperty("user.dir")}")
    }
}
