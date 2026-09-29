package bd.info.bsdc.app.util;

import java.net.URI;
import java.util.Locale;

/** Java boundary utility used before saving external URLs or accepting user media. */
public final class SafetyPolicy {
    private SafetyPolicy() { }

    public static boolean isAllowedUploadMime(String mime) {
        if (mime == null) return false;
        String value = mime.toLowerCase(Locale.ROOT);
        return value.startsWith("image/") || value.startsWith("audio/");
    }

    /** Only allow web links. Intent, file, data, javascript and custom schemes are rejected. */
    public static String safeHttpUrl(String raw) {
        if (raw == null || raw.length() > 2048) return null;
        try {
            URI uri = new URI(raw.trim());
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (host == null || scheme == null) return null;
            if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) return null;
            return uri.toASCIIString();
        } catch (Exception ignored) {
            return null;
        }
    }
}
