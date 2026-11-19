package bd.info.bsdc.app.feature.discover;

import java.net.URI;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Pure Java 21 deterministic logic for BSDC global search normalization,
 * voice-query sanitization, opportunity compensation formatting, skill matching,
 * proposal validation and profile edits.
 */
public final class DiscoverSearchEngine {

    /** A proposal pitch must be at least this many characters, as the database check enforces. */
    public static final int MIN_PITCH = 20;
    /** Highest delivery window the database accepts (`delivery_days between 1 and 3650`). */
    public static final int MAX_DELIVERY_DAYS = 3650;

    private DiscoverSearchEngine() {}

    public static String sanitizeSearchQuery(String raw) {
        if (raw == null) return "";
        String cleaned = raw.replaceAll("[\\p{Cntrl}]+", " ").replaceAll("\\s+", " ").trim();
        return cleaned.length() > 80 ? cleaned.substring(0, 80).trim() : cleaned;
    }

    /**
     * Maps search result kinds returned by Postgres `global_search` to canonical app paths.
     */
    public static String resolveSearchRoute(String kind, String slug, String id) {
        String safeKind = kind == null ? "" : kind.trim().toLowerCase(Locale.ROOT);
        String safeSlug = slug == null ? "" : slug.trim();
        String safeId = id == null ? "" : id.trim();
        String target = !safeSlug.isEmpty() ? safeSlug : safeId;
        if (target.isEmpty()) return "/";

        switch (safeKind) {
            case "post":
                return "/p/" + target;
            case "person":
                return "/@" + target;
            case "group":
                return "/g/" + target;
            case "course":
                return "/courses/" + target;
            case "job":
                return "/jobs/" + target;
            case "gig":
            case "gig_proposal":
                return "/freelance/" + target;
            case "event":
                return "/events/" + target;
            case "project":
                return "/projects/" + target;
            case "shop":
            case "product":
                return "/shop/" + target;
            default:
                return "/";
        }
    }

    /**
     * The section a search hit belongs to when the reader taps it inside the Discover hub:
     * one of `search`, `groups`, `events`, `jobs`, `gigs`, `projects`, `courses`, `people`.
     */
    public static String sectionForKind(String kind) {
        String safeKind = kind == null ? "" : kind.trim().toLowerCase(Locale.ROOT);
        switch (safeKind) {
            case "group":
                return "groups";
            case "event":
                return "events";
            case "job":
                return "jobs";
            case "gig":
            case "gig_proposal":
                return "gigs";
            case "project":
                return "projects";
            case "course":
                return "courses";
            case "person":
                return "people";
            default:
                return "search";
        }
    }

    /** The label shown on a search-result kind chip, in the reader's language. */
    public static String kindLabel(String kind, boolean bn) {
        String safeKind = kind == null ? "" : kind.trim().toLowerCase(Locale.ROOT);
        switch (safeKind) {
            case "post":
                return bn ? "পোস্ট" : "Post";
            case "person":
                return bn ? "সদস্য" : "Person";
            case "group":
                return bn ? "গ্রুপ" : "Group";
            case "event":
                return bn ? "ইভেন্ট" : "Event";
            case "job":
                return bn ? "চাকরি" : "Job";
            case "gig":
                return bn ? "গিগ" : "Gig";
            case "project":
                return bn ? "প্রজেক্ট" : "Project";
            case "course":
                return bn ? "কোর্স" : "Course";
            case "shop":
                return bn ? "দোকান" : "Shop";
            case "product":
                return bn ? "পণ্য" : "Product";
            default:
                return bn ? "ফলাফল" : "Result";
        }
    }

    /** Groups a whole number with thousand separators: 12000 -> "12,000". */
    static String groupDigits(long value) {
        DecimalFormatSymbols symbols = DecimalFormatSymbols.getInstance(Locale.ROOT);
        DecimalFormat format = new DecimalFormat("#,##0", symbols);
        return format.format(value);
    }

