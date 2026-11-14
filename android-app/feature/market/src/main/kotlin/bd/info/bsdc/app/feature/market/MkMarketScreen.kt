package bd.info.bsdc.app.feature.market

import androidx.activity.compose.BackHandler
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
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Campaign
import androidx.compose.material.icons.rounded.Dashboard
import androidx.compose.material.icons.rounded.Receipt
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.ShoppingCart
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
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
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.model.AppLanguage
import coil3.ImageLoader
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Screens of the cash-on-delivery marketplace. The stack keeps back navigation predictable. */
sealed interface MkRoute {
    data object Shops : MkRoute
    data class Vendor(val slug: String) : MkRoute
    data class Product(val id: String) : MkRoute
    data object Cart : MkRoute
    data class Checkout(val vendorSlug: String, val vendorName: String, val direct: List<MkDirectItem>?) : MkRoute
    data object Orders : MkRoute
    data object Console : MkRoute
}

/**
 * Root of the marketplace. Customers browse shops, buy with cash on delivery, and track orders.
 * Vendors see their own console. Ads stay in the legacy hub, reached through [onOpenAds].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MkMarketScreen(
    repository: MkRepository,
    mediaRepository: BsdcMediaRepository,
    imageLoader: ImageLoader,
    viewerUid: String?,
    language: AppLanguage,
    onBack: () -> Unit,
    onSignInRequired: () -> Unit,
    onOpenExternal: (String) -> Unit,
    onOpenAds: () -> Unit,
    initialSection: MarketSection = MarketSection.SHOP,
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val stack = remember { mutableStateListOf<MkRoute>(initialSection.toRoute()) }
    val current = stack.last()

    fun push(route: MkRoute) {
        stack.add(route)
    }

    fun switchTab(route: MkRoute) {
        stack.clear()
        stack.add(route)
    }

    // Deep links (/cart, /orders, /vendor) change the section while this screen is already open.
    LaunchedEffect(initialSection) {
        switchTab(initialSection.toRoute())
        if (initialSection == MarketSection.ADS) onOpenAds()
    }

    fun popOrLeave(): Boolean {
        if (stack.size > 1) {
            stack.removeAt(stack.lastIndex)
            return true
        }
        return false
    }

    BackHandler {
        if (!popOrLeave()) onBack()
    }

    val tabIndex = when (current) {
        MkRoute.Cart -> 1
        MkRoute.Orders -> 2
        MkRoute.Console -> 3
        else -> 0
    }
    val needsSignIn = viewerUid == null && (
        current == MkRoute.Cart || current == MkRoute.Orders || current == MkRoute.Console ||
            current is MkRoute.Checkout
        )

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = when (current) {
                            is MkRoute.Shops -> mkText(bn, "Marketplace", "মার্কেটপ্লেস")
                            is MkRoute.Vendor -> mkText(bn, "Shop", "দোকান")
                            is MkRoute.Product -> mkText(bn, "Product", "পণ্য")
                            MkRoute.Cart -> mkText(bn, "Cart", "কার্ট")
                            is MkRoute.Checkout -> mkText(bn, "Checkout", "অর্ডার নিশ্চিত")
                            MkRoute.Orders -> mkText(bn, "My orders", "আমার অর্ডার")
                            MkRoute.Console -> mkText(bn, "My shop", "আমার দোকান")
                        },
                        fontWeight = FontWeight.SemiBold,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = { if (!popOrLeave()) onBack() }) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = mkText(bn, "Back", "ফিরে যান"))
                    }
                },
                actions = {
                    if (current is MkRoute.Shops) {
                        IconButton(onClick = onOpenAds) {
                            Icon(Icons.Rounded.Campaign, contentDescription = mkText(bn, "Ads", "বিজ্ঞাপন"))
                        }
                    }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                val tabs = listOf(
                    Triple(mkText(bn, "Shops", "দোকান"), Icons.Rounded.Storefront, MkRoute.Shops),
                    Triple(mkText(bn, "Cart", "কার্ট"), Icons.Rounded.ShoppingCart, MkRoute.Cart),
                    Triple(mkText(bn, "Orders", "অর্ডার"), Icons.Rounded.Receipt, MkRoute.Orders),
                    Triple(mkText(bn, "My shop", "দোকান ড্যাশবোর্ড"), Icons.Rounded.Dashboard, MkRoute.Console),
                )
                tabs.forEachIndexed { index, (label, icon, route) ->
                    NavigationBarItem(
                        selected = tabIndex == index,
                        onClick = { switchTab(route) },
                        icon = { Icon(icon, contentDescription = label) },
                        label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    )
                }
            }
        },
    ) { innerPadding ->
        Box(Modifier.padding(innerPadding).fillMaxSize()) {
            if (needsSignIn) {
                MkSignInPrompt(bn = bn, onSignIn = onSignInRequired)
                return@Box
            }
            when (val route = current) {
                MkRoute.Shops -> MkShopListScreen(
                    repository = repository,
                    imageLoader = imageLoader,
                    bn = bn,
                    onOpenShop = { slug -> push(MkRoute.Vendor(slug)) },
                )
                is MkRoute.Vendor -> MkVendorPageScreen(
                    repository = repository,
                    imageLoader = imageLoader,
                    bn = bn,
                    slug = route.slug,
                    onOpenProduct = { id -> push(MkRoute.Product(id)) },
                )
                is MkRoute.Product -> MkProductScreen(
                    repository = repository,
                    imageLoader = imageLoader,
                    bn = bn,
                    productId = route.id,
                    signedIn = viewerUid != null,
                    onSignIn = onSignInRequired,
                    onBuyNow = { vendorSlug, vendorName, items ->
                        push(MkRoute.Checkout(vendorSlug, vendorName, items))
                    },
                    onOpenCart = { switchTab(MkRoute.Cart) },
                )
                MkRoute.Cart -> MkCartScreen(
                    repository = repository,
                    imageLoader = imageLoader,
                    bn = bn,
                    onCheckout = { slug, name -> push(MkRoute.Checkout(slug, name, null)) },
                )
                is MkRoute.Checkout -> MkCheckoutScreen(
                    repository = repository,
                    imageLoader = imageLoader,
                    bn = bn,
                    vendorSlug = route.vendorSlug,
                    vendorName = route.vendorName,
                    directItems = route.direct,
                    onPlaced = { switchTab(MkRoute.Orders) },
                )
                MkRoute.Orders -> MkOrdersScreen(
                    repository = repository,
                    imageLoader = imageLoader,
                    bn = bn,
                )
                MkRoute.Console -> MkVendorConsoleScreen(
                    repository = repository,
                    mediaRepository = mediaRepository,
                    imageLoader = imageLoader,
                    bn = bn,
                    onOpenExternal = onOpenExternal,
                )
            }
        }
    }
}

/** Maps the shell's section (set by deep links and the tab bar) to the first route of this screen. */
private fun MarketSection.toRoute(): MkRoute = when (this) {
    MarketSection.CART -> MkRoute.Cart
    MarketSection.ORDERS -> MkRoute.Orders
    MarketSection.VENDOR -> MkRoute.Console
    else -> MkRoute.Shops
}

