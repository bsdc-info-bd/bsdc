package bd.info.bsdc.app.feature.feed;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Pure Java 21 4-stage BSDC feed ranking engine mirroring `main-site/src/lib/feed/ranking.ts`.
 *
 * <p>1. Database RLS candidate window (`feed_candidates`)
 * <p>2. Filtering (blocks, mutes, sensitivity, language, seen status)
 * <p>3. Deterministic scoring (recency half-life 6h, quality, affinity, following, language)
 * <p>4. Author & tag diversity cap (max 2 per author, 3 per tag in primary stream)
 */
public final class FeedRankingEngine {

    public static final double WEIGHT_RECENCY = 40.0;
    public static final double WEIGHT_FOLLOWING = 28.0;
    public static final double WEIGHT_AFFINITY = 18.0;
    public static final double WEIGHT_QUALITY = 20.0;
    public static final double WEIGHT_LANGUAGE = 8.0;
    public static final double WEIGHT_SEEN_PENALTY = 35.0;
    public static final double WEIGHT_SENSITIVE_PENALTY = 6.0;
    private static final double RECENCY_HALF_LIFE_HOURS = 6.0;

    public static final class Candidate {
        public final String postId;
        public final String authorUid;
        public final String publishedAtIso;
        public final int likes;
        public final int comments;
        public final int views;
        public final String language;
        public final boolean isSensitive;
        public final String kind;
        public final boolean authorFollowed;
        public final double affinity;
        public final boolean alreadySeen;
        public final List<String> tags;

        public Candidate(
            String postId,
            String authorUid,
            String publishedAtIso,
            int likes,
            int comments,
            int views,
            String language,
            boolean isSensitive,
            String kind,
            boolean authorFollowed,
            double affinity,
            boolean alreadySeen,
            List<String> tags
        ) {
            this.postId = postId;
            this.authorUid = authorUid;
            this.publishedAtIso = publishedAtIso;
            this.likes = likes;
            this.comments = comments;
            this.views = views;
            this.language = language;
            this.isSensitive = isSensitive;
            this.kind = kind;
            this.authorFollowed = authorFollowed;
            this.affinity = affinity;
            this.alreadySeen = alreadySeen;
            this.tags = tags == null ? Collections.emptyList() : tags;
        }
    }

    public static final class Preferences {
        public final String algorithm; // ranked, following, latest
        public final List<String> languages;
        public final Set<String> mutedTagsLower;
        public final boolean showSensitive;
        public final boolean hideSeen;

        public Preferences(
            String algorithm,
            List<String> languages,
            List<String> mutedTags,
            boolean showSensitive,
            boolean hideSeen
        ) {
            this.algorithm = algorithm == null ? "ranked" : algorithm;
            this.languages = languages == null ? List.of("bn", "en") : languages;
            Set<String> muted = new HashSet<>();
            if (mutedTags != null) {
                for (String t : mutedTags) {
                    if (t != null && !t.trim().isEmpty()) {
                        muted.add(t.trim().toLowerCase(Locale.ROOT));
                    }
                }
            }
            this.mutedTagsLower = Collections.unmodifiableSet(muted);
            this.showSensitive = showSensitive;
            this.hideSeen = hideSeen;
        }
    }

    public static final class ScoredCandidate {
        public final Candidate candidate;
        public final double score;
        public final List<String> reasons;

        public ScoredCandidate(Candidate candidate, double score, List<String> reasons) {
            this.candidate = candidate;
            this.score = score;
            this.reasons = reasons;
        }
    }

    public enum EmptyReason {
        NONE,
        NOTHING,
        ALL_SEEN,
        PREFERENCES
    }

    public static final class RankOutcome {
        public final List<ScoredCandidate> ranked;
        public final int considered;
        public final int removedSeen;
        public final int removedSensitive;
        public final int removedMuted;
        public final int removedLanguage;
        public final int removedFollowing;
        public final EmptyReason emptyReason;

