package bd.info.bsdc.app.feature.market

import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Everything the vendor types in the application. Saved across rotation, so a long form survives. */
internal data class MkApplyDraft(
    val fullName: String = "",
    val nid: String = "",
    val mobile: String = "",
    val shopName: String = "",
    val shopType: String = "",
    val tradeLicence: String = "",
    val addressLine: String = "",
    val lat: Double? = null,
    val lng: Double? = null,
    val placeLabel: String = "",
    val agreements: Set<String> = emptySet(),
    val packageCode: String = "",
    val paymentSender: String = "",
    val paymentHolder: String = "",
    val paymentTxn: String = "",
)

internal enum class ApplyStep { IDENTITY, SHOP, LOCATION, AGREEMENTS, PACKAGE, PAYMENT, REVIEW }

internal val MkApplyDraftSaver = listSaver<MkApplyDraft, Any>(
    save = { d ->
        listOf(
            d.fullName, d.nid, d.mobile, d.shopName, d.shopType, d.tradeLicence, d.addressLine,
            d.lat ?: Double.NaN, d.lng ?: Double.NaN, d.placeLabel,
            d.agreements.joinToString(","), d.packageCode, d.paymentSender, d.paymentHolder, d.paymentTxn,
        )
    },
    restore = { l ->
        MkApplyDraft(
            fullName = l[0] as String,
            nid = l[1] as String,
            mobile = l[2] as String,
            shopName = l[3] as String,
            shopType = l[4] as String,
            tradeLicence = l[5] as String,
            addressLine = l[6] as String,
            lat = (l[7] as Double).takeUnless { it.isNaN() },
            lng = (l[8] as Double).takeUnless { it.isNaN() },
            placeLabel = l[9] as String,
            agreements = (l[10] as String).split(",").filter { it.isNotEmpty() }.toSet(),
            packageCode = l[11] as String,
            paymentSender = l[12] as String,
            paymentHolder = l[13] as String,
            paymentTxn = l[14] as String,
        )
    },
)

/** Problems that keep a step from advancing. Same rules as mk-logic.ts stepErrors. */
internal fun applyStepProblems(step: ApplyStep, d: MkApplyDraft, bn: Boolean): List<String> {
    val out = mutableListOf<String>()
    fun add(en: String, bnText: String) = out.add(mkText(bn, en, bnText))
    if (step == ApplyStep.IDENTITY || step == ApplyStep.REVIEW) {
        if (d.fullName.trim().length < 2) add("Enter your full name as on NID.", "NID অনুযায়ী পুরো নাম লিখুন।")
        if (!MkLogic.isNid(d.nid)) add("NID must be 10, 13 or 17 digits.", "NID ১০, ১৩ বা ১৭ সংখ্যার হতে হবে।")
        if (!MkLogic.isBdMobile(d.mobile)) add("Enter a valid Bangladeshi mobile number.", "সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন।")
    }
    if (step == ApplyStep.SHOP || step == ApplyStep.REVIEW) {
        if (d.shopName.trim().length < 2) add("Enter the shop name.", "দোকানের নাম লিখুন।")
        if (d.shopType.isEmpty()) add("Choose what you sell.", "আপনি কী বিক্রি করেন তা বেছে নিন।")
        if (d.tradeLicence.trim().length > 60) add("Trade licence is too long.", "ট্রেড লাইসেন্স নম্বর অনেক লম্বা।")
    }
    if (step == ApplyStep.LOCATION || step == ApplyStep.REVIEW) {
        val lat = d.lat
        val lng = d.lng
        if (lat == null || lng == null || !MkLogic.isInsideBangladesh(lat, lng)) {
            add("Pin your shop on the map inside Bangladesh.", "ম্যাপে বাংলাদেশের ভেতরে দোকানের পিন দিন।")
        }
        if (d.addressLine.trim().length < 5) add("Enter the shop address.", "দোকানের ঠিকানা লিখুন।")
    }
    if (step == ApplyStep.AGREEMENTS || step == ApplyStep.REVIEW) {
        if (MkLogic.AGREEMENT_KEYS.any { it !in d.agreements }) {
            add("Accept every agreement to continue.", "এগোতে সব শর্ত মেনে নিন।")
        }
    }
    if (step == ApplyStep.PACKAGE || step == ApplyStep.REVIEW) {
        if (d.packageCode.isEmpty()) add("Choose an order credit package.", "একটি অর্ডার ক্রেডিট প্যাকেজ বেছে নিন।")
    }
    if (step == ApplyStep.PAYMENT || step == ApplyStep.REVIEW) {
        if (!MkLogic.isBdMobile(d.paymentSender)) {
            add("Enter the number you sent the money from.", "যে নম্বর থেকে টাকা পাঠিয়েছেন সেটি লিখুন।")
        }
        if (d.paymentHolder.trim().length < 2) add("Enter the account holder name.", "অ্যাকাউন্ট ধারকের নাম লিখুন।")
        if (!MkLogic.isTxnId(d.paymentTxn)) add("Enter the transaction ID (4 to 40 characters).", "ট্রানজেকশন আইডি লিখুন (৪ থেকে ৪০ অক্ষর)।")
    }
    return out
}