    /**
     * A freelance budget the way a freelancer reads it: a range, a single figure, or
     * "Negotiable" when the client left both bounds empty. Hourly and day-rate work get
     * their unit appended; a fixed-price gig gets its delivery window when one is known.
     */
    public static String formatBudget(
        Integer minAmount,
        Integer maxAmount,
        String currency,
        boolean hourly,
        Integer durationDays,
        boolean bn
    ) {
        String curr = (currency == null || currency.isBlank()) ? "BDT" : currency.trim().toUpperCase(Locale.ROOT);
        String unit = hourly ? (bn ? "/ঘণ্টা" : "/hr") : (bn ? " (নির্ধারিত)" : " fixed");

        if (minAmount == null && maxAmount == null) {
            return (bn ? "আলোচনা সাপেক্ষ" : "Negotiable") + (hourly ? (bn ? " · ঘণ্টাভিত্তিক" : " · hourly") : "");
        }

        String body;
        if (minAmount != null && maxAmount != null && !minAmount.equals(maxAmount)) {
            int low = Math.min(minAmount, maxAmount);
            int high = Math.max(minAmount, maxAmount);
            body = curr + " " + groupDigits(low) + " – " + groupDigits(high);
        } else {
            int single = minAmount != null ? minAmount : maxAmount;
            body = curr + " " + groupDigits(single);
        }

        String out = body + unit;
        if (!hourly && durationDays != null && durationDays > 0) {
            out += bn ? (" · " + durationDays + " দিন") : (" · " + durationDays + " day" + (durationDays == 1 ? "" : "s"));
        }
        return out;
    }

    /** The plain budget only, without unit or duration — used in compact list rows. */
    public static String formatBudgetShort(Integer minAmount, Integer maxAmount, String currency, boolean bn) {
        if (minAmount == null && maxAmount == null) return bn ? "আলোচনা সাপেক্ষ" : "Negotiable";
        String curr = (currency == null || currency.isBlank()) ? "BDT" : currency.trim().toUpperCase(Locale.ROOT);
        if (minAmount != null && maxAmount != null && !minAmount.equals(maxAmount)) {
            int low = Math.min(minAmount, maxAmount);
            int high = Math.max(minAmount, maxAmount);
            return curr + " " + groupDigits(low) + "–" + groupDigits(high);
        }
        int single = minAmount != null ? minAmount : maxAmount;
        return curr + " " + groupDigits(single);
    }

    public static String formatCompensation(
        Integer minAmount,
        Integer maxAmount,
        String currency,
        String period,
        boolean bn
    ) {
        if (minAmount == null && maxAmount == null) {
            return bn ? "আলোচনা সাপেক্ষ" : "Negotiable";
        }
        String curr = (currency == null || currency.isBlank()) ? "BDT" : currency.trim().toUpperCase(Locale.ROOT);
        String per = period == null ? "" : period.trim().toLowerCase(Locale.ROOT);
        String suffix = per.isEmpty() ? "" : "/" + per;

        if (minAmount != null && maxAmount != null && !minAmount.equals(maxAmount)) {
            int low = Math.min(minAmount, maxAmount);
            int high = Math.max(minAmount, maxAmount);
            return curr + " " + groupDigits(low) + " - " + groupDigits(high) + suffix;
        }
        int single = minAmount != null ? minAmount : maxAmount;
        return curr + " " + groupDigits(single) + suffix;
    }

    /**
     * What a monthly figure becomes over another period, so a reader can compare offers.
     * `targetPeriod` is one of `month`, `year`, `day`, `hour`. Returns "" when the source
     * period is unknown or the amount is not positive.
     */
    public static String convertCompensation(long amount, String sourcePeriod, String targetPeriod, String currency) {
        long monthly;
        String source = sourcePeriod == null ? "" : sourcePeriod.trim().toLowerCase(Locale.ROOT);
        switch (source) {
            case "year":
            case "yearly":
            case "annual":
                monthly = Math.round(amount / 12.0);
                break;
            case "month":
            case "monthly":
                monthly = amount;
                break;
            case "week":
            case "weekly":
                monthly = Math.round(amount * 52.0 / 12.0);
                break;
            case "day":
            case "daily":
                monthly = amount * 26;
                break;
            case "hour":
            case "hourly":
                monthly = amount * 8 * 26;
                break;
            default:
                return "";
        }
        if (monthly <= 0) return "";

        String target = targetPeriod == null ? "" : targetPeriod.trim().toLowerCase(Locale.ROOT);
        long result;
        String label;
        switch (target) {
            case "year":
            case "yearly":
            case "annual":
                result = monthly * 12;
                label = "year";
                break;
            case "day":
            case "daily":
                result = Math.round(monthly / 26.0);
                label = "day";
                break;
            case "hour":
            case "hourly":
                result = Math.round(monthly / (8.0 * 26.0));
                label = "hour";
                break;
            case "month":
            case "monthly":
            default:
                result = monthly;
                label = "month";
                break;
        }
        String curr = (currency == null || currency.isBlank()) ? "BDT" : currency.trim().toUpperCase(Locale.ROOT);
        return curr + " " + groupDigits(result) + "/" + label;
    }

