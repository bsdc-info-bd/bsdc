package bd.info.bsdc.app.feature.market

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ShoppingCart
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.BookmarkBorder
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcDirectorySkeletonCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import coil3.ImageLoader
import kotlinx.coroutines.launch

/** Product detail with image strip, quantity, add to cart, and direct buy (cash on delivery). */
@Composable
fun MkProductScreen(
    repository: MkRepository,
    imageLoader: ImageLoader,
    bn: Boolean,
    productId: String,
    signedIn: Boolean,
    onSignIn: () -> Unit,
    onBuyNow: (vendorSlug: String, vendorName: String, items: List<MkDirectItem>) -> Unit,
    onOpenCart: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var detail by remember { mutableStateOf<MkProductDetailDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var qty by rememberSaveable { mutableStateOf(1) }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<Pair<String, BsdcTone>?>(null) }
    val context = LocalContext.current
    val savedStore = remember(context) { MkSavedStore.get(context) }
    val wishlist by savedStore.wishlist.collectAsState()
    // Derived from the store rather than copied into local state, so un-saving the same
    // product from the shop list updates this button without leaving the page.
    val wished = wishlist.any { it.id == productId }

    LaunchedEffect(productId) {
        loading = true
        detail = repository.fetchProductDetail(productId).getOrNull()
        loading = false
        // Opening the page is what makes it "recently viewed"; the shelf remembers the price
        // and the shop so the row still reads correctly after the catalogue moves on.
        detail?.let { record ->
            savedStore.recordView(
                MkSavedProduct(
                    id = record.id,
                    name = record.name,
                    shopSlug = record.vendor.slug,
                    shopName = record.vendor.name,
                    pricePoisha = record.price_poisha,
                    imageUrl = record.images.firstOrNull().orEmpty(),
                ),
            )
        }
    }

    val product = detail
    if (product == null) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            if (loading) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    BsdcDirectorySkeletonCard()
                    BsdcDirectorySkeletonCard()
                }
            } else {
                BsdcEmptyState(
                    icon = Icons.Rounded.Storefront,
                    title = mkText(bn, "Product not available", "পণ্যটি পাওয়া যায়নি"),
                    subtitle = mkText(bn, "It may have been removed.", "এটি সরিয়ে ফেলা হয়ে থাকতে পারে।"),
                )
            }
        }
        return
    }

    val maxQty = product.stock.coerceAtLeast(1)
    val shopOpen = product.vendor.schedule?.is_open != false
    val canBuy = product.in_stock && product.stock > 0 && shopOpen
    val selectedQty = qty.coerceIn(1, maxQty)

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            LazyRow(
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                val images = product.images.ifEmpty { listOf("") }
                items(images) { url ->
                    MkImage(
                        url = url,
                        contentDescription = product.name,
                        imageLoader = imageLoader,
                        modifier = Modifier.width(280.dp).height(220.dp),
                    )
                }
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = product.name,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(
                        onClick = {
                            val nowSaved = savedStore.toggleWishlist(
                                MkSavedProduct(
                                    id = product.id,
                                    name = product.name,
                                    shopSlug = product.vendor.slug,
                                    shopName = product.vendor.name,
                                    pricePoisha = product.price_poisha,
                                    imageUrl = product.images.firstOrNull().orEmpty(),
                                ),
                            )
                            notice = (if (nowSaved) {
                                mkText(bn, "Saved to your wish list.", "ইচ্ছাতালিকায় যোগ হয়েছে।")
                            } else {
                                mkText(bn, "Removed from your wish list.", "ইচ্ছাতালিকা থেকে সরানো হয়েছে।")
                            }) to BsdcTone.OK
                        },
                    ) {
                        Icon(
                            imageVector = if (wished) Icons.Rounded.Bookmark else Icons.Rounded.BookmarkBorder,
                            contentDescription = mkText(bn, "Wish list", "ইচ্ছাতালিকা"),
                            tint = if (wished) BsdcThemeTokens.colors.brandStrong else BsdcThemeTokens.colors.mutedText,
                        )
                    }
                }
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    MkPrice(poisha = product.price_poisha, bn = bn)
                    Spacer(Modifier.width(12.dp))
                    if (!shopOpen) {
                        BsdcBadge(label = mkText(bn, "Shop closed", "দোকান বন্ধ"), tone = BsdcTone.WARN)
                    } else if (canBuy) {
                        BsdcBadge(label = mkText(bn, "In stock", "স্টক আছে"), tone = BsdcTone.OK)
                    } else {
                        BsdcBadge(label = mkText(bn, "Out of stock", "স্টক শেষ"), tone = BsdcTone.WARN)
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    MkStars(rating = product.rating)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = product.vendor.name,
                        style = MaterialTheme.typography.bodySmall,
                        color = BsdcThemeTokens.colors.mutedText,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        if (product.description.isNotBlank()) {
            item {
                Text(
                    text = product.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = BsdcThemeTokens.colors.mutedText,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
            }
        }
        item {
            BsdcCard(modifier = Modifier.padding(horizontal = 16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = mkText(bn, "Quantity", "পরিমাণ"),
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier.weight(1f),
                    )
                    MkQtyStepper(
                        qty = selectedQty,
                        max = maxQty,
                        bn = bn,
                        onChange = { qty = it.coerceIn(1, maxQty) },
                    )
                }
                Spacer(Modifier.height(4.dp))
                val deliveryNote = product.vendor.delivery?.let { del ->
                    if (del.fee_mode == "per_km") {
                        val rate = MkLogic.formatTaka(del.per_km_rate_poisha, bn)
                        mkText(bn, "Pay cash on delivery · $rate / km.", "হাতে পেয়ে নগদ দিন · ডেলিভারি $rate / কিমি।")
                    } else {
                        val chg = MkLogic.formatTaka(
                            if (del.fee_mode == "fixed") del.fixed_fee_poisha else del.default_fee_poisha,
                            bn,
                        )
                        mkText(bn, "Pay cash on delivery · Delivery $chg.", "হাতে পেয়ে নগদ পরিশোধ করুন · ডেলিভারি $chg।")
                    }
                } ?: mkText(bn, "Pay in cash when it arrives.", "পণ্য হাতে পেয়ে নগদ পরিশোধ করুন।")
                Text(
                    text = deliveryNote,
                    style = MaterialTheme.typography.bodySmall,
                    color = BsdcThemeTokens.colors.mutedText,
                )
                product.vendor.delivery?.takeIf { MkLogic.hasMinimumOrder(it.min_order_poisha) }?.let { del ->
                    Text(
                        text = mkText(
                            bn,
                            "This shop takes orders from " + MkLogic.formatTaka(del.min_order_poisha, bn) + ".",
                            "এই দোকান " + MkLogic.formatTaka(del.min_order_poisha, bn) + " থেকে অর্ডার নেয়।",
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                }
            }
        }
        notice?.let { (text, tone) ->
            item {
                BsdcStatusBanner(
                    title = text,
                    body = "",
                    tone = tone,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(
                    onClick = {
                        if (!signedIn) {
                            onSignIn()
                            return@OutlinedButton
                        }
                        scope.launch {
                            busy = true
                            val existing = repository.fetchMyCart().getOrNull()
                                ?.firstOrNull { it.product_id == product.id }?.qty ?: 0
                            repository.setCartQuantity(product.id, (existing + selectedQty).coerceAtMost(maxQty))
                                .onSuccess {
                                    notice = mkText(bn, "Added to cart", "কার্টে যোগ হয়েছে") to BsdcTone.OK
                                }
                                .onFailure {
                                    notice = (it.message ?: "error") to BsdcTone.BAD
                                }
                            busy = false
                        }
                    },
                    enabled = canBuy && !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Rounded.ShoppingCart, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(mkText(bn, "Add to cart", "কার্টে যোগ করুন"))
                }
                Button(
                    onClick = {
                        if (!signedIn) {
                            onSignIn()
                            return@Button
                        }
                        onBuyNow(
                            product.vendor.slug,
                            product.vendor.name,
                            listOf(MkDirectItem(productId = product.id, qty = selectedQty)),
                        )
                    },
                    enabled = canBuy && !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(mkText(bn, "Order now (cash on delivery)", "এখনই অর্ডার করুন (ক্যাশ অন ডেলিভারি)"))
                }
                OutlinedButton(onClick = onOpenCart, modifier = Modifier.fillMaxWidth()) {
                    Text(mkText(bn, "View cart", "কার্ট দেখুন"))
                }
            }
        }
    }
}

/** Cart grouped by shop. Each shop checks out on its own, because one order goes to one vendor. */
@Composable
fun MkCartScreen(
    repository: MkRepository,
    imageLoader: ImageLoader,
    bn: Boolean,
    onCheckout: (vendorSlug: String, vendorName: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var lines by remember { mutableStateOf<List<MkCartLineDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun reload() {
        repository.fetchMyCart()
            .onSuccess { lines = it; error = null }
            .onFailure { error = it.message ?: "load_failed" }
        loading = false
    }

    LaunchedEffect(Unit) { reload() }

    fun changeQty(productId: String, next: Int) {
        scope.launch {
            repository.setCartQuantity(productId, next)
                .onFailure { error = it.message ?: "update_failed" }
            reload()
        }
    }

    if (!loading && lines.isEmpty()) {
        BsdcEmptyState(
            icon = Icons.Rounded.ShoppingCart,
            title = mkText(bn, "Your cart is empty", "আপনার কার্ট খালি"),
            subtitle = mkText(bn, "Add products from a shop to order.", "অর্ডার করতে কোনো দোকান থেকে পণ্য যোগ করুন।"),
            modifier = modifier.fillMaxSize(),
        )
        return
    }

    val groups = lines.groupBy { it.vendor_slug }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        error?.let { message ->
            item {
                BsdcStatusBanner(
                    title = mkText(bn, "Cart update failed", "কার্ট আপডেট হয়নি"),
                    body = message,
                    tone = BsdcTone.BAD,
                )
            }
        }
        items(groups.entries.toList(), key = { it.key }) { (slug, shopLines) ->
            val shopName = shopLines.first().vendor_name
            val orderable = shopLines.filter { it.orderable }
            val subtotal = orderable.sumOf { it.line_total }
            BsdcCard {
                Text(
                    text = shopName,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                shopLines.forEach { line ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        MkImage(
                            url = line.image_url,
                            contentDescription = line.product_name,
                            imageLoader = imageLoader,
                            modifier = Modifier.size(56.dp),
                        )
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                text = line.product_name,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (line.orderable) {
                                MkPrice(poisha = line.line_total, bn = bn)
                            } else {
                                BsdcBadge(
                                    label = if (!line.vendor_open) {
                                        mkText(bn, "Shop closed", "দোকান বন্ধ")
                                    } else {
                                        mkText(bn, "Unavailable", "পাওয়া যাচ্ছে না")
                                    },
                                    tone = BsdcTone.WARN,
                                )
                            }
                        }
                        MkQtyStepper(
                            qty = line.qty,
                            max = line.stock.coerceAtLeast(line.qty),
                            bn = bn,
                            onChange = { next -> changeQty(line.product_id, next) },
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = mkText(bn, "Subtotal", "সাবটোটাল"),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                    MkPrice(poisha = subtotal, bn = bn)
                }

                // The shop's minimum, read off the cart lines themselves: `mk_my_cart` joins it on, so
                // the nudge costs no second call and cannot quote a number from a stale shop page.
                val minOrder = shopLines.firstOrNull()?.min_order_poisha ?: 0L
                val shortfall = MkLogic.minimumOrderShortfallPoisha(subtotal, minOrder)
                val short = shortfall > 0L
                if (MkLogic.hasMinimumOrder(minOrder)) {
                    Spacer(Modifier.height(8.dp))
                    if (short) {
                        Text(
                            text = mkText(
                                bn,
                                "Add ${MkLogic.formatTaka(shortfall, bn)} more — this shop takes orders from " +
                                    "${MkLogic.formatTaka(minOrder, bn)}.",
                                "আরও ${MkLogic.formatTaka(shortfall, bn)} যোগ করুন — এই দোকান " +
                                    "${MkLogic.formatTaka(minOrder, bn)} থেকে অর্ডার নেয়।",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    } else {
                        Text(
                            text = mkText(
                                bn,
                                "Minimum order met (${MkLogic.formatTaka(minOrder, bn)}).",
                                "সর্বনিম্ন অর্ডার পূরণ হয়েছে (${MkLogic.formatTaka(minOrder, bn)})।",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = { onCheckout(slug, shopName) },
                    enabled = orderable.isNotEmpty() && !short,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = if (short) {
                            mkText(bn, "Below the shop's minimum", "দোকানের সর্বনিম্নের নিচে")
                        } else {
                            mkText(bn, "Checkout with this shop", "এই দোকানে অর্ডার করুন")
                        },
                    )
                }
            }
        }
    }
}
