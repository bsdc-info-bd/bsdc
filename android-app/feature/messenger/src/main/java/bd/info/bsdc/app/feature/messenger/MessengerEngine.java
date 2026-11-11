package bd.info.bsdc.app.feature.messenger;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pure Java 21 deterministic messenger algorithms matching main-site/src/lib/messaging/:
 * instant microsecond comparison, 5-minute sender bubble grouping, URL/mention/code-fence
 * segmentation, inbox filtering/sorting, outbox reconciliation, and zero-audio-note guards.
 */
public final class MessengerEngine {

    private MessengerEngine() {}

    public static final long GROUP_WINDOW_MS = 5L * 60_000L;
    public static final int MAX_MESSAGE_BODY_CHARS = 8_000;
    public static final int MAX_GROUP_TITLE_CHARS = 80;
    public static final int MAX_GROUP_MEMBERS = 256;

    /** Fixed 6-reaction set matching main-site/src/lib/messaging/message-text.ts. */
    public static final List<String> REACTION_CHOICES = List.of(
        "❤️", "👍", "😂", "😮", "🎉", "🙏"
    );

    public enum SegmentType {
        TEXT, LINK, MENTION, CODE
    }

    public static final class BodySegment {
        public final SegmentType type;
        public final String value;
        public final String metadata; // href for LINK, handle for MENTION, language for CODE

        public BodySegment(SegmentType type, String value, String metadata) {
            this.type = type;
            this.value = value;
            this.metadata = metadata;
        }
    }

    public static final class HighlightSpan {
        public final String text;
        public final boolean hit;

        public HighlightSpan(String text, boolean hit) {
            this.text = text;
            this.hit = hit;
        }
    }

    public static final class InboxItemInput {
        public final String id;
        public final String kind; // direct | group
        public final String title;
        public final String otherDisplayName;
        public final String otherUsername;
        public final String preview;
        public final String lastMessageAt;
        public final int unreadCount;
        public final boolean pinned;
        public final boolean archived;

        public InboxItemInput(
            String id,
            String kind,
            String title,
            String otherDisplayName,
            String otherUsername,
            String preview,
            String lastMessageAt,
            int unreadCount,
            boolean pinned,
            boolean archived
        ) {
            this.id = id;
            this.kind = kind;
            this.title = title;
            this.otherDisplayName = otherDisplayName;
            this.otherUsername = otherUsername;
            this.preview = preview;
            this.lastMessageAt = lastMessageAt;
            this.unreadCount = unreadCount;
            this.pinned = pinned;
            this.archived = archived;
        }
    }

    private static final Pattern FENCE_PATTERN = Pattern.compile(
        "```([a-zA-Z0-9+#-]{0,16})\\n([\\s\\S]*?)(?:```|$)"
    );
    private static final Pattern INLINE_TOKEN_PATTERN = Pattern.compile(
        "(\\bhttps?://[^\\s<>\"'`]+[^\\s<>\"'`.,;:!?)])|(^|[\\s(])@([a-zA-Z0-9_]{3,30})\\b"
    );
    private static final Pattern MENTION_PATTERN = Pattern.compile(
        "(^|[\\s(])@([a-zA-Z0-9_]{3,30})\\b"
    );
    private static final Pattern FRACTION_PATTERN = Pattern.compile(
        "[T ]\\d{2}:\\d{2}:\\d{2}\\.(\\d+)"
    );

    public static boolean isReactionChoice(String emoji) {
        return emoji != null && REACTION_CHOICES.contains(emoji);
    }

    /**
     * Zero-audio-note enforcement: native BSDC Messenger explicitly prohibits
     * voice notes / audio blobs and only supports text, code snippets, and ImgBB photos.
     */
    public static boolean isAllowedMessageKind(String kind) {
        if (kind == null) return false;
        String norm = kind.trim().toLowerCase(Locale.ROOT);
        return "text".equals(norm) || "image".equals(norm) || "snippet".equals(norm) || "system".equals(norm);
    }

