package bd.info.bsdc.app.feature.news;

import bd.info.bsdc.app.core.model.BsdcHosts;
import java.net.URI;
import java.util.Locale;

/**
 * Pure Java 21 security policy enforcing isolation of the News WebView strictly to
 * HTTPS pages on https://news.bsdc.info.bd (zero file://, zero javascript:, zero auth leakage).
 */
public final class NewsWebSecurityEngine {

    public enum NavigationDecision {
        ALLOW_IN_NEWS_WEBVIEW,
        ROUTE_NATIVE_APP,
        OPEN_EXTERNAL_BROWSER,
        REJECT
    }

    private NewsWebSecurityEngine() {}

    public static String normalizeNewsStartUrl(String candidate) {
        if (candidate == null || candidate.isBlank()) {
            return BsdcHosts.NEWS_ORIGIN;
        }
        String trimmed = candidate.trim();
        return classifyNavigation(trimmed) == NavigationDecision.ALLOW_IN_NEWS_WEBVIEW
            ? trimmed
            : BsdcHosts.NEWS_ORIGIN;
    }

    public static NavigationDecision classifyNavigation(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) return NavigationDecision.REJECT;
        URI uri;
        try {
            uri = URI.create(rawUrl.trim());
        } catch (IllegalArgumentException ex) {
            return NavigationDecision.REJECT;
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (BsdcHosts.APP_SCHEME.equals(scheme)) {
            return NavigationDecision.ROUTE_NATIVE_APP;
        }
        if (!"https".equals(scheme)) {
            return NavigationDecision.REJECT;
        }
        if (uri.getRawUserInfo() != null && !uri.getRawUserInfo().isEmpty()) {
            return NavigationDecision.REJECT;
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (host.isEmpty()) return NavigationDecision.REJECT;
        if (BsdcHosts.NEWS_HOSTS.contains(host)) {
            return NavigationDecision.ALLOW_IN_NEWS_WEBVIEW;
        }
        if (BsdcHosts.NATIVE_HOSTS.contains(host)) {
            String path = uri.getRawPath() == null ? "" : uri.getRawPath().toLowerCase(Locale.ROOT);
            if (path.equals("/admin") || path.startsWith("/admin/")) {
                return NavigationDecision.REJECT;
            }
            return NavigationDecision.ROUTE_NATIVE_APP;
        }
        return NavigationDecision.OPEN_EXTERNAL_BROWSER;
    }

    public static int clampTextZoom(int zoomPercent) {
        return Math.max(85, Math.min(150, zoomPercent));
    }
}
