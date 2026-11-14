package bd.info.bsdc.app.feature.market

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

    /** A review is allowed only after delivery and only once. */
    fun canReview(status: String, reviewed: Boolean): Boolean = status == "delivered" && !reviewed

    /** Cancelling is allowed only before the vendor has handed the order to a rider. */
    fun canCustomerCancel(status: String): Boolean = status == "placed" || status == "accepted"

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
}
