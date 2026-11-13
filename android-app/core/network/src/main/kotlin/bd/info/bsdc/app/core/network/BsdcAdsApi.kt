package bd.info.bsdc.app.core.network

import bd.info.bsdc.app.core.model.AdEventKind
import bd.info.bsdc.app.core.model.AdPlacement
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.ServedAdModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

suspend fun SupabaseRestClient.fetchServedAds(
    placement: AdPlacement,
    limit: Int = 1,
    language: AppLanguage? = null,
    topic: String? = null,
    city: String? = null,
    viewerToken: String? = null,
): Result<List<ServedAdModel>> = withContext(Dispatchers.IO) {
    runCatching {
        val raw = rpcText(
            functionName = "serve_ads",
            params = buildJsonObject {
                put("p_placement", placement.wireValue)
                put("p_limit", limit.coerceIn(1, 5))
                put("p_platform", "android")
                if (language != null) put("p_language", language.tag)
                val cleanTopic = topic?.trim().orEmpty()
                if (cleanTopic.isNotEmpty()) put("p_topic", cleanTopic)
                val cleanCity = city?.trim().orEmpty()
                if (cleanCity.isNotEmpty()) put("p_city", cleanCity)
                val cleanToken = viewerToken?.trim().orEmpty()
                if (cleanToken.length >= 8) put("p_viewer_token", cleanToken.take(80))
            },
            requireAuth = false,
        )
        decode<List<ServedAdModel>>(raw)
    }
}

suspend fun SupabaseRestClient.recordAdEvent(
    creativeId: String,
    kind: AdEventKind,
    viewerToken: String? = null,
): Result<Boolean> = withContext(Dispatchers.IO) {
    runCatching {
        if (creativeId.isBlank()) return@runCatching false
        val raw = rpcText(
            functionName = "record_ad_event",
            params = buildJsonObject {
                put("p_creative_id", creativeId)
                put("p_kind", kind.wireValue)
                val cleanToken = viewerToken?.trim().orEmpty()
                if (cleanToken.length >= 8) put("p_viewer_token", cleanToken.take(80))
            },
            requireAuth = false,
        )
        raw.trim().equals("true", ignoreCase = true)
    }
}
