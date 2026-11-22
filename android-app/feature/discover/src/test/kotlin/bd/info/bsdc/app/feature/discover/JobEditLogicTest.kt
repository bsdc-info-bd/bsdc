package bd.info.bsdc.app.feature.discover

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Instant

/**
 * What the job editor may write — and the two places where a well-meaning editor damages a posting.
 *
 * The deadline is the sharp one: `update_job` overwrites `expires_at` whatever it is sent, so a form
 * that blanks the box really does re-open a role, and a form that leaves a stale date in it would be
 * refused by the database rather than by the screen. Both behaviours are asserted here, in both
 * directions, because neither is obvious from the field's label.
 *
 * The second is the option vocabulary. A job's type, mode, level and period are what every filter on
 * the board matches against; if this sheet called `contract` something else, or invented a fifth level,
 * the role would drop out of the lists it already appears in. So the tables in [JobEditLogic] are
 * compared against the website's own `create.options`, in both languages — a label this file invents is
 * a label nobody asked for, and the same posting would read differently depending on which client the
 * member last edited it from.
 */
class JobEditLogicTest {
    /** A fixed instant, because the deadline rule is the one rule a test cannot assert against a clock. */
    private val now: Long = Instant.parse("2026-11-21T09:00:00Z").toEpochMilli()

    private fun form(
        title: String = "Android engineer, Compose",
        company: String = "BSDC Labs",
        description: String = "Own the app our members use every day, from release to store listing.",
        jobType: String = "full_time",
        workMode: String = "hybrid",
        level: String = "senior",
        city: String = "Dhaka",
        salaryMin: String = "80000",
        salaryMax: String = "140000",
        period: String = "month",
        expires: String = "2026-12-06 18:00",
        applyUrl: String = "",
        skills: List<String> = listOf("Kotlin", "Compose"),
        cover: String = "",
    ) = JobEditForm(
        title = title,
        company = company,
        description = description,
        jobType = jobType,
        workMode = workMode,
        level = level,
        city = city,
        salaryMinText = salaryMin,
        salaryMaxText = salaryMax,
        salaryPeriod = period,
        expiresAtText = expires,
        applyUrl = applyUrl,
        skills = skills,
        coverUrl = cover,
    )

    @Test
    fun aWellFormedEditPassesAndSendsTheBoxes() {
        assertTrue(JobEditLogic.validate(form(), now).isEmpty())
        val payload = JobEditLogic.toPayload(form())
        assertEquals("Android engineer, Compose", payload.title)
        assertEquals("BSDC Labs", payload.company)
        assertEquals("full_time", payload.jobType)
        assertEquals(80000, payload.salaryMin)
        assertEquals(140000, payload.salaryMax)
        assertEquals("month", payload.salaryPeriod)
        assertEquals("2026-12-06T12:00:00Z", payload.expiresAt)
        assertEquals("", payload.applyUrl)
        assertEquals(listOf("compose", "kotlin"), payload.skills)
    }

    @Test
    fun theRulesSpeakTheCreateFormsOwnSentences() {
        assertEquals(
            listOf("Job title must be between 3 and 140 characters."),
            JobEditLogic.validate(form(title = "  Jo  "), now),
        )
        assertEquals(
            listOf("Company name must be between 2 and 100 characters."),
            JobEditLogic.validate(form(company = " B "), now),
        )
        assertEquals(
            listOf("Job description must be at least 20 characters."),
            JobEditLogic.validate(form(description = "too brief"), now),
        )
        assertEquals(
            listOf("Non-remote roles require a city."),
            JobEditLogic.validate(form(city = "   "), now),
        )
        assertEquals(
            listOf("A city cannot be longer than 80 characters."),
            JobEditLogic.validate(form(city = "C".repeat(81)), now),
        )
        assertEquals(
            listOf("Salary figures cannot be negative."),
            JobEditLogic.validate(form(salaryMin = "-5"), now),
        )
        assertEquals(
            listOf("Maximum salary cannot be below minimum salary."),
            JobEditLogic.validate(form(salaryMin = "140000", salaryMax = "80000"), now),
        )
        assertEquals(
            listOf("Select at most 20 skills."),
            JobEditLogic.validate(form(skills = (1..21).map { "skill $it" }), now),
        )
        assertEquals(
            listOf(JobEditLogic.applyUrlRefusal),
            JobEditLogic.validate(form(applyUrl = "http://jobs.example/apply", expires = ""), now),
        )
        assertEquals(
            listOf(GigEditLogic.coverRefusal),
            JobEditLogic.validate(form(cover = "https://elsewhere.example/cover.png"), now),
        )
    }