/** The bKash number, package prices and fee the vendor pays against. Shared by the application and credit purchases. */
@Composable
internal fun MkPaymentInstructionsCard(
    instructions: MkPaymentInstructionsDto,
    bn: Boolean,
    modifier: Modifier = Modifier,
) {
    BsdcCard(modifier = modifier.fillMaxWidth(), elevated = true) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Payments, contentDescription = null, tint = BsdcThemeTokens.colors.brandStrong)
            Spacer(Modifier.width(8.dp))
            Text(
                text = mkText(bn, "Pay by bKash Send Money", "bKash Send Money-তে পাঠান"),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.height(10.dp))
        Text(
            text = mkText(bn, "Send to", "পাঠান"),
            style = MaterialTheme.typography.labelMedium,
            color = BsdcThemeTokens.colors.mutedText,
        )
        Text(
            text = instructions.bikash_number.ifBlank { "—" },
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.ExtraBold,
            color = BsdcThemeTokens.colors.brandStrong,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = mkText(
                bn,
                "Include any cash-out charge. BSDC does not take a cut from your sales.",
                "ক্যাশ-আউট চার্জ সহ পাঠান। বিক্রি থেকে BSDC কোনো কমিশন নেয় না।",
            ),
            style = MaterialTheme.typography.bodySmall,
            color = BsdcThemeTokens.colors.mutedText,
        )
    }
}