@Composable
private fun MkSignInPrompt(bn: Boolean, onSignIn: () -> Unit) {
    BsdcEmptyState(
        icon = Icons.Rounded.Storefront,
        title = mkText(bn, "Sign in to continue", "এগিয়ে যেতে সাইন ইন করুন"),
        subtitle = mkText(
            bn,
            "Your cart, orders and shop are linked to your account.",
            "আপনার কার্ট, অর্ডার ও দোকান আপনার অ্যাকাউন্টের সাথে যুক্ত।",
        ),
        actionLabel = mkText(bn, "Sign in", "সাইন ইন"),
        onAction = onSignIn,
    )
}

/** Shop directory with search, category chips, and distance when location permission is already granted. */
@Composable
fun MkShopListScreen(
    repository: MkRepository,
    imageLoader: ImageLoader,
    bn: Boolean,
    onOpenShop: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var query by rememberSaveable { mutableStateOf("") }
    var type by rememberSaveable { mutableStateOf("") }
    var shops by remember { mutableStateOf<List<MkListedShopDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var origin by remember { mutableStateOf<Pair<Double, Double>?>(null) }

    LaunchedEffect(Unit) {
        if (MkLocation.hasPermission(context)) origin = MkLocation.current(context)
    }

    LaunchedEffect(query, type) {
        delay(if (query.isBlank()) 0L else 300L)
        loading = true
        repository.listShops(type.ifBlank { null }, query, origin)
            .onSuccess { shops = it; error = null }
            .onFailure { error = it.message ?: "load_failed" }
        loading = false
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                placeholder = { Text(mkText(bn, "Search shops", "দোকান খুঁজুন")) },
            )
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    FilterChip(
                        selected = type.isBlank(),
                        onClick = { type = "" },
                        label = { Text(mkText(bn, "All", "সব")) },
                    )
                }
                items(MkLogic.SHOP_TYPES) { key ->
                    FilterChip(
                        selected = type == key,
                        onClick = { type = if (type == key) "" else key },
                        label = { Text(MkLogic.shopTypeLabel(key, bn)) },
                    )
                }
            }
        }
        error?.let { message ->
            item {
                BsdcStatusBanner(
                    title = mkText(bn, "Could not load shops", "দোকান লোড করা যায়নি"),
                    body = message,
                    tone = BsdcTone.BAD,
                    actionLabel = mkText(bn, "Retry", "আবার চেষ্টা করুন"),
                    onAction = {
                        scope.launch {
                            loading = true
                            repository.listShops(type.ifBlank { null }, query, origin)
                                .onSuccess { shops = it; error = null }
                                .onFailure { error = it.message ?: "load_failed" }
                            loading = false
                        }
                    },
                )
            }
        }
        if (!loading && shops.isEmpty() && error == null) {
            item {
                BsdcEmptyState(
                    icon = Icons.Rounded.Storefront,
                    title = mkText(bn, "No shops yet", "এখনো কোনো দোকান নেই"),
                    subtitle = mkText(
                        bn,
                        "Shops appear here once they are approved and have order credits.",
                        "অনুমোদিত ও অর্ডার ক্রেডিট থাকা দোকান এখানে দেখাবে।",
                    ),
                )
            }
        }
        items(shops, key = { it.slug }) { shop ->
            MkShopCard(shop = shop, imageLoader = imageLoader, bn = bn, onClick = { onOpenShop(shop.slug) })
        }
    }
}

