package bd.info.bsdc.app.util;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SafetyPolicyTest {
    @Test public void permitsOnlyImagesAndAudio() {
        assertTrue(SafetyPolicy.isAllowedUploadMime("image/webp"));
        assertTrue(SafetyPolicy.isAllowedUploadMime("audio/ogg"));
        assertFalse(SafetyPolicy.isAllowedUploadMime("video/mp4"));
    }

    @Test public void blocksDangerousUrlSchemes() {
        assertTrue(SafetyPolicy.safeHttpUrl("https://www.bsdc.info.bd/post/example") != null);
        assertNull(SafetyPolicy.safeHttpUrl("javascript:alert(1)"));
        assertNull(SafetyPolicy.safeHttpUrl("file:///etc/passwd"));
    }
}
