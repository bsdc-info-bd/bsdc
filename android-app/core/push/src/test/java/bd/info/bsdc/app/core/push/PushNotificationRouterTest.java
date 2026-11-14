package bd.info.bsdc.app.core.push;

import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public final class PushNotificationRouterTest {

    @Test
    public void routesNotificationKindsToFiveExpectedAndroidChannels() {
        assertEquals(
            PushNotificationRouter.CHANNEL_MESSENGER,
            PushNotificationRouter.resolveChannelId("message", "/messages/c1", null)
        );
        assertEquals(
            PushNotificationRouter.CHANNEL_SOCIAL,
            PushNotificationRouter.resolveChannelId("comment", "/p/slug-1", null)
        );
        assertEquals(
            PushNotificationRouter.CHANNEL_SOCIAL,
            PushNotificationRouter.resolveChannelId("project_star", "/projects/demo", null)
        );
        assertEquals(
            PushNotificationRouter.CHANNEL_SOCIAL,
            PushNotificationRouter.resolveChannelId("poll_vote", "/p/slug-1", null)
        );
        assertEquals(
            PushNotificationRouter.CHANNEL_SOCIAL,
            PushNotificationRouter.resolveChannelId("comment_reaction", "/p/slug-1", null)
        );
        assertEquals(
            PushNotificationRouter.CHANNEL_SOCIAL,
            PushNotificationRouter.resolveChannelId("answer_accepted", "/p/slug-1", null)
        );
        assertEquals(
            PushNotificationRouter.CHANNEL_ORDERS,
            PushNotificationRouter.resolveChannelId("order", "/orders/123", null)
        );
        assertEquals(
            PushNotificationRouter.CHANNEL_ORDERS,
            PushNotificationRouter.resolveChannelId("review", "/shop", null)
        );
        assertEquals(
            PushNotificationRouter.CHANNEL_VERIFY_ALERTS,
            PushNotificationRouter.resolveChannelId("certificate", "/verify", null)
        );
        assertEquals(
            PushNotificationRouter.CHANNEL_VERIFY_ALERTS,
            PushNotificationRouter.resolveChannelId("gig_proposal", "/freelance", null)
        );
        assertEquals(
            PushNotificationRouter.CHANNEL_GENERAL,
            PushNotificationRouter.resolveChannelId("bsdc-summary", "/notifications", null)
        );
        assertEquals(
            PushNotificationRouter.CHANNEL_ORDERS,
            PushNotificationRouter.resolveChannelId("unknown", "/", "bsdc_orders")
        );
    }

    @Test
    public void blocksExternalPhishingPathsAndExtractsConversationUuid() {
        assertEquals(
            "/notifications",
            PushNotificationRouter.sanitizeRelativePath(Map.of("url", "https://evil.example/steal"))
        );
        assertEquals(
            "/notifications",
            PushNotificationRouter.sanitizeRelativePath(Map.of("url", "//evil.example/steal"))
        );
        assertEquals(
            "/p/hello-bsdc",
            PushNotificationRouter.sanitizeRelativePath(Map.of("path", "/p/hello-bsdc"))
        );
        assertEquals(
            "11111111-2222-3333-4444-555555555555",
            PushNotificationRouter.extractConversationId("/messages/11111111-2222-3333-4444-555555555555", null)
        );
        assertNull(PushNotificationRouter.extractConversationId("/p/not-a-chat", null));
        assertTrue(PushNotificationRouter.stableNotificationId("tag", "ch", null) >= 1000);
    }
}
