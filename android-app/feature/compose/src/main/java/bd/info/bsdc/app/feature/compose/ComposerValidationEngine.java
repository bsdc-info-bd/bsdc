package bd.info.bsdc.app.feature.compose;

import java.net.URI;
import java.text.Normalizer;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pure Java 21 slug, excerpt, mention/tag, and Postgres-parity validator matching
 * {@code main-site/src/lib/content/text.ts} and {@code main-site/src/lib/create/create-types.ts}.
 */
public final class ComposerValidationEngine {

    public static final int TITLE_MIN = 3;
    public static final int TITLE_MAX = 140;
    public static final int DESCRIPTION_MIN = 20;
    public static final int EVENT_DESCRIPTION_MIN = 10;
    public static final int DESCRIPTION_MAX = 20_000;
    public static final int EVENT_DESCRIPTION_MAX = 8_000;
    public static final int GROUP_DESCRIPTION_MAX = 2_000;
    public static final int SKILLS_MAX = 20;
    public static final int DURATION_DAYS_MAX = 3_650;
    public static final int MAX_POLL_OPTIONS = 6;
    public static final int MIN_POLL_OPTIONS = 2;

    private static final Pattern NON_LATIN_MARK = Pattern.compile("[\\u0300-\\u036f]");
    private static final Pattern SLUG_SEPARATORS = Pattern.compile("[^a-z0-9\\u0980-\\u09FF]+");
    private static final Pattern NON_ASCII_SLUG = Pattern.compile("[^a-z0-9-]+");
    private static final Pattern EDGE_HYPHENS = Pattern.compile("^-+|-+$");
    private static final Pattern QUOTES = Pattern.compile("['\"’`]");
    private static final Pattern MARKDOWN_CODE_FENCE = Pattern.compile("```[\\s\\S]*?```");
    private static final Pattern MARKDOWN_LINKS = Pattern.compile("!\\[[^\\]]*\\]\\([^)]*\\)|\\[([^\\]]*)\\]\\([^)]*\\)");
    private static final Pattern MARKDOWN_SYMBOLS = Pattern.compile("(?m)^#{1,6}\\s+|[\\*_~`>]+");
    private static final Pattern MULTI_WHITESPACE = Pattern.compile("\\s+");
    private static final Pattern MENTION_PATTERN = Pattern.compile("(^|[\\s(])@([a-z0-9_]{3,24})\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern HASHTAG_PATTERN = Pattern.compile("(^|[\\s(])#([a-z0-9][a-z0-9-]{1,31})\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern GROUP_SLUG_PATTERN = Pattern.compile("^[a-z0-9][a-z0-9-]{2,59}$");

    private ComposerValidationEngine() {}

    public static String slugify(String input, String fallback) {
        String safeFallback = (fallback == null || fallback.isBlank()) ? "post" : fallback.trim().toLowerCase(Locale.ROOT);
        if (input == null || input.isBlank()) return safeFallback;

        String norm = Normalizer.normalize(input, Normalizer.Form.NFKD);
        norm = NON_LATIN_MARK.matcher(norm).replaceAll("").toLowerCase(Locale.ROOT);
        norm = QUOTES.matcher(norm).replaceAll("");
        norm = SLUG_SEPARATORS.matcher(norm).replaceAll("-");
        norm = EDGE_HYPHENS.matcher(norm).replaceAll("");
        if (norm.length() > 80) {
            norm = norm.substring(0, 80);
            norm = EDGE_HYPHENS.matcher(norm).replaceAll("");
        }
        String ascii = NON_ASCII_SLUG.matcher(norm).replaceAll("");
        ascii = EDGE_HYPHENS.matcher(ascii).replaceAll("");
        return ascii.length() >= 3 ? ascii : safeFallback;
    }

    public static String uniqueSlug(String input, String fallback) {
        String base = slugify(input, fallback);
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 6);
        String combined = base + "-" + suffix;
        return combined.length() > 120 ? combined.substring(0, 120) : combined;
    }

    public static String toExcerpt(String body, int limit) {
        if (body == null || body.isBlank()) return "";
        String cleaned = MARKDOWN_CODE_FENCE.matcher(body).replaceAll(" ");
        Matcher linkMatcher = MARKDOWN_LINKS.matcher(cleaned);
        StringBuilder sb = new StringBuilder();
        while (linkMatcher.find()) {
            String label = linkMatcher.group(1);
            linkMatcher.appendReplacement(sb, Matcher.quoteReplacement(label != null ? label : " "));
        }
        linkMatcher.appendTail(sb);
        cleaned = MARKDOWN_SYMBOLS.matcher(sb.toString()).replaceAll(" ");
        cleaned = MULTI_WHITESPACE.matcher(cleaned).replaceAll(" ").trim();

        int max = Math.max(20, limit);
        if (cleaned.length() <= max) return cleaned;
        String cut = cleaned.substring(0, max);
        int lastSpace = cut.lastIndexOf(' ');
        String trimmed = (lastSpace > 60 ? cut.substring(0, lastSpace) : cut).trim();
        return trimmed + "…";
    }

    public static int readingTimeMinutes(String combinedText) {
        if (combinedText == null || combinedText.trim().isEmpty()) return 1;
        String[] words = MULTI_WHITESPACE.split(combinedText.trim());
        int rounded = (int) Math.round(words.length / 200.0);
        return Math.min(180, Math.max(1, rounded));
    }

    public static List<String> extractMentions(String body) {
        if (body == null || body.isBlank()) return Collections.emptyList();
        Set<String> found = new LinkedHashSet<>();
        Matcher m = MENTION_PATTERN.matcher(body);
        while (m.find()) {
            String handle = m.group(2);
            if (handle != null && !handle.isBlank()) {
                found.add(handle.toLowerCase(Locale.ROOT));
            }
        }
        return new ArrayList<>(found);
    }

    public static List<String> extractHashtags(String body) {
        if (body == null || body.isBlank()) return Collections.emptyList();
        Set<String> found = new LinkedHashSet<>();
        Matcher m = HASHTAG_PATTERN.matcher(body);
        while (m.find()) {
            String tag = m.group(2);
            if (tag != null && !tag.isBlank()) {
                found.add(tag.toLowerCase(Locale.ROOT));
            }
        }
        return new ArrayList<>(found);
    }

    public static String normalizeTag(String raw) {
        if (raw == null) return "";
        String t = raw.trim().toLowerCase(Locale.ROOT);
        if (t.startsWith("#")) t = t.substring(1);
        t = t.replaceAll("[^a-z0-9-]+", "-");
        t = EDGE_HYPHENS.matcher(t).replaceAll("");
        return t.length() > 32 ? t.substring(0, 32) : t;
    }

    public static boolean isHttpUrl(String value) {
        if (value == null || value.trim().isEmpty()) return true;
        try {
            URI uri = URI.create(value.trim());
            String scheme = uri.getScheme();
            return ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))
                && uri.getHost() != null
                && !uri.getHost().isBlank();
        } catch (Exception ignored) {
            return false;
        }
    }

    public static List<String> validatePostDraft(
        String kind,
        String title,
        String body,
        String code,
        List<String> pollOptions,
        boolean hasUnreadyImages
    ) {
        List<String> issues = new ArrayList<>();
        String cleanTitle = title == null ? "" : title.trim();
        String cleanBody = body == null ? "" : body.trim();
        String cleanCode = code == null ? "" : code.trim();

        if (hasUnreadyImages) {
            issues.add("Wait for all attached images to finish uploading or remove failed uploads.");
        }
        if ("article".equals(kind) && cleanTitle.length() < TITLE_MIN) {
            issues.add("Articles require a title of at least 3 characters.");
        }
        if ("question".equals(kind) && cleanTitle.length() < TITLE_MIN) {
            issues.add("Questions require a clear title of at least 3 characters.");
        }
        if ("poll".equals(kind)) {
            if (cleanTitle.length() < TITLE_MIN && cleanBody.length() < TITLE_MIN) {
                issues.add("Polls require a question or prompt.");
            }
            int nonBlankOptions = 0;
            if (pollOptions != null) {
                for (String opt : pollOptions) {
                    if (opt != null && !opt.trim().isEmpty()) nonBlankOptions++;
                }
            }
            if (nonBlankOptions < MIN_POLL_OPTIONS) {
                issues.add("Add at least 2 poll options.");
            } else if (nonBlankOptions > MAX_POLL_OPTIONS) {
                issues.add("Polls can have at most 6 options.");
            }
        } else if ("snippet".equals(kind)) {
            if (cleanCode.isEmpty()) {
                issues.add("Code snippets require source code.");
            }
        } else if (cleanTitle.isEmpty() && cleanBody.isEmpty()) {
            issues.add("Write a title or post body before publishing.");
        }
        if (cleanTitle.length() > TITLE_MAX) {
            issues.add("Title cannot exceed 140 characters.");
        }
        return issues;
    }

    public static List<String> validateEventDraft(
        String title,
        String description,
        String mode,
        String venue,
        String city,
        String joinUrl,
        String startsAtIso,
        String endsAtIso,
        Integer capacity
    ) {
        List<String> issues = new ArrayList<>();
        String cleanTitle = title == null ? "" : title.trim();
        String cleanDesc = description == null ? "" : description.trim();
        if (cleanTitle.length() < TITLE_MIN || cleanTitle.length() > TITLE_MAX) {
            issues.add("Event title must be between 3 and 140 characters.");
        }
        if (cleanDesc.length() < EVENT_DESCRIPTION_MIN || cleanDesc.length() > EVENT_DESCRIPTION_MAX) {
            issues.add("Event description must be at least 10 characters.");
        }
        long startMs = parseEpochMs(startsAtIso);
        long endMs = parseEpochMs(endsAtIso);
        if (startMs <= 0 || endMs <= 0) {
            issues.add("Valid ISO start and end timestamps are required.");
        } else if (endMs <= startMs) {
            issues.add("Event end time must be after start time.");
        }
        boolean needsUrl = "online".equals(mode) || "hybrid".equals(mode);
        boolean needsVenue = "in_person".equals(mode) || "hybrid".equals(mode);
        if (needsUrl && (joinUrl == null || joinUrl.trim().isEmpty())) {
            issues.add("Online and hybrid events require a join URL.");
        }
        if (needsVenue && (venue == null || venue.trim().isEmpty())) {
            issues.add("In-person and hybrid events require a venue.");
        }
        if (!isHttpUrl(joinUrl)) {
            issues.add("Join URL must be a valid HTTP/HTTPS link.");
        }
        if (capacity != null && capacity <= 0) {
            issues.add("Capacity must be greater than zero.");
        }
        return issues;
    }

    public static List<String> validateJobDraft(
        String title,
        String company,
        String description,
        String workMode,
        String city,
        Integer salaryMin,
        Integer salaryMax,
        List<String> skills,
        String applyUrl
    ) {
        List<String> issues = new ArrayList<>();
        String cleanTitle = title == null ? "" : title.trim();
        String cleanCompany = company == null ? "" : company.trim();
        String cleanDesc = description == null ? "" : description.trim();
        if (cleanTitle.length() < TITLE_MIN || cleanTitle.length() > TITLE_MAX) {
            issues.add("Job title must be between 3 and 140 characters.");
        }
        if (cleanCompany.length() < 2 || cleanCompany.length() > 100) {
            issues.add("Company name must be between 2 and 100 characters.");
        }
        if (cleanDesc.length() < DESCRIPTION_MIN || cleanDesc.length() > DESCRIPTION_MAX) {
            issues.add("Job description must be at least 20 characters.");
        }
        if (!"remote".equals(workMode) && (city == null || city.trim().isEmpty())) {
            issues.add("Non-remote roles require a city.");
        }
        if ((salaryMin != null && salaryMin < 0) || (salaryMax != null && salaryMax < 0)) {
            issues.add("Salary figures cannot be negative.");
        }
        if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) {
            issues.add("Maximum salary cannot be below minimum salary.");
        }
        if (skills != null && skills.size() > SKILLS_MAX) {
            issues.add("Select at most 20 skills.");
        }
        if (!isHttpUrl(applyUrl)) {
            issues.add("Application URL must be a valid HTTP/HTTPS link.");
        }
        return issues;
    }

    public static List<String> validateGigDraft(
        String title,
        String description,
        Integer budgetMin,
        Integer budgetMax,
        Integer durationDays,
        List<String> skills
    ) {
        List<String> issues = new ArrayList<>();
        String cleanTitle = title == null ? "" : title.trim();
        String cleanDesc = description == null ? "" : description.trim();
        if (cleanTitle.length() < TITLE_MIN || cleanTitle.length() > TITLE_MAX) {
            issues.add("Gig title must be between 3 and 140 characters.");
        }
        if (cleanDesc.length() < DESCRIPTION_MIN || cleanDesc.length() > DESCRIPTION_MAX) {
            issues.add("Gig scope must be at least 20 characters.");
        }
        if ((budgetMin != null && budgetMin < 0) || (budgetMax != null && budgetMax < 0)) {
            issues.add("Budget values cannot be negative.");
        }
        if (budgetMin != null && budgetMax != null && budgetMax < budgetMin) {
            issues.add("Maximum budget cannot be lower than minimum budget.");
        }
        if (durationDays != null && (durationDays < 1 || durationDays > DURATION_DAYS_MAX)) {
            issues.add("Duration must be between 1 and 3650 days.");
        }
        if (skills != null && skills.size() > SKILLS_MAX) {
            issues.add("Select at most 20 skills.");
        }
        return issues;
    }

    public static List<String> validateProjectDraft(
        String name,
        String tagline,
        String description,
        String repoUrl,
        String demoUrl,
        List<String> tech
    ) {
        List<String> issues = new ArrayList<>();
        String cleanName = name == null ? "" : name.trim();
        String cleanDesc = description == null ? "" : description.trim();
        if (cleanName.length() < 2 || cleanName.length() > 100) {
            issues.add("Project name must be between 2 and 100 characters.");
        }
        if (tagline != null && tagline.length() > 200) {
            issues.add("Tagline cannot exceed 200 characters.");
        }
        if (cleanDesc.length() < 10 || cleanDesc.length() > DESCRIPTION_MAX) {
            issues.add("Project description must be at least 10 characters.");
        }
        if (!isHttpUrl(repoUrl) || !isHttpUrl(demoUrl)) {
            issues.add("Repository and demo URLs must start with http:// or https://.");
        }
        if (tech != null && tech.size() > SKILLS_MAX) {
            issues.add("Add at most 20 tech stack tags.");
        }
        return issues;
    }

    public static List<String> validateGroupDraft(
        String slug,
        String name,
        String description
    ) {
        List<String> issues = new ArrayList<>();
        String cleanName = name == null ? "" : name.trim();
        String cleanSlug = slug == null ? "" : slug.trim();
        if (cleanName.length() < 3 || cleanName.length() > 80) {
            issues.add("Group name must be between 3 and 80 characters.");
        }
        if (!GROUP_SLUG_PATTERN.matcher(cleanSlug).matches()) {
            issues.add("Group slug must be 3-60 lowercase alphanumeric or hyphen characters.");
        }
        if (description != null && description.length() > GROUP_DESCRIPTION_MAX) {
            issues.add("Group description cannot exceed 2000 characters.");
        }
        return issues;
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
