package bd.info.bsdc.app.feature.feed;

import org.junit.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public final class FeedRankingEngineTest {

    private static final Instant NOW = Instant.parse("2026-11-11T12:00:00Z");

    private static FeedRankingEngine.Candidate candidate(
        String id,
        String author,
        long ageHours,
        int likes,
        int comments,
        int views,
        String lang,
        boolean sensitive,
        boolean followed,
        double affinity,
        boolean seen,
        List<String> tags
    ) {
        String ts = NOW.minus(ageHours, ChronoUnit.HOURS).toString();
        return new FeedRankingEngine.Candidate(
            id, author, ts, likes, comments, views, lang, sensitive, "post",
            followed, affinity, seen, tags
        );
    }

    @Test
    public void filtersSensitiveMutedAndLanguageWhileKeepingOwnPost() {
        List<FeedRankingEngine.Candidate> input = List.of(
            candidate("own-sensitive", "viewer-1", 1, 0, 0, 1, "en", true, false, 0, true, List.of("mutedtag")),
            candidate("other-sensitive", "auth-2", 1, 50, 10, 100, "bn", true, false, 0, false, List.of("kotlin")),
            candidate("other-muted", "auth-3", 1, 50, 10, 100, "bn", false, false, 0, false, List.of("MutedTag")),
            candidate("other-wrong-lang", "auth-4", 1, 50, 10, 100, "es", false, false, 0, false, List.of("kotlin")),
            candidate("kept-normal", "auth-5", 1, 10, 2, 50, "bn", false, false, 15, false, List.of("android"))
        );
        FeedRankingEngine.Preferences prefs = new FeedRankingEngine.Preferences(
            "ranked",
            List.of("bn", "en"),
            List.of("mutedtag"),
            false,
            true
        );

        FeedRankingEngine.RankOutcome outcome = FeedRankingEngine.rankFeed(
            input, prefs, "viewer-1", NOW.toEpochMilli()
        );

        assertEquals(2, outcome.ranked.size());
        assertEquals(1, outcome.removedSensitive);
        assertEquals(1, outcome.removedMuted);
        assertEquals(1, outcome.removedLanguage);
        assertEquals(FeedRankingEngine.EmptyReason.NONE, outcome.emptyReason);
    }

    @Test
    public void reportsAllSeenEmptyReasonWhenOnlySeenFilterRemovesPosts() {
        List<FeedRankingEngine.Candidate> input = List.of(
            candidate("p1", "auth-1", 1, 5, 1, 20, "bn", false, false, 0, true, List.of("android")),
            candidate("p2", "auth-2", 2, 8, 2, 40, "en", false, false, 0, true, List.of("java"))
        );
        FeedRankingEngine.Preferences prefs = new FeedRankingEngine.Preferences(
            "ranked",
            List.of("bn", "en"),
            List.of(),
            true,
            true
        );

        FeedRankingEngine.RankOutcome outcome = FeedRankingEngine.rankFeed(
            input, prefs, "viewer-9", NOW.toEpochMilli()
        );

        assertTrue(outcome.ranked.isEmpty());
        assertEquals(2, outcome.removedSeen);
        assertEquals(FeedRankingEngine.EmptyReason.ALL_SEEN, outcome.emptyReason);
    }

    @Test
    public void enforcesAuthorAndTagDiversityCapsAndAppendsOverflow() {
        List<FeedRankingEngine.Candidate> input = List.of(
            candidate("a1", "same-author", 1, 100, 20, 200, "bn", false, true, 30, false, List.of("android")),
            candidate("a2", "same-author", 1, 95, 20, 200, "bn", false, true, 30, false, List.of("android")),
            candidate("a3", "same-author", 1, 90, 20, 200, "bn", false, true, 30, false, List.of("android")),
            candidate("b1", "other-author", 2, 20, 5, 100, "bn", false, false, 10, false, List.of("rust"))
        );
        FeedRankingEngine.Preferences prefs = new FeedRankingEngine.Preferences(
            "ranked",
            List.of("bn", "en"),
            List.of(),
            true,
            false
        );

        FeedRankingEngine.RankOutcome outcome = FeedRankingEngine.rankFeed(
            input, prefs, null, NOW.toEpochMilli()
        );

        assertEquals(4, outcome.ranked.size());
        // First two come from same-author, third must be other-author, fourth is overflow a3
        assertEquals("other-author", outcome.ranked.get(2).candidate.authorUid);
        assertEquals("a3", outcome.ranked.get(3).candidate.postId);
    }

    @Test
    public void latestAlgorithmIgnoresHideSeenAndSortsChronologically() {
        List<FeedRankingEngine.Candidate> input = List.of(
            candidate("older", "auth-1", 10, 500, 100, 1000, "bn", false, true, 30, true, List.of()),
            candidate("newer", "auth-2", 1, 0, 0, 1, "en", false, false, 0, true, List.of())
        );
        FeedRankingEngine.Preferences prefs = new FeedRankingEngine.Preferences(
            "latest",
            List.of("bn", "en"),
            List.of(),
            true,
            true
        );

        FeedRankingEngine.RankOutcome outcome = FeedRankingEngine.rankFeed(
            input, prefs, null, NOW.toEpochMilli()
        );

        assertEquals(2, outcome.ranked.size());
        assertEquals("newer", outcome.ranked.get(0).candidate.postId);
        assertEquals("older", outcome.ranked.get(1).candidate.postId);
    }
}