    @Test
    fun aRemoteRoleNeedsNoCityAndAnOnsiteRoleDoes() {
        assertTrue(JobEditLogic.isValid(form(workMode = "remote", city = ""), now))
        assertFalse(JobEditLogic.isValid(form(workMode = "onsite", city = ""), now))
        assertFalse(JobEditLogic.isValid(form(workMode = "hybrid", city = ""), now))
    }

    @Test
    fun anEmptySalaryBoxIsNotZero() {
        val payload = JobEditLogic.toPayload(form(salaryMin = "", salaryMax = "  "))
        assertNull(payload.salaryMin)
        assertNull(payload.salaryMax)
        // What the reader sees has to say the same thing, and "৳0" is not it.
        assertEquals("Negotiable", JobEditLogic.salaryLine(form(salaryMin = "", salaryMax = ""), "BDT", false))
        assertEquals("BDT 80000 – 140000 / Month", JobEditLogic.salaryLine(form(), "BDT", false))
        assertEquals("from BDT 80000 / Month", JobEditLogic.salaryLine(form(salaryMax = ""), "BDT", false))
        assertEquals("up to BDT 140000 / Month", JobEditLogic.salaryLine(form(salaryMin = ""), "BDT", false))
        assertEquals("BDT 80000 / Month", JobEditLogic.salaryLine(form(salaryMax = "80000"), "BDT", false))
        assertEquals("আলোচনা সাপেক্ষ", JobEditLogic.salaryLine(form(salaryMin = "", salaryMax = ""), "BDT", true))
    }

    @Test
    fun clearingTheDeadlineIsTheWayToReOpenARole() {
        // `update_job` writes `expires_at` whatever it is sent, so null here is not "leave it alone" —
        // it is "this role is open again". That is what the empty box promises, and why the sheet says
        // so beside the field instead of pre-filling it with the date the posting already carries.
        assertNull(JobEditLogic.toPayload(form(expires = "")).expiresAt)
        assertEquals(
            listOf(JobEditLogic.expiryPast),
            JobEditLogic.validate(form(expires = "2026-11-20 09:00"), now),
        )
        assertEquals(
            listOf(JobEditLogic.expiryFormat),
            JobEditLogic.validate(form(expires = "next Friday"), now),
        )
    }

    @Test
    fun aBareDateMeansTheEndOfThatDayNotItsStart() {
        // 23:59 in Asia/Dhaka, which is the zone the event forms already use. Midnight would close the
        // role before its last day had run.
        val iso = JobEditLogic.expiresIso("2026-12-06")
        assertEquals("2026-12-06T17:59:00Z", iso)
        assertTrue(JobEditLogic.isFuture(iso, now))
        assertEquals("2026-12-06T12:00:00Z", JobEditLogic.expiresIso("2026-12-06 18:00"))
        assertTrue(JobEditLogic.parsesExpiry("2026-12-06"))
        assertFalse(JobEditLogic.parsesExpiry("06/12/2026"))
        assertFalse(JobEditLogic.isFuture(null, now))
    }

    @Test
    fun theStoredInstantComesBackInTheBoxsOwnShape() {
        val seeded = JobEditLogic.formFrom(
            JobDetailDto(
                id = "j1",
                slug = "android-engineer",
                title = "Android engineer",
                expiresAt = "2026-12-06T12:00:00Z",
                salaryMin = 80000,
                salaryMax = null,
                skills = listOf("Kotlin", " ", "Compose"),
                coverUrl = "https://i.ibb.co/j/cover.png",
            ),
        )
        assertEquals("2026-12-06 18:00", seeded.expiresAtText)
        assertEquals("80000", seeded.salaryMinText)
        assertEquals("", seeded.salaryMaxText)
        assertEquals(listOf("Kotlin", "Compose"), seeded.skills)
        assertEquals("https://i.ibb.co/j/cover.png", seeded.coverUrl)
        // An editor that is dirty the moment it opens invites a member to rewrite a row they never
        // touched — and here that row carries a deadline, so the invitation is not harmless.
        assertFalse(JobEditLogic.isDirty(seeded, seeded))
    }

