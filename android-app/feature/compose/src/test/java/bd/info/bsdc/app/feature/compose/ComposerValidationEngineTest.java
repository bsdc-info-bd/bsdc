package bd.info.bsdc.app.feature.compose

import org.junit.Test

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public final class ComposerValidationEngineTest {

    @Test
    public void slugifyHandlesAsciiAndBanglaFallbacksCleanly() {
        assertEquals("kotlin-compose-guide", ComposerValidationEngine.slugify("Kotlin & Compose Guide!", "post"));
        assertEquals("post", ComposerValidationEngine.slugify("বাংলা শিরোনাম", "post"));
        String unique = ComposerValidationEngine.uniqueSlug("Hello BSDC", "post");
        assertTrue(unique.startsWith("hello-bsdc-"));
        assertTrue(unique.length() <= 120);
    }

    @Test
    public void extractsMentionsAndHashtagsLowercasedAndDeduplicated() {
        String body = "Thanks @Hasan_Dev and @hasan_dev for #Kotlin and #Android-Dev tips!";
        assertEquals(List.of("hasan_dev"), ComposerValidationEngine.extractMentions(body));
        assertEquals(List.of("kotlin", "android-dev"), ComposerValidationEngine.extractHashtags(body));
    }

    @Test
    public void readingTimeAndExcerptStripMarkdownNoise() {
        String md = "## Title\n\nCheck [BSDC](https://bsdc.info.bd) and ```kotlin\nval x = 1\n``` now.";
        String excerpt = ComposerValidationEngine.toExcerpt(md, 120);
        assertFalse(excerpt.contains("```"));
        assertTrue(excerpt.contains("BSDC"));
        assertEquals(1, ComposerValidationEngine.readingTimeMinutes("short sample body"));
    }

    @Test
    public void validatesPostDraftRulesIncludingImagesAndPollBounds() {
        List<String> unreadyImg = ComposerValidationEngine.validatePostDraft(
            "post", "Hello", "Body text", "", List.of(), true
        );
        assertFalse(unreadyImg.isEmpty());

        List<String> badPoll = ComposerValidationEngine.validatePostDraft(
            "poll", "Favorite JVM language?", "", "", List.of("Kotlin", "  "), false
        );
        assertFalse(badPoll.isEmpty());

        List<String> validSnippet = ComposerValidationEngine.validatePostDraft(
            "snippet", "Check digit helper", "", "fun ok() = true", List.of(), false
        );
        assertTrue(validSnippet.isEmpty());
    }

    @Test
    public void enforcesDirectoryTableConstraintsForEventsJobsAndGroups() {
        List<String> badEvent = ComposerValidationEngine.validateEventDraft(
            "Meetup", "Full community meetup description", "online",
            "", "Dhaka", "", "2026-11-12T10:00:00Z", "2026-11-12T09:00:00Z", 50
        );
        assertTrue(badEvent.size() >= 2); // end <= start + missing joinUrl

        List<String> badJob = ComposerValidationEngine.validateJobDraft(
            "Android Engineer", "BSDC Tech", "At least twenty characters of job description.",
            "onsite", "", 80000, 50000, List.of("kotlin"), "https://bsdc.info.bd"
        );
        assertTrue(badJob.size() >= 2); // missing city + max < min

        List<String> badGroup = ComposerValidationEngine.validateGroupDraft("ab", "Valid Name", "Description");
        assertFalse(badGroup.isEmpty()); // slug < 3 chars
        assertTrue(ComposerValidationEngine.validateGroupDraft("dhaka-devs", "Dhaka Devs", "Description").isEmpty());
    }
}
