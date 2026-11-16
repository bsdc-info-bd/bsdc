package bd.info.bsdc.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import bd.info.bsdc.app.core.common.AppLinkUriRouter;
import bd.info.bsdc.app.core.common.AppVersionResolver;
import bd.info.bsdc.app.core.model.BsdcHosts;
import bd.info.bsdc.app.core.model.LinkDestination;
import org.junit.Test;

public class AppRoutingContractTest {

    @Test
    public void verifyPackageIdAndOriginConstants() {
        assertEquals("bd.info.bsdc.app", BsdcHosts.PACKAGE_ID);
        assertTrue(BsdcHosts.NATIVE_HOSTS.contains("www.bsdc.info.bd"));
        assertTrue(BsdcHosts.NATIVE_HOSTS.contains("vf.bsdc.info.bd"));
        assertTrue(BsdcHosts.NATIVE_HOSTS.contains("vf.main.bsdc.info.bd"));
        assertTrue(BsdcHosts.NEWS_HOSTS.contains("news.bsdc.info.bd"));
    }

    @Test
    public void adminRoutesNeverOpenInMobileShell() {
        assertTrue(
            AppLinkUriRouter.resolveLink("https://www.bsdc.info.bd/admin")
                instanceof LinkDestination.AdminWebOnly
        );
        assertTrue(
            AppLinkUriRouter.resolveLink("bsdc://admin/moderation")
                instanceof LinkDestination.AdminWebOnly
        );
    }

    @Test
    public void tagProducesValidPlayStoreSemverAndCode() {
        AppVersionResolver.AppVersion release = AppVersionResolver.fromTagAndRun("android-v1.5.2", 42);
        assertEquals(42, release.getCode());
        assertEquals("1.5.2", release.getName());

        AppVersionResolver.AppVersion ci = AppVersionResolver.fromTagAndRun("arena/3b09a022-bsdc", 17);
        assertEquals(17, ci.getCode());
        assertEquals("0.0.0-build.17", ci.getName());
    }
}
