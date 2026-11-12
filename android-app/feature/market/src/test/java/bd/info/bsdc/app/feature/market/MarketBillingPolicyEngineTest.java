package bd.info.bsdc.app.feature.market;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class MarketBillingPolicyEngineTest {

    @Test
    public void estimateShipping_respectsFreeOverThreshold() {
        assertEquals(0L, MarketBillingPolicyEngine.estimateShipping(0L, 60L, 1000L));
        assertEquals(60L, MarketBillingPolicyEngine.estimateShipping(500L, 60L, 1000L));
        assertEquals(0L, MarketBillingPolicyEngine.estimateShipping(1000L, 60L, 1000L));
        assertEquals(60L, MarketBillingPolicyEngine.estimateShipping(1500L, 60L, null));
    }

    @Test
    public void canOrderPhysicallyInApp_blocksDigitalThirdPartyCheckout() {
        assertTrue(MarketBillingPolicyEngine.canOrderPhysicallyInApp(false));
        assertFalse(MarketBillingPolicyEngine.canOrderPhysicallyInApp(true));
    }

    @Test
    public void formatCurrency_formatsBdtBilingually() {
        assertEquals("BDT 450", MarketBillingPolicyEngine.formatCurrency(450L, "bdt", false));
        assertEquals("৳450", MarketBillingPolicyEngine.formatCurrency(450L, "BDT", true));
        assertEquals("USD 12", MarketBillingPolicyEngine.formatCurrency(12L, "usd", false));
    }
}
