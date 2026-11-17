package bd.info.bsdc.app.feature.discover;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public class DiscoverSearchEngineTest {

    @Test
    public void sanitizeSearchQuery_cleansControlCharsAndTruncates() {
        assertEquals("kotlin compose", DiscoverSearchEngine.sanitizeSearchQuery("  kotlin\n\t compose  "));
        assertEquals("@bob", DiscoverSearchEngine.sanitizeSearchQuery("  @bob \n "));
        String longText = "a".repeat(120);
        assertEquals(80, DiscoverSearchEngine.sanitizeSearchQuery(longText).length());
    }

    @Test
    public void resolveSearchRoute_mapsEverySearchKind() {
        assertEquals("/p/hello", DiscoverSearchEngine.resolveSearchRoute("post", "hello", "1"));
        assertEquals("/@arif", DiscoverSearchEngine.resolveSearchRoute("person", "arif", "2"));
        assertEquals("/g/android-bd", DiscoverSearchEngine.resolveSearchRoute("group", "android-bd", "3"));
        assertEquals("/courses/kotlin-101", DiscoverSearchEngine.resolveSearchRoute("course", "kotlin-101", "4"));
        assertEquals("/jobs/senior-dev", DiscoverSearchEngine.resolveSearchRoute("job", "senior-dev", "5"));
        assertEquals("/projects/bsdc-app", DiscoverSearchEngine.resolveSearchRoute("project", "bsdc-app", "6"));
        assertEquals("/freelance/logo-redesign", DiscoverSearchEngine.resolveSearchRoute("gig", "logo-redesign", "7"));
        assertEquals("/freelance/logo-redesign", DiscoverSearchEngine.resolveSearchRoute("GIG", "logo-redesign", "7"));
        assertEquals("/events/devfest-2026", DiscoverSearchEngine.resolveSearchRoute("event", "devfest-2026", "8"));
        assertEquals("/shop/sylhet-tea", DiscoverSearchEngine.resolveSearchRoute("shop", "sylhet-tea", "9"));
    }

    @Test
    public void resolveSearchRoute_fallsBackToIdThenRoot() {
        assertEquals("/freelance/8f14", DiscoverSearchEngine.resolveSearchRoute("gig", "", "8f14"));
        assertEquals("/events/8f14", DiscoverSearchEngine.resolveSearchRoute("event", null, " 8f14 "));
        assertEquals("/", DiscoverSearchEngine.resolveSearchRoute("gig", "", "  "));
        assertEquals("/", DiscoverSearchEngine.resolveSearchRoute("unknown-kind", "x", "y"));
    }

    @Test
    public void sectionForKind_mapsKindsToHubSections() {
        assertEquals("gigs", DiscoverSearchEngine.sectionForKind("gig"));
        assertEquals("events", DiscoverSearchEngine.sectionForKind(" EVENT "));
        assertEquals("jobs", DiscoverSearchEngine.sectionForKind("job"));
        assertEquals("projects", DiscoverSearchEngine.sectionForKind("project"));
        assertEquals("people", DiscoverSearchEngine.sectionForKind("person"));
        assertEquals("search", DiscoverSearchEngine.sectionForKind(null));
    }

    @Test
    public void kindLabel_isBilingual() {
        assertEquals("Gig", DiscoverSearchEngine.kindLabel("gig", false));
        assertEquals("গিগ", DiscoverSearchEngine.kindLabel("gig", true));
        assertEquals("Event", DiscoverSearchEngine.kindLabel("event", false));
        assertEquals("ইভেন্ট", DiscoverSearchEngine.kindLabel("event", true));
        assertEquals("Result", DiscoverSearchEngine.kindLabel("mystery", false));
    }

    @Test
    public void formatCompensation_handlesRangeSingleAndNegotiable() {
        assertEquals("BDT 50,000 - 90,000/month", DiscoverSearchEngine.formatCompensation(50000, 90000, "bdt", "month", false));
        assertEquals("Negotiable", DiscoverSearchEngine.formatCompensation(null, null, "BDT", "month", false));
        assertEquals("আলোচনা সাপেক্ষ", DiscoverSearchEngine.formatCompensation(null, null, "BDT", "month", true));
        assertEquals("BDT 50,000/month", DiscoverSearchEngine.formatCompensation(50000, 50000, "BDT", "month", false));
        assertEquals("BDT 40,000", DiscoverSearchEngine.formatCompensation(40000, null, "BDT", "", false));
    }

    @Test
    public void formatCompensation_swapsReversedBounds() {
        assertEquals("BDT 50,000 - 90,000/month", DiscoverSearchEngine.formatCompensation(90000, 50000, "BDT", "month", false));
    }

    @Test
    public void formatBudget_handlesRangeHourlyAndDeliveryWindow() {
        assertEquals("BDT 12,000 – 18,000 fixed · 14 days",
            DiscoverSearchEngine.formatBudget(12000, 18000, "BDT", false, 14, false));
        assertEquals("BDT 800/hr", DiscoverSearchEngine.formatBudget(800, null, "BDT", true, null, false));
        assertEquals("Negotiable", DiscoverSearchEngine.formatBudget(null, null, "BDT", false, null, false));
        assertEquals("Negotiable · hourly", DiscoverSearchEngine.formatBudget(null, null, "BDT", true, null, false));
        assertEquals("BDT 5,000 fixed · 1 day", DiscoverSearchEngine.formatBudget(5000, null, "BDT", false, 1, false));
        assertEquals("BDT 5,000 fixed · 3 days", DiscoverSearchEngine.formatBudget(5000, null, "BDT", false, 3, false));
    }

    @Test
    public void formatBudgetShort_isCompact() {
        assertEquals("BDT 12,000–18,000", DiscoverSearchEngine.formatBudgetShort(12000, 18000, "BDT", false));
        assertEquals("BDT 7,500", DiscoverSearchEngine.formatBudgetShort(7500, 7500, "bdt", false));
        assertEquals("Negotiable", DiscoverSearchEngine.formatBudgetShort(null, null, "BDT", false));
    }

    @Test
    public void convertCompensation_crossesPeriods() {
        assertEquals("BDT 120,000/year", DiscoverSearchEngine.convertCompensation(10000, "month", "year", "BDT"));
        assertEquals("BDT 10,000/month", DiscoverSearchEngine.convertCompensation(120000, "year", "month", "BDT"));
        assertEquals("BDT 48/hour", DiscoverSearchEngine.convertCompensation(10000, "month", "hour", "BDT"));
        assertEquals("", DiscoverSearchEngine.convertCompensation(10000, "fortnight", "month", "BDT"));
        assertEquals("", DiscoverSearchEngine.convertCompensation(0, "month", "year", "BDT"));
    }

    @Test
    public void normaliseSkill_trimsLowercasesAndCollapsesSpaces() {
        assertEquals("react native", DiscoverSearchEngine.normaliseSkill("  React   Native "));
        assertEquals("", DiscoverSearchEngine.normaliseSkill(null));
        assertEquals("", DiscoverSearchEngine.normaliseSkill("   "));
    }

    @Test
    public void normaliseSkills_dedupesAndSorts() {
        List<String> out = DiscoverSearchEngine.normaliseSkills(
            Arrays.asList("Kotlin", " kotlin ", "", "Compose", "SQL"));
        assertEquals(Arrays.asList("compose", "kotlin", "sql"), out);
        assertTrue(DiscoverSearchEngine.normaliseSkills(null).isEmpty());
    }

    @Test
    public void skillMatchPercent_countsOverlapAndNeverFakesAPerfectScore() {
        assertEquals(67, DiscoverSearchEngine.skillMatchPercent(
            Arrays.asList("Kotlin", "Compose", "SQL"), Arrays.asList("kotlin", "sql")));
        assertEquals(100, DiscoverSearchEngine.skillMatchPercent(
            Arrays.asList("Kotlin"), Arrays.asList("KOTLIN")));
        assertEquals(0, DiscoverSearchEngine.skillMatchPercent(Collections.emptyList(), Arrays.asList("kotlin")));
        assertEquals(0, DiscoverSearchEngine.skillMatchPercent(Arrays.asList("Kotlin"), Collections.emptyList()));
    }

    @Test
    public void missingSkills_listsWhatTheReaderLacks() {
        assertEquals(Collections.singletonList("compose"), DiscoverSearchEngine.missingSkills(
            Arrays.asList("Kotlin", "Compose"), Arrays.asList("kotlin")));
    }

    @Test
    public void proposalProblems_returnsStableCodes() {
        assertTrue(DiscoverSearchEngine.proposalProblems("A solid twenty-plus character pitch.", 5000, 7).isEmpty());
        assertEquals(Arrays.asList("pitch_short"), DiscoverSearchEngine.proposalProblems("too short", 5000, 7));
        assertEquals(Arrays.asList("pitch_short", "bid_invalid", "days_invalid"),
            DiscoverSearchEngine.proposalProblems("", null, null));
        assertEquals(Arrays.asList("bid_invalid"), DiscoverSearchEngine.proposalProblems(
            "A solid twenty-plus character pitch.", -1, 7));
        assertEquals(Arrays.asList("days_too_long"), DiscoverSearchEngine.proposalProblems(
            "A solid twenty-plus character pitch.", 100, 100000));
    }

    @Test
    public void proposalProblems_acceptsBoundaryValues() {
        String pitch = "a".repeat(DiscoverSearchEngine.MIN_PITCH);
        assertTrue(DiscoverSearchEngine.proposalProblems(pitch, 0, 1).isEmpty());
        assertTrue(DiscoverSearchEngine.proposalProblems(
            pitch, 0, DiscoverSearchEngine.MAX_DELIVERY_DAYS).isEmpty());
    }

    @Test
    public void gigNextStatuses_allowsReopenAndCloseOnly() {
        assertEquals(Arrays.asList("paused", "closed"), DiscoverSearchEngine.gigNextStatuses("open"));
        assertEquals(Arrays.asList("open", "closed"), DiscoverSearchEngine.gigNextStatuses(" PAUSED "));
        assertEquals(Collections.singletonList("open"), DiscoverSearchEngine.gigNextStatuses("closed"));
        assertTrue(DiscoverSearchEngine.gigNextStatuses("draft").isEmpty());
        assertTrue(DiscoverSearchEngine.gigNextStatuses(null).isEmpty());
    }

    @Test
    public void proposalAction_followsTheProposalStatus() {
        assertEquals("withdraw", DiscoverSearchEngine.proposalAction("submitted"));
        assertEquals("withdraw", DiscoverSearchEngine.proposalAction("shortlisted"));
        assertEquals("propose", DiscoverSearchEngine.proposalAction(null));
        assertEquals("propose", DiscoverSearchEngine.proposalAction("withdrawn"));
        assertEquals("none", DiscoverSearchEngine.proposalAction("hired"));
        assertEquals("none", DiscoverSearchEngine.proposalAction("rejected"));
    }

    @Test
    public void safeHttpUrlOrEmpty_rejectsJavascriptAndMalformed() {
        assertEquals("https://bsdc.info.bd", DiscoverSearchEngine.safeHttpUrlOrEmpty(" https://bsdc.info.bd "));
        assertEquals("", DiscoverSearchEngine.safeHttpUrlOrEmpty("javascript:alert(1)"));
        assertEquals("", DiscoverSearchEngine.safeHttpUrlOrEmpty("not a url"));
        assertEquals("", DiscoverSearchEngine.safeHttpUrlOrEmpty(""));
        assertEquals("", DiscoverSearchEngine.safeHttpUrlOrEmpty("file:///etc/passwd"));
    }

    @Test
    public void followReasonLabel_formatsReasonsCleanly() {
        assertEquals("2 mutual connections", DiscoverSearchEngine.followReasonLabel("mutual", 2, Collections.emptyList(), false));
        assertEquals("1 mutual connection", DiscoverSearchEngine.followReasonLabel("mutual", 1, Collections.emptyList(), false));
        assertEquals("অভিন্ন দক্ষতা: Kotlin", DiscoverSearchEngine.followReasonLabel("skills", 0, Collections.singletonList("Kotlin"), true));
    }

    @Test
    public void resolveSearchRoute_keepsTheTargetInsideItsOwnPath() {
        // A slug is appended to a fixed prefix, so a hostile slug can never introduce a new
        // scheme or host — the worst it can do is look odd inside the path it was given.
        for (String kind : Arrays.asList("post", "person", "group", "course", "job", "gig", "event", "project")) {
            String route = DiscoverSearchEngine.resolveSearchRoute(kind, "x@y://evil", null);
            // One leading slash, never two: the slug stays a path segment and cannot become
            // a protocol-relative address that a browser would treat as a new host.
            assertTrue(route, route.startsWith("/"));
            assertFalse(route, route.startsWith("//"));
        }
        // A hostile slug is also refused outright when the kind would put it after "@".
        assertEquals("/@x@y://evil", DiscoverSearchEngine.resolveSearchRoute("person", "x@y://evil", null));
    }
}
