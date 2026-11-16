package bd.info.bsdc.app.core.common;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import bd.info.bsdc.app.core.model.LinkDestination;
import java.util.Map;
import org.junit.Test;

public class AppLinkUriRouterTest {

    @Test
    public void resolvesNativeCommunityAndVerificationHostsWithoutWebView() {
        LinkDestination post = AppLinkUriRouter.resolveLink("https://www.bsdc.info.bd/p/kotlin-compose/");
        assertEquals(new LinkDestination.NativeRoute("/p/kotlin-compose"), post);

        LinkDestination vf = AppLinkUriRouter.resolveLink("https://vf.main.bsdc.info.bd/?code=BSDC-CT-4A7C21B9-6");
        assertEquals(new LinkDestination.NativeRoute("/verify?code=BSDC-CT-4A7C21B9-6"), vf);

        LinkDestination vfShort = AppLinkUriRouter.resolveLink("https://vf.bsdc.info.bd/report?id=123");
        assertEquals(new LinkDestination.NativeRoute("/report?id=123"), vfShort);
    }

    @Test
    public void routesNewsSubdomainStrictlyToIsolatedNewsReader() {
        LinkDestination news = AppLinkUriRouter.resolveLink("https://news.bsdc.info.bd/2026/release");
        assertEquals(
            new LinkDestination.NewsReader("https://news.bsdc.info.bd/2026/release"),
            news
        );
    }

    @Test
    public void isolatesAdminRoutesAsWebOnly() {
        LinkDestination admin = AppLinkUriRouter.resolveLink("https://www.bsdc.info.bd/admin/people");
        assertEquals(new LinkDestination.AdminWebOnly("/admin/people"), admin);
    }

    @Test
    public void routesUntrustedOriginsToExternalBrowserAndBlocksUnsafeSchemes() {
        LinkDestination ext = AppLinkUriRouter.resolveLink("https://github.com/bsdc-info-bd/bsdc");
        assertEquals(new LinkDestination.ExternalBrowser("https://github.com/bsdc-info-bd/bsdc"), ext);

        assertTrue(AppLinkUriRouter.resolveLink("http://www.bsdc.info.bd/p/hi") instanceof LinkDestination.Ignored);
        assertTrue(AppLinkUriRouter.resolveLink("javascript:alert(1)") instanceof LinkDestination.Ignored);
        assertTrue(AppLinkUriRouter.resolveLink("//evil.example.com") instanceof LinkDestination.Ignored);
        assertTrue(AppLinkUriRouter.resolveLink("/\\evil.example.com") instanceof LinkDestination.Ignored);
        assertTrue(AppLinkUriRouter.resolveLink("https://user:pass@www.bsdc.info.bd/") instanceof LinkDestination.Ignored);
    }

    @Test
    public void handlesCustomBsdcSchemeAndPushPayloads() {
        assertEquals(
            new LinkDestination.NativeRoute("/p/why-rust"),
            AppLinkUriRouter.resolveLink("bsdc://post/why-rust")
        );
        assertEquals(
            new LinkDestination.NativeRoute("/messages/conv-42"),
            AppLinkUriRouter.pushDestination(Map.of("kind", "message", "id", "conv-42"))
        );
        assertEquals(
            new LinkDestination.NativeRoute("/p/hello"),
            AppLinkUriRouter.pushDestination(Map.of("url", "/p/hello"))
        );
        assertTrue(
            AppLinkUriRouter.pushDestination(Map.of("url", "https://evil.test/phish"))
                instanceof LinkDestination.ExternalBrowser
        );
    }

    @Test
    public void validatesImgBbOnlyMediaHostsAndRejectsCloudinary() {
        assertTrue(AppLinkUriRouter.isImgBbUrl("https://i.ibb.co/abc123/photo.webp"));
        assertTrue(AppLinkUriRouter.isImgBbUrl("https://i.ibb.co.com/xyz/avatar.png"));
        assertFalse(AppLinkUriRouter.isImgBbUrl("https://res.cloudinary.com/demo/image/upload/sample.jpg"));
        assertFalse(AppLinkUriRouter.isImgBbUrl("http://i.ibb.co/insecure.png"));
    }
}
