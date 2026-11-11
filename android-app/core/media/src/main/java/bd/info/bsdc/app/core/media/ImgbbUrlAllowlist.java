package bd.info.bsdc.app.core.media;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Pure Java 21 image host allowlist and responsive ImgBB URL selector matching
 * main-site/src/lib/media/hosts.ts and main-site/src/lib/media/optimise.ts.
 *
 * <p>Enforces ImgBB-only image uploads and explicitly blocks Cloudinary, plain HTTP,
 * documents, and audio file URLs.
 */
public final class ImgbbUrlAllowlist {

    private static final Set<String> EXACT_HOSTS = Set.of(
        "i.ibb.co",
        "ibb.co",
        "i.ibb.co.com",
        "ibb.co.com",
        "image.ibb.co",
        "preview.ibb.co",
        "thumb.ibb.co"
    );

    private static final Pattern IMGBB_SUBDOMAIN = Pattern.compile("^i\\d+\\.ibb\\.co(?:\\.com)?$");

    private static final Set<String> SUFFIX_HOSTS = Set.of(
        "googleusercontent.com",
        "firebasestorage.app",
        "tile.openstreetmap.org",
        "yimg.com",
        "avatars.githubusercontent.com"
    );

    private static final Pattern NOT_IMAGE_SUFFIX = Pattern.compile(
        "\\.(?:pdf|docx?|xlsx?|pptx?|zip|rar|7z|tar|gz|mp4|mov|avi|mkv|webm|mp3|wav|ogg|opus|m4a|json|txt|csv|sql|ts|js)$",
        Pattern.CASE_INSENSITIVE
    );

    private ImgbbUrlAllowlist() {}

    public static boolean isRepairableImgbbHost(String hostname) {
        if (hostname == null) return false;
        String host = hostname.trim().toLowerCase(Locale.ROOT);
        return EXACT_HOSTS.contains(host) || IMGBB_SUBDOMAIN.matcher(host).matches();
    }

    public static boolean isAllowedImageHost(String hostname) {
        if (hostname == null) return false;
        String host = hostname.trim().toLowerCase(Locale.ROOT);
        if (host.isEmpty()) return false;
        if (isRepairableImgbbHost(host)) return true;
        if (host.endsWith("cloudinary.com")) return false;
        for (String suffix : SUFFIX_HOSTS) {
            if (host.equals(suffix) || host.endsWith("." + suffix)) {
                return true;
            }
        }
        return false;
    }

    public static boolean looksLikeDocument(String url) {
        if (url == null) return false;
        int q = url.indexOf('?');
        String noQuery = q >= 0 ? url.substring(0, q) : url;
        int h = noQuery.indexOf('#');
        String path = h >= 0 ? noQuery.substring(0, h) : noQuery;
        return NOT_IMAGE_SUFFIX.matcher(path).find();
    }

    public static boolean isAllowedImageUrl(String rawUrl) {
        if (rawUrl == null) return false;
        String trimmed = rawUrl.trim();
        if (!trimmed.startsWith("https://")) return false;
        if (looksLikeDocument(trimmed)) return false;
        try {
            URI uri = URI.create(trimmed);
            String host = uri.getHost();
            return isAllowedImageHost(host);
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    /**
     * Picks ImgBB's lightweight ~640w medium variant (`thumbUrl`) for thumbnails/feed
     * slots <= 640px and crisp `fullUrl` for full-screen viewers and wide covers.
     */
    public static String selectResponsiveUrl(String fullUrl, String thumbUrl, int targetWidthPx) {
        String cleanFull = fullUrl == null ? "" : fullUrl.trim();
        String cleanThumb = thumbUrl == null ? "" : thumbUrl.trim();
        if (cleanFull.isEmpty()) return cleanThumb;
        if (cleanThumb.isEmpty() || cleanThumb.equals(cleanFull)) return cleanFull;
        if (targetWidthPx <= 640 && isAllowedImageUrl(cleanThumb)) {
            return cleanThumb;
        }
        return cleanFull;
    }

    public static String edgeRepairUrl(String siteOrigin, String imgbbUrl) {
        if (imgbbUrl == null || imgbbUrl.trim().isEmpty()) return "";
        try {
            URI uri = URI.create(imgbbUrl.trim());
            if (!isRepairableImgbbHost(uri.getHost())) return imgbbUrl.trim();
            String base = siteOrigin.replaceAll("/+$", "");
            return base + "/media/i?u=" + URLEncoder.encode(imgbbUrl.trim(), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ex) {
            return imgbbUrl.trim();
        }
    }
}
