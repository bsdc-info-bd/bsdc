package bd.info.bsdc.app.feature.market

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

enum class MarketSection {
    SHOP,
    CART,
    ORDERS,
    VENDOR,
    ADS,
}

@Serializable
data class CatalogProductDto(
    val id: String,
    val slug: String = "",
    val title: String,
    val summary: String = "",
    @SerialName("image_url") val imageUrl: String = "",
    val price: Long = 0,
    @SerialName("price_original") val priceOriginal: Long? = null,
    val currency: String = "BDT",
    val stock: Int = 0,
    @SerialName("is_digital") val isDigital: Boolean = false,
    val category: String = "",
    @SerialName("rating_sum") val ratingSum: Int = 0,
    @SerialName("rating_count") val ratingCount: Int = 0,
    @SerialName("sold_count") val soldCount: Int = 0,
    @SerialName("shop_id") val shopId: String = "",
    @SerialName("shop_name") val shopName: String = "",
    @SerialName("shop_slug") val shopSlug: String = "",
    val wishlisted: Boolean = false,
)

@Serializable
data class CartLineDto(
    @SerialName("product_id") val productId: String,
    val slug: String = "",
    val title: String,
    @SerialName("image_url") val imageUrl: String = "",
    @SerialName("unit_price") val unitPrice: Long = 0,
    val currency: String = "BDT",
    val quantity: Int = 1,
    val available: Int = 0,
    @SerialName("line_total") val lineTotal: Long = 0,
    @SerialName("shop_id") val shopId: String = "",
    @SerialName("shop_name") val shopName: String = "",
    @SerialName("in_stock") val inStock: Boolean = true,
)

@Serializable
data class AddressDto(
    val id: String,
    val uid: String = "",
    val label: String = "Home",
    val recipient: String = "",
    val phone: String = "",
    val line1: String = "",
    val line2: String = "",
    val city: String = "",
    val district: String = "",
    val postcode: String = "",
    @SerialName("is_default") val isDefault: Boolean = false,
)

@Serializable
data class PlacedOrderDto(
    @SerialName("order_id") val orderId: String,
    val code: String,
    val total: Long = 0,
)

@Serializable
data class MyOrderDto(
    val id: String,
    val code: String,
    val status: String = "placed",
    @SerialName("payment_status") val paymentStatus: String = "pending",
    @SerialName("payment_method") val paymentMethod: String = "cash_on_delivery",
    val total: Long = 0,
    val currency: String = "BDT",
    @SerialName("item_count") val itemCount: Int = 1,
    @SerialName("shop_name") val shopName: String = "",
    @SerialName("placed_at") val placedAt: String = "",
    @SerialName("can_cancel") val canCancel: Boolean = false,
    @SerialName("can_review") val canReview: Boolean = false,
)

@Serializable
data class MyShopDto(
    val id: String,
    val slug: String,
    val name: String,
    val status: String = "pending",
    @SerialName("logo_url") val logoUrl: String = "",
    @SerialName("orders_count") val ordersCount: Int = 0,
    @SerialName("product_count") val productCount: Int = 0,
    @SerialName("open_orders") val openOrders: Int = 0,
    val balance: Long = 0,
    @SerialName("lifetime_sales") val lifetimeSales: Long = 0,
    @SerialName("suspension_reason") val suspensionReason: String = "",
)

@Serializable
data class ShopOrderDto(
    val id: String,
    val code: String,
    val status: String = "placed",
    val total: Long = 0,
    val currency: String = "BDT",
    @SerialName("item_count") val itemCount: Int = 1,
    val recipient: String = "",
    val city: String = "",
    @SerialName("next_statuses") val nextStatuses: List<String> = emptyList(),
)

@Serializable
data class MyCampaignDto(
    val id: String,
    val name: String,
    val status: String = "draft",
    val pricing: String = "cpm",
    val bid: Long = 0,
    @SerialName("total_budget") val totalBudget: Long = 0,
    val spent: Long = 0,
    val impressions: Int = 0,
    val clicks: Int = 0,
)
