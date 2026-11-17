package bd.info.bsdc.app.feature.market

import java.util.Locale

/**
 * Pure marketplace rules shared by the customer and vendor screens.
 * Mirrors main-site/src/lib/mk/mk-logic.ts so Android and web agree on money, status and phone rules.
 */
object MkLogic {

    const val DEFAULT_DELIVERY_FEE_POISHA: Long = 15000

    /** Bangladesh bounding box used by the database for every pinned location. */
    const val BD_LAT_MIN = 20.5
    const val BD_LAT_MAX = 26.7
    const val BD_LNG_MIN = 88.0
    const val BD_LNG_MAX = 92.7

    /** Sylhet city centre, used as the map fallback when location is unavailable. */
    const val SYLHET_LAT = 24.8949
    const val SYLHET_LNG = 91.8687

    private val BD_MOBILE = Regex("^01[3-9][0-9]{8}$")

    /** Taka label, e.g. 15000 poisha becomes ৳150. Lakh grouping and Bangla digits when [bn] is true. */
    fun formatTaka(poisha: Long, bn: Boolean): String {
        val negative = poisha < 0
        val absolute = kotlin.math.abs(poisha)
        val taka = absolute / 100
        val paisa = absolute % 100
        val body = buildString {
            append(groupLakh(taka.toString()))
            if (paisa != 0L) {
                append('.')
                append(paisa.toString().padStart(2, '0'))
            }
        }
        val digits = if (bn) toBanglaDigits(body) else body
        return "${if (negative) "-" else ""}৳$digits"
    }

    /** Strips spaces, dashes and the +880 / 880 country prefix from a mobile number. */
    fun normaliseBdMobile(input: String): String {
        val digits = input.filterNot { it == ' ' || it == '-' }
        return when {
            digits.startsWith("+880") -> "0" + digits.substring(4)
            digits.startsWith("880") && digits.length == 13 -> "0" + digits.substring(3)
            else -> digits
        }
    }

    fun isBdMobile(input: String): Boolean = BD_MOBILE.matches(normaliseBdMobile(input))

    fun isInsideBangladesh(lat: Double, lng: Double): Boolean =
        lat in BD_LAT_MIN..BD_LAT_MAX && lng in BD_LNG_MIN..BD_LNG_MAX

    data class DeliveryEvaluation(
        val feePoisha: Long,
        val roundedKm: Int?,
        val withinArea: Boolean,
        val needsPinForFee: Boolean,
    )

    /** Great-circle distance in km, unrounded (matches bsdc.mk_distance_km in SQL). */
    fun rawDistanceKm(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
        val rad = Math.PI / 180.0
        val dLat = (lat2 - lat1) * rad
        val dLng = (lng2 - lng1) * rad
        val sLat = kotlin.math.sin(dLat / 2.0)
        val sLng = kotlin.math.sin(dLng / 2.0)
        val a = sLat * sLat +
            kotlin.math.cos(lat1 * rad) * kotlin.math.cos(lat2 * rad) * sLng * sLng
        return 2.0 * 6371.0 * kotlin.math.asin(kotlin.math.min(1.0, kotlin.math.sqrt(a)))
    }

