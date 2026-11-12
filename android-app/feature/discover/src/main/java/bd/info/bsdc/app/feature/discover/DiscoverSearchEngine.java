package bd.info.bsdc.app.feature.discover;

import java.net.URI;
import java.util.List;
import java.util.Locale;

/**
 * Pure Java 21 deterministic logic for BSDC global search normalization,
 * voice-query sanitization, opportunity compensation formatting, and profile edits.
 */
public final class DiscoverSearchEngine {

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
            case "project":
                return "/projects/" + target;
            default:
                return "/";
        }
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
            return curr + " " + minAmount + " - " + maxAmount + suffix;
        }
        int single = minAmount != null ? minAmount : maxAmount;
        return curr + " " + single + suffix;
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
