package bd.info.bsdc.app.feature.market

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import bd.info.bsdc.app.core.model.MediaPurpose
import coil3.ImageLoader
import kotlinx.coroutines.launch

/**
 * Shop profile (logo, cover, description, mobile), order credits and credit purchase history.
 * Credits are added only after an admin approves the bKash payment, so the screen says so.
 */
@Composable
fun MkVendorShopPanel(
    repository: MkRepository,
    mediaRepository: BsdcMediaRepository,
    imageLoader: ImageLoader,
    bn: Boolean,
    vendor: MkVendorShopDto?,
    credits: Int,
    listed: Boolean,
    purchases: List<MkPurchaseDto>,
    onChanged: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        DeliveryAndScheduleCard(repository, bn, onChanged)
        ProfileCard(repository, mediaRepository, imageLoader, bn, vendor, onChanged)
        CreditsCard(repository, bn, credits, listed, onChanged)
        PurchasesCard(bn, purchases)
    }
}

@Composable
private fun ProfileCard(
    repository: MkRepository,
    mediaRepository: BsdcMediaRepository,
    imageLoader: ImageLoader,
    bn: Boolean,
    vendor: MkVendorShopDto?,
    onChanged: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var description by rememberSaveable(vendor?.slug) { mutableStateOf(vendor?.description.orEmpty()) }
    var mobile by rememberSaveable(vendor?.slug) { mutableStateOf(vendor?.mobile.orEmpty()) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var failed by remember { mutableStateOf<String?>(null) }

    fun report(error: Throwable?, okText: String?) {
        failed = error?.let { it.message?.takeIf { m -> m.isNotBlank() } ?: mkText(bn, "Could not save.", "সংরক্ষণ করা যায়নি।") }
        message = if (error == null) okText else null
    }

    val logoPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            runCatching { mediaRepository.uploadImageUri(uri, MediaPurpose.AVATAR) }
                .mapCatching { result -> repository.updateVendorProfile(logoUrl = result.url).getOrThrow() }
                .onSuccess {
                    report(null, mkText(bn, "Logo updated.", "লোগো হালনাগাদ হয়েছে।"))
                    onChanged()
                }
                .onFailure { report(it, null) }
            busy = false
        }
    }
    val coverPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            runCatching { mediaRepository.uploadImageUri(uri, MediaPurpose.COVER) }
                .mapCatching { result -> repository.updateVendorProfile(coverUrl = result.url).getOrThrow() }
                .onSuccess {
                    report(null, mkText(bn, "Cover updated.", "কভার হালনাগাদ হয়েছে।"))
                    onChanged()
                }
                .onFailure { report(it, null) }
            busy = false
        }
    }

    BsdcCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            mkText(bn, "Shop profile", "দোকানের প্রোফাইল"),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(10.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(120.dp)
                .clip(RoundedCornerShape(14.dp)),
        ) {
            val cover = vendor?.cover_url.orEmpty()
            if (cover.isNotBlank()) {
                MkImage(url = cover, contentDescription = null, imageLoader = imageLoader, modifier = Modifier.fillMaxWidth().height(120.dp), contentScale = ContentScale.Crop)
            } else {
                Box(
                    modifier = Modifier.fillMaxWidth().height(120.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(mkText(bn, "No cover photo", "কভার ছবি নেই"), color = BsdcThemeTokens.colors.mutedText)
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(modifier = Modifier.size(72.dp).clip(RoundedCornerShape(16.dp))) {
                val logo = vendor?.logo_url.orEmpty()
                if (logo.isNotBlank()) {
                    MkImage(url = logo, contentDescription = null, imageLoader = imageLoader, modifier = Modifier.size(72.dp))
                } else {
                    Box(modifier = Modifier.size(72.dp), contentAlignment = Alignment.Center) {
                        Icon(Icons.Rounded.Storefront, contentDescription = null, tint = BsdcThemeTokens.colors.mutedText)
                    }
                }
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(onClick = { logoPicker.launch("image/*") }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Rounded.CameraAlt, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(mkText(bn, "Change logo", "লোগো বদলান"))
                }
                OutlinedButton(onClick = { coverPicker.launch("image/*") }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Rounded.CameraAlt, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(mkText(bn, "Change cover", "কভার বদলান"))
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = description,
            onValueChange = { description = it.take(1000) },
            label = { Text(mkText(bn, "About your shop", "আপনার দোকান সম্পর্কে")) },
            minLines = 3,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = mobile,
            onValueChange = { mobile = it },
            label = { Text(mkText(bn, "Contact mobile", "যোগাযোগের মোবাইল")) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            isError = mobile.isNotBlank() && !MkLogic.isBdMobile(mobile),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(10.dp))
        Button(
            onClick = {
                if (mobile.isNotBlank() && !MkLogic.isBdMobile(mobile)) {
                    failed = mkText(bn, "Enter a valid mobile number.", "সঠিক মোবাইল নম্বর লিখুন।")
                    return@Button
                }
                scope.launch {
                    busy = true
                    val normalised = if (mobile.isBlank()) null else MkLogic.normaliseBdMobile(mobile)
                    repository.updateVendorProfile(description = description.trim(), mobile = normalised)
                        .onSuccess {
                            report(null, mkText(bn, "Profile saved.", "প্রোফাইল সংরক্ষিত হয়েছে।"))
                            onChanged()
                        }
                        .onFailure { report(it, null) }
                    busy = false
                }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (busy) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
            }
            Text(mkText(bn, "Save profile", "প্রোফাইল সংরক্ষণ করুন"))
        }
        message?.let {
            Spacer(Modifier.height(8.dp))
            BsdcStatusBanner(title = mkText(bn, "Saved", "সংরক্ষিত"), body = it, tone = BsdcTone.OK)
        }
        failed?.let {
            Spacer(Modifier.height(8.dp))
            BsdcStatusBanner(title = mkText(bn, "Not saved", "সংরক্ষণ হয়নি"), body = it, tone = BsdcTone.BAD)
        }
    }
}

@Composable
private fun CreditsCard(
    repository: MkRepository,
    bn: Boolean,
    credits: Int,
    listed: Boolean,
    onChanged: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var instructions by remember { mutableStateOf<MkPaymentInstructionsDto?>(null) }
    var packageCode by rememberSaveable { mutableStateOf("") }
    var sender by rememberSaveable { mutableStateOf("") }
    var holder by rememberSaveable { mutableStateOf("") }
    var txn by rememberSaveable { mutableStateOf("") }
    var showErrors by rememberSaveable { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<String?>(null) }
    var failed by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        instructions = repository.fetchPaymentInstructions().getOrNull()
    }

    BsdcCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                mkText(bn, "Order credits", "অর্ডার ক্রেডিট"),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            BsdcBadge(
                label = if (listed) mkText(bn, "Listed", "তালিকায় আছে") else mkText(bn, "Hidden", "লুকানো"),
                tone = if (listed) BsdcTone.OK else BsdcTone.WARN,
            )
        }
        Text(
            mkText(bn, "$credits left. Each accepted order uses one.", "$credits টি বাকি। গৃহীত প্রতিটি অর্ডারে একটি লাগে।"),
            style = MaterialTheme.typography.bodySmall,
            color = BsdcThemeTokens.colors.mutedText,
        )
        if (!listed) {
            Spacer(Modifier.height(8.dp))
            BsdcStatusBanner(
                title = mkText(bn, "Your shop is hidden", "আপনার দোকান লুকানো আছে"),
                body = mkText(
                    bn,
                    "Order credits are used up. Buy a package below. Your shop shows again after the admin approves the payment.",
                    "অর্ডার ক্রেডিট শেষ। নিচে থেকে প্যাকেজ কিনুন। অ্যাডমিন পেমেন্ট অনুমোদন করলে দোকান আবার দেখাবে।",
                ),
                tone = BsdcTone.WARN,
            )
        }

        Spacer(Modifier.height(14.dp))
        Text(
            mkText(bn, "Buy a package", "প্যাকেজ কিনুন"),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
        )
        val current = instructions
        if (current == null) {
            CircularProgressIndicator(modifier = Modifier.padding(top = 8.dp).size(24.dp))
        } else {
            Spacer(Modifier.height(8.dp))
            MkPaymentInstructionsCard(instructions = current, bn = bn)
            Spacer(Modifier.height(10.dp))
            current.packages.forEach { pkg ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                ) {
                    RadioButton(selected = packageCode == pkg.code, onClick = { packageCode = pkg.code })
                    Text(
                        mkText(bn, "${pkg.orders} orders", "${pkg.orders}টি অর্ডার"),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                    MkPrice(poisha = pkg.price_poisha, bn = bn)
                }
            }
            Spacer(Modifier.height(10.dp))
            MkPaymentProofFields(
                bn = bn,
                sender = sender,
                holder = holder,
                txn = txn,
                showErrors = showErrors,
                onSender = { sender = it },
                onHolder = { holder = it },
                onTxn = { txn = it },
            )
            if (showErrors && packageCode.isEmpty()) {
                Text(
                    mkText(bn, "Choose a package.", "একটি প্যাকেজ বেছে নিন।"),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Spacer(Modifier.height(10.dp))
            Button(
                onClick = {
                    val valid = packageCode.isNotEmpty() &&
                        MkLogic.isBdMobile(sender) &&
                        holder.trim().length >= 2 &&
                        MkLogic.isTxnId(txn)
                    if (!valid) {
                        showErrors = true
                        return@Button
                    }
                    scope.launch {
                        busy = true
                        failed = null
                        result = null
                        repository.buyCredits(packageCode, MkLogic.normaliseBdMobile(sender), holder.trim(), txn.trim())
                            .onSuccess {
                                result = mkText(
                                    bn,
                                    "Payment sent. Credits are added after the admin approves it.",
                                    "পেমেন্ট পাঠানো হয়েছে। অ্যাডমিন অনুমোদন করলে ক্রেডিট যোগ হবে।",
                                )
                                packageCode = ""
                                sender = ""
                                holder = ""
                                txn = ""
                                showErrors = false
                                onChanged()
                            }
                            .onFailure {
                                failed = it.message?.takeIf { m -> m.isNotBlank() }
                                    ?: mkText(bn, "Could not send the payment details.", "পেমেন্টের তথ্য পাঠানো যায়নি।")
                            }
                        busy = false
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (busy) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                }
                Text(mkText(bn, "Send payment for approval", "অনুমোদনের জন্য পেমেন্ট পাঠান"))
            }
        }
        result?.let {
            Spacer(Modifier.height(8.dp))
            BsdcStatusBanner(title = mkText(bn, "Sent", "পাঠানো হয়েছে"), body = it, tone = BsdcTone.OK)
        }
        failed?.let {
            Spacer(Modifier.height(8.dp))
            BsdcStatusBanner(title = mkText(bn, "Not sent", "পাঠানো যায়নি"), body = it, tone = BsdcTone.BAD)
        }
    }
}

@Composable
private fun PurchasesCard(bn: Boolean, purchases: List<MkPurchaseDto>) {
    BsdcCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            mkText(bn, "Package purchases", "প্যাকেজ কেনার ইতিহাস"),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
        )
        if (purchases.isEmpty()) {
            Text(
                mkText(bn, "No purchases yet.", "এখনো কোনো কেনা নেই।"),
                style = MaterialTheme.typography.bodySmall,
                color = BsdcThemeTokens.colors.mutedText,
            )
        }
        purchases.forEach { purchase ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = BsdcThemeTokens.colors.brandStrong, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        mkText(bn, "${purchase.orders} orders", "${purchase.orders}টি অর্ডার"),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        purchase.created_at.take(10),
                        style = MaterialTheme.typography.bodySmall,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                }
                BsdcBadge(
                    label = when (purchase.status) {
                        "approved" -> mkText(bn, "Approved", "অনুমোদিত")
                        "rejected" -> mkText(bn, "Rejected", "বাতিল")
                        else -> mkText(bn, "Awaiting approval", "অনুমোদনের অপেক্ষায়")
                    },
                    tone = when (purchase.status) {
                        "approved" -> BsdcTone.OK
                        "rejected" -> BsdcTone.BAD
                        else -> BsdcTone.WARN
                    },
                )
            }
        }
    }
}