/** Sender number, holder name and transaction ID, with the same checks the server applies. */
@Composable
internal fun MkPaymentProofFields(
    bn: Boolean,
    sender: String,
    holder: String,
    txn: String,
    showErrors: Boolean,
    onSender: (String) -> Unit,
    onHolder: (String) -> Unit,
    onTxn: (String) -> Unit,
) {
    val senderBad = !MkLogic.isBdMobile(sender)
    val holderBad = holder.trim().length < 2
    val txnBad = !MkLogic.isTxnId(txn)
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedTextField(
            value = sender,
            onValueChange = onSender,
            label = { Text(mkText(bn, "The number you sent from", "যে নম্বর থেকে পাঠিয়েছেন")) },
            isError = showErrors && senderBad,
            supportingText = if (showErrors && senderBad) {
                { Text(mkText(bn, "Enter a valid mobile number.", "সঠিক মোবাইল নম্বর লিখুন।")) }
            } else {
                null
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = holder,
            onValueChange = onHolder,
            label = { Text(mkText(bn, "Account holder name", "অ্যাকাউন্ট ধারকের নাম")) },
            isError = showErrors && holderBad,
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = txn,
            onValueChange = onTxn,
            label = { Text(mkText(bn, "Transaction ID", "ট্রানজেকশন আইডি")) },
            isError = showErrors && txnBad,
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/**
 * The four-part vendor application (identity, shop, location and agreements, package and payment),
 * shown as seven steps like the web. Nothing leaves the phone until the final review.
 */
@Composable
fun MkVendorApplyScreen(
    repository: MkRepository,
    bn: Boolean,
    onSubmitted: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var instructions by remember { mutableStateOf<MkPaymentInstructionsDto?>(null) }
    var draft by rememberSaveable(stateSaver = MkApplyDraftSaver) { mutableStateOf(MkApplyDraft()) }
    var stepIndex by rememberSaveable { mutableIntStateOf(0) }
    var showErrors by rememberSaveable { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        instructions = repository.fetchPaymentInstructions().getOrNull()
    }

    // Functional updates keep callbacks from the map and location code off stale state.
    val update: ((MkApplyDraft) -> MkApplyDraft) -> Unit = { change -> draft = change(draft) }
    val step = ApplyStep.entries[stepIndex]
    val problems = applyStepProblems(step, draft, bn)

    fun next() {
        showErrors = false
        error = null
        stepIndex = (stepIndex + 1).coerceAtMost(ApplyStep.entries.lastIndex)
    }

    fun back() {
        showErrors = false
        error = null
        stepIndex = (stepIndex - 1).coerceAtLeast(0)
    }

    fun submit() {
        val problemsNow = applyStepProblems(ApplyStep.REVIEW, draft, bn)
        if (problemsNow.isNotEmpty()) {
            showErrors = true
            return
        }
        val d = draft
        val payload: JsonObject = buildJsonObject {
            put("full_name", d.fullName.trim())
            put("shop_name", d.shopName.trim())
            put("nid_number", d.nid.trim())
            put("mobile", MkLogic.normaliseBdMobile(d.mobile))
            put("vendor_type", d.shopType)
            put("address_line", d.addressLine.trim())
            put("lat", d.lat ?: 0.0)
            put("lng", d.lng ?: 0.0)
            put("place_label", d.placeLabel)
            put("trade_license_no", d.tradeLicence.trim())
            put("package_code", d.packageCode)
            put(
                "agreements",
                buildJsonObject { MkLogic.AGREEMENT_KEYS.forEach { key -> put(key, key in d.agreements) } },
            )
            put("payment_sender", MkLogic.normaliseBdMobile(d.paymentSender))
            put("payment_holder", d.paymentHolder.trim())
            put("payment_txn_id", d.paymentTxn.trim())
        }
        scope.launch {
            submitting = true
            error = null
            repository.submitVendorApplication(payload)
                .onSuccess { onSubmitted() }
                .onFailure {
                    error = it.message?.takeIf { m -> m.isNotBlank() }
                        ?: mkText(bn, "Could not send your application. Try again.", "আবেদন পাঠানো যায়নি। আবার চেষ্টা করুন।")
                }
            submitting = false
        }
    }

    Column(modifier = modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(
            text = mkText(bn, "Open your shop", "আপনার দোকান খুলুন"),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = mkText(bn, "Step ${stepIndex + 1} of ${ApplyStep.entries.size}", "ধাপ ${stepIndex + 1} / ${ApplyStep.entries.size}"),
                style = MaterialTheme.typography.labelLarge,
                color = BsdcThemeTokens.colors.mutedText,
            )
            Text(
                text = stepTitle(step, bn),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
            )
        }
        LinearProgressIndicator(
            progress = { (stepIndex + 1f) / ApplyStep.entries.size },
            modifier = Modifier.fillMaxWidth(),
        )

        AnimatedContent(
            targetState = stepIndex,
            modifier = Modifier.fillMaxWidth(),
            transitionSpec = {
                if (targetState > initialState) {
                    slideInHorizontally(tween(260)) { it / 3 } + fadeIn(tween(260)) togetherWith
                        slideOutHorizontally(tween(260)) { -it / 3 } + fadeOut(tween(200))
                } else {
                    slideInHorizontally(tween(260)) { -it / 3 } + fadeIn(tween(260)) togetherWith
                        slideOutHorizontally(tween(260)) { it / 3 } + fadeOut(tween(200))
                }
            },
            label = "vendor-apply-step",
        ) { index ->
            val current = ApplyStep.entries[index]
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                when (current) {
                    ApplyStep.IDENTITY -> IdentityStep(draft, bn, showErrors, update)
                    ApplyStep.SHOP -> ShopStep(draft, bn, showErrors, update)
                    ApplyStep.LOCATION -> ApplyLocationStep(draft, bn, repository, showErrors, update)
                    ApplyStep.AGREEMENTS -> AgreementsStep(draft, bn, update)
                    ApplyStep.PACKAGE -> PackageStep(draft, bn, instructions, update)
                    ApplyStep.PAYMENT -> PaymentStep(draft, bn, instructions, showErrors, update)
                    ApplyStep.REVIEW -> ReviewStep(draft, bn, instructions)
                }
            }
        }

        if (showErrors && problems.isNotEmpty()) {
            BsdcStatusBanner(
                title = mkText(bn, "Almost there", "প্রায় হয়ে গেছে"),
                body = problems.joinToString("\n"),
                tone = BsdcTone.WARN,
            )
        }
        error?.let {
            BsdcStatusBanner(
                title = mkText(bn, "Not sent", "পাঠানো যায়নি"),
                body = it,
                tone = BsdcTone.BAD,
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            if (stepIndex > 0) {
                OutlinedButton(onClick = { back() }, enabled = !submitting, modifier = Modifier.weight(1f)) {
                    Text(mkText(bn, "Back", "পেছনে"))
                }
            }
            val isLast = step == ApplyStep.REVIEW
            Button(
                onClick = {
                    if (isLast) {
                        submit()
                    } else if (applyStepProblems(step, draft, bn).isEmpty()) {
                        next()
                    } else {
                        showErrors = true
                    }
                },
                enabled = !submitting,
                modifier = Modifier.weight(1f),
            ) {
                if (submitting) {
                    CircularProgressIndicator(modifier = Modifier.height(18.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                }
                Text(
                    if (isLast) {
                        mkText(bn, "Send application", "আবেদন পাঠান")
                    } else {
                        mkText(bn, "Continue", "এগিয়ে যান")
                    },
                )
            }
        }
    }
}

internal fun stepTitle(step: ApplyStep, bn: Boolean): String = when (step) {
    ApplyStep.IDENTITY -> mkText(bn, "You", "আপনি")
    ApplyStep.SHOP -> mkText(bn, "Shop", "দোকান")
    ApplyStep.LOCATION -> mkText(bn, "Location", "ঠিকানা")
    ApplyStep.AGREEMENTS -> mkText(bn, "Agreements", "শর্তাবলি")
    ApplyStep.PACKAGE -> mkText(bn, "Package", "প্যাকেজ")
    ApplyStep.PAYMENT -> mkText(bn, "Payment", "পেমেন্ট")
    ApplyStep.REVIEW -> mkText(bn, "Review", "যাচাই")
}

@Composable
private fun IdentityStep(
    d: MkApplyDraft,
    bn: Boolean,
    showErrors: Boolean,
    update: ((MkApplyDraft) -> MkApplyDraft) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedTextField(
            value = d.fullName,
            onValueChange = { v -> update { it.copy(fullName = v) } },
            label = { Text(mkText(bn, "Full name (as on NID)", "পুরো নাম (NID অনুযায়ী)")) },
            isError = showErrors && d.fullName.trim().length < 2,
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = d.nid,
            onValueChange = { v -> update { it.copy(nid = v.filter { ch -> ch.isDigit() }.take(17)) } },
            label = { Text(mkText(bn, "NID number", "NID নম্বর")) },
            isError = showErrors && !MkLogic.isNid(d.nid),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = d.mobile,
            onValueChange = { v -> update { it.copy(mobile = v) } },
            label = { Text(mkText(bn, "Mobile number", "মোবাইল নম্বর")) },
            isError = showErrors && !MkLogic.isBdMobile(d.mobile),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun ShopStep(
    d: MkApplyDraft,
    bn: Boolean,
    showErrors: Boolean,
    update: ((MkApplyDraft) -> MkApplyDraft) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedTextField(
            value = d.shopName,
            onValueChange = { v -> update { it.copy(shopName = v) } },
            label = { Text(mkText(bn, "Shop name", "দোকানের নাম")) },
            isError = showErrors && d.shopName.trim().length < 2,
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            text = mkText(bn, "What do you sell?", "আপনি কী বিক্রি করেন?"),
            style = MaterialTheme.typography.labelLarge,
        )
        MkLogic.SHOP_TYPES.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                row.forEach { type ->
                    FilterChip(
                        selected = d.shopType == type,
                        onClick = { update { it.copy(shopType = type) } },
                        label = {
                            Text(
                                MkLogic.shopTypeLabel(type, bn),
                                maxLines = 1,
                            )
                        },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        OutlinedTextField(
            value = d.tradeLicence,
            onValueChange = { v -> update { it.copy(tradeLicence = v.take(61)) } },
            label = { Text(mkText(bn, "Trade licence number (optional)", "ট্রেড লাইসেন্স নম্বর (ঐচ্ছিক)")) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun ApplyLocationStep(
    d: MkApplyDraft,
    bn: Boolean,
    repository: MkRepository,
    showErrors: Boolean,
    update: ((MkApplyDraft) -> MkApplyDraft) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var query by rememberSaveable { mutableStateOf("") }
    var results by remember { mutableStateOf<List<MkPlaceDto>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var locating by remember { mutableStateOf(false) }
    var locationError by remember { mutableStateOf<String?>(null) }

    // Debounced search against OpenStreetMap (Nominatim usage policy: about one request per second).
    LaunchedEffect(query) {
        if (query.trim().length < 3) {
            results = emptyList()
            return@LaunchedEffect
        }
        delay(900)
        searching = true
        results = repository.searchPlaces(query).getOrNull().orEmpty()
        searching = false
    }

    fun applyFix(pair: Pair<Double, Double>?) {
        locating = false
        if (pair == null) {
            locationError = mkText(bn, "Could not read your location. Try search or the map.", "লোকেশন পড়া যায়নি। সার্চ বা ম্যাপ ব্যবহার করুন।")
            return
        }
        if (!MkLogic.isInsideBangladesh(pair.first, pair.second)) {
            locationError = mkText(bn, "Your location is outside Bangladesh.", "আপনার লোকেশন বাংলাদেশের বাইরে।")
            return
        }
        locationError = null
        update { it.copy(lat = pair.first, lng = pair.second, placeLabel = "") }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { granted ->
        if (granted.values.any { it }) {
            locating = true
            scope.launch { applyFix(MkLocation.current(context)) }
        } else {
            locationError = mkText(bn, "Location permission is needed for the pin.", "পিন দিতে লোকেশন অনুমতি দরকার।")
        }
    }

    fun useCurrent(ctx: Context) {
        if (MkLocation.hasPermission(ctx)) {
            locating = true
            scope.launch { applyFix(MkLocation.current(ctx)) }
        } else {
            permissionLauncher.launch(MkLocation.PERMISSIONS)
        }
    }

    val pinOk = d.lat != null && d.lng != null && MkLogic.isInsideBangladesh(d.lat, d.lng)

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            label = { Text(mkText(bn, "Search a place in Bangladesh", "বাংলাদেশের জায়গা খুঁজুন")) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        if (searching) {
            Text(mkText(bn, "Searching…", "খোঁজা হচ্ছে…"), style = MaterialTheme.typography.bodySmall)
        }
        results.forEach { place ->
            val la = place.latitude
            val ln = place.longitude
            if (la != null && ln != null && MkLogic.isInsideBangladesh(la, ln)) {
                OutlinedButton(
                    onClick = {
                        update { it.copy(lat = la, lng = ln, placeLabel = place.display_name) }
                        results = emptyList()
                        query = ""
                        locationError = null
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(place.display_name, maxLines = 2, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        MkOsmPinMap(
            lat = d.lat,
            lng = d.lng,
            onPin = { la, ln ->
                if (MkLogic.isInsideBangladesh(la, ln)) {
                    locationError = null
                    update { it.copy(lat = la, lng = ln, placeLabel = "") }
                } else {
                    locationError = mkText(bn, "The pin must be inside Bangladesh.", "পিন বাংলাদেশের ভেতরে হতে হবে।")
                }
            },
        )
        Text(
            text = mkText(
                bn,
                "Tap the map or drag the pin to mark the shop exactly.",
                "ম্যাপে ট্যাপ করুন বা পিন টেনে দোকানের সঠিক জায়গা ঠিক করুন।",
            ),
            style = MaterialTheme.typography.bodySmall,
            color = BsdcThemeTokens.colors.mutedText,
        )
        OutlinedButton(
            onClick = { useCurrent(context) },
            enabled = !locating,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(Icons.Rounded.LocationOn, contentDescription = null)
            Spacer(Modifier.width(6.dp))
            Text(
                if (locating) {
                    mkText(bn, "Finding you…", "খোঁজা হচ্ছে…")
                } else {
                    mkText(bn, "Use my current location", "আমার বর্তমান লোকেশন ব্যবহার করুন")
                },
            )
        }
        if (pinOk) {
            BsdcBadge(label = mkText(bn, "Pin set", "পিন দেওয়া হয়েছে"), tone = BsdcTone.OK)
        } else if (showErrors) {
            BsdcBadge(label = mkText(bn, "Pin needed", "পিন দরকার"), tone = BsdcTone.WARN)
        }
        locationError?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
        if (d.placeLabel.isNotBlank()) {
            Text(d.placeLabel, style = MaterialTheme.typography.bodySmall, color = BsdcThemeTokens.colors.mutedText)
        }
        OutlinedTextField(
            value = d.addressLine,
            onValueChange = { v -> update { it.copy(addressLine = v) } },
            label = { Text(mkText(bn, "Shop address", "দোকানের ঠিকানা")) },
            isError = showErrors && d.addressLine.trim().length < 5,
            modifier = Modifier.fillMaxWidth(),
            minLines = 2,
        )
    }
}

@Composable
private fun AgreementsStep(
    d: MkApplyDraft,
    bn: Boolean,
    update: ((MkApplyDraft) -> MkApplyDraft) -> Unit,
) {
    val labels = mapOf(
        "terms" to mkText(bn, "I accept the BSDC marketplace terms of service", "আমি BSDC মার্কেটপ্লেসের সেবার শর্ত মেনে নিচ্ছি"),
        "privacy" to mkText(bn, "I accept the privacy policy and consent to my details being checked", "আমি গোপনীয়তা নীতি মেনে নিচ্ছি এবং আমার তথ্য যাচাইয়ে সম্মতি দিচ্ছি"),
        "vendor_policy" to mkText(bn, "I accept the vendor policy: genuine products, honest prices, on-time handling", "আমি বিক্রেতা নীতি মানছি: আসল পণ্য, সৎ দাম, সময়মতো প্রস্তুতি"),
        "cod_policy" to mkText(bn, "I understand orders are cash on delivery only", "আমি বুঝি অর্ডার শুধু ক্যাশ অন ডেলিভারিতে হয়"),
        "self_delivery" to mkText(bn, "I understand BSDC does not deliver. I deliver my own orders", "আমি বুঝি BSDC ডেলিভারি করে না। আমি নিজেই অর্ডার পৌঁছে দিই"),
        "accuracy" to mkText(bn, "Everything I have entered is true and I will keep it up to date", "আমার দেওয়া সব তথ্য সত্য এবং আমি তা হালনাগাদ রাখব"),
    )
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = mkText(bn, "Please read and accept every agreement", "প্রতিটি শর্ত পড়ে সম্মত হন"),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
        )
        MkLogic.AGREEMENT_KEYS.forEach { key ->
            val checked = key in d.agreements
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        update { draft ->
                            draft.copy(
                                agreements = if (checked) draft.agreements - key else draft.agreements + key,
                            )
                        }
                    }
                    .padding(vertical = 4.dp),
            ) {
                Checkbox(checked = checked, onCheckedChange = null)
                Spacer(Modifier.width(6.dp))
                Text(labels[key].orEmpty(), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun PackageStep(
    d: MkApplyDraft,
    bn: Boolean,
    instructions: MkPaymentInstructionsDto?,
    update: ((MkApplyDraft) -> MkApplyDraft) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = mkText(bn, "Choose an order credit package", "একটি অর্ডার ক্রেডিট প্যাকেজ বেছে নিন"),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = mkText(
                bn,
                "Each accepted order uses one credit. Declined orders use none.",
                "গৃহীত প্রতিটি অর্ডারে একটি ক্রেডিট লাগে। বাতিল অর্ডারে লাগে না।",
            ),
            style = MaterialTheme.typography.bodySmall,
            color = BsdcThemeTokens.colors.mutedText,
        )
        val packages = instructions?.packages.orEmpty()
        if (instructions == null) {
            CircularProgressIndicator(modifier = Modifier.height(24.dp))
        }
        packages.forEach { pkg ->
            val selected = d.packageCode == pkg.code
            BsdcCard(
                modifier = Modifier.fillMaxWidth(),
                elevated = selected,
                onClick = { update { it.copy(packageCode = pkg.code) } },
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = selected, onClick = null)
                    Spacer(Modifier.width(6.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            mkText(bn, "${pkg.orders} orders", "${pkg.orders}টি অর্ডার"),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    MkPrice(poisha = pkg.price_poisha, bn = bn)
                }
            }
        }
    }
}

@Composable
private fun PaymentStep(
    d: MkApplyDraft,
    bn: Boolean,
    instructions: MkPaymentInstructionsDto?,
    showErrors: Boolean,
    update: ((MkApplyDraft) -> MkApplyDraft) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (instructions != null) {
            MkPaymentInstructionsCard(instructions = instructions, bn = bn)
        }
        Text(
            text = mkText(
                bn,
                "After you send the money, enter the number you sent from, the account holder name and the transaction ID.",
                "টাকা পাঠানোর পর যে নম্বর থেকে পাঠিয়েছেন, অ্যাকাউন্ট ধারকের নাম ও ট্রানজেকশন আইডি লিখুন।",
            ),
            style = MaterialTheme.typography.bodySmall,
            color = BsdcThemeTokens.colors.mutedText,
        )
        MkPaymentProofFields(
            bn = bn,
            sender = d.paymentSender,
            holder = d.paymentHolder,
            txn = d.paymentTxn,
            showErrors = showErrors,
            onSender = { v -> update { it.copy(paymentSender = v) } },
            onHolder = { v -> update { it.copy(paymentHolder = v) } },
            onTxn = { v -> update { it.copy(paymentTxn = v) } },
        )
    }
}

@Composable
private fun ReviewStep(d: MkApplyDraft, bn: Boolean, instructions: MkPaymentInstructionsDto?) {
    val pkg = instructions?.packages?.firstOrNull { it.code == d.packageCode }
    BsdcCard(modifier = Modifier.fillMaxWidth(), elevated = true) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = BsdcThemeTokens.colors.brandStrong)
            Spacer(Modifier.width(8.dp))
            Text(
                text = mkText(bn, "Check everything before you send", "পাঠানোর আগে সব দেখে নিন"),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.height(10.dp))
        ReviewRow(mkText(bn, "Name", "নাম"), d.fullName)
        ReviewRow(mkText(bn, "NID", "NID"), d.nid)
        ReviewRow(mkText(bn, "Mobile", "মোবাইল"), d.mobile)
        ReviewRow(mkText(bn, "Shop", "দোকান"), d.shopName)
        ReviewRow(mkText(bn, "Sells", "বিক্রি"), if (d.shopType.isEmpty()) "" else MkLogic.shopTypeLabel(d.shopType, bn))
        ReviewRow(mkText(bn, "Address", "ঠিকানা"), d.addressLine)
        ReviewRow(mkText(bn, "Pin", "পিন"), if (d.lat != null && d.lng != null) "${"%.5f".format(d.lat)}, ${"%.5f".format(d.lng)}" else "")
        ReviewRow(mkText(bn, "Package", "প্যাকেজ"), pkg?.let { "${it.orders} orders" }.orEmpty())
        ReviewRow(mkText(bn, "Sent from", "যে নম্বর থেকে"), d.paymentSender)
        ReviewRow(mkText(bn, "Transaction", "ট্রানজেকশন"), d.paymentTxn)
    }
    Text(
        text = mkText(
            bn,
            "An admin reviews your payment before your shop goes live. You will see the status here.",
            "আপনার শপ চালু হওয়ার আগে অ্যাডমিন পেমেন্ট যাচাই করবেন। এখানে অবস্থা দেখতে পাবেন।",
        ),
        style = MaterialTheme.typography.bodySmall,
        color = BsdcThemeTokens.colors.mutedText,
    )
}

@Composable
private fun ReviewRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = BsdcThemeTokens.colors.mutedText, modifier = Modifier.width(96.dp))
        Text(value.ifBlank { "—" }, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
    }
}
