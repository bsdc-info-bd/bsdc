package bd.info.bsdc.app.feature.market

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Inventory2
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcMetricTile
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import coil3.ImageLoader
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val ORDER_FILTERS = listOf("", "placed", "accepted", "packaged", "out_for_delivery", "delivered", "cancelled")

/** Label of the button that moves an order to [target]. Decline and cancel share the cancelled target. */
private fun vendorActionLabel(target: String, bn: Boolean): String = when (target) {
    "accepted" -> mkText(bn, "Accept", "গ্রহণ করুন")
    "packaged" -> mkText(bn, "Mark packed", "প্যাক হয়েছে")
    "out_for_delivery" -> mkText(bn, "Out for delivery", "ডেলিভারিতে পাঠান")
    "delivered" -> mkText(bn, "Mark delivered", "পৌঁছে গেছে")
    "cancelled" -> mkText(bn, "Decline", "বাতিল করুন")
    else -> target
}

/**
 * Shop console for the signed-in vendor: credits, shop listing state, and the order queue.
 * Products, photos and credit purchases stay on the web console, which already has the upload flow.
 */
@Composable
fun MkVendorConsoleScreen(
    repository: MkRepository,
    mediaRepository: BsdcMediaRepository,
    imageLoader: ImageLoader,
    bn: Boolean,
    onOpenExternal: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var dashboard by remember { mutableStateOf<MkVendorDashboardDto?>(null) }
    var orders by remember { mutableStateOf<List<MkVendorOrderDto>>(emptyList()) }
    var filter by rememberSaveable { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var pendingCancel by remember { mutableStateOf<MkVendorOrderDto?>(null) }
    var actionBusy by remember { mutableStateOf(false) }
    var section by rememberSaveable { mutableStateOf(VendorSection.ORDERS) }
    var refreshTick by rememberSaveable { mutableStateOf(0) }
    val refreshAll: () -> Unit = { refreshTick++ }

    suspend fun reload(status: String) {
        repository.fetchVendorDashboard()
            .onSuccess { dashboard = it; error = null }
            .onFailure { error = it.message ?: "load_failed" }
        if (dashboard?.has_shop == true) {
            repository.fetchVendorOrders(status)
                .onSuccess { orders = it }
                .onFailure { error = it.message ?: "load_failed" }
        }
        loading = false
    }

    // Keeps the queue fresh between pushes. Realtime alerts come from the notification pipeline.
    LaunchedEffect(filter, refreshTick) {
        while (true) {
            reload(filter)
            delay(15_000L)
        }
    }

    val data = dashboard
    if (data == null) {
        if (loading) {
            BsdcEmptyState(
                icon = Icons.Rounded.Inventory2,
                title = mkText(bn, "Loading your shop…", "দোকান লোড হচ্ছে…"),
                subtitle = "",
                modifier = modifier.fillMaxSize(),
            )
        }
        return
    }

    if (!data.has_shop) {
        MkVendorOnboarding(
            repository = repository,
            bn = bn,
            modifier = modifier,
        )
        return
    }

    val vendor = data.vendor
    val credits = data.credits ?: 0
    val listed = data.listed == true

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Column {
                Text(
                    text = vendor?.name.orEmpty(),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BsdcBadge(
                        label = if (listed) mkText(bn, "Listed", "তালিকায় আছে") else mkText(bn, "Hidden", "লুকানো"),
                        tone = if (listed) BsdcTone.OK else BsdcTone.WARN,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = mkText(bn, "$credits order credits left", "$credits টি অর্ডার ক্রেডিট বাকি"),
                        style = MaterialTheme.typography.bodySmall,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                }
            }
        }
        if (!listed) {
            item {
                BsdcStatusBanner(
                    title = mkText(bn, "Your shop is hidden", "আপনার দোকান লুকানো আছে"),
                    body = mkText(
                        bn,
                        "Order credits are used up. Buy a package in the Shop tab; the shop shows again after approval.",
                        "অর্ডার ক্রেডিট শেষ। দোকান ট্যাবে প্যাকেজ কিনুন; অনুমোদনের পর দোকান আবার দেখাবে।",
                    ),
                    tone = BsdcTone.WARN,
                    actionLabel = mkText(bn, "Buy credits", "ক্রেডিট কিনুন"),
                    onAction = { section = VendorSection.SHOP },
                )
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                BsdcMetricTile(
                    label = mkText(bn, "Pending", "অপেক্ষমাণ"),
                    value = (data.orders_pending ?: 0).toString(),
                    icon = Icons.Rounded.Schedule,
                    modifier = Modifier.weight(1f),
                    tone = BsdcTone.INFO,
                )
                BsdcMetricTile(
                    label = mkText(bn, "Today", "আজ"),
                    value = (data.orders_today ?: 0).toString(),
                    icon = Icons.Rounded.Inventory2,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                BsdcMetricTile(
                    label = mkText(bn, "Delivered", "পৌঁছেছে"),
                    value = MkLogic.formatTaka(data.delivered_poisha ?: 0L, bn),
                    icon = Icons.Rounded.Payments,
                    modifier = Modifier.weight(1f),
                    tone = BsdcTone.OK,
                )
                BsdcMetricTile(
                    label = mkText(bn, "Rating", "রেটিং"),
                    value = "%.1f".format(data.rating ?: 0.0),
                    icon = Icons.Rounded.Star,
                    modifier = Modifier.weight(1f),
                    tone = BsdcTone.WARN,
                )
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(VendorSection.entries) { option ->
                    FilterChip(
                        selected = section == option,
                        onClick = { section = option },
                        label = { Text(option.label(bn)) },
                    )
                }
            }
        }
        if (section == VendorSection.PRODUCTS) {
            item {
                MkVendorCatalogPanel(
                    repository = repository,
                    mediaRepository = mediaRepository,
                    imageLoader = imageLoader,
                    bn = bn,
                    onChanged = refreshAll,
                )
            }
        }
        if (section == VendorSection.SHOP) {
            item {
                MkVendorShopPanel(
                    repository = repository,
                    mediaRepository = mediaRepository,
                    imageLoader = imageLoader,
                    bn = bn,
                    vendor = data.vendor,
                    credits = credits,
                    listed = listed,
                    purchases = data.purchases.orEmpty(),
                    onChanged = refreshAll,
                )
            }
        }
        if (section == VendorSection.ORDERS) {
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(ORDER_FILTERS) { key ->
                    FilterChip(
                        selected = filter == key,
                        onClick = { filter = key },
                        label = {
                            Text(
                                if (key.isEmpty()) {
                                    mkText(bn, "All", "সব")
                                } else {
                                    statusShortLabel(key, bn)
                                },
                            )
                        },
                    )
                }
            }
        }
        error?.let { message ->
            item {
                BsdcStatusBanner(
                    title = mkText(bn, "Could not refresh", "আপডেট হয়নি"),
                    body = message,
                    tone = BsdcTone.WARN,
                )
            }
        }
        if (orders.isEmpty()) {
            item {
                BsdcEmptyState(
                    icon = Icons.Rounded.CheckCircle,
                    title = mkText(bn, "No orders here", "এখানে কোনো অর্ডার নেই"),
                    subtitle = mkText(bn, "New orders appear here instantly.", "নতুন অর্ডার সাথে সাথে এখানে আসবে।"),
                )
            }
        }
        items(orders, key = { it.id }) { order ->
            VendorOrderCard(
                order = order,
                bn = bn,
                imageLoader = imageLoader,
                busy = actionBusy,
                onAction = { target ->
                    if (target == "cancelled") {
                        pendingCancel = order
                    } else {
                        scope.launch {
                            actionBusy = true
                            repository.setVendorOrderStatus(order.id, target)
                                .onFailure { error = it.message ?: "update_failed" }
                            reload(filter)
                            actionBusy = false
                        }
                    }
                },
                onOpenMap = { lat, lng ->
                    onOpenExternal("https://www.openstreetmap.org/?mlat=$lat&mlon=$lng#map=17/$lat/$lng")
                },
            )
        }
        }
    }

    pendingCancel?.let { order ->
        var reason by remember(order.id) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { pendingCancel = null },
            title = { Text(mkText(bn, "Decline this order?", "এই অর্ডার বাতিল করবেন?")) },
            text = {
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = { Text(mkText(bn, "Reason for the customer", "গ্রাহকের জন্য কারণ")) },
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                Button(
                    enabled = reason.trim().length >= 3,
                    onClick = {
                        val id = order.id
                        val why = reason.trim()
                        pendingCancel = null
                        scope.launch {
                            actionBusy = true
                            repository.setVendorOrderStatus(id, "cancelled", why)
                                .onFailure { error = it.message ?: "update_failed" }
                            reload(filter)
                            actionBusy = false
                        }
                    },
                ) { Text(mkText(bn, "Decline order", "অর্ডার বাতিল করুন")) }
            },
            dismissButton = {
                OutlinedButton(onClick = { pendingCancel = null }) {
                    Text(mkText(bn, "Back", "ফিরে যান"))
                }
            },
        )
    }
}

