package bd.info.bsdc.app.feature.market

import bd.info.bsdc.app.core.network.SupabaseRestClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Client for the cash-on-delivery marketplace (mk_* RPCs, migrations 0094 and 0095).
 * Every RPC enforces ownership and money rules on the server. This layer only shapes requests and decodes replies.
 */
class MkRepository(
    private val supabase: SupabaseRestClient,
) {

    suspend fun fetchPaymentInstructions(): Result<MkPaymentInstructionsDto> = call {
        supabase.decode<MkPaymentInstructionsDto>(rpc("mk_payment_instructions", buildJsonObject { }))
    }

    suspend fun fetchVendorDashboard(): Result<MkVendorDashboardDto> = call {
        supabase.decode<MkVendorDashboardDto>(rpc("mk_vendor_dashboard", buildJsonObject { }))
    }

    suspend fun fetchVendorOrders(status: String = "", limit: Int = 100): Result<List<MkVendorOrderDto>> =
        call {
            val raw = rpc(
                "mk_vendor_orders",
                buildJsonObject {
                    put("p_status", status)
                    put("p_limit", limit)
                },
            )
            supabase.decode<List<MkVendorOrderDto>>(raw)
        }

    /** Vendor moves an order to [next]. [reason] is required by the server only for cancellation. */
    suspend fun setVendorOrderStatus(orderId: String, next: String, reason: String = ""): Result<Unit> =
        call {
            rpc(
                "mk_vendor_set_order_status",
                buildJsonObject {
                    put("p_order_id", orderId)
                    put("p_next", next)
                    put("p_reason", reason)
                },
            )
            Unit
        }

    suspend fun listShops(
        type: String?,
        query: String,
        origin: Pair<Double, Double>?,
        limit: Int = 40,
    ): Result<List<MkListedShopDto>> = call {
        val raw = rpc(
            "mk_list_vendors",
            buildJsonObject {
                put("p_type", type.orNullString())
                put("p_query", query)
                put("p_lat", origin?.first.orNullNumber())
                put("p_lng", origin?.second.orNullNumber())
                put("p_limit", limit)
            },
            requireAuth = false,
        )
        supabase.decode<List<MkListedShopDto>>(raw)
    }

    suspend fun fetchVendorPage(slug: String): Result<MkVendorPageDto?> = call {
        supabase.decode<MkVendorPageDto?>(
            rpc("mk_vendor_page", buildJsonObject { put("p_slug", slug) }, requireAuth = false),
        )
    }

    suspend fun fetchProductDetail(productId: String): Result<MkProductDetailDto?> = call {
        supabase.decode<MkProductDetailDto?>(
            rpc("mk_product_detail", buildJsonObject { put("p_product_id", productId) }, requireAuth = false),
        )
    }

    /** Sets the cart quantity for one product. Zero removes the line. */
    suspend fun setCartQuantity(productId: String, qty: Int): Result<Unit> = call {
        rpc(
            "mk_cart_set",
            buildJsonObject {
                put("p_product_id", productId)
                put("p_qty", qty.coerceAtLeast(0))
            },
        )
        Unit
    }

    suspend fun fetchMyCart(): Result<List<MkCartLineDto>> = call {
        supabase.decode<List<MkCartLineDto>>(rpc("mk_my_cart", buildJsonObject { }))
    }

    /**
     * Places one COD order for [vendorId]. Pass [directItems] to order straight from a product page,
     * or null to use the saved cart for that vendor.
     */
    suspend fun placeOrder(
        vendorId: String,
        address: MkAddressInput,
        directItems: List<MkDirectItem>?,
    ): Result<MkPlacedOrderDto> = call {
        val addressJson = buildJsonObject {
            put("customer_name", address.customerName)
            put("customer_phone", address.customerPhone)
            put("address_line", address.addressLine)
            put("lat", address.lat)
            put("lng", address.lng)
            put("landmark", address.landmark)
            put("place_label", address.placeLabel)
            put("note", address.note)
        }
        val itemsJson: JsonArray? = directItems?.let { items ->
            buildJsonArray {
                for (item in items) {
                    add(
                        buildJsonObject {
                            put("product_id", item.productId)
                            put("qty", item.qty)
                        },
                    )
                }
            }
        }
        val raw = rpc(
            "mk_place_order",
            buildJsonObject {
                put("p_vendor_id", vendorId)
                put("p_address", addressJson)
                if (itemsJson == null) put("p_items", JsonNull) else put("p_items", itemsJson)
            },
        )
        supabase.decode<MkPlacedOrderDto>(raw)
    }

    suspend fun fetchMyOrders(limit: Int = 40): Result<List<MkCustomerOrderDto>> = call {
        supabase.decode<List<MkCustomerOrderDto>>(
            rpc("mk_my_orders", buildJsonObject { put("p_limit", limit) }),
        )
    }

    suspend fun cancelOrder(orderId: String, reason: String): Result<Unit> = call {
        rpc(
            "mk_customer_cancel_order",
            buildJsonObject {
                put("p_order_id", orderId)
                put("p_reason", reason)
            },
        )
        Unit
    }

    /** Only allowed after the order is delivered, and once per order. Rating is 1 to 5. */
    suspend fun submitReview(orderId: String, rating: Int, body: String): Result<Unit> = call {
        rpc(
            "mk_submit_review",
            buildJsonObject {
                put("p_order_id", orderId)
                put("p_rating", rating.coerceIn(1, 5))
                put("p_body", body)
            },
        )
        Unit
    }

    private suspend fun rpc(
        name: String,
        params: JsonObject,
        requireAuth: Boolean = true,
    ): String = supabase.rpcText(name, params = params, requireAuth = requireAuth)

    private suspend fun <T> call(block: suspend () -> T): Result<T> =
        withContext(Dispatchers.IO) {
            runCatching { block() }
        }

    private fun String?.orNullString(): JsonPrimitive? = this?.takeIf { it.isNotBlank() }?.let { JsonPrimitive(it) }

    private fun Double?.orNullNumber(): JsonPrimitive? = this?.let { JsonPrimitive(it) }
}