@Composable
private fun MkShopCard(
    shop: MkListedShopDto,
    imageLoader: ImageLoader,
    bn: Boolean,
    onClick: () -> Unit,
) {
    BsdcCard(modifier = Modifier.fillMaxWidth(), onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            MkImage(
                url = shop.logo_url.ifBlank { shop.cover_url },
                contentDescription = shop.name,
                imageLoader = imageLoader,
                modifier = Modifier.size(76.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = shop.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BsdcBadge(label = MkLogic.shopTypeLabel(shop.vendor_type, bn), tone = BsdcTone.INFO)
                }
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    MkStars(rating = shop.rating)
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = "(${shop.review_count})",
                        style = MaterialTheme.typography.labelSmall,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                }
                val distance = shop.distance_km?.let { km ->
                    " · " + if (km < 1.0) {
                        "${(km * 1000).toInt()} ${mkText(bn, "m", "মি")}"
                    } else {
                        "%.1f ${mkText(bn, "km", "কিমি")}".format(km)
                    }
                }.orEmpty()
                Text(
                    text = shop.place_label.ifBlank { "" } + distance,
                    style = MaterialTheme.typography.bodySmall,
                    color = BsdcThemeTokens.colors.mutedText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** Storefront: cover and logo, categories, and a two-column product grid. */
@Composable
fun MkVendorPageScreen(
    repository: MkRepository,
    imageLoader: ImageLoader,
    bn: Boolean,
    slug: String,
    onOpenProduct: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var page by remember { mutableStateOf<MkVendorPageDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var categoryId by rememberSaveable { mutableStateOf<String?>(null) }

    LaunchedEffect(slug) {
        loading = true
        repository.fetchVendorPage(slug)
            .onSuccess { page = it; error = null }
            .onFailure { error = it.message ?: "load_failed" }
        loading = false
    }

    val data = page
    if (data == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            if (loading) {
                Text(mkText(bn, "Loading shop…", "দোকান লোড হচ্ছে…"))
            } else {
                BsdcEmptyState(
                    icon = Icons.Rounded.Storefront,
                    title = mkText(bn, "Shop not available", "দোকানটি পাওয়া যায়নি"),
                    subtitle = error ?: mkText(
                        bn,
                        "It may be closed or out of order credits.",
                        "এটি বন্ধ থাকতে পারে বা অর্ডার ক্রেডিট শেষ হতে পারে।",
                    ),
                )
            }
        }
        return
    }

    val visibleProducts = data.products.filter { categoryId == null || it.category_id == categoryId }
    val rows = visibleProducts.chunked(2)

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Box(Modifier.fillMaxWidth().height(170.dp)) {
                MkImage(
                    url = data.vendor.cover_url,
                    contentDescription = data.vendor.name,
                    imageLoader = imageLoader,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Text(
                    text = data.vendor.name,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    BsdcBadge(
                        label = MkLogic.shopTypeLabel(data.vendor.vendor_type, bn),
                        tone = BsdcTone.INFO,
                    )
                    Spacer(Modifier.width(8.dp))
                    MkStars(rating = data.rating)
                    Spacer(Modifier.width(6.dp))
                    Text(
                        text = "(${data.review_count})",
                        style = MaterialTheme.typography.labelSmall,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                }
                if (data.vendor.description.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = data.vendor.description,
                        style = MaterialTheme.typography.bodyMedium,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                }
            }
        }
        item {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    FilterChip(
                        selected = categoryId == null,
                        onClick = { categoryId = null },
                        label = { Text(mkText(bn, "All", "সব")) },
                    )
                }
                items(data.categories, key = { it.id }) { category ->
                    FilterChip(
                        selected = categoryId == category.id,
                        onClick = { categoryId = if (categoryId == category.id) null else category.id },
                        label = { Text(category.name) },
                    )
                }
            }
        }
        if (visibleProducts.isEmpty()) {
            item {
                BsdcEmptyState(
                    icon = Icons.Rounded.Storefront,
                    title = mkText(bn, "No products here yet", "এখানে এখনো পণ্য নেই"),
                    subtitle = mkText(bn, "Try another category.", "অন্য একটি ক্যাটাগরি দেখুন।"),
                )
            }
        }
        items(rows) { pair ->
            Row(
                modifier = Modifier.padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                pair.forEach { product ->
                    MkProductTile(
                        name = product.name,
                        pricePoisha = product.price_poisha,
                        imageUrl = product.image_url,
                        inStock = product.in_stock,
                        imageLoader = imageLoader,
                        bn = bn,
                        onClick = { onOpenProduct(product.id) },
                        modifier = Modifier.weight(1f),
                    )
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun MkProductTile(
    name: String,
    pricePoisha: Long,
    imageUrl: String,
    inStock: Boolean,
    imageLoader: ImageLoader,
    bn: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BsdcCard(modifier = modifier, onClick = onClick) {
        MkImage(
            url = imageUrl,
            contentDescription = name,
            imageLoader = imageLoader,
            modifier = Modifier.fillMaxWidth().height(120.dp),
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = name,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(4.dp))
        MkPrice(poisha = pricePoisha, bn = bn)
        if (!inStock) {
            Spacer(Modifier.height(4.dp))
            BsdcBadge(label = mkText(bn, "Out of stock", "স্টক শেষ"), tone = BsdcTone.WARN)
        }
    }
}
