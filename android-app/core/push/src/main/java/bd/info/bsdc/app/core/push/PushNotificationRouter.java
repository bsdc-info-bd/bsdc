package bd.info.bsdc.app.core.push;

import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pure Java 21 deterministic push channel & deep-link routing engine matching
 * push-worker/src/fcm.ts and AppLinkUriRouter.
 */
public final class PushNotificationRouter {

    private PushNotificationRouter() {}

    public static final String CHANNEL_MESSENGER = "bsdc_messenger";
    public static final String CHANNEL_SOCIAL = "bsdc_social";
    public static final String CHANNEL_ORDERS = "bsdc_orders";
    public static final String CHANNEL_VERIFY_ALERTS = "bsdc_verify_alerts";
    public static final String CHANNEL_GENERAL = "bsdc_general";

    public static final String ACTION_INLINE_REPLY = "bd.info.bsdc.app.ACTION_INLINE_REPLY";
    public static final String ACTION_OPEN_URL = "OPEN_URL";
    public static final String EXTRA_CONVERSATION_ID = "conversation_id";
    public static final String EXTRA_NOTIFICATION_ID = "notification_id";
    public static final String REMOTE_INPUT_KEY = "bsdc_inline_reply_text";

    private static final Pattern CONVERSATION_PATH_PATTERN = Pattern.compile(
        "^/messages/([0-9a-fA-F-]{8,64})(?:[/?#].*)?$"
    );

    public static String resolveChannelId(String kind, String url, String explicitChannelId) {
        if (explicitChannelId != null) {
            String trimmed = explicitChannelId.trim();
            if (CHANNEL_MESSENGER.equals(trimmed)
                || CHANNEL_SOCIAL.equals(trimmed)
                || CHANNEL_ORDERS.equals(trimmed)
                || CHANNEL_VERIFY_ALERTS.equals(trimmed)
                || CHANNEL_GENERAL.equals(trimmed)) {
                return trimmed;
            }
        }
        String k = kind == null ? "" : kind.trim().toLowerCase(Locale.ROOT);
        String u = url == null ? "" : url.trim().toLowerCase(Locale.ROOT);
        if ("message".equals(k) || k.startsWith("c-") || k.startsWith("bsdc-message-") || u.startsWith("/messages")) {
            return CHANNEL_MESSENGER;
        }
        if ("order".equals(k) || "review".equals(k) || "payout".equals(k)
            || k.startsWith("bsdc-order-") || k.startsWith("bsdc-review-") || k.startsWith("bsdc-payout-")
            || u.startsWith("/orders") || u.startsWith("/market") || u.startsWith("/vendor")) {
            return CHANNEL_ORDERS;
        }
        if ("moderation".equals(k) || "certificate".equals(k) || "course".equals(k)
            || "job".equals(k) || "event".equals(k) || u.startsWith("/verify")) {
            return CHANNEL_VERIFY_ALERTS;
        }
        if ("follow".equals(k) || "reaction".equals(k) || "comment".equals(k) || "reply".equals(k)
            || "mention".equals(k) || "mention_group".equals(k) || "bookmark".equals(k)
            || "share".equals(k) || "post_published".equals(k) || "group_invite".equals(k)
            || k.startsWith("p-")) {
            return CHANNEL_SOCIAL;
        }
        return CHANNEL_GENERAL;
    }

    /** Extracts conversation UUID when a notification targets `/messages/<uuid>`. */
    public static String extractConversationId(String url, String explicitConversationId) {
        if (explicitConversationId != null && !explicitConversationId.isBlank()) {
            return explicitConversationId.trim();
        }
        if (url == null || url.isBlank()) return null;
        Matcher m = CONVERSATION_PATH_PATTERN.matcher(url.trim());
        return m.matches() ? m.group(1) : null;
    }

    /**
     * Enforces relative internal routing (`/notifications` fallback) so forged
     * push payloads cannot navigate the Android app to external domains.
     */
    public static String sanitizeRelativePath(Map<String, String> data) {
        if (data == null || data.isEmpty()) return "/notifications";
        for (String key : new String[]{"url", "path", "link"}) {
            String candidate = data.get(key);
            if (candidate != null) {
                String trimmed = candidate.trim().replace("\\", "");
                if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
                    return trimmed.length() > 300 ? trimmed.substring(0, 300) : trimmed;
                }
            }
        }
        return "/notifications";
    }

    public static int stableNotificationId(String tag, String channelId, String conversationId) {
        String key = (conversationId != null && !conversationId.isBlank())
            ? "conv:" + conversationId
            : (tag != null && !tag.isBlank() ? tag : channelId);
        return Math.abs(key.hashCode()) + 1000;
    }
}
