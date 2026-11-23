package bd.info.bsdc.app.core.common;

import java.util.ArrayList;
import java.util.List;

/**
 * The rules one skill or technology tag obeys.
 *
 * <p>Field-for-field parity with {@code main-site/src/design-system/TagInput.tsx}: a tag is trimmed,
 * clamped to 32 characters, refused below 2 characters, refused once the list holds 20, and refused
 * when the list already holds it in another case. Those decisions used to live inside a React
 * component, which is the reason the app's listing forms kept skills as one comma-separated text box
 * — the only shape that needs no rules of its own, and the only one a thumb cannot edit. With the
 * rules here, the app can show chips and still send exactly what the browser would have sent.
 *
 * <p>The case of a stored skill is not left to this class: {@link #LISTINGS} keeps the member's own
 * capitalisation, because the website's listing skills field passes no normaliser, while
 * {@link #APPLICATIONS} lower-cases, because an application's skills are matched against the canonical
 * column. Both are the website's behaviour, read from the call site that supplies them, and the two
 * tests in {@code ListingTagsTest} are pinned to those two call sites.
 */
public final class ListingTags {

    public static final int MAX_TAGS = 20;
    public static final int TAG_MIN_LENGTH = 2;
    public static final int TAG_MAX_LENGTH = 32;
    public static final int SUGGESTIONS_SHOWN = 8;

    /** The ceiling for a set of skills on a job application, which is a wider list than a listing's. */
    public static final int APPLICATION_MAX_SKILLS = 30;
    public static final int APPLICATION_SKILL_MAX_LENGTH = 64;

    private ListingTags() {}

    /**
     * One TagInput's worth of rules. The website passes these numbers to the same component from two
     * different screens, so the app carries the pair rather than inventing a third.
     */
    public static final class Rules {
        public final int minTagLength;
        public final int maxTagLength;
        public final int maxTags;
        /** Whether a tag is stored lower-cased and whitespace-collapsed, as an application's are. */
        public final boolean canonicalCase;

        Rules(int minTagLength, int maxTagLength, int maxTags, boolean canonicalCase) {
            this.minTagLength = minTagLength;
            this.maxTagLength = maxTagLength;
            this.maxTags = maxTags;
            this.canonicalCase = canonicalCase;
        }
    }

    /** A gig's or job's skills: `TagInput.tsx`'s own defaults, with no normaliser on the change. */
    public static final Rules LISTINGS = new Rules(TAG_MIN_LENGTH, TAG_MAX_LENGTH, MAX_TAGS, false);

    /** An application's skills: `max={30} maxLength={64}` and `normaliseSkills` on every change. */
    public static final Rules APPLICATIONS =
        new Rules(TAG_MIN_LENGTH, APPLICATION_SKILL_MAX_LENGTH, APPLICATION_MAX_SKILLS, true);

    /** The tag as one of [rules]' lists would store it. */
    public static String prepare(Rules rules, String raw) {
        String tag = raw == null ? "" : raw.trim();
        if (rules != null && rules.canonicalCase) {
            tag = normaliseSkill(tag);
        }
        return clamp(tag, rules == null ? TAG_MAX_LENGTH : rules.maxTagLength);
    }

    /**
     * The tag as it would be stored, or {@code null} when it must not be added at all.
     */
    public static String accept(List<String> current, String raw) {
        return accept(LISTINGS, current, raw);
    }

    /**
     * The tag as [rules] would store it, or {@code null} when it must not be added at all.
     */
    public static String accept(Rules rules, List<String> current, String raw) {
        if (raw == null) {
            return null;
        }
        int min = rules == null ? TAG_MIN_LENGTH : rules.minTagLength;
        String tag = prepare(rules, raw);
        if (tag.length() < min) {
            return null;
        }
        int cap = rules == null ? MAX_TAGS : rules.maxTags;
        if (current != null) {
            if (current.size() >= cap) {
                return null;
            }
            for (String existing : current) {
                if (existing != null && existing.equalsIgnoreCase(tag)) {
                    return null;
                }
            }
        }
        return tag;
    }

