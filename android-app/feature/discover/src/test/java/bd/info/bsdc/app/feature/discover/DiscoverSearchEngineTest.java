package bd.info.bsdc.app.feature.discover;

import static org.junit.Assert.assertEquals;

import java.util.Collections;
import org.junit.Test;

public class DiscoverSearchEngineTest {

    @Test
    public void sanitizeSearchQuery_cleansControlCharsAndTruncates() {
        assertEquals("kotlin compose", DiscoverSearchEngine.sanitizeSearchQuery("  kotlin\n\t compose  "));
        String longText = "a".repeat(120);
        assertEquals(80, DiscoverSearchEngine.sanitizeSearchQuery(longText).length());
    }

    @Test
    public void resolveSearchRoute_mapsAllSixSearchKinds() {
        assertEquals("/p/hello", DiscoverSearchEngine.resolveSearchRoute("post", "hello", "1"));
        assertEquals("/@arif", DiscoverSearchEngine.resolveSearchRoute("person", "arif", "2"));
        assertEquals("/g/android-bd", DiscoverSearchEngine.resolveSearchRoute("group", "android-bd", "3"));
        assertEquals("/courses/kotlin-101", DiscoverSearchEngine.resolveSearchRoute("course", "kotlin-101", "4"));
        assertEquals("/jobs/senior-dev", DiscoverSearchEngine.resolveSearchRoute("job", "senior-dev", "5"));
        assertEquals("/projects/bsdc-app", DiscoverSearchEngine.resolveSearchRoute("project", "bsdc-app", "6"));
    }

    @Test
    public void formatCompensation_handlesRangeSingleAndNegotiable() {
        assertEquals("BDT 50000 - 90000/month", DiscoverSearchEngine.formatCompensation(50000, 90000, "bdt", "month", false));
        assertEquals("Negotiable", DiscoverSearchEngine.formatCompensation(null, null, "BDT", "month", false));
        assertEquals("আলোচনা সাপেক্ষ", DiscoverSearchEngine.formatCompensation(null, null, "BDT", "month", true));
    }

    @Test
    public void safeHttpUrlOrEmpty_rejectsJavascriptAndMalformed() {
        assertEquals("https://bsdc.info.bd", DiscoverSearchEngine.safeHttpUrlOrEmpty(" https://bsdc.info.bd "));
        assertEquals("", DiscoverSearchEngine.safeHttpUrlOrEmpty("javascript:alert(1)"));
        assertEquals("", DiscoverSearchEngine.safeHttpUrlOrEmpty("not a url"));
    }

    @Test
    public void followReasonLabel_formatsReasonsCleanly() {
        assertEquals("2 mutual connections", DiscoverSearchEngine.followReasonLabel("mutual", 2, Collections.emptyList(), false));
        assertEquals("অভিন্ন দক্ষতা: Kotlin", DiscoverSearchEngine.followReasonLabel("skills", 0, Collections.singletonList("Kotlin"), true));
    }
}
