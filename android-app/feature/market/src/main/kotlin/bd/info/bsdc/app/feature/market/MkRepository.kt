package bd.info.bsdc.app.feature.market

import bd.info.bsdc.app.core.network.BsdcHttpClientFactory
import bd.info.bsdc.app.core.network.SupabaseRestClient
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
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

    private val geocoder: HttpClient by lazy { BsdcHttpClientFactory.createKtorClient() }

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
                put("p_type", type.orNullString() ?: JsonNull)
                put("p_query", query)
                put("p_lat", origin?.first.orNullNumber() ?: JsonNull)
                put("p_lng", origin?.second.orNullNumber() ?: JsonNull)
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

    /** Resolves a vendor slug to its id for mk_place_order. Null when the shop is closed or out of credits. */
    suspend fun fetchVendorRef(slug: String): Result<String?> = call {
        supabase.decode<String?>(rpc("mk_vendor_ref", buildJsonObject { put("p_slug", slug) }, requireAuth = false))
    }

    /**
     * OpenStreetMap place search (Nominatim), limited to Bangladesh, for the address pin.
     * Callers debounce input: Nominatim's usage policy allows about one request per second.
     */
    suspend fun searchPlaces(query: String): Result<List<MkPlaceDto>> = call {
        val q = query.trim()
        if (q.length < 3) return@call emptyList()
        val url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=bd&q=" +
            URLEncoder.encode(q, "UTF-8")
        val body = geocoder.get(url) {
            header(HttpHeaders.UserAgent, "BSDC-Android/1.0 (bsdc.info.bd)")
            header(HttpHeaders.Accept, "application/json")
        }.bodyAsText()
        BsdcHttpClientFactory.sharedJson.decodeFromString<List<MkPlaceDto>>(body)
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

    private fun String?.orNullString(): JsonElement? = this?.takeIf { it.isNotBlank() }?.let { JsonPrimitive(it) }

    private fun Double?.orNullNumber(): JsonElement? = this?.let { JsonPrimitive(it) }
}
