package bd.info.bsdc.app.core.common;

import java.io.IOException;
import java.io.InputStream;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Streaming SHA-256 verifier for finalized BSDC performance report PDFs.
 *
 * <p>Matches {@code corporate-kit/src/pdf/report-integrity.ts} without buffering
 * multi-megabyte documents into heap memory.
 */
public final class PdfSha256Verifier {

    private static final int BUFFER_BYTES = 16 * 1024;
    private static final Pattern UUID_PATTERN = Pattern.compile(
        "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    );
    private static final Pattern SHA256_HEX_PATTERN = Pattern.compile("^[0-9a-f]{64}$");

    private PdfSha256Verifier() {}

    public static String sha256Hex(InputStream stream) throws IOException {
        if (stream == null) throw new IllegalArgumentException("Input stream must not be null");
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm unavailable", e);
        }
        byte[] buffer = new byte[BUFFER_BYTES];
        try (DigestInputStream dis = new DigestInputStream(stream, digest)) {
            while (dis.read(buffer) != -1) {
                // Digest updated cleanly chunk by chunk
            }
        }
        byte[] hash = digest.digest();
        StringBuilder hex = new StringBuilder(hash.length * 2);
        for (byte b : hash) {
            hex.append(Character.forDigit((b >> 4) & 0xF, 16));
            hex.append(Character.forDigit(b & 0xF, 16));
        }
        return hex.toString();
    }

    public static boolean matchesExpectedSha256(InputStream pdfStream, String expectedHex)
        throws IOException {
        if (expectedHex == null) return false;
        String cleanExpected = expectedHex.trim().toLowerCase(Locale.ROOT);
        if (!SHA256_HEX_PATTERN.matcher(cleanExpected).matches()) return false;
        String actual = sha256Hex(pdfStream);
        return constantTimeEquals(actual, cleanExpected);
    }

    public static String normaliseReportReceiptId(String raw) {
        if (raw == null) return "";
        String candidate = raw.trim().toLowerCase(Locale.ROOT);
        return UUID_PATTERN.matcher(candidate).matches() ? candidate : "";
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) return false;
        int diff = 0;
        for (int i = 0; i < a.length(); i++) {
            diff |= a.charAt(i) ^ b.charAt(i);
        }
        return diff == 0;
    }
}
