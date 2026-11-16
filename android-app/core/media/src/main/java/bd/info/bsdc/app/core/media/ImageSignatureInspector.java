package bd.info.bsdc.app.core.media;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Pure Java 21 magic-byte verifier matching main-site/src/lib/media/image-signature.ts.
 *
 * <p>Rejects HTML rate-limit error pages, ZIP archives, PDFs, and audio files disguised
 * with image MIME headers before any bytes reach ImgBB or disk image caches.
 */
public final class ImageSignatureInspector {

    public static final int SNIFF_BYTES = 256;
    public static final long MAX_IMAGE_BYTES = 10L * 1024L * 1024L;

    private ImageSignatureInspector() {}

    public static boolean looksLikeImageBytes(byte[] bytes) {
        if (bytes == null || bytes.length < 4) return false;
        if (isJpeg(bytes) || isPng(bytes) || isGif(bytes) || isBmp(bytes)) return true;
        if (isWebp(bytes) || isIsoMedia(bytes)) return true;
        return isSvg(bytes);
    }

    public static String sniffMimeType(byte[] bytes) {
        if (bytes == null || bytes.length < 4) return null;
        if (isJpeg(bytes)) return "image/jpeg";
        if (isPng(bytes)) return "image/png";
        if (isGif(bytes)) return "image/gif";
        if (isWebp(bytes)) return "image/webp";
        if (isIsoMedia(bytes)) return "image/avif";
        if (isBmp(bytes)) return "image/bmp";
        if (isSvg(bytes)) return "image/svg+xml";
        return null;
    }

    public static boolean isJpeg(byte[] b) {
        return (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
    }

    public static boolean isPng(byte[] b) {
        return (b[0] & 0xFF) == 0x89
            && (b[1] & 0xFF) == 0x50
            && (b[2] & 0xFF) == 0x4E
            && (b[3] & 0xFF) == 0x47;
    }

    public static boolean isGif(byte[] b) {
        return (b[0] & 0xFF) == 0x47
            && (b[1] & 0xFF) == 0x49
            && (b[2] & 0xFF) == 0x46
            && (b[3] & 0xFF) == 0x38;
    }

    public static boolean isBmp(byte[] b) {
        return (b[0] & 0xFF) == 0x42 && (b[1] & 0xFF) == 0x4D;
    }

    public static boolean isWebp(byte[] b) {
        if (b.length < 12) return false;
        return b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
            && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P';
    }

    public static boolean isIsoMedia(byte[] b) {
        if (b.length < 12) return false;
        return b[4] == 'f' && b[5] == 't' && b[6] == 'y' && b[7] == 'p';
    }

    public static boolean isSvg(byte[] b) {
        int limit = Math.min(b.length, SNIFF_BYTES);
        String text = new String(b, 0, limit, StandardCharsets.UTF_8);
        if (!text.isEmpty() && text.charAt(0) == '\uFEFF') {
            text = text.substring(1);
        }
        String trimmed = text.trim().toLowerCase(Locale.ROOT);
        if (trimmed.startsWith("<svg")) return true;
        return trimmed.startsWith("<?xml") && text.toLowerCase(Locale.ROOT).contains("<svg");
    }
}
