package bd.info.bsdc.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.AppPreferences
import bd.info.bsdc.app.model.UserProfile

/**
 * Each control has a separate disclosure and local consent switch. Contact selection uses
 * Android's one-contact picker and only reads the selected recipient to prepare an external invite;
 * it never uploads or persists an address book. City labels are reviewed before saving, and camera
 * capture is limited to profile photos.
 */
@Composable
internal fun PrivacyAndPersonalizationCard(
    profile: UserProfile,
    preferences: AppPreferences,
    busy: Boolean,
    onTakeCameraPhoto: () -> Unit,
    onStopCamera: () -> Unit,
    onRemoveProfilePhoto: () -> Unit,
    onSuggestCity: () -> Unit,
    onStopLocation: () -> Unit,
    onInviteContact: () -> Unit,
    onStopContactInvite: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text("Optional privacy controls", style = MaterialTheme.typography.titleMedium)
            Text(
                "Each tool is off until you choose it. BSDC does not request these permissions when the app opens.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Text("Camera profile photo", style = MaterialTheme.typography.labelLarge)
            Text(
                "Capture a new public profile photo. The temporary capture stays in app cache until it is uploaded after you choose to use it.",
                style = MaterialTheme.typography.bodySmall
            )
            OutlinedButton(onClick = onTakeCameraPhoto, enabled = !busy) { Text("Take a profile photo") }
            if (preferences.cameraProfilePhotoConsent) {
                TextButton(onClick = onStopCamera, enabled = !busy) { Text("Stop using camera") }
            }
            if (profile.photoUrl != null) {
                TextButton(onClick = onRemoveProfilePhoto, enabled = !busy) { Text("Remove public profile photo") }
            }

            Text("Approximate city", style = MaterialTheme.typography.labelLarge)
            Text(
                "Use Android’s approximate location once to suggest a city for your public profile. Coordinates are never stored or sent to BSDC.",
                style = MaterialTheme.typography.bodySmall
            )
            OutlinedButton(onClick = onSuggestCity, enabled = !busy) { Text("Suggest my city") }
            if (preferences.approximateLocationConsent || profile.locationLabel != null) {
                TextButton(onClick = onStopLocation, enabled = !busy) { Text("Stop and remove public city") }
            }

            Text("Invite one contact", style = MaterialTheme.typography.labelLarge)
            Text(
                "Choose one contact to prepare an email or SMS invite. BSDC reads only that recipient to create the external draft and never uploads or saves contact data.",
                style = MaterialTheme.typography.bodySmall
            )
            OutlinedButton(onClick = onInviteContact, enabled = !busy) { Text("Choose a contact to invite") }
            if (preferences.contactInviteConsent) {
                TextButton(onClick = onStopContactInvite, enabled = !busy) { Text("Stop contact invites") }
            }
        }
    }
}
