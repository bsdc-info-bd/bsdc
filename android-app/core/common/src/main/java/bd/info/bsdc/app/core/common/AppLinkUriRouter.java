package bd.info.bsdc.app.core.common;

import bd.info.bsdc.app.core.model.BsdcHosts;
import bd.info.bsdc.app.core.model.LinkDestination;
import java.net.URI;
import java.util.Locale;
import java.util.Map;

/**
 * Security-first URI and push-notification destination classifier.
 *
 * <ul>
 *   <li>{@code www.bsdc.info.bd}, {@code bsdc.info.bd}, {@code vf.main.bsdc.info.bd},
 *       {@code vf.bsdc.info.bd}, and {@code bsdc://} open natively without any WebView.</li>
 *   <li>{@code https://news.bsdc.info.bd/...} opens strictly inside the isolated News WebView.</li>
 *   <li>All {@code /admin*} routes are cleanly refused inside the mobile binary.</li>
 *   <li>External HTTPS URLs route out to Chrome Custom Tabs / system browser.</li>
 *   <li>Insecure, credential-bearing, protocol-relative, or script URIs are rejected.</li>
 * </ul>
 */
public final class AppLinkUriRouter {

    private AppLinkUriRouter() {}

    public static LinkDestination resolveLink(String raw) {
        if (raw == null) {
            return new LinkDestination.Ignored("There was no address in the intent.");
        }
        String value = raw.trim();
        if (value.isEmpty()) {
            return new LinkDestination.Ignored("There was no address in the intent.");
        }

        // Bare relative paths only permitted when strictly clean internal app paths.
        if (value.startsWith("/")) {
            if (value.startsWith("//") || value.startsWith("/\\") || value.contains("..")) {
                return new LinkDestination.Ignored("Protocol-relative or traversal paths are refused.");
            }
            return routeNativePath(value);
        }

        URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException ex) {
            return new LinkDestination.Ignored("That is not an address the app can open.");
        }

        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (scheme.isEmpty()) {
            return new LinkDestination.Ignored("Missing URI scheme.");
        }

        if (BsdcHosts.APP_SCHEME.equals(scheme)) {
            if (uri.getRawUserInfo() != null && !uri.getRawUserInfo().isEmpty()) {
                return new LinkDestination.Ignored("Credentials in deep links are refused.");
            }
            String hostSegment = (uri.getHost() == null || uri.getHost().isEmpty())
                ? ""
                : "/" + uri.getHost();
            String rawPath = uri.getRawPath() == null || "/".equals(uri.getRawPath())
                ? ""
                : uri.getRawPath();
            String path = (hostSegment + rawPath).isEmpty() ? "/" : (hostSegment + rawPath);
            if (path.startsWith("/post/")) {
                path = "/p/" + path.substring("/post/".length());
            }
            return routeNativePath(appendQueryAndFragment(path, uri.getRawQuery(), uri.getRawFragment()));
        }

        if (!"https".equals(scheme)) {
            return new LinkDestination.Ignored("Only secure HTTPS or bsdc:// links are accepted.");
        }

        if (uri.getRawUserInfo() != null && !uri.getRawUserInfo().isEmpty()) {
            return new LinkDestination.Ignored("URLs containing embedded credentials are refused.");
        }

        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (host.isEmpty()) {
            return new LinkDestination.Ignored("Missing host.");
        }

        if (BsdcHosts.NEWS_HOSTS.contains(host)) {
            return new LinkDestination.NewsReader(uri.toString());
        }

        if (BsdcHosts.NATIVE_HOSTS.contains(host)) {
            String path = normalisePath(uri.getRawPath(), uri.getRawQuery(), uri.getRawFragment());
            if (("vf.main.bsdc.info.bd".equals(host) || "vf.bsdc.info.bd".equals(host))
                && ("/".equals(path) || path.startsWith("/?"))) {
                path = "/verify" + (path.length() > 1 ? path.substring(1) : "");
            }
            return routeNativePath(path);
        }

        return new LinkDestination.ExternalBrowser(uri.toString());
    }

    public static LinkDestination pushDestination(Map<String, String> data) {
        if (data == null || data.isEmpty()) {
            return new LinkDestination.Ignored("The notification carried no destination.");
        }
        String candidate = firstNonBlank(data.get("path"), data.get("url"), data.get("link"));
        if (candidate != null) {
            return resolveLink(candidate);
        }
        String kind = data.getOrDefault("kind", "").trim();
        String id = data.getOrDefault("id", "").trim();
        if (!id.isEmpty()) {
            switch (kind) {
                case "message":
                    return routeNativePath("/messages/" + id);
                case "post":
                case "comment":
                case "reply":
                case "reaction":
                case "mention":
                case "bookmark":
                case "share":
                case "post_published":
                case "poll_vote":
                case "comment_reaction":
                case "answer_accepted":
                    return routeNativePath("/p/" + id);
                case "follow":
                    return routeNativePath("/@" + id);
                case "order":
                case "review":
                case "payout":
                    return routeNativePath("/orders");
                case "certificate":
                    return routeNativePath("/verify/" + id);
                case "course":
                    return routeNativePath("/courses");
                case "job":
                    return routeNativePath("/jobs");
                case "event":
                    return routeNativePath("/events");
                case "gig_proposal":
                    return routeNativePath("/freelance");
                case "project_star":
                    return routeNativePath("/projects");
                case "group_invite":
                case "mention_group":
                    return routeNativePath("/groups");
                case "moderation":
                    return routeNativePath("/notifications");
                default:
                    break;
            }
        }
        return new LinkDestination.Ignored("The notification carried no destination.");
    }

    public static boolean isImgBbUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) return false;
        try {
            URI uri = URI.create(rawUrl.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
            if (uri.getRawUserInfo() != null) return false;
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            return BsdcHosts.IMGBB_HOSTS.contains(host) || host.endsWith(".ibb.co");
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private static LinkDestination routeNativePath(String normalizedPath) {
        String lower = normalizedPath.toLowerCase(Locale.ROOT);
        if (lower.equals("/admin") || lower.startsWith("/admin/") || lower.startsWith("/admin?")) {
            return new LinkDestination.AdminWebOnly(normalizedPath);
        }
        return new LinkDestination.NativeRoute(normalizedPath);
    }

    private static String normalisePath(String rawPath, String rawQuery, String rawFragment) {
        String path = (rawPath == null || rawPath.isEmpty()) ? "/" : rawPath;
        if (path.length() > 1 && path.endsWith("/")) {
            path = path.replaceAll("/+$", "");
            if (path.isEmpty()) path = "/";
        }
        return appendQueryAndFragment(path, rawQuery, rawFragment);
    }

    private static String appendQueryAndFragment(String path, String query, String fragment) {
        StringBuilder sb = new StringBuilder(path);
        if (query != null && !query.isEmpty()) {
            sb.append('?').append(query);
        }
        if (fragment != null && !fragment.isEmpty()) {
            sb.append('#').append(fragment);
        }
        return sb.toString();
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) return v.trim();
        }
        return null;
    }
}
