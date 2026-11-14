package bd.info.bsdc.app.feature.market

import bd.info.bsdc.app.core.network.SupabaseRestClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Advertiser dashboard client. These RPCs (migrations 0022 and 0023) belong to the ads
 * system, which is separate from the retired open store. Money is in poisha; display it in taka.
 */
class AdsRepository(
    private val supabase: SupabaseRestClient,
) {
    suspend fun fetchWalletBalance(): Result<Long> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText("ad_wallet_balance", requireAuth = true).trim().toLongOrNull() ?: 0L
        }
    }

    suspend fun fetchCampaigns(limit: Int = 50): Result<List<AdCampaignDto>> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "my_campaigns",
                params = buildJsonObject { put("p_limit", limit) },
                requireAuth = true,
            )
            supabase.decode<List<AdCampaignDto>>(raw)
        }
    }

    suspend fun setCampaignPaused(campaignId: String, paused: Boolean): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "set_campaign_paused",
                params = buildJsonObject {
                    put("p_campaign_id", campaignId)
                    put("p_paused", paused)
                },
                requireAuth = true,
            )
            Unit
        }
    }
}

/** One row of my_campaigns(). Names mirror the database columns; money is in poisha. */
@Serializable
data class AdCampaignDto(
    val id: String,
    val name: String,
    val status: String = "draft",
    val pricing: String = "cpm",
    val bid: Long = 0,
    @SerialName("total_budget") val totalBudget: Long = 0,
    @SerialName("daily_budget") val dailyBudget: Long = 0,
    val spent: Long = 0,
    @SerialName("starts_at") val startsAt: String? = null,
    @SerialName("ends_at") val endsAt: String? = null,
    @SerialName("review_note") val reviewNote: String = "",
    @SerialName("creative_count") val creativeCount: Int = 0,
    val impressions: Int = 0,
    val clicks: Int = 0,
    @SerialName("spend_today") val spendToday: Long = 0,
)
