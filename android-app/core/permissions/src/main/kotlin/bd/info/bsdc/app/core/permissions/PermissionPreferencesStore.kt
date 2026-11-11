package bd.info.bsdc.app.core.permissions

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import bd.info.bsdc.app.core.model.DevicePermissionKind
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.permissionStore by preferencesDataStore(name = "bsdc_permissions_prefs")

class PermissionPreferencesStore(private val context: Context) {

    private fun askedKey(kind: DevicePermissionKind) =
        booleanPreferencesKey("asked_${kind.name.lowercase()}")

    private val onboardingSeenKey = booleanPreferencesKey("readiness_onboarding_seen")
    private val promptDismissCountKey = intPreferencesKey("readiness_dismiss_count")

    fun requestedFlagsFlow(): Flow<Set<DevicePermissionKind>> =
        context.permissionStore.data.map { prefs ->
            DevicePermissionKind.entries.filterTo(mutableSetOf()) { kind ->
                prefs[askedKey(kind)] == true
            }
        }

    suspend fun getRequestedFlags(): Set<DevicePermissionKind> = requestedFlagsFlow().first()

    suspend fun markRequested(vararg kinds: DevicePermissionKind) {
        context.permissionStore.edit { prefs ->
            kinds.forEach { prefs[askedKey(it)] = true }
        }
    }

    fun onboardingSeenFlow(): Flow<Boolean> =
        context.permissionStore.data.map { prefs -> prefs[onboardingSeenKey] == true }

    suspend fun markOnboardingSeen() {
        context.permissionStore.edit { prefs -> prefs[onboardingSeenKey] = true }
    }

    suspend fun recordBannerDismiss() {
        context.permissionStore.edit { prefs ->
            prefs[promptDismissCountKey] = (prefs[promptDismissCountKey] ?: 0) + 1
        }
    }
}