    @Test
    fun savingIsOfferedOnlyWhenARowWouldActuallyChange() {
        assertFalse(JobEditLogic.isDirty(form(), form(company = "  BSDC Labs  ")))
        assertFalse(JobEditLogic.isDirty(form(expires = "2026-12-06 18:00"), form(expires = "2026-12-06 18:00")))
        assertTrue(JobEditLogic.isDirty(form(), form(expires = "")))
        assertTrue(JobEditLogic.isDirty(form(), form(salaryMax = "150000")))
        assertFalse(JobEditLogic.isDirty(form(skills = listOf("kotlin")), form(skills = listOf(" Kotlin "))))
    }

    @Test
    fun theChecklistOpensOnTheFieldTheRoutineWouldRefuse() {
        val items = JobEditLogic.checklist(form(expires = "2026-11-01 08:00", city = ""), bn = false, nowMillis = now)
        assertEquals(2, items.count { !it.done })
        assertEquals(1, items.count { !it.done && it.blocking })
        assertTrue(JobEditLogic.checklist(form(), bn = true, nowMillis = now).all { it.done })
    }

    @Test
    fun everyRefusalTheRoutineCanAnswerWithIsSaidInBothLanguages() {
        val cases = listOf(
            "authentication required" to "Sign in again to save the role.",
            "job not found" to "That role no longer exists.",
            "only the poster of this job may change it" to "You cannot edit this role.",
            "a job needs a title of at least 3 characters" to "The title needs at least 3 characters.",
            "a job needs a company of at least 2 characters" to "The company name needs at least 2 characters.",
            "a job description must be between 20 and 20000 characters" to
                "The description must be between 20 and 20,000 characters.",
            "a city cannot be longer than 80 characters" to "The city is longer than 80 characters.",
            "an on-site or hybrid job needs a city" to "An on-site or hybrid role needs a city.",
            "a salary cannot be negative" to "A salary cannot be negative.",
            "the maximum salary cannot be below the minimum" to "The maximum salary is below the minimum.",
            "a job can carry at most 20 skills" to "A role can carry at most 20 skills.",
            "an apply link must be a valid https address" to JobEditLogic.applyUrlRefusal,
            "a closing date must be in the future" to JobEditLogic.expiryPast,
            "cover images must be hosted on the BSDC image host" to GigEditLogic.coverRefusal,
            "statement timeout" to "Could not save the role.",
        )
        cases.forEach { (wire, english) ->
            val failure = IllegalStateException(wire)
            assertEquals(english, JobEditLogic.editFailureMessage(failure, bn = false))
            val bangla = JobEditLogic.editFailureMessage(failure, bn = true)
            assertTrue("no Bangla for: $wire", bangla.isNotEmpty() && bangla != english)
        }
        // The permission SQLSTATE arrives without the routine's sentence; it has to read as a refusal,
        // not as a stack trace.
        assertEquals(
            "You cannot edit this role.",
            JobEditLogic.editFailureMessage(IllegalStateException("P0001: 42501"), bn = false),
        )
    }

