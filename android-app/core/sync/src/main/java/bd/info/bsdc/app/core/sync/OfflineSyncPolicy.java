package bd.info.bsdc.app.core.sync;

import bd.info.bsdc.app.core.model.SyncNetworkPolicy;

/**
 * Pure Java 21 scheduling and retention calculator for offline feed prefetching.
 */
public final class OfflineSyncPolicy {

    public static final int DEFAULT_PREFETCH_POST_LIMIT = 25;
    public static final int DEFAULT_IMAGE_WARM_LIMIT = 18;
    public static final long RETENTION_WINDOW_MS = 14L * 24L * 60L * 60L * 1000L;

    private OfflineSyncPolicy() {}

    public static boolean shouldRunAutoSync(
        SyncNetworkPolicy policy,
        boolean isConnected,
        boolean isMetered,
        boolean isBatteryLow
    ) {
        if (policy == null || policy == SyncNetworkPolicy.OFF) return false;
        if (!isConnected || isBatteryLow) return false;
        if (policy == SyncNetworkPolicy.WIFI_ONLY && isMetered) return false;
        return true;
    }

    public static long pruneCutoffEpochMs(long nowEpochMs) {
        return Math.max(0L, nowEpochMs - RETENTION_WINDOW_MS);
    }

    public static int clampedCacheMb(int configuredMb) {
        return Math.max(32, Math.min(1024, configuredMb));
    }
}