    /**
     * {@code current} with {@code raw} appended, when the rules allow it.
     *
     * <p>Returns the original list untouched when the tag is refused, so a caller never has to
     * re-check the answer and a rejected tap cannot look like it worked.
     */
    public static List<String> added(List<String> current, String raw) {
        return added(LISTINGS, current, raw);
    }

    /** [current] with [raw] appended under [rules], or unchanged when the tag is refused. */
    public static List<String> added(Rules rules, List<String> current, String raw) {
        String tag = accept(rules, current, raw);
        List<String> out = new ArrayList<>();
        if (current != null) {
            out.addAll(current);
        }
        if (tag != null) {
            out.add(tag);
        }
        return out;
    }

    /**
     * One comma-separated line — what the create drafts still store — as a legal tag list.
     */
    public static List<String> parse(String text) {
        List<String> out = new ArrayList<>();
        if (text == null) {
            return out;
        }
        for (String part : text.split(",")) {
            String candidate = accept(out, part);
            if (candidate != null) {
                out.add(candidate);
            }
        }
        return out;
    }

    /**
     * A tag list as one comma-separated line.
     */
    public static String join(List<String> tags) {
        if (tags == null || tags.isEmpty()) {
            return "";
        }
        return String.join(", ", tags);
    }

    /**
     * The suggestions worth offering: the ones not already chosen, capped at eight, in the caller's
     * order. The cap is the website's, and it is not decoration — a wall of eight chips is already
     * the most a phone screen can show without pushing the form's other fields off it.
     */
    public static List<String> availableSuggestions(List<String> tags, List<String> suggestions) {
        List<String> out = new ArrayList<>();
        if (suggestions == null) {
            return out;
        }
        for (String suggestion : suggestions) {
            if (suggestion == null) {
                continue;
            }
            boolean taken = false;
            if (tags != null) {
                for (String tag : tags) {
                    if (tag != null && tag.equalsIgnoreCase(suggestion)) {
                        taken = true;
                        break;
                    }
                }
            }
            if (!taken) {
                out.add(suggestion);
                if (out.size() >= SUGGESTIONS_SHOWN) {
                    break;
                }
            }
        }
        return out;
    }

    /**
     * The one canonical form a skill is stored in, exactly as `normaliseSkill` in
     * `main-site/src/lib/opportunities/skills.ts` computes it: trimmed, inner runs of whitespace
     * collapsed to one space, lower-cased. Migration 0103 put the database in this form and skill
     * filters match against it, so a client that stores "Kotlin" writes a row its own filters will
     * never find.
     */
    public static String normaliseSkill(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.trim().replaceAll("\\s+", " ").toLowerCase(java.util.Locale.ROOT);
    }

    /**
     * A whole list in canonical form: no blanks, no duplicates, sorted. Uncapped on purpose, because
     * the ceiling is a rule the *form* refuses with and the number of skills is worth reporting.
     */
    public static List<String> normalise(List<String> skills) {
        java.util.Set<String> seen = new java.util.LinkedHashSet<>();
        if (skills != null) {
            for (String skill : skills) {
                String canonical = normaliseSkill(skill);
                if (!canonical.isEmpty()) {
                    seen.add(canonical);
                }
            }
        }
        List<String> out = new ArrayList<>(seen);
        java.util.Collections.sort(out);
        return out;
    }

    /**
     * A comma-separated draft — the shape the create forms still keep in memory — as the list that
     * goes on the wire. Canonical, deduplicated, sorted, and held to {@link #MAX_TAGS}, which is what
     * the create screen's own box has always promised.
     */
    public static List<String> fromCommaText(String text) {
        List<String> all = new ArrayList<>();
        if (text != null) {
            for (String part : text.split(",")) {
                all.add(part);
            }
        }
        List<String> out = new ArrayList<>();
        for (String skill : normalise(all)) {
            if (out.size() >= MAX_TAGS) {
                break;
            }
            out.add(skill);
        }
        return out;
    }

    private static String clamp(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }
}