    /**
     * The canonical form of one skill: trimmed, lower-case, single spaces. The database stores
     * skills this way (migration 0103) and matches filters against it, so every reader and
     * writer has to agree.
     */
    public static String normaliseSkill(String raw) {
        if (raw == null) return "";
        return raw.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    /** Canonical, blank-free, duplicate-free, sorted skill list. */
    public static List<String> normaliseSkills(List<String> raw) {
        List<String> out = new ArrayList<>();
        if (raw == null) return out;
        for (String skill : raw) {
            String canonical = normaliseSkill(skill);
            if (!canonical.isEmpty() && !out.contains(canonical)) out.add(canonical);
        }
        out.sort(String::compareTo);
        return out;
    }

    /**
     * How much of a gig's or job's skill list the reader already has, 0–100. Zero when the
     * opportunity names no skills, so an empty list never reads as a perfect match.
     */
    public static int skillMatchPercent(List<String> required, List<String> mine) {
        List<String> wanted = normaliseSkills(required);
        if (wanted.isEmpty()) return 0;
        List<String> have = normaliseSkills(mine);
        if (have.isEmpty()) return 0;
        int matched = 0;
        for (String skill : wanted) {
            if (have.contains(skill)) matched++;
        }
        return (int) Math.round((matched * 100.0) / wanted.size());
    }

    /** The skills a reader is missing from an opportunity, in the opportunity's order. */
    public static List<String> missingSkills(List<String> required, List<String> mine) {
        List<String> have = normaliseSkills(mine);
        List<String> missing = new ArrayList<>();
        for (String skill : normaliseSkills(required)) {
            if (!have.contains(skill)) missing.add(skill);
        }
        return missing;
    }

    /**
     * Every problem with a proposal draft, as stable codes the UI translates:
     * `pitch_short`, `bid_invalid`, `days_invalid`, `days_too_long`. Empty means valid.
     */
    public static List<String> proposalProblems(String pitch, Integer bidAmount, Integer deliveryDays) {
        List<String> problems = new ArrayList<>();
        String text = pitch == null ? "" : pitch.trim();
        if (text.length() < MIN_PITCH) problems.add("pitch_short");
        if (bidAmount == null || bidAmount < 0) problems.add("bid_invalid");
        if (deliveryDays == null || deliveryDays < 1) {
            problems.add("days_invalid");
        } else if (deliveryDays > MAX_DELIVERY_DAYS) {
            problems.add("days_too_long");
        }
        return problems;
    }

    /**
     * The statuses a gig's client may move it to from its current one. A closed gig can be
     * reopened; an open gig may be paused or closed; a paused gig may be reopened or closed.
     */
    public static List<String> gigNextStatuses(String status) {
        String current = status == null ? "" : status.trim().toLowerCase(Locale.ROOT);
        List<String> out = new ArrayList<>();
        switch (current) {
            case "open":
                out.add("paused");
                out.add("closed");
                break;
            case "paused":
                out.add("open");
                out.add("closed");
                break;
            case "closed":
                out.add("open");
                break;
            default:
                break;
        }
        return out;
    }

    /** What the reader can do on a gig they bid on, given their proposal status. */
    public static String proposalAction(String status) {
        String current = status == null ? "" : status.trim().toLowerCase(Locale.ROOT);
        switch (current) {
            case "submitted":
            case "reviewing":
            case "shortlisted":
                return "withdraw";
            case "":
            case "withdrawn":
                return "propose";
            default:
                return "none";
        }
    }

    public static String followReasonLabel(
        String reason,
        int mutualCount,
        List<String> sharedSkills,
        boolean bn
    ) {
        String r = reason == null ? "" : reason.trim().toLowerCase(Locale.ROOT);
        switch (r) {
            case "mutual":
                return bn
                    ? mutualCount + " জন মিউচুয়াল সংযোগ"
                    : mutualCount + " mutual connection" + (mutualCount == 1 ? "" : "s");
            case "skills":
                if (sharedSkills != null && !sharedSkills.isEmpty()) {
                    return bn
                        ? "অভিন্ন দক্ষতা: " + sharedSkills.get(0)
                        : "Shared skill: " + sharedSkills.get(0);
                }
                return bn ? "অভিন্ন দক্ষতা" : "Shared skills";
            case "city":
                return bn ? "একই শহরের সদস্য" : "In your city";
            case "active":
            default:
                return bn ? "কমিউনিটিতে সক্রিয়" : "Active contributor";
        }
    }

    public static String safeHttpUrlOrEmpty(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String candidate = raw.trim();
        try {
            URI uri = URI.create(candidate);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!"https".equals(scheme) && !"http".equals(scheme)) {
                return "";
            }
            if (uri.getHost() == null || uri.getHost().isBlank()) return "";
            return uri.toString();
        } catch (IllegalArgumentException ex) {
            return "";
        }
    }
}
