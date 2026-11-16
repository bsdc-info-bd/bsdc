package bd.info.bsdc.app.feature.news;

import static org.junit.Assert.assertEquals;

import bd.info.bsdc.app.core.model.BsdcHosts;
import org.junit.Test;

public class NewsWebSecurityEngineTest {

    @Test
    public void classifyNavigation_permitsOnlyHttpsNewsOriginInsideWebView() {
        assertEquals(
            NewsWebSecurityEngine.NavigationDecision.ALLOW_IN_NEWS_WEBVIEW,
            NewsWebSecurityEngine.classifyNavigation("https://news.bsdc.info.bd/articles/kotlin-2")
        );
        assertEquals(
            NewsWebSecurityEngine.NavigationDecision.REJECT,
            NewsWebSecurityEngine.classifyNavigation("http://news.bsdc.info.bd/")
        );
        assertEquals(
            NewsWebSecurityEngine.NavigationDecision.REJECT,
            NewsWebSecurityEngine.classifyNavigation("file:///data/local/tmp/secret.html")
        );
        assertEquals(
            NewsWebSecurityEngine.NavigationDecision.REJECT,
            NewsWebSecurityEngine.classifyNavigation("javascript:alert(1)")
        );
        assertEquals(
            NewsWebSecurityEngine.NavigationDecision.ROUTE_NATIVE_APP,
            NewsWebSecurityEngine.classifyNavigation("https://www.bsdc.info.bd/p/hello")
        );
        assertEquals(
            NewsWebSecurityEngine.NavigationDecision.REJECT,
            NewsWebSecurityEngine.classifyNavigation("https://www.bsdc.info.bd/admin/users")
        );
        assertEquals(
            NewsWebSecurityEngine.NavigationDecision.OPEN_EXTERNAL_BROWSER,
            NewsWebSecurityEngine.classifyNavigation("https://github.com/bsdc-info-bd/bsdc")
        );
    }

    @Test
    public void normalizeNewsStartUrl_fallsBackForUnsafeInputs() {
        assertEquals(
            BsdcHosts.NEWS_ORIGIN,
            NewsWebSecurityEngine.normalizeNewsStartUrl("https://evil.test/phish")
        );
        assertEquals(
            "https://news.bsdc.info.bd/latest",
            NewsWebSecurityEngine.normalizeNewsStartUrl("https://news.bsdc.info.bd/latest")
        );
    }

    @Test
    public void clampTextZoom_respectsBounds() {
        assertEquals(85, NewsWebSecurityEngine.clampTextZoom(40));
        assertEquals(120, NewsWebSecurityEngine.clampTextZoom(120));
        assertEquals(150, NewsWebSecurityEngine.clampTextZoom(300));
    }
}
