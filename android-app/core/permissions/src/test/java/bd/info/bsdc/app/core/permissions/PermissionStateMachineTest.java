package bd.info.bsdc.app.core.permissions;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import bd.info.bsdc.app.core.model.DevicePermissionKind;
import bd.info.bsdc.app.core.model.PermissionGrantState;
import java.util.Map;
import org.junit.Test;

public class PermissionStateMachineTest {

    @Test
    public void modelsFullDenialLifecycleThroughPermanentSettingsFallback() {
        // Fresh app install
        assertEquals(
            PermissionGrantState.NEEDS_REQUEST,
            PermissionStateMachine.evaluate(false, false, false)
        );
        // First denial -> OS marks rationale = true
        assertEquals(
            PermissionGrantState.SHOW_RATIONALE,
            PermissionStateMachine.evaluate(false, true, true)
        );
        // Second denial on Android 11+ -> OS suppresses rationale = false forever
        assertEquals(
            PermissionGrantState.PERMANENTLY_DENIED_OPEN_SETTINGS,
            PermissionStateMachine.evaluate(false, false, true)
        );
        // User enables in Settings -> returns to app -> GRANTED
        assertEquals(
            PermissionGrantState.GRANTED,
            PermissionStateMachine.evaluate(true, false, true)
        );
    }

    @Test
    public void notificationsRuntimePermissionStartsAtApi33() {
        assertTrue(
            PermissionStateMachine.manifestPermissionsFor(DevicePermissionKind.NOTIFICATIONS, 32).isEmpty()
        );
        assertEquals(
            1,
            PermissionStateMachine.manifestPermissionsFor(DevicePermissionKind.NOTIFICATIONS, 33).size()
        );
        assertFalse(
            PermissionStateMachine.manifestPermissionsFor(DevicePermissionKind.CAMERA, 26).isEmpty()
        );
        assertFalse(
            PermissionStateMachine.manifestPermissionsFor(DevicePermissionKind.MICROPHONE, 26).isEmpty()
        );
    }

    @Test
    public void countsMissingPermissionsDeterministically() {
        Map<DevicePermissionKind, PermissionGrantState> snapshot = PermissionStateMachine.initialSnapshot();
        assertEquals(4, PermissionStateMachine.missingCount(snapshot));
        assertFalse(PermissionStateMachine.allGranted(snapshot));

        for (DevicePermissionKind kind : DevicePermissionKind.values()) {
            snapshot.put(kind, PermissionGrantState.GRANTED);
        }
        assertEquals(0, PermissionStateMachine.missingCount(snapshot));
        assertTrue(PermissionStateMachine.allGranted(snapshot));
    }
}
