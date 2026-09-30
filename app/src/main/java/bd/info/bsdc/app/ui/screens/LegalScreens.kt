package bd.info.bsdc.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.core.LanguagePreference
import bd.info.bsdc.app.data.LegalConsentState
import bd.info.bsdc.app.privacy.LegalDocument
import bd.info.bsdc.app.privacy.LegalDocuments
import bd.info.bsdc.app.privacy.LocalizedLegalDocument
import bd.info.bsdc.app.ui.LegalConsentViewModel

/** Full-screen authenticated gate. Access is blocked until both current versioned records exist. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LegalConsentGateScreen(
    viewModel: LegalConsentViewModel,
    initialLanguage: LanguagePreference,
    onSignOut: () -> Unit
) {
    val consent by viewModel.consent.collectAsStateWithLifecycle()
    val action by viewModel.action.collectAsStateWithLifecycle()
    var locale by remember { mutableStateOf(languageToLocale(initialLanguage)) }
    var openDocument by remember { mutableStateOf<LegalDocument?>(null) }

    when (consent) {
        LegalConsentState.Loading -> LegalLoadingScreen(onSignOut)
        LegalConsentState.Accepted -> Unit // CommunityShell replaces this composition on the next state update.
        is LegalConsentState.Unavailable -> LegalUnavailableScreen(
            message = (consent as LegalConsentState.Unavailable).message,
            onRetry = viewModel::retry,
            onSignOut = onSignOut
        )
        LegalConsentState.Required -> Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(if (locale == LegalDocuments.BANGLA) "BSDC নথি" else "BSDC documents") },
                    actions = { TextButton(onClick = onSignOut, enabled = !action.busy) { Text(if (locale == LegalDocuments.BANGLA) "সাইন আউট" else "Sign out") } }
                )
            }
        ) { padding ->
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                item("intro") {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            if (locale == LegalDocuments.BANGLA) "চালিয়ে যেতে বর্তমান নথি গ্রহণ করুন" else "Accept the current documents to continue",
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            if (locale == LegalDocuments.BANGLA) {
                                "BSDC আপনার অ্যাকাউন্টে অপরিবর্তনযোগ্য সংস্করণ ও সার্ভার সময়সহ গ্রহণের রেকর্ড রাখবে। গ্রহণ করার আগে দুটি নথিই পড়ুন।"
                            } else {
                                "BSDC will record the document versions and server time of acceptance immutably on your account. Review both documents before accepting."
                            },
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        LocaleSelector(locale = locale, onSelect = { locale = it })
                    }
                }
                items(LegalDocument.entries, key = { it.id }) { document ->
                    val details = LegalDocuments.document(document, locale)
                    DocumentSummaryCard(details = details, onOpen = { openDocument = document })
                }
                item("accept") {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        action.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                        Button(
                            onClick = { viewModel.accept(locale) },
                            enabled = !action.busy,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                if (action.busy) {
                                    if (locale == LegalDocuments.BANGLA) "রেকর্ড করা হচ্ছে…" else "Recording acceptance…"
                                } else if (locale == LegalDocuments.BANGLA) {
                                    "আমি শর্ত ও গোপনীয়তা বিজ্ঞপ্তি গ্রহণ করছি"
                                } else {
                                    "I accept the Terms and Privacy Notice"
                                }
                            )
                        }
                        Text(
                            if (locale == LegalDocuments.BANGLA) {
                                "গ্রহণ করলে দুটি বর্তমান সংস্করণের জন্য পৃথক, অপরিবর্তনযোগ্য রেকর্ড তৈরি হবে।"
                            } else {
                                "Accepting creates separate immutable records for both current document versions."
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }

    openDocument?.let { document ->
        LegalDocumentDialog(document = LegalDocuments.document(document, locale), onDismiss = { openDocument = null })
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LegalDocumentsScreen(onBack: () -> Unit) {
    var locale by remember { mutableStateOf(LegalDocuments.ENGLISH) }
    var openDocument by remember { mutableStateOf<LegalDocument?>(null) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Terms & privacy") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item("intro") {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Current BSDC documents", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "Review the versioned documents bundled with this native app. New material versions require a new acceptance before continued use.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    LocaleSelector(locale = locale, onSelect = { locale = it })
                }
            }
            items(LegalDocument.entries, key = { it.id }) { document ->
                DocumentSummaryCard(LegalDocuments.document(document, locale)) { openDocument = document }
            }
        }
    }
    openDocument?.let { LegalDocumentDialog(LegalDocuments.document(it, locale)) { openDocument = null } }
}

@Composable
private fun DocumentSummaryCard(details: LocalizedLegalDocument, onOpen: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(details.title, style = MaterialTheme.typography.titleLarge)
            Text(
                "Version ${details.document.version} · Effective ${details.effectiveDate}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(details.sections.first().body, maxLines = 3, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = onOpen) { Text("Read document") }
        }
    }
}

@Composable
private fun LocaleSelector(locale: String, onSelect: (String) -> Unit) {
    androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterChip(selected = locale == LegalDocuments.ENGLISH, onClick = { onSelect(LegalDocuments.ENGLISH) }, label = { Text("English") })
        FilterChip(selected = locale == LegalDocuments.BANGLA, onClick = { onSelect(LegalDocuments.BANGLA) }, label = { Text("বাংলা") })
    }
}

@Composable
internal fun LegalDocumentDialog(document: LocalizedLegalDocument, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text(document.title)
                Text(
                    "Version ${document.document.version} · Effective ${document.effectiveDate}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth().heightIn(max = 460.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                document.sections.forEach { section ->
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(section.heading, fontWeight = FontWeight.SemiBold)
                        Text(section.body, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } }
    )
}

@Composable
private fun LegalLoadingScreen(onSignOut: () -> Unit) = Column(
    Modifier.fillMaxSize().padding(28.dp),
    verticalArrangement = Arrangement.Center
) {
    Text("Checking BSDC documents", style = MaterialTheme.typography.headlineSmall)
    Text("BSDC is checking whether the current terms and privacy notice were accepted for this account.", color = MaterialTheme.colorScheme.onSurfaceVariant)
    TextButton(onClick = onSignOut) { Text("Sign out") }
}

@Composable
private fun LegalUnavailableScreen(message: String, onRetry: () -> Unit, onSignOut: () -> Unit) = Column(
    Modifier.fillMaxSize().padding(28.dp),
    verticalArrangement = Arrangement.Center
) {
    Text("Document check unavailable", style = MaterialTheme.typography.headlineSmall)
    Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Button(onClick = onRetry, modifier = Modifier.padding(top = 14.dp)) { Text("Retry") }
    TextButton(onClick = onSignOut) { Text("Sign out") }
}

private fun languageToLocale(language: LanguagePreference): String = when (language) {
    LanguagePreference.BANGLA -> LegalDocuments.BANGLA
    LanguagePreference.ENGLISH -> LegalDocuments.ENGLISH
}
