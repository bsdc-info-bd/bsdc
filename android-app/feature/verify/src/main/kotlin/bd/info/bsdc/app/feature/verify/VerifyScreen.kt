package bd.info.bsdc.app.feature.verify

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Campaign
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material3.AssistChip
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.common.DocCodeChecksum
import bd.info.bsdc.app.core.common.PdfSha256Verifier
import bd.info.bsdc.app.core.database.VerificationHistoryEntity
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.BsdcHosts
import bd.info.bsdc.app.core.model.ParsedDocCode
import bd.info.bsdc.app.core.model.VerificationResult
import bd.info.bsdc.app.core.model.VerificationState
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.launch

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun VerifyHubScreen(
    repository: VerifyRepository,
    viewerUid: String?,
    language: AppLanguage,
    initialRoutePath: String?,
    onSignInRequired: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val history by repository.observeHistory().collectAsState(initial = emptyList())

    var activeSection by rememberSaveable { mutableStateOf(VerifySection.DOCUMENT) }
    var docInput by rememberSaveable { mutableStateOf("") }
    var docBusy by remember { mutableStateOf(false) }
    var docError by remember { mutableStateOf<String?>(null) }
    var docResult by remember { mutableStateOf<VerificationResult?>(null) }

    var reportIdInput by rememberSaveable { mutableStateOf("") }
    var reportBusy by remember { mutableStateOf(false) }
    var reportError by remember { mutableStateOf<String?>(null) }
    var reportResult by remember { mutableStateOf<VerifiedReport?>(null) }
    var pdfCheckStatus by remember { mutableStateOf(PdfCheckStatus.IDLE) }
    var pdfError by remember { mutableStateOf<String?>(null) }

    var notices by remember { mutableStateOf<List<PublicNoticeRow>>(emptyList()) }
    var noticesBusy by remember { mutableStateOf(false) }
    var noticesError by remember { mutableStateOf<String?>(null) }
    var ackMessage by remember { mutableStateOf<String?>(null) }

    fun runDocVerify(raw: String) {
        val parsed = VerificationInputEngine.classifyInput(raw)
        if (parsed.kind == VerificationInputEngine.InputKind.REPORT_RECEIPT) {
            reportIdInput = parsed.normalizedValue
            activeSection = VerifySection.REPORT_PDF
            scope.launch {
                reportBusy = true
                reportError = null
                repository.verifyPerformanceReport(parsed.normalizedValue)
                    .onSuccess { report ->
                        reportResult = report
                        pdfCheckStatus = PdfCheckStatus.IDLE
                        if (report == null) {
                            reportError = if (bn) {
                                "এই রসিদ আইডির কোনো চূড়ান্ত রিপোর্ট নিবন্ধিত নেই।"
                            } else {
                                "No finalized report is registered for this receipt ID."
                            }
                        }
                    }
                    .onFailure { err -> reportError = err.localizedMessage ?: "Failed to check report" }
                reportBusy = false
            }
            return
        }
        val codeToVerify = if (parsed.kind == VerificationInputEngine.InputKind.DOC_CODE) {
            parsed.normalizedValue
        } else {
            raw.trim()
        }
        docInput = codeToVerify
        activeSection = VerifySection.DOCUMENT
        scope.launch {
            docBusy = true
            docError = null
            repository.verifyDocumentCode(codeToVerify)
                .onSuccess { docResult = it }
                .onFailure { err -> docError = err.localizedMessage ?: "Verification request failed" }
            docBusy = false
        }
    }

    fun runReportVerify(rawId: String) {
        scope.launch {
            reportBusy = true
            reportError = null
            reportResult = null
            pdfCheckStatus = PdfCheckStatus.IDLE
            repository.verifyPerformanceReport(rawId)
                .onSuccess { rep ->
                    reportResult = rep
                    if (rep == null) {
                        reportError = if (bn) {
                            "এই লিংকে কোনো চূড়ান্ত রিপোর্ট পাওয়া যায়নি।"
                        } else {
                            "No finalized report is registered for this link."
                        }
                    }
                }
                .onFailure { err -> reportError = err.localizedMessage ?: "Failed to check report" }
            reportBusy = false
        }
    }

    fun refreshNotices() {
        scope.launch {
            noticesBusy = true
            noticesError = null
            repository.fetchNoticeFeed(50)
                .onSuccess { notices = it }
                .onFailure { err -> noticesError = err.localizedMessage ?: "Failed to load notices" }
            noticesBusy = false
        }
    }

    LaunchedEffect(initialRoutePath) {
        val route = initialRoutePath?.trim().orEmpty()
        if (route.isNotEmpty() && route != "/verify") {
            val classified = VerificationInputEngine.classifyInput(route)
            when (classified.kind) {
                VerificationInputEngine.InputKind.DOC_CODE -> runDocVerify(classified.normalizedValue)
                VerificationInputEngine.InputKind.REPORT_RECEIPT -> {
                    reportIdInput = classified.normalizedValue
                    activeSection = VerifySection.REPORT_PDF
                    runReportVerify(classified.normalizedValue)
                }
                VerificationInputEngine.InputKind.UNRECOGNIZED -> Unit
            }
        }
    }

    LaunchedEffect(activeSection) {
        if (activeSection == VerifySection.NOTICES && notices.isEmpty()) {
            refreshNotices()
        }
    }

    val pdfPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri: Uri? ->
        val expected = reportResult?.sha256.orEmpty()
        if (uri == null || expected.isBlank()) return@rememberLauncherForActivityResult
        scope.launch {
            pdfCheckStatus = PdfCheckStatus.CHECKING
            pdfError = null
            repository.verifyPdfStream(context, uri, expected)
                .onSuccess { matched ->
                    pdfCheckStatus = if (matched) PdfCheckStatus.MATCH else PdfCheckStatus.MISMATCH
                }
                .onFailure { err ->
                    pdfCheckStatus = PdfCheckStatus.ERROR
                    pdfError = err.localizedMessage ?: "Could not read PDF file."
                }
        }
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            BsdcCard {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.VerifiedUser,
                            contentDescription = null,
                            tint = BsdcThemeTokens.colors.brandStrong,
                        )
                        Column {
                            Text(
                                text = if (bn) "BSDC নথি যাচাইকরণ কেন্দ্র" else "BSDC Verification Hub",
                                style = MaterialTheme.typography.titleLarge,
                            )
                            Text(
                                text = if (bn) {
                                    "সার্টিফিকেট, অফিশিয়াল নোটিশ, স্টাফ আইডি ও PDF রিপোর্ট — কোনো লগইন ছাড়াই যাচাই করুন।"
                                } else {
                                    "Verify certificates, official notices, staff ID cards, and report PDFs — no sign-in required."
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        VerifySection.entries.forEach { sec ->
                            val label = when (sec) {
                                VerifySection.DOCUMENT -> if (bn) "কোড যাচাই" else "Verify Code"
                                VerifySection.QR_SCAN -> if (bn) "QR স্ক্যান" else "Scan QR"
                                VerifySection.REPORT_PDF -> if (bn) "রিপোর্ট PDF" else "Report PDF"
                                VerifySection.NOTICES -> if (bn) "নোটিশ বোর্ড" else "Notices"
                                VerifySection.HISTORY -> if (bn) "ইতিহাস" else "History"
                            }
                            FilterChip(
                                selected = activeSection == sec,
                                onClick = { activeSection = sec },
                                label = { Text(label) },
                            )
                        }
                    }
                }
            }
        }

        when (activeSection) {
            VerifySection.DOCUMENT -> {
                item {
                    val liveParsed = DocCodeChecksum.parseDocCode(docInput)
                    BsdcCard {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            OutlinedTextField(
                                value = docInput,
                                onValueChange = { docInput = it },
                                label = {
                                    Text(if (bn) "নথি কোড (যেমন BSDC-CT-4A7C21B9-6)" else "Document code (e.g. BSDC-CT-4A7C21B9-6)")
                                },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            if (docInput.isNotBlank()) {
                                val hintText = when (liveParsed) {
                                    is ParsedDocCode.Valid -> if (bn) {
                                        "সনাক্তকৃত ধরন: ${VerificationInputEngine.docKindLabel(liveParsed.kind.code, true)} • চেক-ডিজিট সঠিক"
                                    } else {
                                        "Reads as ${VerificationInputEngine.docKindLabel(liveParsed.kind.code, false)} • Check digit valid"
                                    }
                                    is ParsedDocCode.Invalid -> liveParsed.reason
                                }
                                Text(
                                    text = hintText,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (liveParsed is ParsedDocCode.Valid) {
                                        BsdcThemeTokens.colors.ok
                                    } else {
                                        MaterialTheme.colorScheme.onSurfaceVariant
                                    },
                                )
                            }
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                BsdcButton(
                                    label = if (docBusy) {
                                        if (bn) "যাচাই হচ্ছে..." else "Checking..."
                                    } else {
                                        if (bn) "যাচাই করুন" else "Verify Code"
                                    },
                                    onClick = { runDocVerify(docInput) },
                                    enabled = !docBusy && docInput.isNotBlank(),
                                    modifier = Modifier.weight(1f),
                                )
                                OutlinedButton(
                                    onClick = { activeSection = VerifySection.QR_SCAN },
                                ) {
                                    Icon(Icons.Rounded.QrCodeScanner, contentDescription = null)
                                    Spacer(modifier = Modifier.size(6.dp))
                                    Text(if (bn) "QR স্ক্যান" else "Scan QR")
                                }
                            }
                        }
                    }
                }

                if (docBusy) {
                    item { LinearProgressIndicator(modifier = Modifier.fillMaxWidth()) }
                }
                if (!docError.isNullOrBlank()) {
                    item {
                        BsdcStatusBanner(
                            title = if (bn) "যাচাই ব্যর্থ হয়েছে" else "Verification error",
                            body = docError.orEmpty(),
                            tone = BsdcTone.BAD,
                        )
                    }
                }
                docResult?.let { result ->
                    item {
                        VerificationResultCard(
                            result = result,
                            language = language,
                            onShare = {
                                val url = DocCodeChecksum.verificationUrl(BsdcHosts.VF_ORIGIN, result.code)
                                val sendIntent = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, url)
                                }
                                context.startActivity(Intent.createChooser(sendIntent, result.code))
                            },
                        )
                    }
                }
                if (history.isNotEmpty()) {
                    item {
                        BsdcCard {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Text(
                                    text = if (bn) "সাম্প্রতিক যাচাইকৃত" else "Recently checked on device",
                                    style = MaterialTheme.typography.labelLarge,
                                )
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    history.take(6).forEach { entry ->
                                        AssistChip(
                                            onClick = {
                                                if (entry.kind == "RP") {
                                                    reportIdInput = entry.code
                                                    activeSection = VerifySection.REPORT_PDF
                                                    runReportVerify(entry.code)
                                                } else {
                                                    runDocVerify(entry.code)
                                                }
                                            },
                                            label = { Text(DocCodeChecksum.formatDocCode(entry.code)) },
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            VerifySection.QR_SCAN -> {
                item {
                    QrCameraScannerCard(
                        language = language,
                        onScannedValue = { rawQr ->
                            runDocVerify(rawQr)
                        },
                    )
                }
            }

            VerifySection.REPORT_PDF -> {
                item {
                    BsdcCard {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.PictureAsPdf,
                                    contentDescription = null,
                                    tint = BsdcThemeTokens.colors.brandStrong,
                                )
                                Text(
                                    text = if (bn) "পারফরম্যান্স রিপোর্ট ও PDF SHA-256 যাচাই" else "Performance Report & PDF SHA-256 Check",
                                    style = MaterialTheme.typography.titleMedium,
                                )
                            }
                            OutlinedTextField(
                                value = reportIdInput,
                                onValueChange = { reportIdInput = it },
                                label = {
                                    Text(if (bn) "রিপোর্ট রসিদ UUID (QR লিংক থেকে)" else "Report receipt UUID (from QR receipt)")
                                },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            BsdcButton(
                                label = if (reportBusy) {
                                    if (bn) "খোঁজা হচ্ছে..." else "Checking..."
                                } else {
                                    if (bn) "রসিদ যাচাই করুন" else "Verify Report Receipt"
                                },
                                onClick = { runReportVerify(reportIdInput) },
                                enabled = !reportBusy && PdfSha256Verifier.normaliseReportReceiptId(reportIdInput).isNotEmpty(),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }

                if (reportBusy) {
                    item { LinearProgressIndicator(modifier = Modifier.fillMaxWidth()) }
                }
                if (!reportError.isNullOrBlank()) {
                    item {
                        BsdcStatusBanner(
                            title = if (bn) "রিপোর্ট যাচাই অনুপলব্ধ" else "Report verification unavailable",
                            body = reportError.orEmpty(),
                            tone = BsdcTone.BAD,
                        )
                    }
                }
                reportResult?.let { rep ->
                    item {
                        BsdcCard {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                BsdcBadge(
                                    label = if (bn) "চূড়ান্ত নিবন্ধিত রিপোর্ট" else "FINALIZED REPORT",
                                    tone = BsdcTone.OK,
                                )
                                Text(
                                    text = rep.title.ifBlank { "${rep.app} (${rep.days}d)" },
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                Text(
                                    text = if (bn) {
                                        "অ্যাপ: ${rep.app} • সময়কাল: ${BanglaDigitFormatter.formatCount(rep.days.toLong(), language)} দিন"
                                    } else {
                                        "App: ${rep.app} • Window: ${rep.days} days"
                                    },
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                if (rep.sections.isNotEmpty()) {
                                    Text(
                                        text = if (bn) "অংশসমূহ: ${rep.sections.joinToString(", ")}" else "Sections: ${rep.sections.joinToString(", ")}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Text(
                                    text = "SHA-256: ${rep.sha256}",
                                    style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                                )
                                OutlinedButton(
                                    onClick = { pdfPicker.launch(arrayOf("application/pdf")) },
                                    modifier = Modifier.fillMaxWidth(),
                                ) {
                                    Icon(Icons.Rounded.PictureAsPdf, contentDescription = null)
                                    Spacer(modifier = Modifier.size(6.dp))
                                    Text(
                                        if (bn) "ডাউনলোডকৃত PDF ফাইল নির্বাচন করে SHA-256 মেলান" else "Select downloaded PDF to verify SHA-256",
                                    )
                                }
                                when (pdfCheckStatus) {
                                    PdfCheckStatus.IDLE -> Unit
                                    PdfCheckStatus.CHECKING -> LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                                    PdfCheckStatus.MATCH -> BsdcStatusBanner(
                                        title = if (bn) "PDF অখণ্ডতা সম্পূর্ণ মিলেছে" else "PDF integrity verified",
                                        body = if (bn) {
                                            "ফাইলটির SHA-256 রেজিস্ট্রির মূল রিপোর্টের সাথে হুবহু মিলেছে।"
                                        } else {
                                            "This PDF matches the exact finalized file checksum in the registry."
                                        },
                                        tone = BsdcTone.OK,
                                    )
                                    PdfCheckStatus.MISMATCH -> BsdcStatusBanner(
                                        title = if (bn) "সতর্কতা: PDF হ্যাশ মেলেনি!" else "Warning: PDF checksum mismatch!",
                                        body = if (bn) {
                                            "ফাইলটি মূল রিপোর্ট থেকে ভিন্ন বা সম্পাদিত হয়েছে।"
                                        } else {
                                            "The selected file does not match the registered SHA-256 digest."
                                        },
                                        tone = BsdcTone.BAD,
                                    )
                                    PdfCheckStatus.ERROR -> BsdcStatusBanner(
                                        title = if (bn) "PDF পড়া যায়নি" else "PDF read error",
                                        body = pdfError.orEmpty(),
                                        tone = BsdcTone.WARN,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            VerifySection.NOTICES -> {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(Icons.Rounded.Campaign, contentDescription = null)
                            Text(
                                text = if (bn) "অফিশিয়াল নোটিশ বোর্ড" else "Official Notice Feed",
                                style = MaterialTheme.typography.titleMedium,
                            )
                        }
                        TextButton(onClick = { refreshNotices() }) {
                            Text(if (bn) "রিফ্রেশ" else "Refresh")
                        }
                    }
                }
                if (noticesBusy) {
                    item { LinearProgressIndicator(modifier = Modifier.fillMaxWidth()) }
                }
                if (!noticesError.isNullOrBlank()) {
                    item {
                        BsdcStatusBanner(
                            title = if (bn) "নোটিশ লোড হয়নি" else "Notice load error",
                            body = noticesError.orEmpty(),
                            tone = BsdcTone.WARN,
                        )
                    }
                }
                if (!ackMessage.isNullOrBlank()) {
                    item {
                        BsdcStatusBanner(
                            title = ackMessage.orEmpty(),
                            body = "",
                            tone = BsdcTone.OK,
                        )
                    }
                }
                if (notices.isEmpty() && !noticesBusy) {
                    item {
                        BsdcEmptyState(
                            icon = Icons.Rounded.Campaign,
                            title = if (bn) "কোনো সক্রিয় নোটিশ নেই" else "No active official notices",
                            subtitle = if (bn) {
                                "প্রকাশিত অফিশিয়াল ঘোষণাগুলো এখানে দেখা যাবে।"
                            } else {
                                "Published notices from the BSDC registry appear here."
                            },
                        )
                    }
                } else {
                    items(notices, key = { it.id }) { notice ->
                        BsdcCard {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        if (notice.pinned) {
                                            BsdcBadge(label = if (bn) "পিনকৃত" else "PINNED", tone = BsdcTone.INFO)
                                        }
                                        BsdcBadge(
                                            label = notice.priority.uppercase(),
                                            tone = when (notice.priority.lowercase()) {
                                                "urgent" -> BsdcTone.BAD
                                                "important" -> BsdcTone.WARN
                                                else -> BsdcTone.NEUTRAL
                                            },
                                        )
                                    }
                                    TextButton(onClick = { runDocVerify(notice.code) }) {
                                        Text(notice.code)
                                    }
                                }
                                Text(
                                    text = notice.title,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                if (notice.summary.isNotBlank()) {
                                    Text(
                                        text = notice.summary,
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                }
                                if (notice.body.isNotBlank()) {
                                    Text(
                                        text = notice.body,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                if (notice.requiresAck) {
                                    if (notice.acknowledged) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        ) {
                                            Icon(
                                                imageVector = Icons.Rounded.CheckCircle,
                                                contentDescription = null,
                                                tint = BsdcThemeTokens.colors.ok,
                                                modifier = Modifier.size(18.dp),
                                            )
                                            Text(
                                                text = if (bn) "প্রাপ্তি নিশ্চিত করা হয়েছে" else "Acknowledged",
                                                style = MaterialTheme.typography.labelMedium,
                                                color = BsdcThemeTokens.colors.ok,
                                            )
                                        }
                                    } else {
                                        OutlinedButton(
                                            onClick = {
                                                if (viewerUid.isNullOrBlank()) {
                                                    onSignInRequired()
                                                } else {
                                                    scope.launch {
                                                        repository.acknowledgeNotice(notice.id)
                                                            .onSuccess {
                                                                notices = notices.map {
                                                                    if (it.id == notice.id) it.copy(acknowledged = true) else it
                                                                }
                                                                ackMessage = if (bn) {
                                                                    "নোটিশ প্রাপ্তি সংরক্ষিত হয়েছে"
                                                                } else {
                                                                    "Notice acknowledged"
                                                                }
                                                            }
                                                            .onFailure { err ->
                                                                noticesError = err.localizedMessage
                                                            }
                                                    }
                                                }
                                            },
                                        ) {
                                            Text(if (bn) "প্রাপ্তি নিশ্চিত করুন" else "Acknowledge Notice")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            VerifySection.HISTORY -> {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(Icons.Rounded.History, contentDescription = null)
                            Text(
                                text = if (bn) "যাচাইয়ের ইতিহাস (অফলাইন)" else "Verification History (Offline)",
                                style = MaterialTheme.typography.titleMedium,
                            )
                        }
                        if (history.isNotEmpty()) {
                            TextButton(onClick = { scope.launch { repository.clearHistory() } }) {
                                Icon(Icons.Rounded.DeleteSweep, contentDescription = null)
                                Spacer(modifier = Modifier.size(4.dp))
                                Text(if (bn) "মুছুন" else "Clear")
                            }
                        }
                    }
                }
                if (history.isEmpty()) {
                    item {
                        BsdcEmptyState(
                            icon = Icons.Rounded.History,
                            title = if (bn) "এখনো কোনো যাচাই করা হয়নি" else "No verification history yet",
                            subtitle = if (bn) {
                                "কোড বা রিপোর্ট যাচাই করলে অফলাইন রেফারেন্স হিসেবে এখানে সংরক্ষিত থাকবে।"
                            } else {
                                "Verified codes and report receipts are saved locally here for quick re-checks."
                            },
                        )
                    }
                } else {
                    items(history, key = { it.code }) { entry ->
                        HistoryRowCard(
                            entry = entry,
                            language = language,
                            onSelect = {
                                if (entry.kind == "RP") {
                                    reportIdInput = entry.code
                                    activeSection = VerifySection.REPORT_PDF
                                    runReportVerify(entry.code)
                                } else {
                                    runDocVerify(entry.code)
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun VerificationResultCard(
    result: VerificationResult,
    language: AppLanguage,
    onShare: () -> Unit,
) {
    val bn = language == AppLanguage.BN
    val tone = when (result.state) {
        VerificationState.VALID -> BsdcTone.OK
        VerificationState.EXPIRED, VerificationState.WITHDRAWN -> BsdcTone.WARN
        VerificationState.REVOKED, VerificationState.UNKNOWN, VerificationState.MALFORMED -> BsdcTone.BAD
    }
    val qrBitmap = remember(result.code) {
        if (result.code.startsWith("BSDC-")) {
            generateQrBitmap(DocCodeChecksum.verificationUrl(BsdcHosts.VF_ORIGIN, result.code))
        } else {
            null
        }
    }

    BsdcCard {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            BsdcStatusBanner(
                title = VerificationInputEngine.stateHeadline(result.state, bn),
                body = result.reason.ifBlank { VerificationInputEngine.adviceText(result.state, bn) },
                tone = tone,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = DocCodeChecksum.formatDocCode(result.code),
                        style = MaterialTheme.typography.titleMedium.copy(fontFamily = FontFamily.Monospace),
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = "${if (bn) "ধরন" else "Document"}: ${VerificationInputEngine.docKindLabel(result.kind, bn)}",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    if (result.subject.isNotBlank()) {
                        Text(
                            text = "${if (bn) "প্রাপক / শিরোনাম" else "Subject"}: ${result.subject}",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    if (result.detail.isNotBlank()) {
                        Text(
                            text = "${if (bn) "বিবরণ" else "Detail"}: ${result.detail}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    if (result.issuer.isNotBlank()) {
                        Text(
                            text = "${if (bn) "ইস্যুকারী" else "Issued by"}: ${result.issuer}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    if (!result.issuedOn.isNullOrBlank()) {
                        Text(
                            text = "${if (bn) "প্রদানের তারিখ" else "Issued on"}: ${result.issuedOn}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    if (!result.expiresOn.isNullOrBlank()) {
                        Text(
                            text = "${if (bn) "মেয়াদ" else "In force until"}: ${result.expiresOn}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    if (result.verifications > 0) {
                        val countStr = BanglaDigitFormatter.formatCount(result.verifications.toLong(), language)
                        Text(
                            text = if (bn) "মোট যাচাই হয়েছে: ${countStr} বার" else "Total registry checks: $countStr",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (qrBitmap != null) {
                    Image(
                        bitmap = qrBitmap.asImageBitmap(),
                        contentDescription = if (bn) "যাচাইকরণ QR" else "Verification QR",
                        modifier = Modifier.size(92.dp),
                    )
                }
            }

            Text(
                text = VerificationInputEngine.adviceText(result.state, bn),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (result.state == VerificationState.VALID) {
                OutlinedButton(
                    onClick = onShare,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Rounded.Share, contentDescription = null)
                    Spacer(modifier = Modifier.size(6.dp))
                    Text(if (bn) "যাচাইকৃত লিংক শেয়ার করুন" else "Share verification link")
                }
            }
        }
    }
}

@Composable
private fun HistoryRowCard(
    entry: VerificationHistoryEntity,
    language: AppLanguage,
    onSelect: () -> Unit,
) {
    val bn = language == AppLanguage.BN
    val tone = when (entry.state.uppercase()) {
        "VALID" -> BsdcTone.OK
        "EXPIRED", "WITHDRAWN" -> BsdcTone.WARN
        else -> BsdcTone.BAD
    }
    BsdcCard(modifier = Modifier.clickable(onClick = onSelect)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                imageVector = Icons.Rounded.QrCode2,
                contentDescription = null,
                tint = BsdcThemeTokens.colors.brandStrong,
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    text = DocCodeChecksum.formatDocCode(entry.code),
                    style = MaterialTheme.typography.titleSmall.copy(fontFamily = FontFamily.Monospace),
                )
                Text(
                    text = entry.subject.ifBlank { VerificationInputEngine.docKindLabel(entry.kind, bn) },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            BsdcBadge(label = entry.state, tone = tone)
        }
    }
}

private fun generateQrBitmap(content: String, sizePx: Int = 256): Bitmap? {
    return runCatching {
        val hints = mapOf(
            EncodeHintType.MARGIN to 1,
        )
        val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx, hints)
        Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888).apply {
            for (x in 0 until sizePx) {
                for (y in 0 until sizePx) {
                    setPixel(x, y, if (matrix[x, y]) AndroidColor.BLACK else AndroidColor.WHITE)
                }
            }
        }
    }.getOrNull()
}
