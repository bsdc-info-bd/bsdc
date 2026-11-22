package bd.info.bsdc.app.core.common;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.Test;

/**
 * The tag rules, and the promise that they are the website's tag rules.
 *
 * <p>The first tests are the behaviour a member meets: a two-character floor, a 32-character clamp,
 * a ceiling of twenty, a duplicate refused in another case. The last one is the one that matters in
 * five years — it reads the React component's own source and pins the numbers it declares, so the
 * day the website moves its ceiling the app fails a test instead of quietly storing a different list
 * from the one the browser stored for the same gig.
 */
public class ListingTagsTest {

    @Test
    public void trimsAndClampsBeforeStoring() {
        assertEquals("Kotlin", ListingTags.accept(Collections.<String>emptyList(), "  Kotlin  "));
        StringBuilder longTag = new StringBuilder();
        for (int i = 0; i < 40; i++) {
            longTag.append('x');
        }
        assertEquals(32, ListingTags.accept(Collections.<String>emptyList(), longTag.toString()).length());
    }

    @Test
    public void refusesTheFourThingsTheFormWouldHaveRejected() {
        // Too short to mean anything, and already taken, in another case.
        assertNull(ListingTags.accept(Collections.<String>emptyList(), " r "));
        assertNull(ListingTags.accept(Arrays.asList("Kotlin"), "KOTLIN"));
        assertNull(ListingTags.accept(Collections.<String>emptyList(), null));
        assertNull(ListingTags.accept(Collections.<String>emptyList(), "   "));

        List<String> full = new ArrayList<>();
        for (int i = 0; i < ListingTags.MAX_TAGS; i++) {
            full.add("skill" + i);
        }
        assertEquals(ListingTags.MAX_TAGS, full.size());
        assertNull("the twenty-first tag must be refused", ListingTags.accept(full, "one more"));
    }

    @Test
    public void aRefusedAddLeavesTheListExactlyAsItWas() {
        List<String> before = Arrays.asList("Kotlin", "Compose");
        assertEquals(before, ListingTags.added(before, "kotlin"));
        assertEquals(Arrays.asList("Kotlin", "Compose", "React"), ListingTags.added(before, " React "));
    }

    @Test
    public void parsesTheCommaSeparatedDraftTheCreateFormStillUses() {
        List<String> parsed = ListingTags.parse(" Kotlin , , compose,KOTLIN,react,,  ");
        assertEquals(Arrays.asList("Kotlin", "compose", "react"), parsed);
        assertTrue(ListingTags.parse(null).isEmpty());
        assertEquals("", ListingTags.join(Collections.<String>emptyList()));
        assertEquals("Kotlin, React", ListingTags.join(Arrays.asList("Kotlin", "React")));

        StringBuilder many = new StringBuilder();
        for (int i = 0; i < 26; i++) {
            if (i > 0) {
                many.append(',');
            }
            many.append("skill").append(i);
        }
        assertEquals(ListingTags.MAX_TAGS, ListingTags.parse(many.toString()).size());
    }

    @Test
    public void offersOnlySuggestionsThatAreStillWanted() {
        List<String> offered = ListingTags.availableSuggestions(
            Arrays.asList("Kotlin"),
            Arrays.asList("Kotlin", "KOTLIN", "Compose", "Android", "React", "Node", "Postgres", "Figma", "SEO", "Rust")
        );
        assertEquals(ListingTags.SUGGESTIONS_SHOWN, offered.size());
        assertEquals(
            Arrays.asList("Compose", "Android", "React", "Node", "Postgres", "Figma", "SEO", "Rust"),
            offered
        );
        assertTrue(ListingTags.availableSuggestions(Arrays.asList("a"), null).isEmpty());
    }

    @Test
    public void theNumbersAreTheWebsitesOwn() throws IOException {
        String component = readWebTagInput();
        assertEquals(
            ListingTags.MAX_TAGS,
            Integer.parseInt(defaultOf(component, "max").replace("_", ""))
        );
        assertEquals(
            ListingTags.TAG_MAX_LENGTH,
            Integer.parseInt(defaultOf(component, "maxLength").replace("_", ""))
        );
        // The floor and the cap on suggestions are written inline, not as props.
        assertTrue(
            "the web's minimum tag length moved: " + component,
            component.contains("tag.length < 2")
        );
        assertTrue(
            "the web's suggestion cap moved: " + component,
            component.contains("slice(0, 8)")
        );
    }

    /** The default value of a destructured prop, e.g. `max = 20,`. */
    private static String defaultOf(String source, String prop) {
        // `max = 20,` as the component destructures it, and `max?: number;` never, because that
        // half has no default to compare with.
        Matcher matcher = Pattern.compile(
            "(?m)^\\s*" + prop + "(?:\\s*:\\s*[\\w<>()|\\[\\]]+)?\\s*=\\s*(\\d+),"
        ).matcher(source);
        assertTrue("`" + prop + "` has no numeric default in TagInput.tsx", matcher.find());
        return matcher.group(1);
    }

