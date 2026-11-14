package bd.info.bsdc.app.feature.market

import java.time.LocalDate
import java.time.format.DateTimeParseException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/** bKash number and the limits the database enforces (ad_payment_instructions). Money is poisha. */
@Serializable
data class AdPaymentInstructionsDto(
    @SerialName("bikash_number") val bikashNumber: String? = null,
    @SerialName("min_budget_poisha") val minBudgetPoisha: Long = 10_000,
    @SerialName("max_budget_poisha") val maxBudgetPoisha: Long = 10_000_000,
    @SerialName("min_bid_poisha") val minBidPoisha: Long = 100,
    @SerialName("max_bid_poisha") val maxBidPoisha: Long = 1_000_000,
    @SerialName("daily_cap_min_poisha") val dailyCapMinPoisha: Long = 1_000,
)

/** One payment an advertiser reported (ad_my_payment_requests). */
@Serializable
data class AdPaymentRequestDto(
    val id: String,
    @SerialName("campaign_id") val campaignId: String,
    @SerialName("amount_poisha") val amountPoisha: Long = 0,
    @SerialName("txn_id") val txnId: String = "",
    val status: String = "pending",
    @SerialName("review_note") val reviewNote: String = "",
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("decided_at") val decidedAt: String? = null,
)

@Serializable
data class AdCreatedDto(@SerialName("campaign_id") val campaignId: String = "")

/** Everything the campaign form holds, as the person typed it. Money stays as taka text until saved. */
data class AdsDraft(
    val name: String = "",
    val pricing: String = "cpc",
    val bidTaka: String = "2",
    val budgetTaka: String = "500",
    val dailyCapTaka: String = "",
    val startsOn: String = "",
    val endsOn: String = "",
    val language: String = "any",
    val placement: String = "feed",
    val platforms: Set<String> = setOf("web", "android"),
    val headline: String = "",
    val body: String = "",
    val ctaLabel: String = "",
    val targetUrl: String = "",
    val imageUrl: String = "",
)

/**
 * The advertiser's campaign rules, mirrored from the web (lib/ads/ads-builder.ts)
 * and enforced again by ad_create_campaign. Validation answers the form before a
 * round trip; the database has the final word.
 */
object AdsBuilderLogic {
    const val BID_MIN_POISHA = 100L
    const val BID_MAX_POISHA = 1_000_000L
    const val BUDGET_MIN_POISHA = 10_000L
    const val BUDGET_MAX_POISHA = 10_000_000L
    const val DAILY_CAP_MIN_POISHA = 1_000L
    const val MAX_SCHEDULE_DAYS = 365L

    val PRICINGS: List<String> = listOf("cpc", "cpm")
    val PLACEMENTS: List<String> = listOf("feed", "sidebar", "shop", "search", "article")
    val LANGUAGES: List<String> = listOf("any", "bn", "en")
    val PLATFORMS: List<String> = listOf("web", "android")

    private val HTTPS = Regex("""https://\S+""")
    private val IMGBB = Regex("""https://(i\.)?ibb\.co/\S+""")

    /** Days since 1970-01-01 for a yyyy-MM-dd date, or null when it is not a real date. */
    fun dayNumber(date: String): Long? = try {
        LocalDate.parse(date).toEpochDay()
    } catch (error: DateTimeParseException) {
        null
    }

    /** Field keys that fail: name, bid, budget, dailyCap, schedule, platforms, headline, body, cta, targetUrl, imageUrl. */
    fun validate(draft: AdsDraft, todayEpochDay: Long): Set<String> {
        val errors = mutableSetOf<String>()
        if (draft.name.trim().length !in 3..80) errors += "name"

        val bid = MkLogic.parseTakaToPoisha(draft.bidTaka)
        if (bid == null || bid !in BID_MIN_POISHA..BID_MAX_POISHA) errors += "bid"

        val budget = MkLogic.parseTakaToPoisha(draft.budgetTaka)
        if (budget == null || budget !in BUDGET_MIN_POISHA..BUDGET_MAX_POISHA) errors += "budget"

        if (draft.dailyCapTaka.isNotBlank()) {
            val cap = MkLogic.parseTakaToPoisha(draft.dailyCapTaka)
            if (cap == null || cap < DAILY_CAP_MIN_POISHA || (budget != null && cap > budget)) {
                errors += "dailyCap"
            }
        }

        val startDay = if (draft.startsOn.isBlank()) todayEpochDay else dayNumber(draft.startsOn)
        val endDay = if (draft.endsOn.isBlank()) null else dayNumber(draft.endsOn)
        if (startDay == null || (draft.endsOn.isNotBlank() && endDay == null)) {
            errors += "schedule"
        } else if (endDay != null && (endDay < startDay || endDay - startDay >= MAX_SCHEDULE_DAYS)) {
            errors += "schedule"
        }

        if (draft.platforms.none { it in PLATFORMS }) errors += "platforms"

        if (draft.headline.trim().length !in 3..80) errors += "headline"
        if (draft.body.length > 200) errors += "body"
        if (draft.ctaLabel.length > 32) errors += "cta"

        val target = draft.targetUrl.trim()
        if (target.length !in 12..500 || !HTTPS.matches(target)) errors += "targetUrl"

        val image = draft.imageUrl.trim()
        if (image.isNotEmpty() && !IMGBB.matches(image)) errors += "imageUrl"

        return errors
    }

    /** The object ad_create_campaign receives. Dates are Dhaka calendar days; money is poisha. */
    fun toPayload(draft: AdsDraft, nowIso: String): JsonObject {
        val startsAt = if (draft.startsOn.isBlank()) nowIso else "${draft.startsOn}T00:00:00+06:00"
        val endsAt = if (draft.endsOn.isBlank()) null else "${draft.endsOn}T23:59:59+06:00"
        val cap = if (draft.dailyCapTaka.isBlank()) 0L else MkLogic.parseTakaToPoisha(draft.dailyCapTaka) ?: 0L
        return buildJsonObject {
            put("name", draft.name.trim())
            put("pricing", draft.pricing)
            put("bid", MkLogic.parseTakaToPoisha(draft.bidTaka) ?: 0L)
            put("total_budget", MkLogic.parseTakaToPoisha(draft.budgetTaka) ?: 0L)
            put("daily_budget", cap)
            put("starts_at", startsAt)
            if (endsAt == null) put("ends_at", JsonNull) else put("ends_at", endsAt)
            put("language", draft.language)
            put("placement", draft.placement)
            putJsonArray("platforms") {
                PLATFORMS.filter { it in draft.platforms }.forEach { add(JsonPrimitive(it)) }
            }
            put("layout", "card")
            put("headline", draft.headline.trim())
            put("body", draft.body)
            put("cta_label", draft.ctaLabel.trim())
            put("target_url", draft.targetUrl.trim())
            put("image_url", draft.imageUrl.trim())
        }
    }
}