@Composable
private fun VendorOrderCard(
    order: MkVendorOrderDto,
    bn: Boolean,
    imageLoader: ImageLoader,
    busy: Boolean,
    onAction: (String) -> Unit,
    onOpenMap: (Double, Double) -> Unit,
) {
    BsdcCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "#${order.code}",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            MkStatusChip(status = order.status, bn = bn)
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = order.customer_name,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Phone, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(4.dp))
            Text(text = order.customer_phone, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.Top) {
            Icon(
                Icons.Rounded.LocationOn,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = BsdcThemeTokens.colors.mutedText,
            )
            Spacer(Modifier.width(4.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = order.address_line,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (order.landmark.isNotBlank()) {
                    Text(
                        text = order.landmark,
                        style = MaterialTheme.typography.labelSmall,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                }
                order.distance_km?.let { km ->
                    Text(
                        text = "%.1f ${mkText(bn, "km away", "কিমি দূরে")}".format(km),
                        style = MaterialTheme.typography.labelSmall,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                }
            }
        }
        val lat = order.lat
        val lng = order.lng
        if (lat != null && lng != null) {
            Spacer(Modifier.height(6.dp))
            OutlinedButton(onClick = { onOpenMap(lat, lng) }) {
                Text(mkText(bn, "Open pin on map", "ম্যাপে পিন দেখুন"))
            }
        }
        if (order.note.isNotBlank()) {
            Spacer(Modifier.height(6.dp))
            Text(
                text = mkText(bn, "Note: ", "নোট: ") + order.note,
                style = MaterialTheme.typography.bodySmall,
                color = BsdcThemeTokens.colors.mutedText,
            )
        }
        Spacer(Modifier.height(8.dp))
        order.items.forEach { item ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "${item.name} × ${item.qty}",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                MkPrice(poisha = item.line_total, bn = bn)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = mkText(bn, "Collect on delivery", "ডেলিভারিতে নগদ নেবেন"),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f),
            )
            MkPrice(poisha = order.total_poisha, bn = bn)
        }
        val next = MkLogic.vendorActionsFor(order.status)
        if (next.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                next.forEach { target ->
                    if (target == "cancelled") {
                        OutlinedButton(onClick = { onAction(target) }, enabled = !busy) {
                            Text(vendorActionLabel(target, bn))
                        }
                    } else {
                        Button(onClick = { onAction(target) }, enabled = !busy) {
                            Text(vendorActionLabel(target, bn))
                        }
                    }
                }
            }
        }
    }
}

