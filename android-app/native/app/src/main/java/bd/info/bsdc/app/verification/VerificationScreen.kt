package bd.info.bsdc.app.verification

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch

@Composable
fun VerificationScreen(repository: VerificationRepository) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var value by remember { mutableStateOf("") }
    var scanning by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var result by remember { mutableStateOf<VerificationResult?>(null) }
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) scanning = true else error = "Camera access was not granted. You can still enter the code manually."
    }

    fun lookup(payload: String) {
        val parsed = QrPayloadParser.parse(payload)
        if (parsed == null) { error = "That QR code is not a supported BSDC verification link or document code."; result = null; return }
        scanning = false; loading = true; error = null; result = null
        scope.launch {
            runCatching { repository.check(parsed) }
                .onSuccess { result = it }
                .onFailure { error = "BSDC verification is temporarily unavailable. Check your connection and try again." }
            loading = false
        }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 22.dp, vertical = 14.dp)) {
        if (scanning) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Scan BSDC verification QR", Modifier.weight(1f), fontWeight = FontWeight.Bold, color = Color(0xFF13251F))
                TextButton(onClick = { scanning = false }) { Text("Cancel") }
            }
            QrCameraPreview(Modifier.fillMaxWidth().weight(1f).padding(vertical = 10.dp).clip(RoundedCornerShape(22.dp)), onCode = ::lookup, onError = { error = it })
            Text("Only official HTTPS BSDC verification links are accepted.", color = Color.Gray, fontSize = 12.sp)
        } else {
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.height(14.dp)); Box(Modifier.size(76.dp).clip(RoundedCornerShape(24.dp)).background(Color(0xFFE8F5EF)), contentAlignment = Alignment.Center) { Icon(Icons.Filled.VerifiedUser, null, tint = Color(0xFF087B57), modifier = Modifier.size(40.dp)) }
                Text("Verify with confidence", Modifier.padding(top = 16.dp), fontSize = 23.sp, fontWeight = FontWeight.Bold, color = Color(0xFF13251F))
                Text("Check BSDC certificates, notices and performance report receipts.", Modifier.padding(top = 7.dp, bottom = 18.dp), color = Color.Gray, fontSize = 13.sp, lineHeight = 19.sp)
                Button(onClick = {
                    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) scanning = true
                    else cameraPermission.launch(Manifest.permission.CAMERA)
                }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(15.dp)) { Icon(Icons.Filled.QrCodeScanner, null); Spacer(Modifier.width(8.dp)); Text("Scan verification QR") }
                Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) { HorizontalDivider(Modifier.weight(1f)); Text("  OR ENTER CODE  ", color = Color.Gray, fontSize = 10.sp); HorizontalDivider(Modifier.weight(1f)) }
                OutlinedTextField(value, { value = it.take(128) }, modifier = Modifier.fillMaxWidth(), label = { Text("BSDC document code or QR URL") }, shape = RoundedCornerShape(14.dp), singleLine = true)
                OutlinedButton(onClick = { lookup(value) }, enabled = value.isNotBlank() && !loading, modifier = Modifier.fillMaxWidth().padding(top = 8.dp).height(48.dp), shape = RoundedCornerShape(14.dp)) { Text("Check registry") }
                error?.let { Text(it, Modifier.fillMaxWidth().padding(top = 12.dp), color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
                if (loading) CircularProgressIndicator(Modifier.padding(top = 16.dp).size(24.dp), strokeWidth = 2.dp)
                result?.let { VerificationResultCard(it) }
                Spacer(Modifier.height(12.dp))
                Text("The result is checked against BSDC's public verification registry. Compare every detail with the document.", color = Color.Gray, fontSize = 11.sp, lineHeight = 16.sp)
            }
        }
    }
}

@Composable
private fun VerificationResultCard(result: VerificationResult) {
    when (result) {
        VerificationResult.NotFound -> VerificationStateCard("No record found", "No finalized BSDC record matched this QR code or code.", Color(0xFFB35B28))
        is VerificationResult.Document -> {
            val verified = result.state == "valid" && result.valid
            val label = when (result.state) { "valid" -> "Record found — compare details"; "revoked" -> "Document withdrawn"; "expired" -> "Document expired"; "withdrawn" -> "Notice not current"; "malformed" -> "Code could not be validated"; else -> "No matching document" }
            Column(Modifier.fillMaxWidth().padding(top = 14.dp).clip(RoundedCornerShape(18.dp)).background(Color.White).padding(16.dp)) {
                Text(label, fontWeight = FontWeight.Bold, color = if (verified) Color(0xFF087B57) else Color(0xFFB33E45))
                Text(result.code, Modifier.padding(top = 6.dp), color = Color.Gray, fontSize = 12.sp)
                listOf("Type" to result.kind, "Name or title" to result.subject, "Details" to result.detail, "Issuer" to result.issuer, "Issued" to result.issuedOn, "Expires" to result.expiresOn).filter { !it.second.isNullOrBlank() }.forEach { (labelText, content) ->
                    Row(Modifier.fillMaxWidth().padding(top = 8.dp)) { Text(labelText, Modifier.width(100.dp), color = Color.Gray, fontSize = 12.sp); Text(content.orEmpty(), color = Color(0xFF13251F), fontSize = 12.sp) }
                }
                Text(if (verified) "A valid registry entry does not prove the paper is unchanged. Ensure printed details match." else "Do not rely on this document as current authority.", Modifier.padding(top = 10.dp), color = Color.Gray, fontSize = 11.sp)
            }
        }
        is VerificationResult.Report -> Column(Modifier.fillMaxWidth().padding(top = 14.dp).clip(RoundedCornerShape(18.dp)).background(Color.White).padding(16.dp)) {
            Text("Registered performance report", fontWeight = FontWeight.Bold, color = Color(0xFF087B57))
            Text(result.title, Modifier.padding(top = 8.dp), color = Color(0xFF13251F))
            Text("${result.app} · ${result.days} days", Modifier.padding(top = 5.dp), color = Color.Gray, fontSize = 12.sp)
            Text("Receipt ${result.receiptId}", Modifier.padding(top = 8.dp), color = Color.Gray, fontSize = 11.sp)
            Text("SHA-256 ${result.sha256}", Modifier.padding(top = 4.dp), color = Color.Gray, fontSize = 10.sp)
        }
    }
}

@Composable
private fun VerificationStateCard(title: String, body: String, color: Color) {
    Column(Modifier.fillMaxWidth().padding(top = 14.dp).clip(RoundedCornerShape(18.dp)).background(Color.White).padding(16.dp)) {
        Text(title, fontWeight = FontWeight.Bold, color = color); Text(body, Modifier.padding(top = 7.dp), color = Color.Gray, fontSize = 13.sp)
    }
}
