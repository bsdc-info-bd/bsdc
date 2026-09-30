package bd.info.bsdc.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.core.AnalyticsConsent
import bd.info.bsdc.app.core.LanguagePreference
import bd.info.bsdc.app.core.ThemePreference
import bd.info.bsdc.app.ui.SettingsViewModel

/** Native, offline-safe product controls. Analytics remains disabled until the member opts in. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    onBack: () -> Unit,
    onOpenLegal: () -> Unit,
    onOpenAccountLifecycle: () -> Unit,
    onOpenModeration: () -> Unit
) {
    val preferences by viewModel.preferences.collectAsStateWithLifecycle()
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item("appearance") {
                SettingCard("Appearance", "Choose how BSDC looks on this device.") {
                    Text("Theme", style = MaterialTheme.typography.titleSmall)
                    ChoiceRow(
                        values = listOf(
                            ThemePreference.SYSTEM to "System",
                            ThemePreference.LIGHT to "Light",
                            ThemePreference.DARK to "Dark"
                        ),
                        selected = preferences.theme,
                        onSelect = viewModel::setTheme
                    )
                    Text("Writing language", style = MaterialTheme.typography.titleSmall)
                    ChoiceRow(
                        values = listOf(
                            LanguagePreference.ENGLISH to "English",
                            LanguagePreference.BANGLA to "বাংলা"
                        ),
                        selected = preferences.language,
                        onSelect = viewModel::setLanguage
                    )
                }
            }
            item("experience") {
                SettingCard("Reading experience", "These settings apply locally and are available without a network connection.") {
                    SettingToggle(
                        title = "Reduce motion",
                        description = "Avoid non-essential interface movement where BSDC provides it.",
                        checked = preferences.reduceMotion,
                        onCheckedChange = viewModel::setReduceMotion
                    )
                    SettingToggle(
                        title = "Ranked community feed",
                        description = "Use BSDC’s transparent local ranking and diversity ordering. Turn off to view server order.",
                        checked = preferences.useRankedFeed,
                        onCheckedChange = viewModel::setRankedFeed
                    )
                }
            }
            item("analytics") {
                SettingCard("Diagnostics and analytics", "Optional product analytics helps BSDC understand feature reliability. It does not grant staff access or override your Firebase privacy controls.") {
                    val enabled = preferences.analyticsConsent == AnalyticsConsent.GRANTED
                    Text(
                        if (enabled) "Analytics collection is enabled on this device." else "Analytics collection is disabled on this device.",
                        style = MaterialTheme.typography.titleSmall
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = enabled,
                            onClick = { viewModel.setAnalyticsConsent(AnalyticsConsent.GRANTED) },
                            label = { Text("Allow analytics") }
                        )
                        FilterChip(
                            selected = preferences.analyticsConsent == AnalyticsConsent.DENIED,
                            onClick = { viewModel.setAnalyticsConsent(AnalyticsConsent.DENIED) },
                            label = { Text("Keep analytics off") }
                        )
                    }
                    Text(
                        "You can change this choice at any time. Collection is disabled by default before you choose.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            item("legal") {
                SettingCard("Terms & privacy", "Review the versioned BSDC Terms of Use and Privacy Notice accepted for this account.") {
                    TextButton(onClick = onOpenLegal) { Text("Review current documents") }
                    Text(
                        "Material document changes require a new acceptance before community access continues.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            item("account-lifecycle") {
                SettingCard("Account data & deletion", "Submit a verified request for your BSDC data or account-erasure review. BSDC requires a recent sign-in and does not claim instant deletion.") {
                    TextButton(onClick = onOpenAccountLifecycle) { Text("Manage data requests") }
                }
            }
            item("moderation") {
                SettingCard("Trust & safety", "Report posts from their discussion page. The staff workspace is protected by trusted Firebase admin or moderator claims.") {
                    TextButton(onClick = onOpenModeration) { Text("Open moderation workspace") }
                }
            }
        }
    }
}

@Composable
private fun SettingCard(title: String, description: String, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            content()
        }
    }
}

@Composable
private fun <T> ChoiceRow(
    values: List<Pair<T, String>>,
    selected: T,
    onSelect: (T) -> Unit
) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        values.forEach { (value, text) ->
            FilterChip(selected = selected == value, onClick = { onSelect(value) }, label = { Text(text) })
        }
    }
}

@Composable
private fun SettingToggle(title: String, description: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}