private fun statusShortLabel(status: String, bn: Boolean): String = when (status) {
    "placed" -> mkText(bn, "New", "নতুন")
    "accepted" -> mkText(bn, "Accepted", "গৃহীত")
    "packaged" -> mkText(bn, "Packed", "প্যাক")
    "out_for_delivery" -> mkText(bn, "On the way", "পথে")
    "delivered" -> mkText(bn, "Delivered", "পৌঁছেছে")
    "cancelled" -> mkText(bn, "Cancelled", "বাতিল")
    else -> status
}

private enum class VendorSection { ORDERS, PRODUCTS, SHOP }

private fun VendorSection.label(bn: Boolean): String = when (this) {
    VendorSection.ORDERS -> mkText(bn, "Orders", "অর্ডার")
    VendorSection.PRODUCTS -> mkText(bn, "Products", "পণ্য")
    VendorSection.SHOP -> mkText(bn, "Shop & credits", "দোকান ও ক্রেডিট")
}

/**
 * For a signed-in user without a shop: the native application wizard, or the status of an application
 * already sent. Approval is an admin step, so the screen says what happens next rather than guessing.
 */
@Composable
private fun MkVendorOnboarding(
    repository: MkRepository,
    bn: Boolean,
    modifier: Modifier = Modifier,
) {
    var application by remember { mutableStateOf<MkMyApplicationDto?>(null) }
    var loaded by remember { mutableStateOf(false) }
    var statusTick by rememberSaveable { mutableStateOf(0) }

    LaunchedEffect(statusTick) {
        application = repository.fetchMyApplication().getOrNull()
        loaded = true
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (!loaded) {
            CircularProgressIndicator(modifier = Modifier.size(28.dp))
            return@Column
        }
        val app = application
        when {
            app != null && app.status == "submitted" -> {
                BsdcStatusBanner(
                    title = mkText(bn, "Application under review", "আবেদন যাচাই চলছে"),
                    body = mkText(
                        bn,
                        "We received your application for ${app.shop_name}. The admin checks your bKash payment before your shop goes live. You get a notification when it is decided.",
                        "${app.shop_name} দোকানের আবেদন পেয়েছি। দোকান চালুর আগে অ্যাডমিন আপনার bKash পেমেন্ট যাচাই করবেন। সিদ্ধান্ত হলে নোটিফিকেশন পাবেন।",
                    ),
                    tone = BsdcTone.WARN,
                )
                OutlinedButton(onClick = { statusTick++ }, modifier = Modifier.fillMaxWidth()) {
                    Text(mkText(bn, "Check status", "অবস্থা দেখুন"))
                }
            }
            app != null && app.status == "approved" -> {
                BsdcStatusBanner(
                    title = mkText(bn, "Approved", "অনুমোদিত"),
                    body = mkText(bn, "Your shop is being set up. Check again in a moment.", "আপনার দোকান প্রস্তুত হচ্ছে। একটু পরে আবার দেখুন।"),
                    tone = BsdcTone.OK,
                )
                OutlinedButton(onClick = { statusTick++ }, modifier = Modifier.fillMaxWidth()) {
                    Text(mkText(bn, "Refresh", "হালনাগাদ করুন"))
                }
            }
            else -> {
                if (app != null && app.status == "rejected") {
                    BsdcStatusBanner(
                        title = mkText(bn, "Application not approved", "আবেদন অনুমোদন পায়নি"),
                        body = app.review_note.ifBlank {
                            mkText(bn, "Check your details and apply again.", "তথ্য দেখে আবার আবেদন করুন।")
                        },
                        tone = BsdcTone.BAD,
                    )
                }
                MkVendorApplyScreen(
                    repository = repository,
                    bn = bn,
                    onSubmitted = { statusTick++ },
                )
            }
        }
    }
}
