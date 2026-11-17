package bd.info.bsdc.app.feature.market

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject

/**
 * The customer's own little shelf: what they wish-listed and what they looked at last.
 *
 * Both lists are local to the device on purpose. A wish list is a shopping intention, not a
 * published fact, so it never leaves the phone and never needs a member to be online. It is
 * cleared on sign-out through [clear] so one member's intentions never surface for the next.
 *
 * The store is a singleton over `SharedPreferences` because the marketplace is opened from
 * several places in the shell and the shelf has to look the same in all of them.
 */
class MkSavedStore private constructor(context: Context) {

    private val prefs = context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _wishlist = MutableStateFlow(readList(KEY_WISHLIST))
    /** Wish-listed products, most recently saved first. */
    val wishlist: StateFlow<List<MkSavedProduct>> = _wishlist.asStateFlow()

    private val _recentlyViewed = MutableStateFlow(readList(KEY_RECENT))
    /** Products this device has opened, most recent first, capped at [RECENT_CAP]. */
    val recentlyViewed: StateFlow<List<MkSavedProduct>> = _recentlyViewed.asStateFlow()

    fun isWishlisted(productId: String): Boolean =
        _wishlist.value.any { it.id == productId }

    /** Adds or removes one product. Returns true when it is now saved. */
    fun toggleWishlist(item: MkSavedProduct): Boolean {
        val current = _wishlist.value
        val existing = current.firstOrNull { it.id == item.id }
        val next = if (existing != null) {
            current.filterNot { it.id == item.id }
        } else {
            listOf(item.copy(savedAtEpochMs = System.currentTimeMillis())) + current
        }
        _wishlist.value = next
        writeList(KEY_WISHLIST, next)
        return existing == null
    }

    /** Remembers that a product page was opened. The same product never appears twice. */
    fun recordView(item: MkSavedProduct) {
        val next = (listOf(item.copy(savedAtEpochMs = System.currentTimeMillis())) +
            _recentlyViewed.value.filterNot { it.id == item.id })
            .take(RECENT_CAP)
        _recentlyViewed.value = next
        writeList(KEY_RECENT, next)
    }

    fun clearWishlist() {
        _wishlist.value = emptyList()
        writeList(KEY_WISHLIST, emptyList())
    }

    fun clearRecentlyViewed() {
        _recentlyViewed.value = emptyList()
        writeList(KEY_RECENT, emptyList())
    }

    /** The atomic sign-out wipe: nothing one member wished for survives into the next session. */
    fun clear() {
        clearWishlist()
        clearRecentlyViewed()
    }

    private fun readList(key: String): List<MkSavedProduct> {
        val raw = prefs.getString(key, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val row = array.optJSONObject(index) ?: continue
                    val id = row.optString("id")
                    if (id.isBlank()) continue
                    add(
                        MkSavedProduct(
                            id = id,
                            name = row.optString("name"),
                            shopSlug = row.optString("shopSlug"),
                            shopName = row.optString("shopName"),
                            pricePoisha = row.optLong("pricePoisha"),
                            imageUrl = row.optString("imageUrl"),
                            savedAtEpochMs = row.optLong("savedAtEpochMs"),
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    private fun writeList(key: String, items: List<MkSavedProduct>) {
        val array = JSONArray()
        items.forEach { item ->
            array.put(
                JSONObject().apply {
                    put("id", item.id)
                    put("name", item.name)
                    put("shopSlug", item.shopSlug)
                    put("shopName", item.shopName)
                    put("pricePoisha", item.pricePoisha)
                    put("imageUrl", item.imageUrl)
                    put("savedAtEpochMs", item.savedAtEpochMs)
                },
            )
        }
        prefs.edit().putString(key, array.toString()).apply()
    }

    companion object {
        private const val PREFS_NAME = "bsdc_market_saved"
        private const val KEY_WISHLIST = "wishlist"
        private const val KEY_RECENT = "recently_viewed"
        /** Six is enough to feel like a shelf without becoming a second catalogue. */
        const val RECENT_CAP = 6

        @Volatile
        private var instance: MkSavedStore? = null

        fun get(context: Context): MkSavedStore =
            instance ?: synchronized(this) {
                instance ?: MkSavedStore(context).also { instance = it }
            }
    }
}

/** One product as the local shelf remembers it. [pricePoisha] is what it cost when saved. */
data class MkSavedProduct(
    val id: String,
    val name: String,
    val shopSlug: String = "",
    val shopName: String = "",
    val pricePoisha: Long = 0,
    val imageUrl: String = "",
    val savedAtEpochMs: Long = 0,
)
