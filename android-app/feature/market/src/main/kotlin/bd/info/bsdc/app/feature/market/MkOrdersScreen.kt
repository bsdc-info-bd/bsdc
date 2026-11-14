package bd.info.bsdc.app.feature.market

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Receipt
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import coil3.ImageLoader
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Customer orders: live status timeline (refreshed every 20 s), cancel before handover, rate after delivery. */
@Composable
fun MkOrdersScreen(
    repository: MkRepository,
    imageLoader: ImageLoader,
    bn: Boolean,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var orders by remember { mutableStateOf<List<MkCustomerOrderDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var cancelTarget by remember { mutableStateOf<MkCustomerOrderDto?>(null) }
    var reviewTarget by remember { mutableStateOf<MkCustomerOrderDto?>(null) }

    suspend fun reload() {
        repository.fetchMyOrders()
            .onSuccess { orders = it; error = null }
            .onFailure { error = it.message ?: "load_failed" }
        loading = false
    }

    LaunchedEffect(Unit) {
        while (true) {
            reload()
            delay(20_000L)
        }
    }

    if (!loading && orders.isEmpty()) {
        BsdcEmptyState(
            icon = Icons.Rounded.Receipt,
            title = mkText(bn, "No orders yet", "এখনো কোনো অর্ডার নেই"),
            subtitle = mkText(bn, "Your orders will show here with live status.", "আপনার অর্ডার এখানে লাইভ অবস্থাসহ দেখাবে।"),
            modifier = modifier.fillMaxSize(),
        )
        return
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        error?.let { message ->
            item {
                BsdcStatusBanner(
                    title = mkText(bn, "Could not refresh orders", "অর্ডার আপডেট হয়নি"),
                    body = message,
                    tone = BsdcTone.WARN,
                )
            }
        }
        items(orders, key = { it.id }) { order ->
            BsdcCard(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = order.vendor.name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = "#${order.code} · ${order.placed_at.replace('T', ' ').take(16)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = BsdcThemeTokens.colors.mutedText,
                        )
                    }
                    MkStatusChip(status = order.status, bn = bn)
                }
                if (order.status != "cancelled") {
                    Spacer(Modifier.height(12.dp))
                    MkTimeline(status = order.status, bn = bn)
                }
                Spacer(Modifier.height(12.dp))
                order.items.forEach { item ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        MkImage(
                            url = item.image_url,
                            contentDescription = item.name,
                            imageLoader = imageLoader,
                            modifier = Modifier.size(44.dp),
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            text = "${item.name} × ${item.qty}",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        MkPrice(poisha = item.line_total, bn = bn)
                    }
                    Spacer(Modifier.height(6.dp))
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = mkText(bn, "Total (cash on delivery)", "মোট (ক্যাশ অন ডেলিভারি)"),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                    MkPrice(poisha = order.total_poisha, bn = bn)
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (MkLogic.canCustomerCancel(order.status)) {
                        OutlinedButton(onClick = { cancelTarget = order }) {
                            Text(mkText(bn, "Cancel order", "অর্ডার বাতিল করুন"))
                        }
                    }
                    if (MkLogic.canReview(order.status, order.reviewed)) {
                        Button(onClick = { reviewTarget = order }) {
                            Text(mkText(bn, "Rate this order", "রেটিং দিন"))
                        }
                    }
                    if (order.reviewed) {
                        BsdcBadge(label = mkText(bn, "Reviewed", "রিভিউ দেওয়া হয়েছে"), tone = BsdcTone.OK)
                    }
                }
            }
        }
    }

    cancelTarget?.let { order ->
        var reason by remember(order.id) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { cancelTarget = null },
            title = { Text(mkText(bn, "Cancel this order?", "এই অর্ডার বাতিল করবেন?")) },
            text = {
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = { Text(mkText(bn, "Reason (optional)", "কারণ (ঐচ্ছিক)")) },
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                Button(onClick = {
                    val id = order.id
                    cancelTarget = null
                    scope.launch {
                        repository.cancelOrder(id, reason.trim())
                            .onFailure { error = it.message ?: "cancel_failed" }
                        reload()
                    }
                }) { Text(mkText(bn, "Yes, cancel", "হ্যাঁ, বাতিল করুন")) }
            },
            dismissButton = {
                OutlinedButton(onClick = { cancelTarget = null }) {
                    Text(mkText(bn, "Keep order", "অর্ডার রাখুন"))
                }
            },
        )
    }

    reviewTarget?.let { order ->
        var rating by remember(order.id) { mutableStateOf(5) }
        var body by remember(order.id) { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { reviewTarget = null },
            title = { Text(mkText(bn, "How was your order?", "অর্ডারটি কেমন ছিল?")) },
            text = {
                Column {
                    Row {
                        (1..5).forEach { star ->
                            IconButton(onClick = { rating = star }) {
                                Icon(
                                    imageVector = if (star <= rating) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                                    contentDescription = "$star",
                                    tint = BsdcThemeTokens.colors.warn,
                                    modifier = Modifier.size(32.dp),
                                )
                            }
                        }
                    }
                    OutlinedTextField(
                        value = body,
                        onValueChange = { body = it },
                        label = { Text(mkText(bn, "Write a review (optional)", "রিভিউ লিখুন (ঐচ্ছিক)")) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    val id = order.id
                    val stars = rating
                    val text = body.trim()
                    reviewTarget = null
                    scope.launch {
                        repository.submitReview(id, stars, text)
                            .onFailure { error = it.message ?: "review_failed" }
                        reload()
                    }
                }) { Text(mkText(bn, "Submit", "জমা দিন")) }
            },
            dismissButton = {
                OutlinedButton(onClick = { reviewTarget = null }) {
                    Text(mkText(bn, "Not now", "পরে"))
                }
            },
        )
    }
}
