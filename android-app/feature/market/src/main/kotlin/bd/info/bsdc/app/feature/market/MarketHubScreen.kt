package bd.info.bsdc.app.feature.market

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Campaign
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.ShoppingBag
import androidx.compose.material.icons.rounded.ShoppingCart
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcAdSlot
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.model.AdPlacement
import bd.info.bsdc.app.core.model.AppLanguage
import coil3.ImageLoader
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun MarketHubScreen(
    repository: MarketRepository,
    imageLoader: ImageLoader,
    viewerUid: String?,
    language: AppLanguage,
    initialSection: MarketSection = MarketSection.SHOP,
    onBack: () -> Unit,
    onSignInRequired: () -> Unit,
    onOpenExternal: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val scope = rememberCoroutineScope()

    var section by rememberSaveable { mutableStateOf(initialSection) }
    LaunchedEffect(initialSection) {
        section = initialSection
    }
    var searchQuery by rememberSaveable { mutableStateOf("") }
    var products by remember { mutableStateOf<List<CatalogProductDto>>(emptyList()) }
    var cartLines by remember { mutableStateOf<List<CartLineDto>>(emptyList()) }
    var addresses by remember { mutableStateOf<List<AddressDto>>(emptyList()) }
    var selectedAddressId by remember { mutableStateOf<String?>(null) }
    var orders by remember { mutableStateOf<List<MyOrderDto>>(emptyList()) }
    var myShop by remember { mutableStateOf<MyShopDto?>(null) }
    var shopOrders by remember { mutableStateOf<List<ShopOrderDto>>(emptyList()) }
    var adWalletBalance by remember { mutableStateOf(0L) }
    var campaigns by remember { mutableStateOf<List<MyCampaignDto>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var statusBanner by remember { mutableStateOf<Pair<String, BsdcTone>?>(null) }

    var showNewAddressDialog by remember { mutableStateOf(false) }
    var addrName by remember { mutableStateOf("") }
    var addrPhone by remember { mutableStateOf("") }
    var addrLine by remember { mutableStateOf("") }
    var addrCity by remember { mutableStateOf("") }

    fun loadActive() {
        scope.launch {
            busy = true
            val onErr: (Throwable) -> Unit = { err ->
                statusBanner = (err.localizedMessage ?: (if (bn) "লোড ব্যর্থ হয়েছে।" else "Failed to load.")) to BsdcTone.BAD
            }
            when (section) {
                MarketSection.SHOP -> {
                    repository.fetchCatalog(search = searchQuery.takeIf { it.isNotBlank() })
                        .onSuccess { products = it }
                        .onFailure(onErr)
                }
                MarketSection.CART -> {
                    if (!viewerUid.isNullOrBlank()) {
                        repository.fetchCart().onSuccess { cartLines = it }.onFailure(onErr)
                        repository.fetchAddresses(viewerUid).onSuccess { list ->
                            addresses = list
                            if (selectedAddressId == null) selectedAddressId = list.firstOrNull()?.id
                        }.onFailure(onErr)
                    }
                }
                MarketSection.ORDERS -> {
                    if (!viewerUid.isNullOrBlank()) {
                        repository.fetchOrders().onSuccess { orders = it }.onFailure(onErr)
                    }
                }
                MarketSection.VENDOR -> {
                    if (!viewerUid.isNullOrBlank()) {
                        repository.fetchMyShop().onSuccess { myShop = it }.onFailure(onErr)
                        repository.fetchShopOrders().onSuccess { shopOrders = it }.onFailure(onErr)
                    }
                }
                MarketSection.ADS -> {
                    if (!viewerUid.isNullOrBlank()) {
                        repository.fetchAdWalletBalance().onSuccess { adWalletBalance = it }.onFailure(onErr)
                        repository.fetchMyCampaigns().onSuccess { campaigns = it }.onFailure(onErr)
                    }
                }
            }
            busy = false
        }
    }

    LaunchedEffect(section, viewerUid) {
        loadActive()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(if (bn) "BSDC মার্কেটপ্লেস ও স্টোর" else "BSDC Marketplace & Store")
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        modifier = modifier,
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    MarketSection.entries.forEach { tab ->
                        val label = when (tab) {
                            MarketSection.SHOP -> if (bn) "দোকান" else "Shop"
                            MarketSection.CART -> if (bn) "কার্ট" else "Cart"
                            MarketSection.ORDERS -> if (bn) "অর্ডার" else "Orders"
                            MarketSection.VENDOR -> if (bn) "ভেন্ডর" else "Vendor"
                            MarketSection.ADS -> if (bn) "বিজ্ঞাপন" else "Ads"
                        }
                        FilterChip(
                            selected = section == tab,
                            onClick = { section = tab },
                            label = { Text(label) },
                        )
                    }
                }
            }

            if (busy) {
                item { LinearProgressIndicator(modifier = Modifier.fillMaxWidth()) }
            }

            statusBanner?.let { (msg, tone) ->
                item {
                    BsdcStatusBanner(title = msg, body = "", tone = tone)
                }
            }

            when (section) {
                MarketSection.SHOP -> {
                    item {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            OutlinedTextField(
                                value = searchQuery,
                                onValueChange = { searchQuery = it },
                                label = { Text(if (bn) "পণ্য খুঁজুন..." else "Search catalog...") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                            BsdcButton(
                                label = if (bn) "খুঁজুন" else "Go",
                                onClick = { loadActive() },
                            )
                        }
                    }

                    item("shop_ad") {
                        BsdcAdSlot(
                            placement = AdPlacement.SHOP,
                            supabase = repository.restClient,
                            imageLoader = imageLoader,
                            language = language,
                            topic = searchQuery.takeIf { it.isNotBlank() },
                            onOpenExternal = onOpenExternal,
                        )
                    }

                    if (products.isEmpty() && !busy) {
                        item {
                            BsdcEmptyState(
                                icon = Icons.Rounded.ShoppingBag,
                                title = if (bn) "কোনো পণ্য পাওয়া যায়নি" else "No catalog products found",
                                subtitle = if (bn) "ডেভেলপার সামগ্রী, বই ও মার্চেন্ডাইজ এখানে পাবেন।" else "Developer merch, books & community gear appear here.",
                            )
                        }
                    }

                    items(products, key = { it.id }) { prod ->
                        BsdcCard {
                            if (prod.imageUrl.isNotBlank()) {
                                BsdcImgbbImage(
                                    fullUrl = prod.imageUrl,
                                    thumbUrl = prod.imageUrl,
                                    contentDescription = prod.title,
                                    imageLoader = imageLoader,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    BsdcBadge(label = prod.shopName.ifBlank { "BSDC Shop" }, tone = BsdcTone.INFO)
                                    if (prod.isDigital) {
                                        BsdcBadge(label = if (bn) "ডিজিটাল (ওয়েব)" else "DIGITAL", tone = BsdcTone.WARN)
                                    }
                                }
                                IconButton(
                                    onClick = {
                                        if (viewerUid.isNullOrBlank()) {
                                            onSignInRequired()
                                        } else {
                                            scope.launch {
                                                repository.toggleWishlist(prod.id)
                                                    .onSuccess { loadActive() }
                                                    .onFailure { err ->
                                                        statusBanner = (err.localizedMessage ?: "Wishlist update failed") to BsdcTone.BAD
                                                    }
                                            }
                                        }
                                    },
                                ) {
                                    Icon(
                                        imageVector = if (prod.wishlisted) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                                        contentDescription = "Wishlist",
                                    )
                                }
                            }
                            Text(text = prod.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            if (prod.summary.isNotBlank()) {
                                Text(text = prod.summary, style = MaterialTheme.typography.bodySmall)
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = MarketBillingPolicyEngine.formatCurrency(prod.price, prod.currency, bn),
                                    style = MaterialTheme.typography.titleMedium,
                                    color = BsdcThemeTokens.colors.brandStrong,
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    text = "★ ${MarketBillingPolicyEngine.formatRating(prod.ratingSum, prod.ratingCount)}",
                                    style = MaterialTheme.typography.labelMedium,
                                )
                            }
                            if (MarketBillingPolicyEngine.canOrderPhysicallyInApp(prod.isDigital)) {
                                BsdcButton(
                                    label = if (prod.stock > 0) {
                                        if (bn) "কার্টে যোগ করুন" else "Add to Cart"
                                    } else {
                                        if (bn) "স্টক শেষ" else "Out of Stock"
                                    },
                                    enabled = prod.stock > 0,
                                    leadingIcon = Icons.Rounded.ShoppingCart,
                                    onClick = {
                                        if (viewerUid.isNullOrBlank()) {
                                            onSignInRequired()
                                        } else {
                                            scope.launch {
                                                repository.addToCart(prod.id, 1)
                                                    .onSuccess {
                                                        statusBanner = (if (bn) "কার্টে যোগ হয়েছে।" else "Added to cart.") to BsdcTone.OK
                                                    }
                                                    .onFailure { err ->
                                                        statusBanner = (err.localizedMessage ?: "Could not add to cart") to BsdcTone.BAD
                                                    }
                                            }
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            } else {
                                BsdcStatusBanner(
                                    title = if (bn) "ডিজিটাল পণ্য" else "Digital fulfillment item",
                                    body = if (bn) {
                                        "Play Store নীতিমালার কারণে ডিজিটাল পণ্য সরাসরি www.bsdc.info.bd থেকে সংগ্রহযোগ্য।"
                                    } else {
                                        "Managed outside in-app purchase flow in compliance with Google Play payments policy."
                                    },
                                    tone = BsdcTone.INFO,
                                )
                            }
                        }
                    }
                }

                MarketSection.CART -> {
                    if (viewerUid.isNullOrBlank()) {
                        item {
                            BsdcCard {
                                Text(text = if (bn) "কার্ট দেখতে সাইন ইন করুন" else "Sign in to view your cart")
                                BsdcButton(label = if (bn) "সাইন ইন" else "Sign in", onClick = onSignInRequired)
                            }
                        }
                    } else if (cartLines.isEmpty() && !busy) {
                        item {
                            BsdcEmptyState(
                                icon = Icons.Rounded.ShoppingCart,
                                title = if (bn) "আপনার কার্ট খালি" else "Your cart is empty",
                                subtitle = if (bn) "দোকান ট্যাব থেকে ভৌত পণ্য যোগ করুন।" else "Add physical goods from the Shop tab.",
                            )
                        }
                    } else {
                        items(cartLines, key = { it.productId }) { line ->
                            BsdcCard {
                                Text(text = line.title, style = MaterialTheme.typography.titleMedium)
                                Text(
                                    text = MarketBillingPolicyEngine.formatCurrency(line.lineTotal, line.currency, bn),
                                    color = BsdcThemeTokens.colors.brandStrong,
                                    fontWeight = FontWeight.Bold,
                                )
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    IconButton(
                                        onClick = {
                                            scope.launch {
                                                repository.setCartQuantity(line.productId, line.quantity - 1)
                                                    .onSuccess { loadActive() }
                                                    .onFailure { err -> statusBanner = (err.localizedMessage ?: "Cart update failed") to BsdcTone.BAD }
                                            }
                                        },
                                    ) { Icon(Icons.Rounded.Remove, contentDescription = "Decrease") }
                                    Text(text = BanglaDigitFormatter.formatCount(line.quantity.toLong(), language))
                                    IconButton(
                                        onClick = {
                                            scope.launch {
                                                repository.setCartQuantity(line.productId, line.quantity + 1)
                                                    .onSuccess { loadActive() }
                                                    .onFailure { err -> statusBanner = (err.localizedMessage ?: "Cart update failed") to BsdcTone.BAD }
                                            }
                                        },
                                    ) { Icon(Icons.Rounded.Add, contentDescription = "Increase") }
                                }
                            }
                        }

                        item {
                            BsdcCard {
                                Text(
                                    text = if (bn) "ডেলিভারি ঠিকানা (Cash on Delivery)" else "Delivery Address (Cash on Delivery)",
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                addresses.forEach { addr ->
                                    FilterChip(
                                        selected = selectedAddressId == addr.id,
                                        onClick = { selectedAddressId = addr.id },
                                        label = { Text("${addr.recipient} — ${addr.line1}, ${addr.city}") },
                                    )
                                }
                                OutlinedButton(onClick = { showNewAddressDialog = true }) {
                                    Text(if (bn) "নতুন ঠিকানা যোগ করুন" else "Add New Address")
                                }
                                val estTotal = cartLines.sumOf { it.lineTotal }
                                Text(
                                    text = "${if (bn) "সাবটোটাল" else "Subtotal"}: ${MarketBillingPolicyEngine.formatCurrency(estTotal, "BDT", bn)}",
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                BsdcButton(
                                    label = if (bn) "ক্যাশ অন ডেলিভারি অর্ডার করুন" else "Place Cash-on-Delivery Order",
                                    enabled = selectedAddressId != null && cartLines.isNotEmpty(),
                                    onClick = {
                                        val addrId = selectedAddressId ?: return@BsdcButton
                                        scope.launch {
                                            repository.placeCodOrder(addrId)
                                                .onSuccess { placed ->
                                                    val codes = placed.joinToString(", ") { it.code }
                                                    statusBanner = (if (bn) "অর্ডার সম্পন্ন: $codes" else "Orders placed: $codes") to BsdcTone.OK
                                                    section = MarketSection.ORDERS
                                                }
                                                .onFailure { err ->
                                                    statusBanner = (err.localizedMessage ?: "Checkout error") to BsdcTone.BAD
                                                }
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }
                }

                MarketSection.ORDERS -> {
                    items(orders, key = { it.id }) { ord ->
                        BsdcCard {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(text = ord.code, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                BsdcBadge(
                                    label = MarketBillingPolicyEngine.orderStatusLabel(ord.status, bn),
                                    tone = BsdcTone.INFO,
                                )
                            }
                            Text(text = "${ord.shopName} • ${MarketBillingPolicyEngine.formatCurrency(ord.total, ord.currency, bn)}")
                            if (ord.canCancel) {
                                OutlinedButton(
                                    onClick = {
                                        scope.launch {
                                            repository.cancelOrder(ord.id)
                                                .onSuccess { loadActive() }
                                                .onFailure { err -> statusBanner = (err.localizedMessage ?: "Cancel failed") to BsdcTone.BAD }
                                        }
                                    },
                                ) { Text(if (bn) "অর্ডার বাতিল" else "Cancel Order") }
                            }
                        }
                    }
                }

                MarketSection.VENDOR -> {
                    item {
                        val shop = myShop
                        if (shop == null) {
                            BsdcEmptyState(
                                icon = Icons.Rounded.Storefront,
                                title = if (bn) "আপনার কোনো ভেন্ডর শপ নেই" else "No active vendor shop",
                                subtitle = if (bn) "BSDC ভেন্ডর প্যানেল এখানে দেখা যাবে।" else "Approved vendor storefronts & incoming orders appear here.",
                            )
                        } else {
                            BsdcCard {
                                BsdcBadge(label = shop.status.uppercase(), tone = BsdcTone.INFO)
                                Text(text = shop.name, style = MaterialTheme.typography.titleLarge)
                                Text(
                                    text = "${if (bn) "ব্যালেন্স" else "Balance"}: ${MarketBillingPolicyEngine.formatCurrency(shop.balance, "BDT", bn)} • ${shop.openOrders} open orders",
                                )
                            }
                        }
                    }
                    items(shopOrders, key = { it.id }) { so ->
                        BsdcCard {
                            Text(text = "${so.code} (${so.status})", style = MaterialTheme.typography.titleMedium)
                            Text(text = "${so.recipient} • ${so.city}")
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                so.nextStatuses.forEach { nxt ->
                                    OutlinedButton(
                                        onClick = {
                                            scope.launch {
                                                repository.advanceOrder(so.id, nxt)
                                                    .onSuccess { loadActive() }
                                                    .onFailure { err -> statusBanner = (err.localizedMessage ?: "Order update failed") to BsdcTone.BAD }
                                            }
                                        },
                                    ) { Text("Mark $nxt") }
                                }
                            }
                        }
                    }
                }

                MarketSection.ADS -> {
                    item {
                        BsdcCard {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(Icons.Rounded.Campaign, contentDescription = null, tint = BsdcThemeTokens.colors.brandStrong)
                                Text(
                                    text = "${if (bn) "বিজ্ঞাপন ওয়ালেট" else "Ad Wallet"}: ${MarketBillingPolicyEngine.formatCurrency(adWalletBalance, "BDT", bn)}",
                                    style = MaterialTheme.typography.titleMedium,
                                )
                            }
                        }
                    }
                    items(campaigns, key = { it.id }) { c ->
                        BsdcCard {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(text = c.name, style = MaterialTheme.typography.titleMedium)
                                BsdcBadge(label = c.status.uppercase(), tone = BsdcTone.INFO)
                            }
                            Text(text = "Impressions: ${c.impressions} • Clicks: ${c.clicks}")
                            Text(
                                text = "${if (bn) "বাজেট" else "Budget"}: ${MarketBillingPolicyEngine.formatCurrency(c.totalBudget, "BDT", bn)} • ${if (bn) "ব্যয়" else "Spent"}: ${MarketBillingPolicyEngine.formatCurrency(c.spent, "BDT", bn)}",
                                style = MaterialTheme.typography.bodySmall,
                            )
                            if (c.status == "active" || c.status == "paused") {
                                val isPaused = c.status == "paused"
                                OutlinedButton(
                                    onClick = {
                                        scope.launch {
                                            repository.toggleCampaignPause(c.id, !isPaused)
                                                .onSuccess { loadActive() }
                                                .onFailure { err -> statusBanner = (err.localizedMessage ?: "Campaign update failed") to BsdcTone.BAD }
                                        }
                                    },
                                ) {
                                    Text(if (isPaused) (if (bn) "চালু করুন" else "Resume") else (if (bn) "বিরতি দিন" else "Pause"))
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showNewAddressDialog && !viewerUid.isNullOrBlank()) {
        AlertDialog(
            onDismissRequest = { showNewAddressDialog = false },
            title = { Text(if (bn) "নতুন ডেলিভারি ঠিকানা" else "New Delivery Address") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = addrName, onValueChange = { addrName = it }, label = { Text(if (bn) "প্রাপকের নাম" else "Recipient") }, singleLine = true)
                    OutlinedTextField(value = addrPhone, onValueChange = { addrPhone = it }, label = { Text(if (bn) "ফোন নম্বর" else "Phone") }, singleLine = true)
                    OutlinedTextField(value = addrLine, onValueChange = { addrLine = it }, label = { Text(if (bn) "ঠিকানা" else "Address line") }, singleLine = true)
                    OutlinedTextField(value = addrCity, onValueChange = { addrCity = it }, label = { Text(if (bn) "শহর" else "City") }, singleLine = true)
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            repository.saveAddress(
                                uid = viewerUid,
                                recipient = addrName,
                                phone = addrPhone,
                                line1 = addrLine,
                                city = addrCity,
                                district = addrCity,
                                postcode = "1000",
                            ).onSuccess { created ->
                                selectedAddressId = created.id
                                showNewAddressDialog = false
                                loadActive()
                            }.onFailure { err ->
                                statusBanner = (err.localizedMessage ?: "Address save failed") to BsdcTone.BAD
                            }
                        }
                    },
                ) { Text(if (bn) "সংরক্ষণ" else "Save") }
            },
            dismissButton = {
                TextButton(onClick = { showNewAddressDialog = false }) { Text(if (bn) "বাতিল" else "Cancel") }
            },
        )
    }
}
