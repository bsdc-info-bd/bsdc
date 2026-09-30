package bd.info.bsdc.app.ui.screens

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.privacy.LegalDocument
import bd.info.bsdc.app.privacy.LegalDocuments
import bd.info.bsdc.app.ui.AuthViewModel
import bd.info.bsdc.app.ui.components.BsdcBrand

@Composable
fun AuthScreen(viewModel: AuthViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var acceptedCurrentDocuments by remember { mutableStateOf(false) }
    var openLegalDocument by remember { mutableStateOf<LegalDocument?>(null) }
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(horizontal = 24.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        BsdcBrand()
        Spacer(Modifier.height(14.dp))
        Text(
            if (state.createAccount) "Join Bangladesh’s developer community" else "Welcome back",
            style = MaterialTheme.typography.headlineSmall
        )
        Text(
            "Connect, learn, publish, and collaborate with developers in Bangladesh and around the world.",
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (state.createAccount) {
            OutlinedTextField(displayName, { displayName = it }, Modifier.fillMaxWidth(), label = { Text("Display name") }, singleLine = true)
            OutlinedTextField(username, { username = it }, Modifier.fillMaxWidth(), label = { Text("Username") }, prefix = { Text("@") }, supportingText = { Text("3–30 lowercase letters, numbers, or underscores") }, singleLine = true)
        }
        OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Email") }, singleLine = true)
        OutlinedTextField(
            password,
            { password = it },
            Modifier.fillMaxWidth(),
            label = { Text("Password") },
            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = { TextButton(onClick = { showPassword = !showPassword }) { Text(if (showPassword) "Hide" else "Show") } },
            singleLine = true
        )
        if (state.createAccount) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Checkbox(checked = acceptedCurrentDocuments, onCheckedChange = { acceptedCurrentDocuments = it }, enabled = !state.busy)
                Column(Modifier.weight(1f)) {
                    Text("I have read and accept the current BSDC Terms of Use and Privacy Notice.", style = MaterialTheme.typography.bodySmall)
                    Row {
                        TextButton(onClick = { openLegalDocument = LegalDocument.TERMS_OF_USE }, enabled = !state.busy) { Text("Terms") }
                        TextButton(onClick = { openLegalDocument = LegalDocument.PRIVACY_NOTICE }, enabled = !state.busy) { Text("Privacy") }
                    }
                }
            }
        }
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        state.message?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }
        Button(
            onClick = {
                if (state.createAccount) viewModel.signUp(email, password, displayName, username, acceptedCurrentDocuments)
                else viewModel.signIn(email, password)
            },
            enabled = !state.busy,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (state.busy) CircularProgressIndicator(modifier = Modifier.height(20.dp), strokeWidth = 2.dp)
            else Text(if (state.createAccount) "Create account" else "Sign in")
        }
        if (!state.createAccount) {
            TextButton(onClick = { viewModel.resetPassword(email) }, modifier = Modifier.fillMaxWidth()) { Text("Forgot password?") }
        }
        HorizontalDivider(Modifier.padding(vertical = 6.dp))
        Text("Or continue with a secure provider", style = MaterialTheme.typography.labelLarge)
        Text("Google uses Android Credential Manager; GitHub and Yahoo use Firebase’s secure provider browser flow.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(
            onClick = { viewModel.google(context) },
            enabled = !state.busy,
            modifier = Modifier.fillMaxWidth()
        ) { Text("Continue with Google") }
        Button(
            onClick = { context.findActivity()?.let { viewModel.provider(it, "github.com") } },
            enabled = !state.busy,
            modifier = Modifier.fillMaxWidth()
        ) { Text("Continue with GitHub") }
        Button(
            onClick = { context.findActivity()?.let { viewModel.provider(it, "yahoo.com") } },
            enabled = !state.busy,
            modifier = Modifier.fillMaxWidth()
        ) { Text("Continue with Yahoo") }
        TextButton(onClick = { viewModel.setCreateAccount(!state.createAccount) }, modifier = Modifier.fillMaxWidth()) {
            Text(if (state.createAccount) "Already have an account? Sign in" else "New to BSDC? Create an account")
        }
        Text(
            if (state.createAccount) "Account creation is available only after you explicitly accept the current documents above." else "New accounts explicitly accept the current Terms of Use and Privacy Notice before entering BSDC.",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
    openLegalDocument?.let { document ->
        LegalDocumentDialog(
            document = LegalDocuments.document(document, LegalDocuments.ENGLISH),
            onDismiss = { openLegalDocument = null }
        )
    }
}

private fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