    public static boolean isAudioAttachmentBlocked(String fileNameOrMime) {
        if (fileNameOrMime == null) return false;
        String lower = fileNameOrMime.trim().toLowerCase(Locale.ROOT);
        if (lower.startsWith("audio/") || lower.contains("voice-note") || lower.contains("voice_note")) {
            return true;
        }
        return lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".ogg")
            || lower.endsWith(".m4a") || lower.endsWith(".flac") || lower.endsWith(".opus")
            || lower.endsWith(".aac");
    }

    /**
     * Compares two ISO-8601 timestamps preserving Postgres microsecond fractional tie-breakers.
     */
    public static int compareInstants(String a, String b) {
        String safeA = a == null ? "" : a;
        String safeB = b == null ? "" : b;
        long msA = parseEpochMillis(safeA);
        long msB = parseEpochMillis(safeB);
        if (msA == Long.MIN_VALUE || msB == Long.MIN_VALUE) {
            return safeA.compareTo(safeB);
        }
        if (msA != msB) return Long.compare(msA, msB);
        int microA = parseRemainingMicros(safeA);
        int microB = parseRemainingMicros(safeB);
        return Integer.compare(microA, microB);
    }

    public static long parseEpochMillis(String iso) {
        if (iso == null || iso.isBlank()) return Long.MIN_VALUE;
        String normalized = iso.trim().replace(" ", "T");
        if (normalized.matches(".*[+-]\\d{2}$")) {
            normalized = normalized + ":00";
        }
        try {
            return Instant.parse(normalized).toEpochMilli();
        } catch (Exception ignored) {
            return Long.MIN_VALUE;
        }
    }

    private static int parseRemainingMicros(String iso) {
        Matcher m = FRACTION_PATTERN.matcher(iso);
        if (!m.find()) return 0;
        String frac = m.group(1);
        String padded = (frac + "000000").substring(0, 6);
        try {
            return Integer.parseInt(padded.substring(3, 6));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    /** Matches Web `groupMessages` 5-minute window for consecutive messages from one sender. */
    public static boolean shouldGroupWithPrevious(
        String prevSenderUid,
        String prevCreatedAt,
        String currentSenderUid,
        String currentCreatedAt
    ) {
        if (prevSenderUid == null || currentSenderUid == null) {
            if (prevSenderUid != currentSenderUid) return false;
        } else if (!prevSenderUid.equals(currentSenderUid)) {
            return false;
        }
        long prevMs = parseEpochMillis(prevCreatedAt);
        long curMs = parseEpochMillis(currentCreatedAt);
        if (prevMs == Long.MIN_VALUE || curMs == Long.MIN_VALUE) return false;
        long diff = curMs - prevMs;
        return diff >= 0 && diff < GROUP_WINDOW_MS;
    }

    public static List<BodySegment> parseMessageBody(String body) {
        if (body == null || body.isEmpty()) return List.of();
        List<BodySegment> out = new ArrayList<>();
        Matcher fenceMatcher = FENCE_PATTERN.matcher(body);
        int cursor = 0;
        while (fenceMatcher.find()) {
            if (fenceMatcher.start() > cursor) {
                parseInlineChunk(body.substring(cursor, fenceMatcher.start()), out);
            }
            String lang = fenceMatcher.group(1) == null ? "" : fenceMatcher.group(1).toLowerCase(Locale.ROOT);
            String code = fenceMatcher.group(2) == null ? "" : fenceMatcher.group(2).replaceFirst("\\n$", "");
            out.add(new BodySegment(SegmentType.CODE, code, lang));
            cursor = fenceMatcher.end();
        }
        if (cursor < body.length()) {
            parseInlineChunk(body.substring(cursor), out);
        }
        return Collections.unmodifiableList(out);
    }

    private static void parseInlineChunk(String chunk, List<BodySegment> out) {
        Matcher matcher = INLINE_TOKEN_PATTERN.matcher(chunk);
        int at = 0;
        while (matcher.find()) {
            if (matcher.start() > at) {
                appendText(out, chunk.substring(at, matcher.start()));
            }
            String url = matcher.group(1);
            if (url != null) {
                out.add(new BodySegment(SegmentType.LINK, url, url));
            } else {
                String prefix = matcher.group(2) == null ? "" : matcher.group(2);
                String handle = matcher.group(3) == null ? "" : matcher.group(3);
                if (!prefix.isEmpty()) {
                    appendText(out, prefix);
                }
                out.add(new BodySegment(SegmentType.MENTION, "@" + handle, handle.toLowerCase(Locale.ROOT)));
            }
            at = matcher.end();
        }
        if (at < chunk.length()) {
            appendText(out, chunk.substring(at));
        }
    }

    private static void appendText(List<BodySegment> out, String text) {
        if (text == null || text.isEmpty()) return;
        if (!out.isEmpty() && out.get(out.size() - 1).type == SegmentType.TEXT) {
            BodySegment prev = out.remove(out.size() - 1);
            out.add(new BodySegment(SegmentType.TEXT, prev.value + text, ""));
        } else {
            out.add(new BodySegment(SegmentType.TEXT, text, ""));
        }
    }

    public static List<String> extractMentions(String body) {
        if (body == null || body.isBlank()) return List.of();
        Set<String> found = new LinkedHashSet<>();
        Matcher m = MENTION_PATTERN.matcher(body);
        while (m.find()) {
            String handle = m.group(2);
            if (handle != null && !handle.isBlank()) {
                found.add(handle.toLowerCase(Locale.ROOT));
            }
        }
        List<String> sorted = new ArrayList<>(found);
        Collections.sort(sorted);
        return sorted;
    }

    public static List<HighlightSpan> highlightMatches(String text, String query) {
        if (text == null) return List.of();
        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        if (needle.isEmpty()) {
            return List.of(new HighlightSpan(text, false));
        }
        String haystack = text.toLowerCase(Locale.ROOT);
        List<HighlightSpan> spans = new ArrayList<>();
        int at = 0;
        while (true) {
            int idx = haystack.indexOf(needle, at);
            if (idx < 0) break;
            if (idx > at) spans.add(new HighlightSpan(text.substring(at, idx), false));
            spans.add(new HighlightSpan(text.substring(idx, idx + needle.length()), true));
            at = idx + needle.length();
        }
        if (at < text.length()) {
            spans.add(new HighlightSpan(text.substring(at), false));
        }
        return spans;
    }

    public static String previewLine(String body, int limit) {
        if (body == null || body.isBlank()) return "";
        String flat = body.replaceAll("\\s+", " ").trim();
        if (flat.length() <= limit) return flat;
        return flat.substring(0, Math.max(0, limit - 1)) + "…";
    }

    public static List<InboxItemInput> sortAndFilterInbox(
        List<InboxItemInput> items,
        String filterKey,
        String query
    ) {
        String filter = filterKey == null ? "all" : filterKey.trim().toLowerCase(Locale.ROOT);
        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        List<InboxItemInput> filtered = new ArrayList<>();
        for (InboxItemInput item : items) {
            if (!"archived".equals(filter) && item.archived) {
                continue;
            }
            boolean matchFilter = switch (filter) {
                case "unread" -> item.unreadCount > 0;
                case "direct" -> "direct".equalsIgnoreCase(item.kind);
                case "groups" -> "group".equalsIgnoreCase(item.kind);
                case "pinned" -> item.pinned;
                case "archived" -> item.archived;
                default -> true;
            };
            if (!matchFilter) continue;
            if (!needle.isEmpty()) {
                String hay = (item.title + " " + item.otherDisplayName + " " +
                    item.otherUsername + " " + item.preview).toLowerCase(Locale.ROOT);
                if (!hay.contains(needle)) continue;
            }
            filtered.add(item);
        }
        filtered.sort(new Comparator<>() {
            @Override
            public int compare(InboxItemInput a, InboxItemInput b) {
                if (a.pinned != b.pinned) return a.pinned ? -1 : 1;
                String aAt = a.lastMessageAt == null ? "" : a.lastMessageAt;
                String bAt = b.lastMessageAt == null ? "" : b.lastMessageAt;
                int cmp = bAt.compareTo(aAt);
                if (cmp != 0) return cmp;
                return a.id.compareTo(b.id);
            }
        });
        return filtered;
    }

    /**
     * Reconciles server message rows against optimistic/failed Room outbox entries by
     * matching non-empty `clientId` keys (from `send_message_once`).
     */
    public static List<String> findReconciledClientIds(
        List<String> confirmedClientIds,
        List<String> outboxClientIds
    ) {
        if (confirmedClientIds == null || outboxClientIds == null) return List.of();
        Set<String> confirmed = new LinkedHashSet<>();
        for (String id : confirmedClientIds) {
            if (id != null && !id.isBlank()) confirmed.add(id.trim());
        }
        List<String> matched = new ArrayList<>();
        for (String outId : outboxClientIds) {
            if (outId != null && confirmed.contains(outId.trim())) {
                matched.add(outId.trim());
            }
        }
        return matched;
    }

    public static int countReadByMembers(
        String messageCreatedAt,
        String senderUid,
        String viewerUid,
        List<String> memberLastReadAtPairs
    ) {
        long sentMs = parseEpochMillis(messageCreatedAt);
        if (sentMs == Long.MIN_VALUE || memberLastReadAtPairs == null) return 0;
        int count = 0;
        for (String pair : memberLastReadAtPairs) {
            if (pair == null) continue;
            int sep = pair.indexOf('|');
            if (sep <= 0) continue;
            String uid = pair.substring(0, sep);
            String readAt = pair.substring(sep + 1);
            if (uid.equals(viewerUid) || uid.equals(senderUid)) continue;
            long readMs = parseEpochMillis(readAt);
            if (readMs != Long.MIN_VALUE && readMs >= sentMs) {
                count++;
            }
        }
        return count;
    }
}
