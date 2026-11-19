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
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.BookmarkBorder
import androidx.compose.material.icons.rounded.Campaign
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.Dashboard
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Receipt
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.ShoppingCart
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.runtime.collectAsState
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
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcDirectorySkeletonCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcFilterPill
import bd.info.bsdc.app.core.designsystem.BsdcHeroBanner
import bd.info.bsdc.app.core.designsystem.BsdcInfoPill
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
    /** Google Maps links go through the system so the Maps app can open them. */
    onOpenGoogleMaps: (String) -> Unit = onOpenExternal,
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
                    onOpenGoogleMaps = onOpenGoogleMaps,
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

/**
 * The shop directory: search, categories, an "open now" switch, and the saved shelf. Distance is
 * shown only when the location permission has already been granted, so opening the marketplace
 * never asks for anything.
 */
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
    val savedStore = remember(context) { MkSavedStore.get(context) }
    val wishlist by savedStore.wishlist.collectAsState()
    val recentlyViewed by savedStore.recentlyViewed.collectAsState()

    var query by rememberSaveable { mutableStateOf("") }
    var type by rememberSaveable { mutableStateOf("") }
    var openNowOnly by rememberSaveable { mutableStateOf(false) }
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

    // "Open now" is applied on the client so toggling it is instant and never re-queries.
    val visibleShops = remember(shops, openNowOnly) {
        if (!openNowOnly) shops else shops.filter { shop -> shop.schedule?.is_open != false }
    }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            BsdcHeroBanner(
                title = mkText(bn, "Marketplace", "মার্কেটপ্লেস"),
                subtitle = mkText(
                    bn,
                    "Sylhet's neighbourhood shops, delivered cash on delivery.",
                    "সিলেটের পাড়ার দোকান — ক্যাশ অন ডেলিভারিতে।",
                ),
                eyebrow = mkText(bn, "ক্যাশ অন ডেলিভারি", "Cash on delivery"),
                icon = Icons.Rounded.Storefront,
                stats = buildList {
                    add(mkText(bn, "Shops", "দোকান") to shops.size.toString())
                    if (wishlist.isNotEmpty()) {
                        add(mkText(bn, "Saved", "সংরক্ষিত") to wishlist.size.toString())
                    }
                },
            )
        }

        item {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
                placeholder = { Text(mkText(bn, "Search shops and products", "দোকান ও পণ্য খুঁজুন")) },
            )
        }

        if (recentlyViewed.isNotEmpty()) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = mkText(bn, "Recently viewed", "সম্প্রতি দেখা"),
                            style = MaterialTheme.typography.titleSmall,
                        )
                        IconButton(onClick = { savedStore.clearRecentlyViewed() }) {
                            Icon(
                                Icons.Rounded.DeleteSweep,
                                contentDescription = mkText(bn, "Clear", "মুছুন"),
                            )
                        }
                    }
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(recentlyViewed, key = { it.id }) { recent ->
                            BsdcCard(modifier = Modifier.width(150.dp)) {
                                Text(
                                    text = recent.name,
                                    style = MaterialTheme.typography.titleSmall,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = MkLogic.formatTaka(recent.pricePoisha, bn),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = BsdcThemeTokens.colors.brandStrong,
                                )
                                if (recent.shopSlug.isNotBlank()) {
                                    Text(
                                        text = recent.shopName.ifBlank { recent.shopSlug },
                                        style = MaterialTheme.typography.labelSmall,
                                        color = BsdcThemeTokens.colors.mutedText,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        if (wishlist.isNotEmpty()) {
            item {
                BsdcCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        BsdcInfoPill(
                            text = mkText(
                                bn,
                                "${wishlist.size} saved item(s)",
                                "${wishlist.size}টি সংরক্ষিত পণ্য",
                            ),
                            icon = Icons.Rounded.Bookmark,
                            tone = BsdcTone.OK,
                        )
                        IconButton(onClick = { savedStore.clearWishlist() }) {
                            Icon(
                                Icons.Rounded.DeleteSweep,
                                contentDescription = mkText(bn, "Clear saved", "সংরক্ষণ মুছুন"),
                            )
                        }
                    }
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(wishlist, key = { it.id }) { item ->
                            BsdcCard(modifier = Modifier.width(150.dp)) {
                                Text(
                                    text = item.name,
                                    style = MaterialTheme.typography.titleSmall,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    text = MkLogic.formatTaka(item.pricePoisha, bn),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = BsdcThemeTokens.colors.brandStrong,
                                )
                            }
                        }
                    }
                }
            }
        }

        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    BsdcFilterPill(
                        label = mkText(bn, "All", "সব"),
                        selected = type.isBlank() && !openNowOnly,
                        onClick = {
                            type = ""
                            openNowOnly = false
                        },
                    )
                }
                item {
                    BsdcFilterPill(
                        label = mkText(bn, "Open now", "এখন খোলা"),
                        selected = openNowOnly,
                        onClick = { openNowOnly = !openNowOnly },
                        leadingIcon = Icons.Rounded.History,
                    )
                }
                items(MkLogic.SHOP_TYPES) { key ->
                    BsdcFilterPill(
                        label = MkLogic.shopTypeLabel(key, bn),
                        selected = type == key,
                        onClick = { type = if (type == key) "" else key },
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

        if (loading) {
            items(3) { BsdcDirectorySkeletonCard() }
        }

        if (!loading && visibleShops.isEmpty() && error == null) {
            item {
                BsdcEmptyState(
                    icon = Icons.Rounded.Storefront,
                    title = if (openNowOnly) {
                        mkText(bn, "Nothing is open right now", "এখন কোনো দোকান খোলা নেই")
                    } else {
                        mkText(bn, "No shops yet", "এখনো কোনো দোকান নেই")
                    },
                    subtitle = mkText(
                        bn,
                        "Shops appear here once they are approved and have order credits.",
                        "অনুমোদিত ও অর্ডার ক্রেডিট থাকা দোকান এখানে দেখাবে।",
                    ),
                    actionLabel = if (openNowOnly) mkText(bn, "Show all shops", "সব দোকান দেখান") else null,
                    onAction = { openNowOnly = false },
                )
            }
        }

        items(visibleShops, key = { it.slug }) { shop ->
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
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    BsdcBadge(label = MkLogic.shopTypeLabel(shop.vendor_type, bn), tone = BsdcTone.INFO)
                    MkLogic.scheduleBadgeLabel(shop.schedule, bn)?.let { schedLabel ->
                        BsdcBadge(
                            label = schedLabel,
                            tone = if (shop.schedule?.is_open != false) BsdcTone.OK else BsdcTone.WARN,
                        )
                    }
                }
                Spacer(Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    MkStars(rating = shop.rating)
                    Spacer(Modifier.width(6.dp))
                    Text(
                        // A Bangla member reading (7) beside a Bangla shop name is the kind of
                        // mismatch that makes an app feel translated rather than built for them.
                        text = "(${BanglaDigitFormatter.formatCount(shop.review_count.toLong(), if (bn) AppLanguage.BN else AppLanguage.EN)})",
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
    var sort by rememberSaveable { mutableStateOf(MkLogic.ProductSort.FEATURED) }
    var inStockOnly by rememberSaveable { mutableStateOf(false) }
    var compareMode by rememberSaveable { mutableStateOf(false) }
    val compareIds = remember { mutableStateListOf<String>() }
    val context = LocalContext.current
    val savedStore = remember(context) { MkSavedStore.get(context) }
    val wishlist by savedStore.wishlist.collectAsState()

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

    val filtered = MkLogic.filterStorefront(
        data.products.filter { categoryId == null || it.category_id == categoryId },
        MkLogic.ProductFilter(inStockOnly = inStockOnly),
    )
    val visibleProducts = MkLogic.sortStorefront(filtered, sort)
    val rows = visibleProducts.chunked(2)
    val comparing = visibleProducts.filter { it.id in compareIds }.take(3)
    val compareRows = MkLogic.compareRows(comparing, bn)
    val cheapest = MkLogic.cheapestOf(comparing)
    val savings = MkLogic.savingsAgainstPriciest(comparing)

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
                        text = "(${BanglaDigitFormatter.formatCount(data.review_count.toLong(), if (bn) AppLanguage.BN else AppLanguage.EN)})",
                        style = MaterialTheme.typography.labelSmall,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                }
                MkLogic.scheduleBadgeLabel(data.vendor.schedule, bn)?.let { schedLabel ->
                    Spacer(Modifier.height(6.dp))
                    BsdcBadge(
                        label = schedLabel,
                        tone = if (data.vendor.schedule?.is_open != false) BsdcTone.OK else BsdcTone.WARN,
                    )
                }
                data.vendor.delivery?.let { del ->
                    Spacer(Modifier.height(6.dp))
                    val delText = if (del.fee_mode == "per_km") {
                        val rate = MkLogic.formatTaka(del.per_km_rate_poisha, bn)
                        mkText(bn, "Delivery: $rate / km", "ডেলিভারি: $rate / কিমি")
                    } else {
                        val chg = MkLogic.formatTaka(
                            if (del.fee_mode == "fixed") del.fixed_fee_poisha else del.default_fee_poisha,
                            bn,
                        )
                        mkText(bn, "Delivery: $chg", "ডেলিভারি: $chg")
                    }
                    Text(
                        text = delText,
                        style = MaterialTheme.typography.bodySmall,
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
                    BsdcFilterPill(
                        label = mkText(bn, "All", "সব"),
                        selected = categoryId == null,
                        onClick = { categoryId = null },
                    )
                }
                items(data.categories, key = { it.id }) { category ->
                    BsdcFilterPill(
                        label = category.name,
                        selected = categoryId == category.id,
                        onClick = { categoryId = if (categoryId == category.id) null else category.id },
                    )
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                BsdcFilterPill(
                    label = mkText(bn, "In stock", "স্টকে আছে"),
                    selected = inStockOnly,
                    onClick = { inStockOnly = !inStockOnly },
                )
                BsdcFilterPill(
                    label = mkText(bn, "Compare", "তুলনা"),
                    selected = compareMode,
                    onClick = {
                        compareMode = !compareMode
                        if (!compareMode) compareIds.clear()
                    },
                    leadingIcon = Icons.Rounded.Tune,
                    countLabel = if (compareIds.isNotEmpty()) compareIds.size.toString() else null,
                )
                Spacer(Modifier.weight(1f))
                Text(
                    text = MkLogic.productSortLabel(sort, bn),
                    style = MaterialTheme.typography.labelMedium,
                    color = BsdcThemeTokens.colors.mutedText,
                )
            }
        }

        item {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(MkLogic.ProductSort.entries.toList(), key = { it.name }) { option ->
                    BsdcFilterPill(
                        label = MkLogic.productSortLabel(option, bn),
                        selected = sort == option,
                        onClick = { sort = option },
                    )
                }
            }
        }

        if (compareMode) {
            item {
                BsdcCard(modifier = Modifier.padding(horizontal = 16.dp)) {
                    Text(
                        text = if (compareIds.isEmpty()) {
                            mkText(bn, "Tap up to three products to compare them.", "তুলনা করতে সর্বোচ্চ তিনটি পণ্যে ট্যাপ করুন।")
                        } else {
                            mkText(bn, "${compareIds.size} of 3 selected", "৩টির মধ্যে ${compareIds.size}টি বাছা হয়েছে")
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                    if (compareRows.isNotEmpty()) {
                        HorizontalDivider()
                        compareRows.forEach { row ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Text(
                                    text = row.label,
                                    style = MaterialTheme.typography.labelMedium,
                                    modifier = Modifier.width(84.dp),
                                    color = BsdcThemeTokens.colors.mutedText,
                                )
                                row.values.forEach { value ->
                                    Text(
                                        text = value,
                                        style = MaterialTheme.typography.bodySmall,
                                        modifier = Modifier.weight(1f),
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                }
                            }
                        }
                        if (cheapest != null && savings > 0) {
                            HorizontalDivider()
                            Text(
                                text = mkText(
                                    bn,
                                    "Cheapest is ${cheapest.name} — you save ${MkLogic.formatTaka(savings, bn)}.",
                                    "সবচেয়ে কম দাম ${cheapest.name} — বাঁচবে ${MkLogic.formatTaka(savings, true)}।",
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = BsdcThemeTokens.colors.brandStrong,
                            )
                        }
                    }
                    if (compareIds.isNotEmpty()) {
                        BsdcButton(
                            label = mkText(bn, "Clear comparison", "তুলনা সরান"),
                            secondary = true,
                            onClick = { compareIds.clear() },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
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
                    val wished = wishlist.any { it.id == product.id }
                    MkProductTile(
                        name = product.name,
                        pricePoisha = product.price_poisha,
                        imageUrl = product.image_url,
                        inStock = product.in_stock,
                        imageLoader = imageLoader,
                        bn = bn,
                        onClick = {
                            savedStore.recordView(
                                MkSavedProduct(
                                    id = product.id,
                                    name = product.name,
                                    shopSlug = slug,
                                    shopName = data.vendor.name,
                                    pricePoisha = product.price_poisha,
                                    imageUrl = product.image_url,
                                ),
                            )
                            if (compareMode) {
                                if (product.id in compareIds) {
                                    compareIds.remove(product.id)
                                } else if (compareIds.size < 3) {
                                    compareIds.add(product.id)
                                }
                            } else {
                                onOpenProduct(product.id)
                            }
                        },
                        wished = wished,
                        onToggleWish = {
                            savedStore.toggleWishlist(
                                MkSavedProduct(
                                    id = product.id,
                                    name = product.name,
                                    shopSlug = slug,
                                    shopName = data.vendor.name,
                                    pricePoisha = product.price_poisha,
                                    imageUrl = product.image_url,
                                ),
                            )
                        },
                        selectedForCompare = compareMode && product.id in compareIds,
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
    wished: Boolean = false,
    onToggleWish: (() -> Unit)? = null,
    selectedForCompare: Boolean = false,
) {
    BsdcCard(
        modifier = modifier,
        onClick = onClick,
        elevated = selectedForCompare,
    ) {
        Box(Modifier.fillMaxWidth()) {
            MkImage(
                url = imageUrl,
                contentDescription = name,
                imageLoader = imageLoader,
                modifier = Modifier.fillMaxWidth().height(120.dp),
            )
            if (onToggleWish != null) {
                IconButton(
                    onClick = onToggleWish,
                    modifier = Modifier.align(Alignment.TopEnd),
                ) {
                    Icon(
                        imageVector = if (wished) Icons.Rounded.Bookmark else Icons.Rounded.BookmarkBorder,
                        contentDescription = if (bn) "সংরক্ষণ" else "Save",
                        tint = if (wished) BsdcThemeTokens.colors.brandStrong else BsdcThemeTokens.colors.mutedText,
                    )
                }
            }
            if (selectedForCompare) {
                BsdcBadge(
                    label = if (bn) "তুলনায়" else "Comparing",
                    tone = BsdcTone.OK,
                    modifier = Modifier.align(Alignment.TopStart).padding(6.dp),
                )
            }
        }
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