@Composable
private fun DeliveryAndScheduleCard(
    repository: MkRepository,
    bn: Boolean,
    onChanged: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var loaded by remember { mutableStateOf(false) }

    var deliveryScope by rememberSaveable { mutableStateOf("radius") }
    var radiusText by rememberSaveable { mutableStateOf("10") }
    var feeMode by rememberSaveable { mutableStateOf("default") }
    var fixedFeeText by rememberSaveable { mutableStateOf("150") }
    var perKmText by rememberSaveable { mutableStateOf("20") }
    var centerLat by rememberSaveable { mutableStateOf<Double?>(null) }
    var centerLng by rememberSaveable { mutableStateOf<Double?>(null) }
    var shopLat by rememberSaveable { mutableStateOf(MkLogic.SYLHET_LAT) }
    var shopLng by rememberSaveable { mutableStateOf(MkLogic.SYLHET_LNG) }
    var deliveryBusy by remember { mutableStateOf(false) }
    var deliverySaved by remember { mutableStateOf<String?>(null) }
    var deliveryError by remember { mutableStateOf<String?>(null) }

    var scheduleEnabled by rememberSaveable { mutableStateOf(false) }
    var scheduleDays by remember { mutableStateOf(MkLogic.defaultScheduleDays()) }
    var liveSchedule by remember { mutableStateOf<MkShopScheduleDto?>(null) }
    var scheduleBusy by remember { mutableStateOf(false) }
    var scheduleSaved by remember { mutableStateOf<String?>(null) }
    var scheduleError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        repository.fetchVendorDelivery().onSuccess { d ->
            deliveryScope = d.scope
            radiusText = d.radius_km.toString()
            feeMode = d.fee_mode
            fixedFeeText = ((d.fixed_fee_poisha.takeIf { it >= 0L } ?: d.fee_poisha) / 100L).toString()
            perKmText = (d.per_km_rate_poisha / 100L).toString()
            centerLat = d.center_lat
            centerLng = d.center_lng
            shopLat = d.shop_lat
            shopLng = d.shop_lng
            d.schedule?.let { sched ->
                liveSchedule = sched
                scheduleEnabled = sched.enabled
                val nextDays = MkLogic.defaultScheduleDays().toMutableMap()
                for (key in MkLogic.DAY_KEYS) {
                    sched.days[key]?.let { nextDays[key] = it }
                }
                scheduleDays = nextDays
            }
        }
        loaded = true
    }

    if (!loaded) return

    val parsedRadius = radiusText.trim().toIntOrNull()
    val showCentreMap = deliveryScope == "radius" || feeMode == "per_km"

    BsdcCard(modifier = Modifier.fillMaxWidth()) {
        Text(
            mkText(bn, "Delivery area & charge", "ডেলিভারি এলাকা ও চার্জ"),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            mkText(
                bn,
                "Choose per-km, custom fixed fee, or platform default (৳150).",
                "প্রতি কিমি, নির্ধারিত চার্জ, অথবা প্ল্যাটফর্ম ডিফল্ট (৳১৫০) বেছে নিন।",
            ),
            style = MaterialTheme.typography.bodySmall,
            color = BsdcThemeTokens.colors.mutedText,
        )
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = deliveryScope == "radius",
                onClick = { deliveryScope = "radius" },
                label = { Text(mkText(bn, "Within radius", "ব্যাসার্ধের মধ্যে")) },
            )
            FilterChip(
                selected = deliveryScope == "all_bd",
                onClick = { deliveryScope = "all_bd" },
                label = { Text(mkText(bn, "All Bangladesh", "সারা বাংলাদেশ")) },
            )
        }
        if (deliveryScope == "radius") {
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = radiusText,
                onValueChange = { radiusText = it.filter(Char::isDigit).take(3) },
                label = { Text(mkText(bn, "Radius (km, 1–500)", "ব্যাসার্ধ (কিমি, ১–৫০০)")) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Spacer(Modifier.height(10.dp))
        Text(
            mkText(bn, "Delivery fee mode", "ডেলিভারি চার্জের ধরন"),
            style = MaterialTheme.typography.labelLarge,
        )
        Spacer(Modifier.height(4.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            listOf(
                "per_km" to mkText(bn, "Custom per-km fee", "কাস্টম প্রতি কিমি চার্জ"),
                "fixed" to mkText(bn, "Custom fixed fee", "কাস্টম নির্ধারিত চার্জ"),
                "default" to mkText(bn, "Platform default (৳150)", "প্ল্যাটফর্ম ডিফল্ট (৳১৫০)"),
            ).forEach { (modeKey, modeTitle) ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = feeMode == modeKey, onClick = { feeMode = modeKey })
                    Text(modeTitle, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        if (feeMode == "fixed") {
            Spacer(Modifier.height(6.dp))
            OutlinedTextField(
                value = fixedFeeText,
                onValueChange = { fixedFeeText = it.filter(Char::isDigit).take(6) },
                label = { Text(mkText(bn, "Fixed charge (taka, 0–100,000)", "নির্ধারিত চার্জ (টাকা, ০–১,০০,০০০)")) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        } else if (feeMode == "per_km") {
            Spacer(Modifier.height(6.dp))
            OutlinedTextField(
                value = perKmText,
                onValueChange = { perKmText = it.filter(Char::isDigit).take(5) },
                label = { Text(mkText(bn, "Per-km rate (taka / km, 0–10,000)", "প্রতি কিমি রেট (টাকা / কিমি, ০–১০,০০০)")) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                mkText(
                    bn,
                    "Whole km rounded up from delivery centre (e.g. 4.2 km → 5 km).",
                    "ডেলিভারি কেন্দ্র থেকে ওপরের দিকে পূর্ণ কিমি হিসাব হয় (যেমন ৪.২ কিমি → ৫ কিমি)।",
                ),
                style = MaterialTheme.typography.labelSmall,
                color = BsdcThemeTokens.colors.mutedText,
            )
        }
        if (showCentreMap) {
            Spacer(Modifier.height(10.dp))
            Text(
                mkText(bn, "Delivery area centre", "ডেলিভারি এলাকার কেন্দ্র"),
                style = MaterialTheme.typography.labelLarge,
            )
            Spacer(Modifier.height(6.dp))
            MkOsmPinMap(
                lat = centerLat,
                lng = centerLng,
                radiusKm = if (deliveryScope == "radius") parsedRadius else null,
                onPin = { plat, plng ->
                    if (MkLogic.isInsideBangladesh(plat, plng)) {
                        centerLat = plat
                        centerLng = plng
                    }
                },
            )
            Spacer(Modifier.height(6.dp))
            OutlinedButton(
                onClick = {
                    centerLat = shopLat
                    centerLng = shopLng
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(mkText(bn, "Use shop location as centre", "দোকানকে কেন্দ্র হিসেবে ব্যবহার করুন"))
            }
        }
        Spacer(Modifier.height(10.dp))
        Button(
            onClick = {
                val rKm = parsedRadius ?: 10
                if (rKm !in 1..500) {
                    deliveryError = mkText(bn, "Radius must be 1–500 km.", "ব্যাসার্ধ ১–৫০০ কিমি হতে হবে।")
                    return@Button
                }
                val fTaka = fixedFeeText.trim().toIntOrNull() ?: 150
                val pkTaka = perKmText.trim().toIntOrNull() ?: 20
                if (feeMode == "fixed" && fTaka !in 0..100_000) {
                    deliveryError = mkText(bn, "Fixed charge must be 0–100,000 taka.", "নির্ধারিত চার্জ ০–১,০০,০০০ টাকা হতে হবে।")
                    return@Button
                }
                if (feeMode == "per_km" && pkTaka !in 0..10_000) {
                    deliveryError = mkText(bn, "Per-km rate must be 0–10,000 taka.", "প্রতি কিমি রেট ০–১০,০০০ টাকা হতে হবে।")
                    return@Button
                }
                if (showCentreMap && (centerLat == null || centerLng == null)) {
                    deliveryError = mkText(bn, "Pin your delivery centre on the map.", "মানচিত্রে ডেলিভারি কেন্দ্র পিন করুন।")
                    return@Button
                }
                scope.launch {
                    deliveryBusy = true
                    deliveryError = null
                    deliverySaved = null
                    repository.setVendorDelivery(
                        scope = deliveryScope,
                        radiusKm = rKm,
                        feeMode = feeMode,
                        feeTaka = fTaka.coerceIn(0, 100_000),
                        perKmTaka = pkTaka.coerceIn(0, 10_000),
                        centerLat = centerLat,
                        centerLng = centerLng,
                    ).onSuccess {
                        deliverySaved = mkText(bn, "Delivery settings saved.", "ডেলিভারি সেটিংস সংরক্ষিত হয়েছে।")
                        onChanged()
                    }.onFailure {
                        deliveryError = it.message ?: mkText(bn, "Could not save delivery settings.", "সংরক্ষণ করা যায়নি।")
                    }
                    deliveryBusy = false
                }
            },
            enabled = !deliveryBusy,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(mkText(bn, "Save delivery settings", "ডেলিভারি সেটিংস সংরক্ষণ করুন"))
        }
        deliverySaved?.let {
            Spacer(Modifier.height(8.dp))
            BsdcStatusBanner(title = mkText(bn, "Saved", "সংরক্ষিত"), body = it, tone = BsdcTone.OK)
        }
        deliveryError?.let {
            Spacer(Modifier.height(8.dp))
            BsdcStatusBanner(title = mkText(bn, "Not saved", "সংরক্ষণ হয়নি"), body = it, tone = BsdcTone.BAD)
        }
    }

    BsdcCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    mkText(bn, "Opening hours (BD time)", "দোকান খোলার সময়সূচি"),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                )
                liveSchedule?.let { sched ->
                    MkLogic.scheduleBadgeLabel(sched, bn)?.let { label ->
                        Spacer(Modifier.height(2.dp))
                        BsdcBadge(
                            label = label,
                            tone = if (sched.is_open) BsdcTone.OK else BsdcTone.WARN,
                        )
                    }
                }
            }
            Switch(
                checked = scheduleEnabled,
                onCheckedChange = { scheduleEnabled = it },
            )
        }
        Spacer(Modifier.height(8.dp))
        if (!scheduleEnabled) {
            Text(
                mkText(
                    bn,
                    "Turned off: your shop accepts orders 24 hours a day.",
                    "বন্ধ থাকলে আপনার দোকান ২৪ ঘণ্টাই অর্ডার গ্রহণ করবে।",
                ),
                style = MaterialTheme.typography.bodySmall,
                color = BsdcThemeTokens.colors.mutedText,
            )
        } else {
            MkLogic.DAY_KEYS.forEach { dayKey ->
                val row = scheduleDays[dayKey] ?: MkDayHoursDto()
                Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = row.open,
                            onCheckedChange = { checked ->
                                scheduleDays = scheduleDays.toMutableMap().apply {
                                    put(dayKey, row.copy(open = checked))
                                }
                            },
                        )
                        Text(
                            MkLogic.dayLabel(dayKey, bn),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                    if (row.open) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = row.start,
                                onValueChange = { next ->
                                    scheduleDays = scheduleDays.toMutableMap().apply {
                                        put(dayKey, row.copy(start = next.take(5)))
                                    }
                                },
                                label = { Text(mkText(bn, "Opens (HH:MM)", "খোলে (HH:MM)")) },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                            OutlinedTextField(
                                value = row.end,
                                onValueChange = { next ->
                                    scheduleDays = scheduleDays.toMutableMap().apply {
                                        put(dayKey, row.copy(end = next.take(5)))
                                    }
                                },
                                label = { Text(mkText(bn, "Closes (HH:MM)", "বন্ধ (HH:MM)")) },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Button(
            onClick = {
                for (key in MkLogic.DAY_KEYS) {
                    val row = scheduleDays[key] ?: MkDayHoursDto()
                    if (!MkLogic.isValidHhMm(row.start, allow24 = false) ||
                        !MkLogic.isValidHhMm(row.end, allow24 = true) ||
                        (row.open && row.start == row.end)
                    ) {
                        scheduleError = mkText(
                            bn,
                            "Use valid HH:MM times and distinct open/close times.",
                            "সঠিক HH:MM সময় দিন এবং খোলা ও বন্ধের সময় আলাদা রাখুন।",
                        )
                        return@Button
                    }
                }
                scope.launch {
                    scheduleBusy = true
                    scheduleError = null
                    scheduleSaved = null
                    repository.setVendorSchedule(scheduleEnabled, scheduleDays)
                        .onSuccess { updated ->
                            liveSchedule = updated
                            scheduleSaved = mkText(bn, "Opening hours saved.", "সময়সূচি সংরক্ষিত হয়েছে।")
                            onChanged()
                        }
                        .onFailure {
                            scheduleError = it.message ?: mkText(bn, "Could not save opening hours.", "সংরক্ষণ করা যায়নি।")
                        }
                    scheduleBusy = false
                }
            },
            enabled = !scheduleBusy,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(mkText(bn, "Save opening hours", "সময়সূচি সংরক্ষণ করুন"))
        }
        scheduleSaved?.let {
            Spacer(Modifier.height(8.dp))
            BsdcStatusBanner(title = mkText(bn, "Saved", "সংরক্ষিত"), body = it, tone = BsdcTone.OK)
        }
        scheduleError?.let {
            Spacer(Modifier.height(8.dp))
            BsdcStatusBanner(title = mkText(bn, "Not saved", "সংরক্ষণ হয়নি"), body = it, tone = BsdcTone.BAD)
        }
    }
}
