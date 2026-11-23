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
            supabase.wakePushDelivery("mk_order_status")
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
     * or null to use the saved cart for that vendor. [addressId] names a saved address, and the
     * routine then reads that row instead of the [address] below: the pin decides the fee, the
     * radius test and where the rider goes, so it is not a value a screen should be trusted to copy.
     * The typed [address] is still sent, because the note belongs to the order and not to the door.
     */
    suspend fun placeOrder(
        vendorId: String,
        address: MkAddressInput,
        directItems: List<MkDirectItem>?,
        addressId: String? = null,
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
                put("p_address_id", addressId.orNullString() ?: JsonNull)
            },
        )
        supabase.wakePushDelivery("mk_place_order")
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
        supabase.wakePushDelivery("mk_cancel_order")
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
        supabase.wakePushDelivery("mk_review")
        Unit
    }

    /** The signed-in user's latest vendor application, or null when they have not applied. */
    suspend fun fetchMyApplication(): Result<MkMyApplicationDto?> = call {
        supabase.decode<MkMyApplicationDto?>(rpc("mk_my_application", buildJsonObject { }))
    }

    /** Submits the four-part vendor application. [payload] uses the keys of mk_submit_vendor_application. */
    suspend fun submitVendorApplication(payload: JsonObject): Result<MkSubmitResultDto> = call {
        supabase.decode<MkSubmitResultDto>(rpc("mk_submit_vendor_application", buildJsonObject { put("p", payload) }))
    }

    /** Records a bKash payment for an order-credit package; the admin approves it before credits are added. */
    suspend fun buyCredits(
        packageCode: String,
        sender: String,
        holder: String,
        txnId: String,
    ): Result<MkBuyCreditsResultDto> = call {
        supabase.decode<MkBuyCreditsResultDto>(
            rpc(
                "mk_vendor_buy_credits",
                buildJsonObject {
                    put("p_package_code", packageCode)
                    put("p_sender", sender)
                    put("p_holder", holder)
                    put("p_txn_id", txnId)
                },
            ),
        )
    }

    suspend fun fetchVendorCatalog(): Result<MkVendorCatalogDto> = call {
        supabase.decode<MkVendorCatalogDto>(rpc("mk_vendor_catalog", buildJsonObject { }))
    }

    /** Creates a category when [id] is null, otherwise renames it. Returns the category id. */
    suspend fun saveVendorCategory(id: String?, name: String, sort: Int): Result<String> = call {
        supabase.decode<String>(
            rpc(
                "mk_vendor_save_category",
                buildJsonObject {
                    put("p_id", id.orNullString() ?: JsonNull)
                    put("p_name", name)
                    put("p_sort", sort)
                },
            ),
        )
    }

    /** Creates or updates a product. [payload] uses the keys of mk_vendor_save_product. Returns the product id. */
    suspend fun saveVendorProduct(id: String?, payload: JsonObject): Result<String> = call {
        supabase.decode<String>(
            rpc(
                "mk_vendor_save_product",
                buildJsonObject {
                    put("p_id", id.orNullString() ?: JsonNull)
                    put("p", payload)
                },
            ),
        )
    }

    /** Updates only the fields that are passed. Null fields are left as they are on the server. */
    suspend fun updateVendorProfile(
        description: String? = null,
        logoUrl: String? = null,
        coverUrl: String? = null,
        mobile: String? = null,
    ): Result<Unit> = call {
        rpc(
            "mk_vendor_update_profile",
            buildJsonObject {
                put(
                    "p",
                    buildJsonObject {
                        description?.let { put("description", it) }
                        logoUrl?.let { put("logo_url", it) }
                        coverUrl?.let { put("cover_url", it) }
                        mobile?.let { put("mobile", it) }
                    },
                )
            },
        )
        Unit
    }

    /** Resolves a vendor slug to its id for mk_place_order. Null when the shop is closed or out of credits. */
    suspend fun fetchVendorRef(slug: String): Result<String?> = call {
        supabase.decode<String?>(rpc("mk_vendor_ref", buildJsonObject { put("p_slug", slug) }, requireAuth = false))
    }

    /** Reads the signed-in vendor's 3-mode delivery configuration + Asia/Dhaka opening schedule. */
    suspend fun fetchVendorDelivery(): Result<MkVendorDeliveryDto> = call {
        supabase.decode<MkVendorDeliveryDto>(rpc("mk_vendor_delivery", buildJsonObject { }))
    }

    /** Saves the signed-in vendor's delivery scope, radius, 3-mode fee (`default`, `fixed`, `per_km`), and centre pin. */
    suspend fun setVendorDelivery(
        scope: String,
        radiusKm: Int,
        feeMode: String,
        feeTaka: Int,
        perKmTaka: Int,
        centerLat: Double?,
        centerLng: Double?,
    ): Result<Unit> = call {
        rpc(
            "mk_vendor_set_delivery",
            buildJsonObject {
                put("p_scope", scope)
                put("p_radius_km", radiusKm)
                put("p_fee_taka", feeTaka)
                put("p_center_lat", centerLat.orNullNumber() ?: JsonNull)
                put("p_center_lng", centerLng.orNullNumber() ?: JsonNull)
                put("p_fee_mode", feeMode)
                put("p_per_km_taka", perKmTaka)
            },
        )
        Unit
    }

    /** Saves the signed-in vendor's daily opening & closing schedule in Bangladesh time (`Asia/Dhaka`). */
    suspend fun setVendorSchedule(
        enabled: Boolean,
        days: Map<String, MkDayHoursDto>,
    ): Result<MkShopScheduleDto> = call {
        val daysJson = buildJsonObject {
            for (key in MkLogic.DAY_KEYS) {
                val row = days[key] ?: MkDayHoursDto()
                put(
                    key,
                    buildJsonObject {
                        put("open", row.open)
                        put("start", row.start)
                        put("end", row.end)
                    },
                )
            }
        }
        supabase.decode<MkShopScheduleDto>(
            rpc(
                "mk_vendor_set_schedule",
                buildJsonObject {
                    put("p_enabled", enabled)
                    put("p_days", daysJson)
                },
            ),
        )
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

    /**
     * The member's saved doorsteps, in the order `mk_my_addresses` returns them: the default first,
     * then whatever they have actually been ordering to. Nothing here re-sorts — a client that
     * ordered the book itself would disagree with the browser about which address comes first, and
     "first" is the one a checkout offers.
     */
    suspend fun fetchMyAddresses(): Result<List<MkSavedAddressDto>> = call {
        supabase.decode<List<MkSavedAddressDto>>(rpc("mk_my_addresses", buildJsonObject { }))
    }

    /**
     * Insert or update one saved address. The response carries the whole book, because the routine is
     * the only thing that knows what the default ended up being — a member's first address is the
     * default whether or not they asked for it — and a client that re-fetched to learn that would be
     * racing its own write.
     */
    suspend fun saveAddress(address: MkAddressInput): Result<MkAddressSaveDto> = call {
        val raw = rpc(
            "mk_save_address",
            buildJsonObject {
                put("p_id", address.id.orNullString() ?: JsonNull)
                put("p_label", address.label)
                put("p_nickname", address.nickname.trim())
                put("p_recipient_name", address.customerName.trim())
                put("p_phone", address.customerPhone.trim())
                put("p_address_line", address.addressLine.trim())
                put("p_landmark", address.landmark.trim())
                put("p_place_label", address.placeLabel.trim())
                put("p_lat", address.lat)
                put("p_lng", address.lng)
                put("p_note", address.note.trim())
                put("p_is_default", address.isDefault)
            },
        )
        supabase.decode<MkAddressSaveDto>(raw)
    }

    suspend fun deleteAddress(addressId: String): Result<MkAddressDeleteDto> = call {
        supabase.decode<MkAddressDeleteDto>(
            rpc("mk_delete_address", buildJsonObject { put("p_id", addressId) }),
        )
    }

    /** Saves the signed-in vendor's minimum order, in whole taka. Zero accepts any order. */
    suspend fun setVendorMinOrder(taka: Int): Result<Unit> = call {
        rpc(
            "mk_vendor_set_min_order",
            buildJsonObject { put("p_taka", taka) },
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

    private fun String?.orNullString(): JsonElement? = this?.takeIf { it.isNotBlank() }?.let { JsonPrimitive(it) }

    private fun Double?.orNullNumber(): JsonElement? = this?.let { JsonPrimitive(it) }
}