        RankOutcome(
            List<ScoredCandidate> ranked,
            int considered,
            int removedSeen,
            int removedSensitive,
            int removedMuted,
            int removedLanguage,
            int removedFollowing
        ) {
            this.ranked = ranked;
            this.considered = considered;
            this.removedSeen = removedSeen;
            this.removedSensitive = removedSensitive;
            this.removedMuted = removedMuted;
            this.removedLanguage = removedLanguage;
            this.removedFollowing = removedFollowing;

            if (!ranked.isEmpty()) {
                this.emptyReason = EmptyReason.NONE;
            } else if (considered == 0) {
                this.emptyReason = EmptyReason.NOTHING;
            } else {
                int totalRemoved =
                    removedSeen + removedSensitive + removedMuted + removedLanguage + removedFollowing;
                this.emptyReason = (totalRemoved == removedSeen && removedSeen > 0)
                    ? EmptyReason.ALL_SEEN
                    : EmptyReason.PREFERENCES;
            }
        }
    }

    private FeedRankingEngine() {}

    public static double recencyScore(String publishedAtIso, long nowEpochMs) {
        long ms = parseEpochMs(publishedAtIso);
        if (ms <= 0L) return 0.0;
        double ageHours = Math.max(0.0, (nowEpochMs - ms) / 3_600_000.0);
        return Math.pow(0.5, ageHours / RECENCY_HALF_LIFE_HOURS);
    }

    public static double qualityScore(Candidate c) {
        double interactions = c.likes + (c.comments * 2.0);
        double magnitude = Math.log10(1.0 + interactions) / Math.log10(1.0 + 500.0);
        double views = Math.max(c.views, 1);
        double engagementRate = Math.min(interactions / views, 0.5) * 2.0;
        return Math.min(1.0, magnitude * 0.7 + engagementRate * 0.3);
    }

    public static double affinityScore(Candidate c) {
        return Math.min(1.0, Math.max(0.0, c.affinity) / 30.0);
    }

    public static RankOutcome rankFeed(
        List<Candidate> candidates,
        Preferences prefs,
        String viewerUid,
        long nowEpochMs
    ) {
        if (candidates == null || candidates.isEmpty()) {
            return new RankOutcome(Collections.emptyList(), 0, 0, 0, 0, 0, 0);
        }

        int removedSeen = 0;
        int removedSensitive = 0;
        int removedMuted = 0;
        int removedLanguage = 0;
        int removedFollowing = 0;
        List<Candidate> kept = new ArrayList<>();

        for (Candidate c : candidates) {
            if (viewerUid != null && !viewerUid.isEmpty() && viewerUid.equals(c.authorUid)) {
                kept.add(c);
                continue;
            }
            if (!prefs.showSensitive && c.isSensitive) {
                removedSensitive += 1;
                continue;
            }
            boolean hasMutedTag = false;
            for (String tag : c.tags) {
                if (prefs.mutedTagsLower.contains(tag.toLowerCase(Locale.ROOT))) {
                    hasMutedTag = true;
                    break;
                }
            }
            if (hasMutedTag) {
                removedMuted += 1;
                continue;
            }
            if (!prefs.languages.isEmpty() && !prefs.languages.contains(c.language)) {
                removedLanguage += 1;
                continue;
            }
            if ("following".equals(prefs.algorithm) && !c.authorFollowed) {
                removedFollowing += 1;
                continue;
            }
            if (prefs.hideSeen && !"latest".equals(prefs.algorithm) && c.alreadySeen) {
                removedSeen += 1;
                continue;
            }
            kept.add(c);
        }

        if ("latest".equals(prefs.algorithm)) {
            List<ScoredCandidate> latest = new ArrayList<>(kept.size());
            for (Candidate c : kept) {
                latest.add(new ScoredCandidate(c, 0.0, List.of("fresh")));
            }
            latest.sort((a, b) -> Long.compare(
                parseEpochMs(b.candidate.publishedAtIso),
                parseEpochMs(a.candidate.publishedAtIso)
            ));
            return new RankOutcome(
                latest,
                candidates.size(),
                removedSeen,
                removedSensitive,
                removedMuted,
                removedLanguage,
                removedFollowing
            );
        }

        List<ScoredCandidate> scored = new ArrayList<>(kept.size());
        for (Candidate c : kept) {
            scored.add(scoreCandidate(c, prefs, nowEpochMs));
        }
        List<ScoredCandidate> diversified = diversify(scored, 2, 3);
        return new RankOutcome(
            diversified,
            candidates.size(),
            removedSeen,
            removedSensitive,
            removedMuted,
            removedLanguage,
            removedFollowing
        );
    }

