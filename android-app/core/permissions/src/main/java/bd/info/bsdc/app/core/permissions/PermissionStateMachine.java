package bd.info.bsdc.app.core.permissions;

import bd.info.bsdc.app.core.model.DevicePermissionKind;
import bd.info.bsdc.app.core.model.PermissionGrantState;
import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Deterministic finite-state evaluator for Android 8..15 runtime permissions.
 *
 * <p>Distinguishes first-time request, rationale display, and Android 11+ double-denial
 * suppression where only App Settings can restore the capability.
 */
public final class PermissionStateMachine {

    private PermissionStateMachine() {}

    public static PermissionGrantState evaluate(
        boolean granted,
        boolean shouldShowRationale,
        boolean hasRequestedBefore
    ) {
        if (granted) {
            return PermissionGrantState.GRANTED;
        }
        if (shouldShowRationale) {
            return PermissionGrantState.SHOW_RATIONALE;
        }
        if (hasRequestedBefore) {
            return PermissionGrantState.PERMANENTLY_DENIED_OPEN_SETTINGS;
        }
        return PermissionGrantState.NEEDS_REQUEST;
    }

    public static List<String> manifestPermissionsFor(DevicePermissionKind kind, int sdkInt) {
        switch (kind) {
            case NOTIFICATIONS:
                if (sdkInt >= 33) {
                    return List.of("android.permission.POST_NOTIFICATIONS");
                }
                return Collections.emptyList();
            case LOCATION:
                return List.of(
                    "android.permission.ACCESS_COARSE_LOCATION",
                    "android.permission.ACCESS_FINE_LOCATION"
                );
            case CAMERA:
                return List.of("android.permission.CAMERA");
            case MICROPHONE:
                return List.of("android.permission.RECORD_AUDIO");
            default:
                return Collections.emptyList();
        }
    }

    public static boolean requiresRuntimePrompt(DevicePermissionKind kind, int sdkInt) {
        return !manifestPermissionsFor(kind, sdkInt).isEmpty();
    }

    public static int missingCount(Map<DevicePermissionKind, PermissionGrantState> snapshot) {
        int count = 0;
        for (DevicePermissionKind kind : DevicePermissionKind.values()) {
            if (snapshot.get(kind) != PermissionGrantState.GRANTED) {
                count += 1;
            }
        }
        return count;
    }

    public static boolean allGranted(Map<DevicePermissionKind, PermissionGrantState> snapshot) {
        return missingCount(snapshot) == 0;
    }

    public static Map<DevicePermissionKind, PermissionGrantState> initialSnapshot() {
        Map<DevicePermissionKind, PermissionGrantState> map = new EnumMap<>(DevicePermissionKind.class);
        for (DevicePermissionKind kind : DevicePermissionKind.values()) {
            map.put(kind, PermissionGrantState.NEEDS_REQUEST);
        }
        return map;
    }
}
