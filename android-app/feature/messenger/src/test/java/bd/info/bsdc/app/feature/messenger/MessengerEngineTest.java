package bd.info.bsdc.app.feature.messenger;

import org.junit.Test;

import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public final class MessengerEngineTest {

    @Test
    public void comparesPostgresMicrosecondInstantsDeterministically() {
        String earlier = "2026-11-11T10:15:30.123400+00";
        String later = "2026-11-11T10:15:30.123900Z";
        assertTrue(MessengerEngine.compareInstants(earlier, later) < 0);
        assertEquals(0, MessengerEngine.compareInstants("2026-11-11T10:15:30.100Z", "2026-11-11T10:15:30.1Z"));
    }

    @Test
    public void groupsConsecutiveMessagesWithinFiveMinutesFromSameSender() {
        assertTrue(MessengerEngine.shouldGroupWithPrevious(
            "u1", "2026-11-11T10:00:00Z",
            "u1", "2026-11-11T10:04:30Z"
        ));
        assertFalse(MessengerEngine.shouldGroupWithPrevious(
            "u1", "2026-11-11T10:00:00Z",
            "u1", "2026-11-11T10:05:30Z"
        ));
        assertFalse(MessengerEngine.shouldGroupWithPrevious(
            "u1", "2026-11-11T10:00:00Z",
            "u2", "2026-11-11T10:01:00Z"
        ));
    }

    @Test
    public void parsesTextLinksMentionsAndFencedCodeBlocks() {
        String body = "Hey @Hasan_Dev check https://bsdc.info.bd/docs!\n```kotlin\nprintln(\"Hi\")\n```\nDone";
        List<MessengerEngine.BodySegment> segs = MessengerEngine.parseMessageBody(body);

        assertTrue(segs.stream().anyMatch(s -> s.type == MessengerEngine.SegmentType.MENTION && "hasan_dev".equals(s.metadata)));
        assertTrue(segs.stream().anyMatch(s -> s.type == MessengerEngine.SegmentType.LINK && s.metadata.startsWith("https://bsdc.info.bd")));
        assertTrue(segs.stream().anyMatch(s -> s.type == MessengerEngine.SegmentType.CODE && "kotlin".equals(s.metadata) && s.value.contains("println")));
        assertEquals(List.of("hasan_dev"), MessengerEngine.extractMentions(body));
    }

    @Test
    public void enforcesZeroAudioPolicyAndAllowedReactionSet() {
        assertTrue(MessengerEngine.isAllowedMessageKind("text"));
        assertTrue(MessengerEngine.isAllowedMessageKind("image"));
        assertTrue(MessengerEngine.isAllowedMessageKind("snippet"));
        assertFalse(MessengerEngine.isAllowedMessageKind("audio"));
        assertTrue(MessengerEngine.isAudioAttachmentBlocked("voice-note-01.ogg"));
        assertTrue(MessengerEngine.isAudioAttachmentBlocked("audio/mpeg"));
        assertFalse(MessengerEngine.isAudioAttachmentBlocked("screenshot.webp"));

        assertEquals(6, MessengerEngine.REACTION_CHOICES.size());
        assertTrue(MessengerEngine.isReactionChoice("❤️"));
        assertFalse(MessengerEngine.isReactionChoice("💀"));
    }

    @Test
    public void sortsPinnedFirstAndFiltersInboxCorrectly() {
        List<MessengerEngine.InboxItemInput> items = List.of(
            new MessengerEngine.InboxItemInput("c1", "direct", "", "Amina", "amina", "Hi", "2026-11-11T10:00:00Z", 0, false, false),
            new MessengerEngine.InboxItemInput("c2", "group", "Kotlin BD", "", "", "Meetup", "2026-11-11T09:00:00Z", 3, true, false),
            new MessengerEngine.InboxItemInput("c3", "direct", "", "Old", "old", "Archive", "2026-11-11T12:00:00Z", 1, false, true)
        );
        List<MessengerEngine.InboxItemInput> all = MessengerEngine.sortAndFilterInbox(items, "all", "");
        assertEquals(2, all.size());
        assertEquals("c2", all.get(0).id); // pinned comes first even with earlier timestamp

        List<MessengerEngine.InboxItemInput> unread = MessengerEngine.sortAndFilterInbox(items, "unread", "");
        assertEquals(List.of("c2"), unread.stream().map(i -> i.id).toList());

        List<MessengerEngine.InboxItemInput> archived = MessengerEngine.sortAndFilterInbox(items, "archived", "");
        assertEquals(List.of("c3"), archived.stream().map(i -> i.id).toList());
    }

    @Test
    public void reconcilesOutboxByClientIdAndComputesReadReceipts() {
        List<String> matched = MessengerEngine.findReconciledClientIds(
            List.of("uuid-1", "uuid-3"),
            List.of("uuid-1", "uuid-2", "uuid-3")
        );
        assertEquals(List.of("uuid-1", "uuid-3"), matched);

        int readers = MessengerEngine.countReadByMembers(
            "2026-11-11T10:00:00Z",
            "sender-1",
            "sender-1",
            List.of("sender-1|2026-11-11T10:01:00Z", "peer-a|2026-11-11T10:05:00Z", "peer-b|2026-11-11T09:59:00Z")
        );
        assertEquals(1, readers);
    }
}
