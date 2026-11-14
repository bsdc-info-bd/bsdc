package bd.info.bsdc.app.feature.market

import kotlinx.serialization.Serializable

/*
 * DTOs for the COD marketplace RPCs (migrations 0094 and 0095).
 * Shapes mirror main-site/src/lib/mk/mk-types.ts. Money is poisha (1 taka = 100 poisha).
 * Every optional field has a default so a missing key never fails decoding.
 */

@Serializable
data class MkPackageDto(
    val code: String = "",
    val orders: Int = 0,
    val price_poisha: Long = 0,
)

@Serializable
data class MkPaymentInstructionsDto(
    val bikash_number: String = "",
    val packages: List<MkPackageDto> = emptyList(),
    val delivery_fee_poisha: Long = 15000,
    val order_credit_price_poisha: Long = 1000,
)

@Serializable
data class MkVendorShopDto(
    val slug: String = "",
    val name: String = "",
    val status: String = "active",
    val vendor_type: String = "",
    val logo_url: String = "",
    val cover_url: String = "",
    val description: String = "",
    val mobile: String = "",
    val place_label: String = "",
)

@Serializable
data class MkPurchaseDto(
    val id: String = "",
    val package_code: String = "",
    val orders: Int = 0,
    val status: String = "pending",
    val created_at: String = "",
)

@Serializable
data class MkVendorDashboardDto(
    val has_shop: Boolean = false,
    val vendor: MkVendorShopDto? = null,
    val credits: Int? = null,
    val listed: Boolean? = null,
    val orders_pending: Int? = null,
    val orders_today: Int? = null,
    val delivered_poisha: Long? = null,
    val rating: Double? = null,
    val purchases: List<MkPurchaseDto>? = null,
)

@Serializable
data class MkOrderItemDto(
    val name: String = "",
    val qty: Int = 0,
    val unit_price: Long = 0,
    val line_total: Long = 0,
    val image_url: String = "",
)

@Serializable
data class MkVendorOrderDto(
    val id: String = "",
    val code: String = "",
    val status: String = "placed",
    val subtotal_poisha: Long = 0,
    val delivery_fee_poisha: Long = 0,
    val total_poisha: Long = 0,
    val payment_method: String = "cash_on_delivery",
    val customer_name: String = "",
    val customer_phone: String = "",
    val address_line: String = "",
    val landmark: String = "",
    val lat: Double? = null,
    val lng: Double? = null,
    val place_label: String = "",
    val note: String = "",
    val cancel_reason: String = "",
    val cancelled_by: String? = null,
    val placed_at: String = "",
    val accepted_at: String? = null,
    val delivered_at: String? = null,
    val distance_km: Double? = null,
    val items: List<MkOrderItemDto> = emptyList(),
)

@Serializable
data class MkCategoryDto(
    val id: String = "",
    val name: String = "",
)

@Serializable
data class MkStorefrontProductDto(
    val id: String = "",
    val slug: String = "",
    val name: String = "",
    val price_poisha: Long = 0,
    val in_stock: Boolean = false,
    val category_id: String? = null,
    val image_url: String = "",
)

@Serializable
data class MkVendorInfoDto(
    val slug: String = "",
    val name: String = "",
    val vendor_type: String = "",
    val description: String = "",
    val logo_url: String = "",
    val cover_url: String = "",
    val place_label: String = "",
    val lat: Double? = null,
    val lng: Double? = null,
)

@Serializable
data class MkVendorPageDto(
    val vendor: MkVendorInfoDto = MkVendorInfoDto(),
    val categories: List<MkCategoryDto> = emptyList(),
    val products: List<MkStorefrontProductDto> = emptyList(),
    val rating: Double = 0.0,
    val review_count: Int = 0,
)

@Serializable
data class MkProductVendorDto(
    val slug: String = "",
    val name: String = "",
)

@Serializable
data class MkProductDetailDto(
    val id: String = "",
    val name: String = "",
    val description: String = "",
    val price_poisha: Long = 0,
    val in_stock: Boolean = false,
    val stock: Int = 0,
    val images: List<String> = emptyList(),
    val vendor: MkProductVendorDto = MkProductVendorDto(),
    val rating: Double = 0.0,
)

@Serializable
data class MkCartLineDto(
    val product_id: String = "",
    val qty: Int = 0,
    val product_name: String = "",
    val price_poisha: Long = 0,
    val stock: Int = 0,
    val product_status: String = "",
    val orderable: Boolean = false,
    val vendor_id: String = "",
    val vendor_slug: String = "",
    val vendor_name: String = "",
    val line_total: Long = 0,
    val image_url: String = "",
)

@Serializable
data class MkPlacedOrderDto(
    val order_id: String = "",
    val code: String = "",
    val status: String = "placed",
    val subtotal_poisha: Long = 0,
    val delivery_fee_poisha: Long = 0,
    val total_poisha: Long = 0,
    val line_count: Int = 0,
)

@Serializable
data class MkCustomerOrderDto(
    val id: String = "",
    val code: String = "",
    val status: String = "placed",
    val total_poisha: Long = 0,
    val delivery_fee_poisha: Long = 0,
    val placed_at: String = "",
    val delivered_at: String? = null,
    val vendor: MkProductVendorLogoDto = MkProductVendorLogoDto(),
    val reviewed: Boolean = false,
    val items: List<MkCustomerOrderItemDto> = emptyList(),
)

@Serializable
data class MkProductVendorLogoDto(
    val slug: String = "",
    val name: String = "",
    val logo_url: String = "",
)

@Serializable
data class MkCustomerOrderItemDto(
    val name: String = "",
    val qty: Int = 0,
    val line_total: Long = 0,
    val image_url: String = "",
)

/** Address sent with mk_place_order. Lat and lng are required (inside Bangladesh) and come from the map pin. */
data class MkAddressInput(
    val customerName: String,
    val customerPhone: String,
    val addressLine: String,
    val lat: Double,
    val lng: Double,
    val landmark: String = "",
    val placeLabel: String = "",
    val note: String = "",
)

/** One direct-order line (mk_place_order with items instead of the saved cart). */
data class MkDirectItem(
    val productId: String,
    val qty: Int,
)

/** A shop row from mk_list_vendors. */
@Serializable
data class MkListedShopDto(
    val slug: String = "",
    val name: String = "",
    val vendor_type: String = "",
    val logo_url: String = "",
    val cover_url: String = "",
    val place_label: String = "",
    val lat: Double? = null,
    val lng: Double? = null,
    val distance_km: Double? = null,
    val product_count: Int = 0,
    val rating: Double = 0.0,
    val review_count: Int = 0,
)