    public static ScoredCandidate scoreCandidate(Candidate c, Preferences prefs, long nowEpochMs) {
        List<String> reasons = new ArrayList<>();
        double recency = recencyScore(c.publishedAtIso, nowEpochMs);
        double quality = qualityScore(c);
        double affinity = affinityScore(c);
        int langMatch = (!prefs.languages.isEmpty() && prefs.languages.get(0).equals(c.language)) ? 1 : 0;

        double score =
            recency * WEIGHT_RECENCY +
            quality * WEIGHT_QUALITY +
            affinity * WEIGHT_AFFINITY +
            langMatch * WEIGHT_LANGUAGE;

        if (c.authorFollowed) {
            score += WEIGHT_FOLLOWING;
            reasons.add("following");
        }
        if (affinity > 0.25) reasons.add("topic");
        if (quality > 0.4) reasons.add("popular");
        if (recency > 0.5) reasons.add("fresh");
        if (langMatch == 1) reasons.add("language");

        if (c.alreadySeen) score -= WEIGHT_SEEN_PENALTY;
        if (c.isSensitive) score -= WEIGHT_SENSITIVE_PENALTY;

        double rounded = Math.round(score * 100.0) / 100.0;
        return new ScoredCandidate(c, rounded, reasons);
    }

    public static List<ScoredCandidate> diversify(
        List<ScoredCandidate> scored,
        int maxPerAuthor,
        int maxPerTag
    ) {
        List<ScoredCandidate> ordered = new ArrayList<>(scored);
        ordered.sort((a, b) -> {
            int cmp = Double.compare(b.score, a.score);
            return cmp != 0 ? cmp : a.candidate.postId.compareTo(b.candidate.postId);
        });

        Map<String, Integer> authorCount = new HashMap<>();
        Map<String, Integer> tagCount = new HashMap<>();
        List<ScoredCandidate> primary = new ArrayList<>(ordered.size());
        List<ScoredCandidate> overflow = new ArrayList<>();

        for (ScoredCandidate sc : ordered) {
            int seenAuthor = authorCount.getOrDefault(sc.candidate.authorUid, 0);
            boolean tagExceeded = false;
            for (String tag : sc.candidate.tags) {
                if (tagCount.getOrDefault(tag.toLowerCase(Locale.ROOT), 0) >= maxPerTag) {
                    tagExceeded = true;
                    break;
                }
            }
            if (seenAuthor >= maxPerAuthor || tagExceeded) {
                overflow.add(sc);
                continue;
            }
            authorCount.put(sc.candidate.authorUid, seenAuthor + 1);
            for (String tag : sc.candidate.tags) {
                String lower = tag.toLowerCase(Locale.ROOT);
                tagCount.put(lower, tagCount.getOrDefault(lower, 0) + 1);
            }
            primary.add(sc);
        }

        primary.addAll(overflow);
        return primary;
    }

    private static long parseEpochMs(String iso) {
        if (iso == null || iso.trim().isEmpty()) return 0L;
        try {
            return Instant.parse(iso.trim()).toEpochMilli();
        } catch (Exception ignored) {
            return 0L;
        }
    }
}
