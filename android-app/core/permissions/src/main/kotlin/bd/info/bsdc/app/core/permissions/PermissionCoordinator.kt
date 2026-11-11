package bd.info.bsdc.app.core.permissions

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import bd.info.bsdc.app.core.model.DevicePermissionKind
import bd.info.bsdc.app.core.model.PermissionGrantState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

@Stable
class PermissionCoordinator internal constructor(
    private val context: Context,
    private val store: PermissionPreferencesStore,
    private val scope: CoroutineScope,
    private val launchSystemPrompt: (Array<String>) -> Unit,
    private val openAppSettingsAction: () -> Unit,
) {
    var states by mutableStateOf(PermissionStateMachine.initialSnapshot())
        private set

    var showSettingsFallbackDialogFor by mutableStateOf<DevicePermissionKind?>(null)
        private set

    val missingPermissions: List<DevicePermissionKind>
        get() = DevicePermissionKind.entries.filter { states[it] != PermissionGrantState.GRANTED }

    val allGranted: Boolean
        get() = missingPermissions.isEmpty()

    fun refresh() {
        scope.launch {
            val asked = store.getRequestedFlags()
            val activity = context.findActivity()
            val next = LinkedHashMap<DevicePermissionKind, PermissionGrantState>()

            for (kind in DevicePermissionKind.entries) {
                val granted = isKindGranted(kind)
                val permissions = PermissionStateMachine.manifestPermissionsFor(kind, Build.VERSION.SDK_INT)
                val rationale = if (activity != null && permissions.isNotEmpty()) {
                    permissions.any { ActivityCompat.shouldShowRequestPermissionRationale(activity, it) }
                } else {
                    false
                }
                next[kind] = PermissionStateMachine.evaluate(
                    granted = granted,
                    shouldShowRationale = rationale,
                    hasRequestedBefore = asked.contains(kind),
                )
            }
            states = next
        }
    }

    fun request(kind: DevicePermissionKind) {
        val currentState = states[kind] ?: PermissionGrantState.NEEDS_REQUEST
        if (currentState == PermissionGrantState.GRANTED) return

        val permissions = PermissionStateMachine.manifestPermissionsFor(kind, Build.VERSION.SDK_INT)
        if (permissions.isEmpty()) {
            openAppSettings()
            return
        }

        if (currentState == PermissionGrantState.PERMANENTLY_DENIED_OPEN_SETTINGS) {
            showSettingsFallbackDialogFor = kind
            return
        }

        scope.launch {
            store.markRequested(kind)
            launchSystemPrompt(permissions.toTypedArray())
        }
    }

    fun requestAllMissing() {
        val missing = missingPermissions
        if (missing.isEmpty()) return

        val raw = missing
            .flatMap { PermissionStateMachine.manifestPermissionsFor(it, Build.VERSION.SDK_INT) }
            .distinct()

        if (raw.isEmpty()) {
            val firstDenied = missing.firstOrNull()
            if (firstDenied != null) showSettingsFallbackDialogFor = firstDenied
            return
        }

        val permanentlyBlocked = missing.filter {
            states[it] == PermissionGrantState.PERMANENTLY_DENIED_OPEN_SETTINGS
        }
        if (permanentlyBlocked.size == missing.size) {
            showSettingsFallbackDialogFor = permanentlyBlocked.first()
            return
        }

        scope.launch {
            store.markRequested(*missing.toTypedArray())
            launchSystemPrompt(raw.toTypedArray())
        }
    }

    fun dismissSettingsDialog() {
        showSettingsFallbackDialogFor = null
    }

    fun openAppSettings() {
        showSettingsFallbackDialogFor = null
        openAppSettingsAction()
    }

    private fun isKindGranted(kind: DevicePermissionKind): Boolean {
        return when (kind) {
            DevicePermissionKind.NOTIFICATIONS -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    ContextCompat.checkSelfPermission(
                        context,
                        android.Manifest.permission.POST_NOTIFICATIONS,
                    ) == PackageManager.PERMISSION_GRANTED
                } else {
                    NotificationManagerCompat.from(context).areNotificationsEnabled()
                }
            }
            DevicePermissionKind.LOCATION -> {
                val fine = ContextCompat.checkSelfPermission(
                    context,
                    android.Manifest.permission.ACCESS_FINE_LOCATION,
                ) == PackageManager.PERMISSION_GRANTED
                val coarse = ContextCompat.checkSelfPermission(
                    context,
                    android.Manifest.permission.ACCESS_COARSE_LOCATION,
                ) == PackageManager.PERMISSION_GRANTED
                fine || coarse
            }
            DevicePermissionKind.CAMERA -> {
                ContextCompat.checkSelfPermission(
                    context,
                    android.Manifest.permission.CAMERA,
                ) == PackageManager.PERMISSION_GRANTED
            }
            DevicePermissionKind.MICROPHONE -> {
                ContextCompat.checkSelfPermission(
                    context,
                    android.Manifest.permission.RECORD_AUDIO,
                ) == PackageManager.PERMISSION_GRANTED
            }
        }
    }
}

@Composable
fun rememberPermissionCoordinator(): PermissionCoordinator {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val store = remember(context) { PermissionPreferencesStore(context.applicationContext) }

    var coordinatorRef by remember { mutableStateOf<PermissionCoordinator?>(null) }

    val multiLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        coordinatorRef?.refresh()
    }

    val settingsLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult(),
    ) {
        coordinatorRef?.refresh()
    }

    val coordinator = remember(context, store, scope) {
        PermissionCoordinator(
            context = context,
            store = store,
            scope = scope,
            launchSystemPrompt = { permissions -> multiLauncher.launch(permissions) },
            openAppSettingsAction = {
                val intent = Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", context.packageName, null),
                )
                settingsLauncher.launch(intent)
            },
        ).also { coordinatorRef = it }
    }

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        coordinator.refresh()
    }

    return coordinator
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
