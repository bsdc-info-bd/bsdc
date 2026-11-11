package bd.info.bsdc.app.core.sync

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import bd.info.bsdc.app.core.model.SyncNetworkPolicy
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.syncStore by preferencesDataStore(name = "bsdc_offline_sync_prefs")

data class OfflineSyncSettings(
    val policy: SyncNetworkPolicy = SyncNetworkPolicy.WIFI_ONLY,
    val maxCacheMb: Int = 150,
    val prefetchThumbnails: Boolean = true,
    val lastSyncEpochMs: Long = 0L,
    val lastSyncedPosts: Int = 0,
)

class OfflineSyncPreferencesStore(private val context: Context) {

    private val policyKey = stringPreferencesKey("sync_policy")
    private val maxCacheMbKey = intPreferencesKey("max_cache_mb")
    private val prefetchThumbsKey = booleanPreferencesKey("prefetch_thumbnails")
    private val lastSyncMsKey = longPreferencesKey("last_sync_epoch_ms")
    private val lastCountKey = intPreferencesKey("last_synced_posts")

    fun settingsFlow(): Flow<OfflineSyncSettings> = context.syncStore.data.map { prefs ->
        OfflineSyncSettings(
            policy = SyncNetworkPolicy.fromWire(prefs[policyKey]),
            maxCacheMb = OfflineSyncPolicy.clampedCacheMb(prefs[maxCacheMbKey] ?: 150),
            prefetchThumbnails = prefs[prefetchThumbsKey] ?: true,
            lastSyncEpochMs = prefs[lastSyncMsKey] ?: 0L,
            lastSyncedPosts = prefs[lastCountKey] ?: 0,
        )
    }

    suspend fun getSettings(): OfflineSyncSettings = settingsFlow().first()

    suspend fun setNetworkPolicy(policy: SyncNetworkPolicy) {
        context.syncStore.edit { prefs -> prefs[policyKey] = policy.wireValue }
    }

    suspend fun setMaxCacheMb(mb: Int) {
        context.syncStore.edit { prefs -> prefs[maxCacheMbKey] = OfflineSyncPolicy.clampedCacheMb(mb) }
    }

    suspend fun setPrefetchThumbnails(enabled: Boolean) {
        context.syncStore.edit { prefs -> prefs[prefetchThumbsKey] = enabled }
    }

    suspend fun recordSyncCompletion(epochMs: Long, count: Int) {
        context.syncStore.edit { prefs ->
            prefs[lastSyncMsKey] = epochMs
            prefs[lastCountKey] = count
        }
    }
}
