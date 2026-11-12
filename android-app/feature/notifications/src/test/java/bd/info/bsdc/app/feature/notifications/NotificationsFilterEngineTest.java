package bd.info.bsdc.app.feature.notifications;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public final class NotificationsFilterEngineTest {

    @Test
    public void categorizesAndFiltersNotificationKindsAccurately() {
        assertEquals(
            NotificationsFilterEngine.CategoryFilter.MESSAGES,
            NotificationsFilterEngine.categoryForKind("message")
        );
        assertEquals(
            NotificationsFilterEngine.CategoryFilter.ALERTS,
            NotificationsFilterEngine.categoryForKind("certificate")
        );
        assertEquals(
            NotificationsFilterEngine.CategoryFilter.SOCIAL,
            NotificationsFilterEngine.categoryForKind("comment")
        );

        assertTrue(NotificationsFilterEngine.matchesFilter("comment", true, NotificationsFilterEngine.CategoryFilter.UNREAD));
        assertFalse(NotificationsFilterEngine.matchesFilter("comment", false, NotificationsFilterEngine.CategoryFilter.UNREAD));
        assertTrue(NotificationsFilterEngine.matchesFilter("message", false, NotificationsFilterEngine.CategoryFilter.MESSAGES));
    }

    @Test
    public void buildsSafeDeepLinksAndLocalizedDescriptions() {
        assertEquals(
            "/@hasan_dev",
            NotificationsFilterEngine.sanitizeTargetPath("follow", "/notifications", "@hasan_dev")
        );
        assertEquals(
            "/notifications",
            NotificationsFilterEngine.sanitizeTargetPath("comment", "https://phish.test/x", null)
        );
        assertTrue(NotificationsFilterEngine.describeNotificationAction("reply", "Tarek", false).contains("Tarek"));
        assertTrue(NotificationsFilterEngine.describeNotificationAction("message", "Amina", true).contains("Amina"));
    }
}
