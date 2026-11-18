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
    public void pushDestinationsCoverGigsAndTheirDecisions() {
        assertEquals(
            new LinkDestination.NativeRoute("/freelance"),
            AppLinkUriRouter.pushDestination(Map.of("kind", "gig_proposal"))
        );
        assertEquals(
            new LinkDestination.NativeRoute("/freelance"),
            AppLinkUriRouter.pushDestination(Map.of("kind", "gig_proposal_decision"))
        );
        assertEquals(
            new LinkDestination.NativeRoute("/freelance"),
            AppLinkUriRouter.pushDestination(Map.of("kind", "gig"))
        );
        assertEquals(
            new LinkDestination.NativeRoute("/jobs"),
            AppLinkUriRouter.pushDestination(Map.of("kind", "application_decision"))
        );
        assertEquals(
            new LinkDestination.NativeRoute("/events"),
            AppLinkUriRouter.pushDestination(Map.of("kind", "event"))
        );
    }

    @Test
    public void aDeepGigLinkReachesTheGigRatherThanTheDirectory() {
        assertEquals(
            new LinkDestination.NativeRoute("/freelance/logo-redesign"),
            AppLinkUriRouter.resolveLink("https://www.bsdc.info.bd/freelance/logo-redesign")
        );
        assertEquals(
            new LinkDestination.NativeRoute("/jobs/senior-dev"),
            AppLinkUriRouter.resolveLink("https://bsdc.info.bd/jobs/senior-dev")
        );
    }

    @Test
    public void validatesImgBbOnlyMediaHostsAndRejectsCloudinary() {
        assertTrue(AppLinkUriRouter.isImgBbUrl("https://i.ibb.co/abc123/photo.webp"));
        assertTrue(AppLinkUriRouter.isImgBbUrl("https://i.ibb.co.com/xyz/avatar.png"));
        assertFalse(AppLinkUriRouter.isImgBbUrl("https://res.cloudinary.com/demo/image/upload/sample.jpg"));
        assertFalse(AppLinkUriRouter.isImgBbUrl("http://i.ibb.co/insecure.png"));
    }

    /**
     * Push payloads are the one place a path is built by concatenation rather than
     * parsed, so the id is the only thing standing between a notification and the
     * route table. Anyone who can deliver a payload controls it.
     *
     * The id guard is a deny-list of separators rather than an allow-list of
     * characters, because real ids contain hyphens and Bangla letters. These cases are
     * the ones a hostile payload would try: traversal, an absolute URL parked in the
     * id, and casing tricks against the admin check.
     */
    @Test
    public void aHostilePushIdIsRefusedRatherThanConcatenated() {
        for (String hostile : new String[] {
            "../admin/announcements",
            "../../ADMIN",
            "https://evil.test/phish",
            "conv/../settings",
            "conv\\..\\admin",
            "conv id with a space",
            "bsdc://admin",
            "newline\n/ admin",
        }) {
            assertTrue(
                "hostile id must be refused: " + hostile,
                AppLinkUriRouter.pushDestination(Map.of("kind", "message", "id", hostile))
                    instanceof LinkDestination.Ignored
            );
        }
    }

    @Test
    public void ordinaryIdsStillReachTheirScreen() {
        // The guard must not break real traffic. A uuid, a slug and a certificate code
        // are all ids this platform actually sends.
        assertEquals(
            new LinkDestination.NativeRoute("/messages/8f14e45f-ceea-467f-a8e0-9d3a1b2c3d4e"),
            AppLinkUriRouter.pushDestination(
                Map.of("kind", "message", "id", "8f14e45f-ceea-467f-a8e0-9d3a1b2c3d4e")
            )
        );
        assertEquals(
            new LinkDestination.NativeRoute("/p/kotlin-compose"),
            AppLinkUriRouter.pushDestination(Map.of("kind", "post", "id", "kotlin-compose"))
        );
        // A certificate code is hyphenated and must survive the guard unchanged.
        assertEquals(
            new LinkDestination.NativeRoute("/verify/BSDC-CT-4A7C21B9-6"),
            AppLinkUriRouter.pushDestination(Map.of("kind", "certificate", "id", "BSDC-CT-4A7C21B9-6"))
        );
    }

    @Test
    public void aPushUrlIsHeldToTheSameRulesAsATappedLink() {
        // `url` is the field an attacker would reach for first, because it looks like it
        // bypasses the id switch entirely. It does not: it is handed to resolveLink, so
        // the scheme, host and credential rules all apply unchanged.
        assertTrue(
            AppLinkUriRouter.pushDestination(Map.of("url", "http://www.bsdc.info.bd/p/x"))
                instanceof LinkDestination.Ignored
        );
        assertTrue(
            AppLinkUriRouter.pushDestination(Map.of("url", "https://www.bsdc.info.bd@evil.test/p"))
                instanceof LinkDestination.Ignored
        );
        assertTrue(
            AppLinkUriRouter.pushDestination(Map.of("url", "javascript:alert(1)"))
                instanceof LinkDestination.Ignored
        );
        assertEquals(
            new LinkDestination.NativeRoute("/p/realfind"),
            AppLinkUriRouter.pushDestination(Map.of("url", "https://www.bsdc.info.bd/p/realfind"))
        );
    }
}
