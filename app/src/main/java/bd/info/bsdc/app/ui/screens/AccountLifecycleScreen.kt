package bd.info.bsdc.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import bd.info.bsdc.app.model.AccountLifecycleRequest
import bd.info.bsdc.app.model.AccountLifecycleRequestState
import bd.info.bsdc.app.model.AccountLifecycleRequestType
import bd.info.bsdc.app.ui.AccountLifecycleViewModel

/** A secure request workflow, intentionally not a misleading instant export/delete button. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountLifecycleScreen(viewModel: AccountLifecycleViewModel, onBack: () -> Unit, onSignOut: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var requestedType by remember { mutableStateOf<AccountLifecycleRequestType?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Account data & deletion") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text("Verified account-data requests", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(
                "BSDC records export and erasure requests only after a recent Firebase sign-in. This protects you if an unlocked device or an old session is used without permission.",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (state.loading) {
                CircularProgressIndicator()
            } else {
                val request = state.request
                RequestStatusCard(request)
                state.message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (request == null || request.state == AccountLifecycleRequestState.CANCELLED.name) {
                    RequestActions(busy = state.busy, onRequest = { requestedType = it })
                } else if (request.state == AccountLifecycleRequestState.PENDING.name) {
                    Text(
                        "This request is pending. You can cancel it before BSDC operations acknowledges receipt.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    OutlinedButton(onClick = viewModel::cancel, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
                        Text("Cancel pending request")
                    }
                } else {
                    Text(
                        "BSDC operations has acknowledged this request. The native app does not mark exports or erasure complete because that requires verified processing across Firebase, Cloudinary, retention, and safety systems.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Text(
                "Need to make a sensitive request? Sign out, sign in again, then return here. BSDC requires that recent authentication rather than accepting a long-lived session.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            TextButton(onClick = onSignOut, enabled = !state.busy) { Text("Sign out now") }
        }
    }

    requestedType?.let { type ->
        ConfirmLifecycleRequestDialog(
            type = type,
            busy = state.busy,
            onDismiss = { requestedType = null },
            onConfirm = {
                viewModel.submit(type)
                requestedType = null
            }
        )
    }
}

@Composable
private fun RequestStatusCard(request: AccountLifecycleRequest?) = Card(
    modifier = Modifier.fillMaxWidth(),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        if (request == null) {
            Text("No active request", style = MaterialTheme.typography.titleMedium)
            Text("You can request a data export or an account-erasure review below.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            Text(request.requestType.toLifecycleLabel(), style = MaterialTheme.typography.titleMedium)
            Text(request.state.toLifecycleStateLabel(), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            request.requestedAt?.let { Text("Requested: ${it.toDate()}", style = MaterialTheme.typography.bodySmall) }
            request.acknowledgedAt?.let { Text("Acknowledged: ${it.toDate()}", style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun RequestActions(busy: Boolean, onRequest: (AccountLifecycleRequestType) -> Unit) = Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
    Button(onClick = { onRequest(AccountLifecycleRequestType.EXPORT) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
        Text("Request my BSDC data export")
    }
    OutlinedButton(onClick = { onRequest(AccountLifecycleRequestType.ERASURE) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
        Text("Request account erasure review")
    }
}

@Composable
private fun ConfirmLifecycleRequestDialog(
    type: AccountLifecycleRequestType,
    busy: Boolean,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    val (title, text, confirm) = when (type) {
        AccountLifecycleRequestType.EXPORT -> Triple(
            "Request your BSDC data export?",
            "BSDC will record a verified export request for trusted operations. This app does not create an instant download because a complete export needs reviewed processing across durable community data, messaging, media references, and retention controls.",
            "Submit export request"
        )
        AccountLifecycleRequestType.ERASURE -> Triple(
            "Request account erasure review?",
            "BSDC will record a verified erasure request for trusted operations. Do not assume the account is deleted until a reviewed lifecycle process has confirmed handling of Firebase, Cloudinary media, reports, messages, and lawful retention obligations.",
            "Submit erasure request"
        )
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { Button(onClick = onConfirm, enabled = !busy) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") } }
    )
}

private fun String.toLifecycleLabel() = when (this) {
    AccountLifecycleRequestType.EXPORT.name -> "BSDC data export request"
    AccountLifecycleRequestType.ERASURE.name -> "Account erasure review request"
    else -> "Account data request"
}

private fun String.toLifecycleStateLabel() = when (this) {
    AccountLifecycleRequestState.PENDING.name -> "Pending secure review"
    AccountLifecycleRequestState.ACKNOWLEDGED.name -> "Acknowledged by BSDC operations"
    AccountLifecycleRequestState.CANCELLED.name -> "Cancelled"
    else -> "Request status unavailable"
}
