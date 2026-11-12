package bd.info.bsdc.app.feature.notifications;

import java.util.Locale;

/**
 * Pure Java 21 deterministic helpers for notification inbox categorization,
 * localized summary labels, and safe route target resolution.
 */
public final class NotificationsFilterEngine {

    private NotificationsFilterEngine() {}

    public enum CategoryFilter {
        ALL, UNREAD, SOCIAL, MESSAGES, ALERTS
    }

    public static CategoryFilter categoryForKind(String kind) {
        if (kind == null) return CategoryFilter.SOCIAL;
        String k = kind.trim().toLowerCase(Locale.ROOT);
        if ("message".equals(k)) return CategoryFilter.MESSAGES;
        if ("moderation".equals(k) || "order".equals(k) || "review".equals(k)
            || "payout".equals(k) || "certificate".equals(k) || "course".equals(k)
            || "job".equals(k) || "event".equals(k)) {
            return CategoryFilter.ALERTS;
        }
        return CategoryFilter.SOCIAL;
    }

    public static boolean matchesFilter(String kind, boolean isUnread, CategoryFilter filter) {
        if (filter == null || filter == CategoryFilter.ALL) return true;
        if (filter == CategoryFilter.UNREAD) return isUnread;
        return categoryForKind(kind) == filter;
    }

    public static String describeNotificationAction(String kind, String actorName, boolean bn) {
        String actor = (actorName == null || actorName.isBlank())
            ? (bn ? "কেউ একজন" : "Someone")
            : actorName.trim();
        String k = kind == null ? "" : kind.trim().toLowerCase(Locale.ROOT);
        return switch (k) {
            case "follow" -> bn ? actor + " আপনাকে অনুসরণ করেছেন" : actor + " followed you";
            case "reaction" -> bn ? actor + " প্রতিক্রিয়া জানিয়েছেন" : actor + " reacted to your post";
            case "comment" -> bn ? actor + " মন্তব্য করেছেন" : actor + " commented";
            case "reply" -> bn ? actor + " উত্তর দিয়েছেন" : actor + " replied";
            case "mention" -> bn ? actor + " আপনাকে উল্লেখ করেছেন" : actor + " mentioned you";
            case "mention_group" -> bn ? actor + " গ্রুপে উল্লেখ করেছেন" : actor + " mentioned you in a group";
            case "message" -> bn ? actor + " একটি বার্তা পাঠিয়েছেন" : actor + " sent you a message";
            case "share" -> bn ? actor + " আপনার পোস্ট শেয়ার করেছেন" : actor + " shared your post";
            case "bookmark" -> bn ? actor + " আপনার পোস্ট বুকমার্ক করেছেন" : actor + " saved your post";
            case "post_published" -> bn ? actor + " নতুন পোস্ট প্রকাশ করেছেন" : actor + " published a post";
            case "order" -> bn ? "অর্ডারের আপডেট" : "Order update";
            case "payout" -> bn ? "পেমেন্ট সম্পন্ন" : "Payout processed";
            case "certificate" -> bn ? "আপনার সার্টিফিকেট প্রস্তুত" : "Certificate ready";
            case "moderation" -> bn ? "মডারেশন বিজ্ঞপ্তি" : "Moderation update";
            case "group_invite" -> bn ? actor + " আপনাকে গ্রুপে আমন্ত্রণ জানিয়েছেন" : actor + " invited you to a group";
            default -> bn ? actor + " একটি কার্যকলাপ করেছেন" : actor + " interacted with you";
        };
    }

    public static String sanitizeTargetPath(String kind, String rawTargetUrl, String actorUsername) {
        if ("follow".equalsIgnoreCase(kind) && actorUsername != null && !actorUsername.isBlank()) {
            return "/@" + actorUsername.trim().replace("@", "");
        }
        if (rawTargetUrl != null) {
            String trimmed = rawTargetUrl.trim().replace("\\", "");
            if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
                return trimmed;
            }
        }
        return "/notifications";
    }
}