    @Test
    public void skillsAreStoredInTheOneCanonicalForm() {
        assertEquals("kotlin", ListingTags.normaliseSkill("  Kotlin  "));
        assertEquals("node js", ListingTags.normaliseSkill("Node   JS"));
        assertEquals("", ListingTags.normaliseSkill("   "));
        assertEquals("", ListingTags.normaliseSkill(null));

        // Canonical, deduplicated case-insensitively, and sorted — the order the website stores, so
        // that editing a listing from the app cannot reorder a member's skill list.
        assertEquals(
            Arrays.asList("kotlin", "react"),
            ListingTags.normalise(Arrays.asList("React", "kotlin", " React ", "", "  "))
        );
        assertTrue(ListingTags.normalise(null).isEmpty());

        // The create box caps at twenty, because that is what it promised on screen.
        StringBuilder many = new StringBuilder();
        for (int i = 0; i < 25; i++) {
            if (i > 0) {
                many.append(',');
            }
            many.append("Skill ").append(i);
        }
        List<String> capped = ListingTags.fromCommaText(many.toString());
        assertEquals(ListingTags.MAX_TAGS, capped.size());
        List<String> sorted = new ArrayList<>(capped);
        Collections.sort(sorted);
        assertEquals("the list must arrive sorted, as the website stores it", sorted, capped);
        // `normalise` itself refuses no skill, so a form can still count them and complain.
        assertEquals(25, ListingTags.normalise(Arrays.asList(many.toString().split(","))).size());
    }

    @Test
    public void theCanonicalFormIsTheWebsitesOwn() throws IOException {
        // The function the database matches against is written once, in TypeScript, and every client
        // that stores anything else creates rows its own filters cannot find. Read it back and pin it.
        String skills = readWebSkills();
        assertTrue("normaliseSkill stopped trimming: " + skills, skills.contains("raw.trim()"));
        assertTrue(
            "normaliseSkill stopped collapsing inner whitespace: " + skills,
            skills.contains("replace(/\\s+/g, ' ')")
        );
        assertTrue("normaliseSkill stopped lower-casing: " + skills, skills.contains("toLowerCase()"));
        assertTrue("the list is no longer sorted: " + skills, skills.contains("[...seen].sort()"));
    }

    @Test
    public void theApplicationSkillRulesAreTheApplyFormsOwn() throws IOException {
        // The apply form uses the same component with different numbers, and it normalises every
        // change. Both facts are pinned to the component's call site, because the app has to refuse
        // exactly what the browser refuses and store exactly what the browser stores.
        String form = readWebSource(
            "../../../main-site/src/components/jobs/JobApplicationForm.tsx",
            "../main-site/src/components/jobs/JobApplicationForm.tsx",
            "main-site/src/components/jobs/JobApplicationForm.tsx"
        );
        assertTrue("the apply form no longer caps skills at 30: " + form, form.contains("max={30}"));
        assertTrue("the apply form no longer caps length at 64: " + form, form.contains("maxLength={64}"));
        assertTrue(
            "the apply form stopped canonicalising skills on every change: " + form,
            form.contains("normaliseSkills(skills)")
        );
        assertEquals(30, ListingTags.APPLICATION_MAX_SKILLS);
        assertEquals(64, ListingTags.APPLICATION_SKILL_MAX_LENGTH);

        // Two sets, one implementation: a listing keeps the member's own case, an application does not.
        List<String> none = Collections.<String>emptyList();
        assertEquals("kotlin", ListingTags.accept(ListingTags.APPLICATIONS, none, "  Kotlin  "));
        assertEquals("Kotlin", ListingTags.accept(ListingTags.LISTINGS, none, "  Kotlin  "));

        StringBuilder longSkill = new StringBuilder();
        for (int i = 0; i < 70; i++) {
            longSkill.append('x');
        }
        assertEquals(
            64,
            ListingTags.accept(ListingTags.APPLICATIONS, none, longSkill.toString()).length()
        );
        assertEquals(
            ListingTags.TAG_MAX_LENGTH,
            ListingTags.accept(ListingTags.LISTINGS, none, longSkill.toString()).length()
        );

        List<String> full = new ArrayList<>();
        for (int i = 0; i < ListingTags.APPLICATION_MAX_SKILLS; i++) {
            full.add("skill " + i);
        }
        assertNull(ListingTags.accept(ListingTags.APPLICATIONS, full, "one more"));
        assertEquals(
            full,
            ListingTags.added(ListingTags.APPLICATIONS, full, "one more")
        );
        // The same list is not full for an application, which caps higher: the ceiling belongs to the
        // rules the caller passes, not to the number of things already sitting in the box.
        List<String> twenty = new ArrayList<>();
        for (int i = 0; i < ListingTags.MAX_TAGS; i++) {
            twenty.add("skill-" + i);
        }
        assertNull(ListingTags.accept(ListingTags.LISTINGS, twenty, "one more"));
        assertEquals("one more", ListingTags.accept(ListingTags.APPLICATIONS, twenty, "one more"));
    }

    private static String readWebSkills() throws IOException {
        return readWebSource(
            "../../../main-site/src/lib/opportunities/skills.ts",
            "../main-site/src/lib/opportunities/skills.ts",
            "main-site/src/lib/opportunities/skills.ts"
        );
    }

    private static String readWebTagInput() throws IOException {
        return readWebSource(
            "../../../main-site/src/design-system/TagInput.tsx",
            "../main-site/src/design-system/TagInput.tsx",
            "main-site/src/design-system/TagInput.tsx"
        );
    }

    /**
     * The web package is three levels up from here, because Gradle runs a module's tests with that
     * module as the working directory. The other spellings cover a run started from `android-app` or
     * from the repository root, which is how the same suite is launched by an IDE.
     */
    private static String readWebSource(String... relative) throws IOException {
        File dir = new File(System.getProperty("user.dir")).getAbsoluteFile();
        for (int hop = 0; hop < 6 && dir != null; hop++) {
            for (String part : relative) {
                File candidate = new File(dir, part);
                if (candidate.isFile()) {
                    return new String(Files.readAllBytes(candidate.toPath()), StandardCharsets.UTF_8);
                }
            }
            dir = dir.getParentFile();
        }
        throw new IOException("could not find a web source above " + System.getProperty("user.dir"));
    }
}
