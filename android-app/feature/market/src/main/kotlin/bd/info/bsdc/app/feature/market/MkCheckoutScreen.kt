package bd.info.bsdc.app.feature.market

import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.MyLocation
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import coil3.ImageLoader
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Cash-on-delivery checkout for one shop. Address needs a map pin inside Bangladesh, which comes from
 * the device location or from an OpenStreetMap place search. The total adds the fixed ৳150 delivery fee.
 */
@Composable
fun MkCheckoutScreen(
    repository: MkRepository,
    imageLoader: ImageLoader,
    bn: Boolean,
    vendorSlug: String,
    vendorName: String,
    directItems: List<MkDirectItem>?,
    onPlaced: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var vendorId by remember { mutableStateOf<String?>(null) }
    var vendorChecked by remember { mutableStateOf(false) }
    var subtotal by remember { mutableStateOf<Long?>(null) }
    var itemCount by remember { mutableStateOf(0) }

    var customerName by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var addressLine by rememberSaveable { mutableStateOf("") }
    var landmark by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }
    var placeLabel by rememberSaveable { mutableStateOf("") }
    var pinLat by rememberSaveable { mutableStateOf<Double?>(null) }
    var pinLng by rememberSaveable { mutableStateOf<Double?>(null) }

    var placeQuery by rememberSaveable { mutableStateOf("") }
    var placeResults by remember { mutableStateOf<List<MkPlaceDto>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var locating by remember { mutableStateOf(false) }

    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var placedCode by remember { mutableStateOf<String?>(null) }

    // Resolve the vendor id and the price of what is being bought.
    LaunchedEffect(vendorSlug) {
        vendorChecked = false
        vendorId = repository.fetchVendorRef(vendorSlug).getOrNull()
        if (directItems == null) {
            val lines = repository.fetchMyCart().getOrNull().orEmpty()
                .filter { it.vendor_slug == vendorSlug && it.orderable }
            subtotal = lines.sumOf { it.line_total }
            itemCount = lines.sumOf { it.qty }
        } else {
            var total = 0L
            var count = 0
            for (item in directItems) {
                val detail = repository.fetchProductDetail(item.productId).getOrNull()
                if (detail != null) {
                    total += detail.price_poisha * item.qty
                    count += item.qty
                }
            }
            subtotal = total
            itemCount = count
        }
        vendorChecked = true
    }

    // Place search against OpenStreetMap, debounced to respect the Nominatim usage policy.
    LaunchedEffect(placeQuery) {
        if (placeQuery.trim().length < 3) {
            placeResults = emptyList()
            return@LaunchedEffect
        }
        delay(900)
        searching = true
        placeResults = repository.searchPlaces(placeQuery).getOrNull().orEmpty()
        searching = false
    }

    fun applyLocation(pair: Pair<Double, Double>?) {
        locating = false
        if (pair == null) {
            error = mkText(bn, "Could not read your location. Try search instead.", "আপনার লোকেশন পড়া যায়নি। সার্চ ব্যবহার করুন।")
            return
        }
        if (!MkLogic.isInsideBangladesh(pair.first, pair.second)) {
            error = mkText(bn, "Your location is outside Bangladesh.", "আপনার লোকেশন বাংলাদেশের বাইরে।")
            return
        }
        pinLat = pair.first
        pinLng = pair.second
        error = null
    }

    val locationPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        if (result.values.any { it }) {
            locating = true
            scope.launch { applyLocation(MkLocation.current(context)) }
        } else {
            error = mkText(bn, "Location permission is needed for the pin.", "পিন দিতে লোকেশন অনুমতি দরকার।")
        }
    }

    fun useCurrentLocation(context: Context) {
        if (MkLocation.hasPermission(context)) {
            locating = true
            scope.launch { applyLocation(MkLocation.current(context)) }
        } else {
            locationPermission.launch(MkLocation.PERMISSIONS)
        }
    }

    val lat = pinLat
    val lng = pinLng
    val nameOk = customerName.trim().length >= 2
    val phoneOk = MkLogic.isBdMobile(phone)
    val addressOk = addressLine.trim().length >= 5
    val pinOk = lat != null && lng != null && MkLogic.isInsideBangladesh(lat, lng)
    val canPlace = vendorId != null && nameOk && phoneOk && addressOk && pinOk && !busy && placedCode == null &&
        (subtotal ?: 0L) > 0L

    // Once the order is in, show the confirmation briefly, then go to the orders screen.
    LaunchedEffect(placedCode) {
        if (placedCode != null) {
            delay(1800)
            onPlaced()
        }
    }

    val fee = MkLogic.DEFAULT_DELIVERY_FEE_POISHA
    val sub = subtotal ?: 0L

    Box(modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Text(
                    text = vendorName,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
            }
            if (vendorChecked && vendorId == null) {
                item {
                    BsdcStatusBanner(
                        title = mkText(bn, "This shop is not taking orders", "এই দোকান এখন অর্ডার নিচ্ছে না"),
                        body = mkText(
                            bn,
                            "It may be out of order credits. Try again later.",
                            "অর্ডার ক্রেডিট শেষ হতে পারে। পরে আবার চেষ্টা করুন।",
                        ),
                        tone = BsdcTone.WARN,
                    )
                }
            }
            error?.let { message ->
                item {
                    BsdcStatusBanner(
                        title = mkText(bn, "Check your order", "অর্ডার যাচাই করুন"),
                        body = message,
                        tone = BsdcTone.BAD,
                    )
                }
            }

            item {
                BsdcCard {
                    Text(
                        text = mkText(bn, "Delivery to", "ডেলিভারি ঠিকানা"),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = customerName,
                        onValueChange = { customerName = it },
                        label = { Text(mkText(bn, "Full name", "পুরো নাম")) },
                        singleLine = true,
                        isError = customerName.isNotEmpty() && !nameOk,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = { Text(mkText(bn, "Mobile (01XXXXXXXXX)", "মোবাইল (01XXXXXXXXX)")) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        isError = phone.isNotEmpty() && !phoneOk,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = addressLine,
                        onValueChange = { addressLine = it },
                        label = { Text(mkText(bn, "House, road, area", "বাসা, রাস্তা, এলাকা")) },
                        isError = addressLine.isNotEmpty() && !addressOk,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = landmark,
                        onValueChange = { landmark = it },
                        label = { Text(mkText(bn, "Landmark (optional)", "ল্যান্ডমার্ক (ঐচ্ছিক)")) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            item {
                BsdcCard {
                    Text(
                        text = mkText(bn, "Pin your location", "লোকেশন পিন করুন"),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = { useCurrentLocation(context) },
                        enabled = !locating,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Rounded.MyLocation, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(
                            if (locating) {
                                mkText(bn, "Finding you…", "খুঁজে পাওয়া যাচ্ছে…")
                            } else {
                                mkText(bn, "Use my current location", "আমার বর্তমান লোকেশন ব্যবহার করুন")
                            },
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = placeQuery,
                        onValueChange = { placeQuery = it },
                        label = { Text(mkText(bn, "Search a place (OpenStreetMap)", "জায়গা খুঁজুন (OpenStreetMap)")) },
                        singleLine = true,
                        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (searching) {
                        Text(
                            text = mkText(bn, "Searching…", "খোঁজা হচ্ছে…"),
                            style = MaterialTheme.typography.bodySmall,
                            color = BsdcThemeTokens.colors.mutedText,
                        )
                    }
                    placeResults.forEach { place ->
                        val plat = place.latitude
                        val plng = place.longitude
                        if (plat != null && plng != null && MkLogic.isInsideBangladesh(plat, plng)) {
                            OutlinedButton(
                                onClick = {
                                    pinLat = plat
                                    pinLng = plng
                                    placeLabel = place.display_name
                                    placeResults = emptyList()
                                    error = null
                                },
                                modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                            ) {
                                Text(
                                    text = place.display_name,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (pinOk) {
                            BsdcBadge(label = mkText(bn, "Pinned", "পিন হয়েছে"), tone = BsdcTone.OK)
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = "%.5f, %.5f".format(lat, lng),
                                style = MaterialTheme.typography.bodySmall,
                                color = BsdcThemeTokens.colors.mutedText,
                            )
                        } else {
                            BsdcBadge(label = mkText(bn, "No pin yet", "এখনো পিন নেই"), tone = BsdcTone.WARN)
                        }
                    }
                }
            }

            item {
                BsdcCard {
                    Text(
                        text = mkText(bn, "Summary", "সারাংশ"),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = mkText(bn, "Items: $itemCount", "পণ্য: $itemCount"),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Spacer(Modifier.height(8.dp))
                    SummaryRow(label = mkText(bn, "Subtotal", "সাবটোটাল"), poisha = sub, bn = bn)
                    SummaryRow(label = mkText(bn, "Delivery", "ডেলিভারি"), poisha = fee, bn = bn)
                    HorizontalDivider(Modifier.padding(vertical = 8.dp))
                    SummaryRow(
                        label = mkText(bn, "Total (cash on delivery)", "মোট (ক্যাশ অন ডেলিভারি)"),
                        poisha = sub + fee,
                        bn = bn,
                        emphasize = true,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        text = mkText(
                            bn,
                            "Pay the rider in cash when the order arrives.",
                            "অর্ডার পৌঁছালে রাইডারকে নগদ টাকা দিন।",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                }
            }

            item {
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text(mkText(bn, "Note for the shop (optional)", "দোকানের জন্য নোট (ঐচ্ছিক)")) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            item {
                Button(
                    onClick = {
                        val pLat = pinLat ?: return@Button
                        val pLng = pinLng ?: return@Button
                        val vId = vendorId ?: return@Button
                        scope.launch {
                            busy = true
                            error = null
                            val address = MkAddressInput(
                                customerName = customerName.trim(),
                                customerPhone = MkLogic.normaliseBdMobile(phone),
                                addressLine = addressLine.trim(),
                                lat = pLat,
                                lng = pLng,
                                landmark = landmark.trim(),
                                placeLabel = placeLabel.trim(),
                                note = note.trim(),
                            )
                            repository.placeOrder(vId, address, directItems)
                                .onSuccess { placedCode = it.code }
                                .onFailure { error = it.message ?: "order_failed" }
                            busy = false
                        }
                    },
                    enabled = canPlace,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(mkText(bn, "Place order · cash on delivery", "অর্ডার দিন · ক্যাশ অন ডেলিভারি"))
                }
            }
        }

        // Confirmation: the card springs in, then the screen moves to the orders list.
        AnimatedVisibility(
            visible = placedCode != null,
            enter = fadeIn() + scaleIn(animationSpec = spring(dampingRatio = 0.6f)),
            modifier = Modifier.fillMaxSize(),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(BsdcThemeTokens.colors.surfaceElevated.copy(alpha = 0.92f)),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        modifier = Modifier
                            .size(96.dp)
                            .background(BsdcThemeTokens.colors.online.copy(alpha = 0.15f), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.CheckCircle,
                            contentDescription = null,
                            tint = BsdcThemeTokens.colors.online,
                            modifier = Modifier.size(64.dp),
                        )
                    }
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = mkText(bn, "Order placed", "অর্ডার দেওয়া হয়েছে"),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = placedCode.orEmpty(),
                        style = MaterialTheme.typography.bodyMedium,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                }
            }
        }
    }
}

@Composable
private fun SummaryRow(label: String, poisha: Long, bn: Boolean, emphasize: Boolean = false) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = if (emphasize) MaterialTheme.typography.titleSmall else MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
        if (emphasize) {
            MkPrice(poisha = poisha, bn = bn)
        } else {
            Text(
                text = MkLogic.formatTaka(poisha, bn),
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}
