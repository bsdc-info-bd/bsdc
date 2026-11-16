package bd.info.bsdc.app.core.sync;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import bd.info.bsdc.app.core.model.SyncNetworkPolicy;
import org.junit.Test;

public class OfflineSyncPolicyTest {

    @Test
    public void respectsWifiOnlyCellularAndOffPolicies() {
        assertTrue(OfflineSyncPolicy.shouldRunAutoSync(SyncNetworkPolicy.WIFI_ONLY, true, false, false));
        assertFalse(OfflineSyncPolicy.shouldRunAutoSync(SyncNetworkPolicy.WIFI_ONLY, true, true, false));
        assertTrue(OfflineSyncPolicy.shouldRunAutoSync(SyncNetworkPolicy.WIFI_AND_CELLULAR, true, true, false));
        assertFalse(OfflineSyncPolicy.shouldRunAutoSync(SyncNetworkPolicy.WIFI_AND_CELLULAR, false, false, false));
        assertFalse(OfflineSyncPolicy.shouldRunAutoSync(SyncNetworkPolicy.WIFI_AND_CELLULAR, true, false, true));
        assertFalse(OfflineSyncPolicy.shouldRunAutoSync(SyncNetworkPolicy.OFF, true, false, false));
    }

    @Test
    public void clampsDiskCacheAndRetentionBounds() {
        assertEquals(32, OfflineSyncPolicy.clampedCacheMb(5));
        assertEquals(150, OfflineSyncPolicy.clampedCacheMb(150));
        assertEquals(1024, OfflineSyncPolicy.clampedCacheMb(4096));
        assertEquals(0L, OfflineSyncPolicy.pruneCutoffEpochMs(1000L));
    }
}
