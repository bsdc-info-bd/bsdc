package bd.info.bsdc.app.feature.market

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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Campaign
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.ShoppingBag
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.ImageLoader
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcTone

private enum class VendorDetailsTab { INFO, REVIEWS }

/**
 * Production-grade vendor fact-sheet — Foodpanda pattern.
 * Five questions answered before the menu: type, open, delivery, location, reviews.
 * Built only from components that already ship in this app (BsdcBadge/Card/Tokens,
 * MkOsmViewMap, Material3) so the build stays green.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MkVendorDetailsScreen(
    repository: MkRepository,
    imageLoader: ImageLoader,
    slug: String,
    bn: Boolean,
    onBack: () -> Unit,
    onOpenShop: (String) -> Unit,
    onOpenGoogleMaps: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var details by remember { mutableStateOf<MkVendorDetailsDto?>(null) }
    var reviews by remember { mutableStateOf<MkVendorReviewsDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var tab by remember { mutableStateOf(VendorDetailsTab.INFO) }
    var reviewOffset by remember { mutableIntStateOf(0) }
    var reviewsLoading by remember { mutableStateOf(false) }
    var filterRating by remember { mutableIntStateOf(0) }

    LaunchedEffect(slug) {
        loading = true
        repository.fetchVendorDetails(slug)
            .onSuccess { details = it; error = null }
            .onFailure { error = it.message ?: "load_failed" }
        loading = false
        repository.fetchVendorReviews(slug, limit = 20, offset = 0)
            .onSuccess { reviews = it }
    }

    LaunchedEffect(reviewOffset) {
        if (reviewOffset == 0) return@LaunchedEffect
        reviewsLoading = true
        repository.fetchVendorReviews(slug, limit = 20, offset = reviewOffset)
            .onSuccess { page ->
                reviews = reviews?.let { prev -> prev.copy(reviews = prev.reviews + page.reviews) } ?: page
            }
        reviewsLoading = false
    }

    val data = details
    if (loading && data == null) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }
    if (data == null) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            BsdcEmptyState(
                icon = Icons.Rounded.Storefront,
                title = mkText(bn, "Shop not found", "দোকান পাওয়া যায়নি"),
                subtitle = error ?: mkText(bn, "It may be closed or the link is wrong.", "এটি বন্ধ থাকতে পারে বা লিংকটি ভুল।"),
            )
        }
        return
    }

    val vendor = data.vendor
    val schedule = vendor.schedule
    val isOpen = schedule?.is_open ?: true
    val delivery = vendor.delivery

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            TopAppBar(
                title = { Text(text = vendor.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = mkText(bn, "Back", "ফিরে যান"))
                    }
                },
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.padding(innerPadding).fillMaxSize(),
            contentPadding = PaddingValues(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Hero cover + floating badges
            item {
                Box(modifier = Modifier.fillMaxWidth().height(190.dp)) {
                    if (vendor.cover_url.isNotBlank()) {
                        AsyncImage(
                            model = ImageRequest.Builder(LocalContext.current).data(vendor.cover_url).build(),
                            contentDescription = null,
                            imageLoader = imageLoader,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant))
                    }
                    // Top gradient for legibility
                    Box(
                        modifier = Modifier.fillMaxSize().background(
                            androidx.compose.ui.graphics.Brush.verticalGradient(
                                colors = listOf(
                                    androidx.compose.ui.graphics.Color.Transparent,
                                    androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.45f),
                                ),
                            ),
                        ),
                    )
                    Row(
                        modifier = Modifier.align(Alignment.BottomStart).padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        BsdcBadge(label = MkLogic.shopTypeLabel(vendor.vendor_type, bn), tone = BsdcTone.INFO)
                        BsdcBadge(
                            label = if (isOpen) mkText(bn, "Open now", "এখন খোলা") else mkText(bn, "Closed", "বন্ধ"),
                            tone = if (isOpen) BsdcTone.OK else BsdcTone.WARN,
                        )
                    }
                }
            }

            // Identity row: logo + name + rating + place
            item {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    Surface(shape = RoundedCornerShape(16.dp), shadowElevation = 4.dp, modifier = Modifier.size(84.dp)) {
                        if (vendor.logo_url.isNotBlank()) {
                            AsyncImage(
                                model = ImageRequest.Builder(LocalContext.current).data(vendor.logo_url).build(),
                                contentDescription = null,
                                imageLoader = imageLoader,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize(),
                            )
                        } else {
                            Box(
                                modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(Icons.Rounded.Storefront, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    Spacer(modifier = Modifier.width(14.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = vendor.name,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Icon(Icons.Rounded.Star, contentDescription = null, tint = MaterialTheme.colorScheme.tertiary, modifier = Modifier.size(16.dp))
                            Text(text = String.format("%.1f", data.rating), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                            Text(text = "(${data.review_count})", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (vendor.place_label.isNotBlank()) {
                            Text(
                                text = vendor.place_label,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }

            // Three stat pills
            item {
                Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    DetailStatPill(
                        label = mkText(bn, "Delivery", "ডেলিভারি"),
                        value = delivery?.let { d ->
                            when (d.fee_mode) {
                                "per_km" -> MkLogic.formatTaka(d.per_km_rate_poisha, bn) + "/km"
                                else -> MkLogic.formatTaka(if (d.fee_mode == "fixed") d.fixed_fee_poisha else d.fee_poisha, bn)
                            }
                        } ?: MkLogic.formatTaka(15000, bn),
                        modifier = Modifier.weight(1f),
                    )
                    DetailStatPill(
                        label = mkText(bn, "Min order", "সর্বনিম্ন"),
                        value = if ((delivery?.min_order_poisha ?: 0L) > 0) MkLogic.formatTaka(delivery!!.min_order_poisha, bn) else mkText(bn, "None", "নেই"),
                        modifier = Modifier.weight(1f),
                    )
                    DetailStatPill(
                        label = mkText(bn, "Rating", "রেটিং"),
                        value = String.format("%.1f ★", data.rating),
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            // Tab switcher
            item {
                Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = tab == VendorDetailsTab.INFO,
                        onClick = { tab = VendorDetailsTab.INFO },
                        label = { Text(text = mkText(bn, "Info", "তথ্য")) },
                        leadingIcon = { Icon(Icons.Rounded.Info, contentDescription = null, modifier = Modifier.size(16.dp)) },
                    )
                    FilterChip(
                        selected = tab == VendorDetailsTab.REVIEWS,
                        onClick = { tab = VendorDetailsTab.REVIEWS },
                        label = { Text(text = mkText(bn, "Reviews (${data.review_count})", "রিভিউ (${data.review_count})")) },
                        leadingIcon = { Icon(Icons.Rounded.ChatBubbleOutline, contentDescription = null, modifier = Modifier.size(16.dp)) },
                    )
                    Spacer(modifier = Modifier.weight(1f))
                    FilterChip(
                        selected = false,
                        onClick = { onOpenShop(slug) },
                        label = { Text(text = mkText(bn, "Menu", "মেনু")) },
                        leadingIcon = { Icon(Icons.Rounded.ShoppingBag, contentDescription = null, modifier = Modifier.size(16.dp)) },
                    )
                }
            }

            if (tab == VendorDetailsTab.INFO) {
                // About
                item {
                    DetailInfoCard(title = mkText(bn, "About", "দোকান সম্পর্কে"), icon = Icons.Rounded.Storefront) {
                        if (vendor.description.isNotBlank()) {
                            Text(text = vendor.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.height(8.dp))
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            BsdcBadge(label = MkLogic.shopTypeLabel(vendor.vendor_type, bn), tone = BsdcTone.INFO)
                            Text(text = vendor.place_label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }

                // Location + delivery radius map
                if (vendor.lat != null && vendor.lng != null) {
                    item {
                        DetailInfoCard(title = mkText(bn, "Location & delivery area", "অবস্থান ও ডেলিভারি এলাকা"), icon = Icons.Rounded.LocationOn) {
                            Text(text = vendor.place_label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                            Text(text = String.format("%.5f, %.5f", vendor.lat, vendor.lng), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.height(12.dp))
                            MkOsmViewMap(lat = vendor.lat, lng = vendor.lng, bn = bn, modifier = Modifier.fillMaxWidth().height(190.dp))
                            Spacer(modifier = Modifier.height(10.dp))
                            if (delivery != null) {
                                val areaText = if (delivery.scope == "all_bd") mkText(bn, "All of Bangladesh can order", "সারা বাংলাদেশ থেকে অর্ডার করা যায়")
                                else mkText(bn, "Within ${delivery.radius_km} km of the shop", "দোকান থেকে ${delivery.radius_km} কিমি-র মধ্যে")
                                BsdcBadge(label = areaText, tone = BsdcTone.INFO)
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(text = String.format(if (bn) "কেন্দ্র: %.4f, %.4f" else "Centre: %.4f, %.4f", delivery.center_lat ?: vendor.lat, delivery.center_lng ?: vendor.lng), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Spacer(modifier = Modifier.height(14.dp))
                            androidx.compose.material3.Button(
                                onClick = { onOpenGoogleMaps(String.format("https://www.google.com/maps/dir/?api=1&destination=%.6f,%.6f", vendor.lat, vendor.lng)) },
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Icon(Icons.Rounded.LocationOn, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(text = mkText(bn, "Directions", "দিকনির্দেশনা"))
                            }
                        }
                    }
                }

                // Opening hours
                item {
                    DetailInfoCard(title = mkText(bn, "Opening hours", "খোলার সময়"), icon = Icons.Rounded.Schedule) {
                        if (schedule == null || !schedule.enabled) {
                            Text(text = mkText(bn, "Open 24 hours — no schedule set.", "২৪ ঘণ্টা খোলা — সময়সূচি নির্ধারণ করা হয়নি।"), style = MaterialTheme.typography.bodyMedium)
                        } else {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                for (dayKey in listOf("1", "2", "3", "4", "5", "6", "0")) {
                                    val row = schedule.days[dayKey] ?: continue
                                    val dayLabel = when (dayKey) {
                                        "1" -> mkText(bn, "Monday", "সোমবার")
                                        "2" -> mkText(bn, "Tuesday", "মঙ্গলবার")
                                        "3" -> mkText(bn, "Wednesday", "বুধবার")
                                        "4" -> mkText(bn, "Thursday", "বৃহস্পতিবার")
                                        "5" -> mkText(bn, "Friday", "শুক্রবার")
                                        "6" -> mkText(bn, "Saturday", "শনিবার")
                                        else -> mkText(bn, "Sunday", "রবিবার")
                                    }
                                    Row(
                                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(
                                            if (schedule.today_day.toString() == dayKey) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f)
                                            else androidx.compose.ui.graphics.Color.Transparent
                                        ).padding(horizontal = 10.dp, vertical = 8.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(text = dayLabel, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                                        if (row.open) Text(text = row.start + " – " + row.end, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                                        else Text(text = mkText(bn, "Closed", "বন্ধ"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                                    }
                                }
                                if (!isOpen && schedule.next_open != null) {
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(text = mkText(bn, "Closed now · opens ${schedule.next_open.start}", "এখন বন্ধ · খুলবে ${schedule.next_open.start}"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                                }
                                if (isOpen && schedule.closes_at != null) {
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(text = mkText(bn, "Open now · closes at ${schedule.closes_at}", "এখন খোলা · বন্ধ হবে ${schedule.closes_at}"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                                }
                            }
                        }
                    }
                }

                // Delivery
                item {
                    DetailInfoCard(title = mkText(bn, "Delivery charge", "ডেলিভারি চার্জ"), icon = Icons.Rounded.Campaign) {
                        if (delivery != null) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Text(text = mkText(bn, "Mode", "ধরন"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(text = when (delivery.fee_mode) { "per_km" -> mkText(bn, "Per km", "প্রতি কিমি"); "fixed" -> mkText(bn, "Fixed", "নির্ধারিত"); else -> mkText(bn, "Default (৳150)", "ডিফল্ট (৳১৫০)") }, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Text(text = mkText(bn, "Fee", "চার্জ"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(text = when (delivery.fee_mode) { "per_km" -> MkLogic.formatTaka(delivery.per_km_rate_poisha, bn) + "/km"; "fixed" -> MkLogic.formatTaka(delivery.fixed_fee_poisha, bn); else -> MkLogic.formatTaka(delivery.fee_poisha, bn) }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                            }
                            if ((delivery.min_order_poisha ?: 0L) > 0) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(text = mkText(bn, "Min order: ${MkLogic.formatTaka(delivery.min_order_poisha, bn)}", "সর্বনিম্ন অর্ডার: ${MkLogic.formatTaka(delivery.min_order_poisha, bn)}"), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                            }
                        } else {
                            Text(text = MkLogic.formatTaka(15000, bn), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                if (data.recent_reviews.isNotEmpty()) {
                    item {
                        DetailInfoCard(title = mkText(bn, "Recent reviews", "সাম্প্রতিক রিভিউ"), icon = Icons.Rounded.ChatBubbleOutline) {
                            data.recent_reviews.take(3).forEach { r ->
                                DetailReviewRow(review = r, bn = bn)
                                Spacer(modifier = Modifier.height(10.dp))
                            }
                            androidx.compose.material3.TextButton(onClick = { tab = VendorDetailsTab.REVIEWS }, modifier = Modifier.fillMaxWidth()) {
                                Text(text = mkText(bn, "See all ${data.review_count} reviews", "সব ${data.review_count}টি রিভিউ দেখুন"))
                            }
                        }
                    }
                }
            } else {
                // Reviews tab: rating hero + histogram (custom bars to avoid LinearProgressIndicator overload)
                item {
                    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                        Column(modifier = Modifier.padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(text = String.format("%.1f", data.rating), style = MaterialTheme.typography.displayMedium, fontWeight = FontWeight.Black)
                            Row(horizontalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.padding(top = 4.dp)) {
                                repeat(5) { i -> Icon(Icons.Rounded.Star, contentDescription = null, tint = if (i < data.rating.toInt()) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.outline, modifier = Modifier.size(18.dp)) }
                            }
                            Text(text = "${data.review_count} " + mkText(bn, "reviews", "টি রিভিউ"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                            Spacer(modifier = Modifier.height(16.dp))
                            val hist = data.histogram
                            if (hist.isNotEmpty()) {
                                val max = hist.values.maxOrNull()?.coerceAtLeast(1) ?: 1
                                for (star in 5 downTo 1) {
                                    val count = hist[star.toString()] ?: 0
                                    val fraction = count.toFloat() / max.toFloat()
                                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        Text(text = "$star ★", style = MaterialTheme.typography.labelMedium, modifier = Modifier.width(36.dp), fontWeight = FontWeight.Medium)
                                        // Custom bar — avoids LinearProgressIndicator overload ambiguity
                                        Box(modifier = Modifier.weight(1f).height(8.dp).clip(CircleShape).background(MaterialTheme.colorScheme.outlineVariant)) {
                                            Box(modifier = Modifier.fillMaxWidth(fraction).height(8.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
                                        }
                                        Text(text = "$count", style = MaterialTheme.typography.labelSmall, modifier = Modifier.width(30.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                            }
                        }
                    }
                }

                item {
                    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = filterRating == 0, onClick = { filterRating = 0 }, label = { Text(text = mkText(bn, "All", "সব")) })
                        for (s in 5 downTo 1) {
                            FilterChip(selected = filterRating == s, onClick = { filterRating = if (filterRating == s) 0 else s }, label = { Text(text = "$s★") })
                        }
                    }
                }

                val list = reviews?.reviews ?: data.recent_reviews
                val visible = if (filterRating == 0) list else list.filter { it.rating == filterRating }
                if (visible.isEmpty()) {
                    item {
                        BsdcEmptyState(icon = Icons.Rounded.ChatBubbleOutline, title = mkText(bn, "No reviews yet", "এখনো রিভিউ নেই"), subtitle = mkText(bn, "Be the first after delivery.", "ডেলিভারির পর প্রথম রিভিউ দিন।"))
                    }
                } else {
                    items(visible, key = { it.id }) { r ->
                        Box(modifier = Modifier.padding(horizontal = 16.dp)) {
                            BsdcCard(modifier = Modifier.fillMaxWidth()) {
                                DetailReviewRow(review = r, bn = bn)
                            }
                        }
                    }
                    if ((reviews?.reviews?.size ?: 0) >= 18) {
                        item {
                            Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                                if (reviewsLoading) CircularProgressIndicator(modifier = Modifier.size(24.dp))
                                else androidx.compose.material3.OutlinedButton(onClick = { reviewOffset += 20 }) { Text(text = mkText(bn, "Load more", "আরও দেখুন")) }
                            }
                        }
                    }
                }
            }

            item {
                androidx.compose.material3.Button(onClick = { onOpenShop(slug) }, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    Icon(Icons.Rounded.ShoppingBag, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(text = mkText(bn, "View menu", "মেনু দেখুন"))
                }
                Spacer(modifier = Modifier.height(4.dp))
            }
        }
    }
}

@Composable
private fun DetailStatPill(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = modifier) {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(text = label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(modifier = Modifier.height(2.dp))
            Text(text = value, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun DetailInfoCard(title: String, icon: androidx.compose.ui.graphics.vector.ImageVector, content: @Composable () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(imageVector = icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Text(text = title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.height(12.dp))
            content()
        }
    }
}

@Composable
private fun DetailReviewRow(review: MkVendorReviewDto, bn: Boolean) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(36.dp)) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(text = (review.customer.display_name.take(1).ifBlank { "?" }).uppercase(), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Black)
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(text = review.customer.display_name.ifBlank { review.customer.username.ifBlank { mkText(bn, "A customer", "একজন গ্রাহক") } }, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (review.customer.username.isNotBlank()) Text(text = "@${review.customer.username}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.tertiaryContainer) {
                Row(modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(text = "${review.rating}", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Black)
                    Icon(Icons.Rounded.Star, contentDescription = null, modifier = Modifier.size(13.dp))
                }
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            repeat(5) { i -> Icon(Icons.Rounded.Star, contentDescription = null, tint = if (i < review.rating) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.outline, modifier = Modifier.size(15.dp)) }
        }
        if (review.body.isNotBlank()) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = review.body, style = MaterialTheme.typography.bodyMedium)
        }
        Text(text = review.created_at.take(10), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
    }
}

private fun mkText(bn: Boolean, en: String, bnText: String = en): String = if (bn) bnText else en
