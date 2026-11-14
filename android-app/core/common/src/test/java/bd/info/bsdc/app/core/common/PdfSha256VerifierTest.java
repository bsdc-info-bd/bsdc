package bd.info.bsdc.app.core.common;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class PdfSha256VerifierTest {

    @Test
    public void detectsMatchingAndTamperedReportBytes() throws IOException {
        byte[] pdfBytes = "%PDF-1.4\nBSDC Sealed Report\n%%EOF".getBytes(StandardCharsets.UTF_8);
        String digest = PdfSha256Verifier.sha256Hex(new ByteArrayInputStream(pdfBytes));

        assertEquals(64, digest.length());
        assertTrue(PdfSha256Verifier.matchesExpectedSha256(new ByteArrayInputStream(pdfBytes), digest));

        byte[] altered = pdfBytes.clone();
        altered[12] ^= 0x01;
        assertFalse(PdfSha256Verifier.matchesExpectedSha256(new ByteArrayInputStream(altered), digest));
        assertFalse(PdfSha256Verifier.matchesExpectedSha256(new ByteArrayInputStream(pdfBytes), "badhex"));
    }

    @Test
    public void normalisesValidReportUuidsOnly() {
        assertEquals(
            "550e8400-e29b-41d4-a716-446655440000",
            PdfSha256Verifier.normaliseReportReceiptId("  550E8400-E29B-41D4-A716-446655440000 ")
        );
        assertEquals("", PdfSha256Verifier.normaliseReportReceiptId("not-a-uuid"));
    }
}
