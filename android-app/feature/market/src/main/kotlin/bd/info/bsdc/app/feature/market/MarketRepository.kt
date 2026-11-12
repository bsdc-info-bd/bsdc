package bd.info.bsdc.app.feature.market

import bd.info.bsdc.app.core.network.SupabaseRestClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class MarketRepository(
    private val supabase: SupabaseRestClient,
) {
    suspend fun fetchCatalog(
        category: String? = null,
        search: String? = null,
        sort: String = "recent",
        limit: Int = 40,
    ): Result<List<CatalogProductDto>> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "product_catalog",
                params = buildJsonObject {
                    put("p_limit", limit)
                    if (category.isNullOrBlank()) put("p_category", JsonNull) else put("p_category", category)
                    if (search.isNullOrBlank()) put("p_search", JsonNull) else put("p_search", search)
                    put("p_sort", sort)
                },
                requireAuth = false,
            )
            supabase.decode<List<CatalogProductDto>>(raw)
        }
    }

    suspend fun toggleWishlist(productId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "toggle_wishlist",
                params = buildJsonObject { put("p_product_id", productId) },
                requireAuth = true,
            )
            raw.trim().equals("true", ignoreCase = true)
        }
    }

    suspend fun fetchCart(): Result<List<CartLineDto>> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText("my_cart", requireAuth = true)
            supabase.decode<List<CartLineDto>>(raw)
        }
    }

    suspend fun addToCart(productId: String, quantity: Int = 1): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "add_to_cart",
                params = buildJsonObject {
                    put("p_product_id", productId)
                    put("p_quantity", quantity.coerceAtLeast(1))
                },
                requireAuth = true,
            )
            Unit
        }
    }

    suspend fun setCartQuantity(productId: String, quantity: Int): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "set_cart_quantity",
                params = buildJsonObject {
                    put("p_product_id", productId)
                    put("p_quantity", quantity.coerceAtLeast(0))
                },
                requireAuth = true,
            )
            Unit
        }
    }

    suspend fun clearCart(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText("clear_cart", requireAuth = true)
            Unit
        }
    }

    suspend fun fetchAddresses(uid: String): Result<List<AddressDto>> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.getJsonText(
                table = "addresses",
                queryPairs = listOf(
                    "uid" to "eq.$uid",
                    "order" to "is_default.desc,created_at.desc",
                ),
                requireAuth = true,
            )
            supabase.decode<List<AddressDto>>(raw)
        }
    }

    suspend fun saveAddress(
        uid: String,
        recipient: String,
        phone: String,
        line1: String,
        city: String,
        district: String,
        postcode: String,
    ): Result<AddressDto> = withContext(Dispatchers.IO) {
        runCatching {
            val body = buildJsonObject {
                put("uid", uid)
                put("label", "Default")
                put("recipient", recipient.trim())
                put("phone", phone.trim())
                put("line1", line1.trim())
                put("line2", "")
                put("city", city.trim())
                put("district", district.trim())
                put("postcode", postcode.trim())
                put("is_default", false)
            }
            val raw = supabase.postJson(
                table = "addresses",
                body = body,
                prefer = "return=representation",
                requireAuth = true,
            )
            supabase.decode<List<AddressDto>>(raw).first()
        }
    }

    suspend fun placeCodOrder(addressId: String, note: String = ""): Result<List<PlacedOrderDto>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.rpcText(
                    "place_order",
                    params = buildJsonObject {
                        put("p_address_id", addressId)
                        put("p_payment_method", "cash_on_delivery")
                        put("p_note", note.trim())
                    },
                    requireAuth = true,
                )
                supabase.decode<List<PlacedOrderDto>>(raw)
            }
        }

    suspend fun fetchOrders(limit: Int = 30): Result<List<MyOrderDto>> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "my_orders",
                params = buildJsonObject { put("p_limit", limit) },
                requireAuth = true,
            )
            supabase.decode<List<MyOrderDto>>(raw)
        }
    }

    suspend fun cancelOrder(orderId: String, reason: String = ""): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "cancel_order",
                params = buildJsonObject {
                    put("p_order_id", orderId)
                    put("p_reason", reason)
                },
                requireAuth = true,
            )
            Unit
        }
    }

    // ---- Vendor Storefront (non-admin) ----

    suspend fun fetchMyShop(): Result<MyShopDto?> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText("my_shop", requireAuth = true)
            supabase.decode<List<MyShopDto>>(raw).firstOrNull()
        }
    }

    suspend fun fetchShopOrders(limit: Int = 40): Result<List<ShopOrderDto>> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "shop_orders",
                params = buildJsonObject { put("p_limit", limit) },
                requireAuth = true,
            )
            supabase.decode<List<ShopOrderDto>>(raw)
        }
    }

    suspend fun advanceOrder(orderId: String, nextStatus: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "advance_order",
                params = buildJsonObject {
                    put("p_order_id", orderId)
                    put("p_next_status", nextStatus)
                },
                requireAuth = true,
            )
            Unit
        }
    }

    // ---- Creator Ads (non-admin) ----

    suspend fun fetchAdWalletBalance(): Result<Long> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText("ad_wallet_balance", requireAuth = true)
            raw.trim().toLongOrNull() ?: 0L
        }
    }

    suspend fun fetchMyCampaigns(limit: Int = 30): Result<List<MyCampaignDto>> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "my_campaigns",
                params = buildJsonObject { put("p_limit", limit) },
                requireAuth = true,
            )
            supabase.decode<List<MyCampaignDto>>(raw)
        }
    }

    suspend fun toggleCampaignPause(campaignId: String, pause: Boolean): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                supabase.rpcText(
                    "set_campaign_paused",
                    params = buildJsonObject {
                        put("p_campaign_id", campaignId)
                        put("p_paused", pause)
                    },
                    requireAuth = true,
                )
                Unit
            }
        }
}