    @Test
    fun theLimitsAreTheCreateFormsOwn() {
        val engine = readRepoFile(
            "android-app", "feature", "compose", "src", "main", "java",
            "bd", "info", "bsdc", "app", "feature", "compose", "ComposerValidationEngine.java",
        )
        val web = readRepoFile("main-site", "src", "lib", "create", "create-types.ts")
        fun engineConst(name: String): Int {
            val matcher = Regex("int $name = ([0-9_]+);").find(engine)
            assertTrue("$name is not in the create validator any more", matcher != null)
            return matcher!!.groupValues[1].replace("_", "").toInt()
        }

        fun webLimit(name: String): Int {
            val matcher = Regex("\n *$name: ([0-9_]+),").find(web)
            assertTrue("CREATE_LIMITS.$name is gone", matcher != null)
            return matcher!!.groupValues[1].replace("_", "").toInt()
        }

        // Three copies of the same rule, kept honest by one test: this file, the engine the create
        // forms call, and the website the app is supposed to match.
        assertEquals(engineConst("TITLE_MIN"), JobEditLogic.TITLE_MIN)
        assertEquals(engineConst("TITLE_MAX"), JobEditLogic.TITLE_MAX)
        assertEquals(engineConst("DESCRIPTION_MIN"), JobEditLogic.DESCRIPTION_MIN)
        assertEquals(engineConst("DESCRIPTION_MAX"), JobEditLogic.DESCRIPTION_MAX)
        assertEquals(engineConst("SKILLS_MAX"), JobEditLogic.SKILLS_MAX)
        assertEquals(webLimit("titleMin"), JobEditLogic.TITLE_MIN)
        assertEquals(webLimit("titleMax"), JobEditLogic.TITLE_MAX)
        assertEquals(webLimit("companyMin"), JobEditLogic.COMPANY_MIN)
        assertEquals(webLimit("companyMax"), JobEditLogic.COMPANY_MAX)
        assertEquals(webLimit("cityMax"), JobEditLogic.CITY_MAX)
        assertEquals(webLimit("descriptionMin"), JobEditLogic.DESCRIPTION_MIN)
        assertEquals(webLimit("descriptionMax"), JobEditLogic.DESCRIPTION_MAX)
        assertEquals(webLimit("skillsMax"), JobEditLogic.SKILLS_MAX)
    }

    @Test
    fun theOptionTablesAreTheWebsitesOwnInBothLanguages() {
        val en = createSection(readRepoFile("main-site", "src", "i18n", "locales", "en.ts"))
        val bn = createSection(readRepoFile("main-site", "src", "i18n", "locales", "bn.ts"))
        assertOptions("jobType", JobEditLogic.JOB_TYPES, en, bn)
        assertOptions("workMode", JobEditLogic.WORK_MODES, en, bn)
        assertOptions("level", JobEditLogic.LEVELS, en, bn)
        assertOptions("period", JobEditLogic.PERIODS, en, bn)
    }

    private fun assertOptions(
        group: String,
        ours: List<JobEditLogic.JobOption>,
        en: String,
        bn: String,
    ) {
        val webEn = optionBlock(en, group)
        val webBn = optionBlock(bn, group)
        val webValues = Regex("^ +([a-z_]+): ", RegexOption.MULTILINE).findAll(webEn).map { it.value.trim().removeSuffix(":") }.toList()
        assertEquals("$group: the two clients do not offer the same number of options", webValues.size, ours.size)
        assertEquals("$group: the values have to match, the filters depend on it", webValues, ours.map { it.value })
        ours.forEach { option ->
            assertTrue(
                "$group.${option.value} is labelled differently on the website",
                webEn.contains("${option.value}: '${option.labelEn}',"),
            )
            assertTrue(
                "$group.${option.value} has no Bangla label on the website",
                webBn.contains("${option.value}: '${option.labelBn}',"),
            )
        }
    }

    /** The `create:` block of a locale file, so a `level:` from another screen cannot answer for ours. */
    private fun createSection(source: String): String {
        val start = source.indexOf("\n  create: {")
        assertTrue("the locale file has no create section", start >= 0)
        val rest = source.substring(start)
        val end = rest.indexOf("\n  },\n")
        assertTrue("the create section never closes", end > 0)
        return rest.substring(0, end)
    }

    private fun optionBlock(createSection: String, group: String): String {
        val opener = "\n      $group: {\n"
        val start = createSection.indexOf(opener)
        assertTrue("create.options.$group is gone from the website", start >= 0)
        val rest = createSection.substring(start + opener.length)
        val end = rest.indexOf("\n      },")
        assertTrue("create.options.$group never closes", end > 0)
        return rest.substring(0, end)
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