    /** Whole kilometres rounded up (matches ceil(bsdc.mk_distance_km(...)) in SQL). */
    fun roundedDistanceKm(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Int =
        kotlin.math.ceil(rawDistanceKm(lat1, lng1, lat2, lng2)).toInt().coerceAtLeast(0)

    /**
     * Evaluates a shop's 3-mode delivery charge (`default`, `fixed`, `per_km`) and radius
     * eligibility for an optional customer pin, matching `mk_place_order` in SQL.
     */
    fun evaluateShopDelivery(
        delivery: MkShopDeliveryDto?,
        pinLat: Double?,
        pinLng: Double?,
    ): DeliveryEvaluation {
        if (delivery == null) {
            return DeliveryEvaluation(
                feePoisha = DEFAULT_DELIVERY_FEE_POISHA,
                roundedKm = null,
                withinArea = true,
                needsPinForFee = false,
            )
        }
        val cLat = delivery.center_lat
        val cLng = delivery.center_lng
        val roundedKm = if (pinLat != null && pinLng != null && cLat != null && cLng != null) {
            roundedDistanceKm(cLat, cLng, pinLat, pinLng)
        } else {
            null
        }
        val withinArea = delivery.scope == "all_bd" || roundedKm == null || roundedKm <= delivery.radius_km
        return when (delivery.fee_mode) {
            "per_km" -> {
                if (roundedKm == null) {
                    DeliveryEvaluation(
                        feePoisha = 0L,
                        roundedKm = null,
                        withinArea = withinArea,
                        needsPinForFee = true,
                    )
                } else {
                    DeliveryEvaluation(
                        feePoisha = roundedKm.toLong() * delivery.per_km_rate_poisha.coerceAtLeast(0L),
                        roundedKm = roundedKm,
                        withinArea = withinArea,
                        needsPinForFee = false,
                    )
                }
            }
            "fixed" -> DeliveryEvaluation(
                feePoisha = delivery.fixed_fee_poisha.takeIf { it >= 0L } ?: delivery.fee_poisha,
                roundedKm = roundedKm,
                withinArea = withinArea,
                needsPinForFee = false,
            )
            else -> DeliveryEvaluation(
                feePoisha = delivery.default_fee_poisha.takeIf { it > 0L } ?: DEFAULT_DELIVERY_FEE_POISHA,
                roundedKm = roundedKm,
                withinArea = withinArea,
                needsPinForFee = false,
            )
        }
    }

    val DAY_KEYS: List<String> = listOf("0", "1", "2", "3", "4", "5", "6")

    fun defaultScheduleDays(): Map<String, MkDayHoursDto> =
        DAY_KEYS.associateWith { MkDayHoursDto(open = true, start = "09:00", end = "22:00") }

    private val HH_MM = Regex("^([01][0-9]|2[0-3]):[0-5][0-9]$")

    fun isValidHhMm(value: String, allow24: Boolean = false): Boolean =
        (allow24 && value == "24:00") || HH_MM.matches(value.trim())

    fun dayLabel(dayKey: String, bn: Boolean): String = when (dayKey) {
        "0" -> if (bn) "রবিবার" else "Sunday"
        "1" -> if (bn) "সোমবার" else "Monday"
        "2" -> if (bn) "মঙ্গলবার" else "Tuesday"
        "3" -> if (bn) "বুধবার" else "Wednesday"
        "4" -> if (bn) "বৃহস্পতিবার" else "Thursday"
        "5" -> if (bn) "শুক্রবার" else "Friday"
        "6" -> if (bn) "শনিবার" else "Saturday"
        else -> dayKey
    }

    fun formatHhMm(hhmm: String, bn: Boolean): String {
        val parts = hhmm.trim().split(":")
        val h = parts.getOrNull(0)?.toIntOrNull() ?: return hhmm
        val m = parts.getOrNull(1)?.toIntOrNull() ?: return hhmm
        val norm = h % 24
        val isPm = norm >= 12 && h != 24
        val hour12 = if (norm % 12 == 0) 12 else norm % 12
        val mStr = m.toString().padStart(2, '0')
        return if (bn) {
            "${toBanglaDigits("$hour12:$mStr")} ${if (isPm) "অপরাহ্ণ" else "পূর্বাহ্ণ"}"
        } else {
            "$hour12:$mStr ${if (isPm) "PM" else "AM"}"
        }
    }

    fun scheduleBadgeLabel(schedule: MkShopScheduleDto?, bn: Boolean): String? {
        if (schedule == null || !schedule.enabled) return null
        if (schedule.is_open) {
            val closes = schedule.closes_at?.takeIf { it.isNotBlank() }
            return if (closes != null) {
                if (bn) "খোলা · বন্ধ ${formatHhMm(closes, true)}" else "Open · closes ${formatHhMm(closes, false)}"
            } else {
                if (bn) "এখন খোলা" else "Open now"
            }
        }
        val next = schedule.next_open
        return if (next != null) {
            val dName = dayLabel(next.day.toString(), bn)
            val tFmt = formatHhMm(next.start, bn)
            if (bn) "বন্ধ · খুলবে $dName $tFmt" else "Closed · opens $dName $tFmt"
        } else {
            if (bn) "এখন বন্ধ" else "Closed now"
        }
    }

    /** What a vendor can do next to an order, given its current status. */
    fun vendorActionsFor(status: String): List<String> = when (status) {
        "placed" -> listOf("accepted", "cancelled")
        "accepted" -> listOf("packaged", "cancelled")
        "packaged" -> listOf("out_for_delivery", "cancelled")
        "out_for_delivery" -> listOf("delivered", "cancelled")
        else -> emptyList()
    }

    /** Position on the customer timeline (0 to 4). Cancelled is off the line and returns -1. */
    fun timelineIndex(status: String): Int = when (status) {
        "placed" -> 0
        "accepted" -> 1
        "packaged" -> 2
        "out_for_delivery" -> 3
        "delivered" -> 4
        else -> -1
    }

    /** Orders still moving through the line. These keep a status notification on the device. */
    fun isActiveOrderStatus(status: String): Boolean =
        status == "placed" || status == "accepted" || status == "packaged" || status == "out_for_delivery"

    /** Bilingual status text, the same wording the server writes into order notifications. */
    fun orderStatusLabel(status: String): String = when (status) {
        "placed" -> "New order | নতুন অর্ডার"
        "accepted" -> "Accepted | গ্রহণ করা হয়েছে"
        "packaged" -> "Packaged | প্যাকেট হয়েছে"
        "out_for_delivery" -> "Out for delivery | ডেলিভারিতে"
        "delivered" -> "Delivered | পৌঁছে গেছে"
        "cancelled" -> "Cancelled | বাতিল"
        else -> status
    }

    /** A review is allowed only after delivery and only once. */
    fun canReview(status: String, reviewed: Boolean): Boolean = status == "delivered" && !reviewed

    /** Matches mk_customer_cancel_order: only a placed order can be cancelled by the customer. */
    fun canCustomerCancel(status: String): Boolean = status == "placed"

    /** Agreement keys the server stores, same as mk-logic.ts AGREEMENT_KEYS. Every one must be ticked. */
    val AGREEMENT_KEYS: List<String> = listOf(
        "terms", "privacy", "vendor_policy", "cod_policy", "self_delivery", "accuracy",
    )

    /** NID is 10, 13 or 17 digits, matching the database check. */
    fun isNid(input: String): Boolean = NID_PATTERN.matches(input.trim())

    /** Transaction IDs are 4 to 40 characters. */
    fun isTxnId(input: String): Boolean = input.trim().length in 4..40

    /**
     * Parses a taka amount typed by a vendor ("150", "12.5", "১২০.৫০") into poisha.
     * Returns null for anything that is not a positive amount with at most two decimals.
     */
    fun parseTakaToPoisha(input: String): Long? {
        val normalised = input.trim().replace(",", "").map { ch ->
            if (ch in '\u09E6'..'\u09EF') ('0' + (ch - '\u09E6')) else ch
        }.joinToString("")
        val match = TAKA_PATTERN.matchEntire(normalised) ?: return null
        val taka = match.groupValues[1].toLong()
        val paisa = match.groupValues[2].padEnd(2, '0').toLong()
        val total = taka * 100 + paisa
        return if (total > 0) total else null
    }

    private val NID_PATTERN = Regex("""[0-9]{10}|[0-9]{13}|[0-9]{17}""")
    private val TAKA_PATTERN = Regex("""(\d{1,7})(?:\.(\d{1,2}))?""")

    // ---------------------------------------------------------------------
    // Browsing rules: sorting, filtering, comparing and the shelf's arithmetic
    // ---------------------------------------------------------------------

    /** The order a customer can put a storefront in. Mirrors the chips on the product grid. */
    enum class ProductSort { FEATURED, PRICE_LOW, PRICE_HIGH, NAME }

    fun productSortLabel(sort: ProductSort, bn: Boolean): String = when (sort) {
        ProductSort.FEATURED -> if (bn) "প্রস্তাবিত" else "Featured"
        ProductSort.PRICE_LOW -> if (bn) "কম দাম আগে" else "Price: low first"
        ProductSort.PRICE_HIGH -> if (bn) "বেশি দাম আগে" else "Price: high first"
        ProductSort.NAME -> if (bn) "নাম অনুসারে" else "Name A–Z"
    }

    /**
     * Sorts a storefront for display. `FEATURED` keeps the shop's own order but lifts in-stock
     * items above sold-out ones, so a customer never scrolls past three un-buyable rows to find
     * something they can buy.
     */
    fun sortStorefront(
        products: List<MkStorefrontProductDto>,
        sort: ProductSort,
    ): List<MkStorefrontProductDto> = when (sort) {
        ProductSort.FEATURED -> products.sortedBy { if (it.in_stock) 0 else 1 }
        ProductSort.PRICE_LOW -> products.sortedWith(
            compareBy<MkStorefrontProductDto> { it.price_poisha }.thenBy { it.name.lowercase() },
        )
        ProductSort.PRICE_HIGH -> products.sortedWith(
            compareByDescending<MkStorefrontProductDto> { it.price_poisha }.thenBy { it.name.lowercase() },
        )
        ProductSort.NAME -> products.sortedBy { it.name.lowercase() }
    }

    /** The one filter panel a storefront offers: a price band and an in-stock-only switch. */
    data class ProductFilter(
        val inStockOnly: Boolean = false,
        val minTaka: Long? = null,
        val maxTaka: Long? = null,
        val query: String = "",
    ) {
        val isActive: Boolean
            get() = inStockOnly || minTaka != null || maxTaka != null || query.isNotBlank()
    }

    /**
     * Applies [filter] to a storefront. Prices are compared in **taka**, because that is what a
     * customer types; the products carry poisha, so the bounds are converted once here rather
     * than in every call site.
     */
    fun filterStorefront(
        products: List<MkStorefrontProductDto>,
        filter: ProductFilter,
    ): List<MkStorefrontProductDto> {
        val needle = filter.query.trim().lowercase()
        val minPoisha = filter.minTaka?.let { it * 100 }
        val maxPoisha = filter.maxTaka?.let { it * 100 }
        return products.filter { product ->
            if (filter.inStockOnly && !product.in_stock) return@filter false
            if (minPoisha != null && product.price_poisha < minPoisha) return@filter false
            if (maxPoisha != null && product.price_poisha > maxPoisha) return@filter false
            if (needle.isEmpty()) return@filter true
            product.name.lowercase().contains(needle)
        }
    }

    /**
     * A comparison row: the same attribute across up to three products, so the customer sees
     * one difference per line rather than one card per product.
     */
    data class CompareRow(val label: String, val values: List<String>, val differs: Boolean)

    /**
     * Builds the comparison table for [products] (at most three). Blank rows — every value the
     * same — are dropped unless [keepSame] is true, so a table of identical product names does
     * not bury the one line that actually differs.
     */
    fun compareRows(
        products: List<MkStorefrontProductDto>,
        bn: Boolean,
        keepSame: Boolean = false,
    ): List<CompareRow> {
        val chosen = products.take(3)
        if (chosen.size < 2) return emptyList()
        val rows = mutableListOf<CompareRow>()

        val prices = chosen.map { formatTaka(it.price_poisha, bn) }
        rows.add(CompareRow(if (bn) "দাম" else "Price", prices, prices.distinct().size > 1))

        val stock = chosen.map {
            if (it.in_stock) (if (bn) "স্টকে আছে" else "In stock")
            else (if (bn) "স্টক নেই" else "Sold out")
        }
        rows.add(CompareRow(if (bn) "স্টক" else "Stock", stock, stock.distinct().size > 1))

        val shop = chosen.map { it.image_url.isNotBlank().toString() }
        rows.add(
            CompareRow(
                if (bn) "ছবি আছে" else "Has photo",
                chosen.map { if (it.image_url.isNotBlank()) (if (bn) "হ্যাঁ" else "Yes") else (if (bn) "না" else "No") },
                shop.distinct().size > 1,
            ),
        )
        return if (keepSame) rows else rows.filter { it.differs }
    }

    /** The cheapest of the compared products, or null when the list is empty. */
    fun cheapestOf(products: List<MkStorefrontProductDto>): MkStorefrontProductDto? =
        products.minByOrNull { it.price_poisha }

    /** What a customer saves against the most expensive alternative, in poisha. Zero when alone. */
    fun savingsAgainstPriciest(products: List<MkStorefrontProductDto>): Long {
        if (products.size < 2) return 0
        val cheapest = products.minOf { it.price_poisha }
        val priciest = products.maxOf { it.price_poisha }
        return (priciest - cheapest).coerceAtLeast(0)
    }

    /** Shop categories, same keys as the database and the web (mk-logic.ts SHOP_TYPES). */
    val SHOP_TYPES: List<String> = listOf(
        "grocery", "restaurant", "bakery", "pharmacy", "electronics", "fashion", "beauty",
        "stationery", "home_kitchen", "books", "handicraft", "other",
    )

    fun shopTypeLabel(type: String, bn: Boolean): String {
        val en = mapOf(
            "grocery" to "Grocery", "restaurant" to "Restaurant & food", "bakery" to "Bakery & sweets",
            "pharmacy" to "Pharmacy", "electronics" to "Electronics", "fashion" to "Fashion",
            "beauty" to "Beauty", "stationery" to "Stationery", "home_kitchen" to "Home & kitchen",
            "books" to "Books", "handicraft" to "Handicraft", "other" to "Other",
        )
        val bnLabels = mapOf(
            "grocery" to "মুদি", "restaurant" to "রেস্তোরাঁ ও খাবার", "bakery" to "বেকারি ও মিষ্টি",
            "pharmacy" to "ফার্মেসি", "electronics" to "ইলেকট্রনিক্স", "fashion" to "ফ্যাশন",
            "beauty" to "বিউটি", "stationery" to "স্টেশনারি", "home_kitchen" to "ঘর ও রান্নাঘর",
            "books" to "বই", "handicraft" to "হস্তশিল্প", "other" to "অন্যান্য",
        )
        return if (bn) bnLabels[type] ?: type else en[type] ?: type
    }

    /** Lakh grouping for a plain digit string, e.g. 1000000 becomes 10,00,000. */
    internal fun groupLakh(digits: String): String {
        if (digits.length <= 3) return digits
        val head = digits.substring(0, digits.length - 3)
        val tail = digits.substring(digits.length - 3)
        val groups = mutableListOf<String>()
        var rest = head
        while (rest.length > 2) {
            groups.add(0, rest.substring(rest.length - 2))
            rest = rest.substring(0, rest.length - 2)
        }
        if (rest.isNotEmpty()) groups.add(0, rest)
        return groups.joinToString(",") + "," + tail
    }

    internal fun toBanglaDigits(text: String): String = buildString(text.length) {
        for (c in text) {
            if (c in '0'..'9') append('০' + (c - '0')) else append(c)
        }
    }

    /** OpenStreetMap's canonical tile host. The map page requests this one. */
    const val OSM_TILE_HOST: String = "tile.openstreetmap.org"

    /**
     * Whether a request is for an OpenStreetMap raster tile.
     *
     * The page asks for [OSM_TILE_HOST], but OSM answers by redirecting to its `a.`/`b.`/`c.`
     * shards, so the bare host and any `*.tile.openstreetmap.org` subdomain both have to be
     * recognised. A strict `host ==` test dropped every sharded tile and left the Android map
     * a blank white canvas while the web map loaded fine.
     *
     * Lives here, beside the other pure rules, so it can be unit tested: `MkOsmPinMap.kt`
     * imports `android.webkit.WebView`, and a JVM unit test that touched a declaration in that
     * file would drag the Android stubs in with it.
     */
    internal fun isOsmTileRequest(scheme: String?, host: String?): Boolean {
        if (!scheme.equals("https", ignoreCase = true)) return false
        val clean = host?.trim()?.lowercase() ?: return false
        return clean == OSM_TILE_HOST || clean.endsWith(".$OSM_TILE_HOST")
    }

    /**
     * A Google Maps directions link for a delivery pin.
     *
     * This is the one form that needs no API key and no billing, works on the web and opens
     * the Maps app when it is installed: `maps/dir/?api=1&destination=lat,lng`. The Android
     * side opens it with a plain `ACTION_VIEW`, so the system may hand it to the Maps app;
     * a Custom Tab would force a browser and lose turn-by-turn.
     *
     * Six decimals is about 11 cm — far finer than any delivery address needs, and enough
     * that two nearby pins cannot round onto the same point.
     */
    internal fun googleMapsDirectionsUrl(lat: Double, lng: Double): String {
        if (!lat.isFinite() || !lng.isFinite()) return ""
        val point = String.format(Locale.ROOT, "%.6f,%.6f", lat, lng)
        return "https://www.google.com/maps/dir/?api=1&destination=$point"
    }
}
