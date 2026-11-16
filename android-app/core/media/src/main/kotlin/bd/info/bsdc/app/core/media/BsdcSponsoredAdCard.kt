package bd.info.bsdc.app.core.media

import android.content.Context
import android.graphics.Color as AndroidColor
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Campaign
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.model.AdEventKind
import bd.info.bsdc.app.core.model.AdLayout
import bd.info.bsdc.app.core.model.AdPlacement
import bd.info.bsdc.app.core.model.AdSafetyValidator
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.ServedAdModel
import bd.info.bsdc.app.core.network.SupabaseRestClient
import bd.info.bsdc.app.core.network.fetchServedAds
import bd.info.bsdc.app.core.network.recordAdEvent
import coil3.ImageLoader
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID

object BsdcAdViewerToken {
    private const val PREFS_NAME = "bsdc_ads_prefs"
    private const val KEY_VIEWER_TOKEN = "viewer_token_v1"

    @Volatile
    private var cachedToken: String = ""

    fun getOrCreate(context: Context): String {
        if (cachedToken.length >= 16) return cachedToken
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val existing = prefs.getString(KEY_VIEWER_TOKEN, "").orEmpty().trim()
        if (existing.length >= 16) {
            cachedToken = existing
            return existing
        }
        val fresh = UUID.randomUUID().toString().replace("-", "")
        prefs.edit().putString(KEY_VIEWER_TOKEN, fresh).apply()
        cachedToken = fresh
        return fresh
    }
}

/**
 * Self-contained native sponsored slot backed by `serve_ads` + `record_ad_event`
 * with IAB-style viewability (>=50% visible on screen for 1s) and ImgBB delivery.
 */
@Composable
fun BsdcAdSlot(
    placement: AdPlacement,
    supabase: SupabaseRestClient,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onOpenExternal: (String) -> Unit,
    modifier: Modifier = Modifier,
    topic: String? = null,
    city: String? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val viewerToken = remember(context) { BsdcAdViewerToken.getOrCreate(context) }

    var ad by remember(placement, language, topic, city) { mutableStateOf<ServedAdModel?>(null) }
    var impressionReportedId by remember { mutableStateOf<String?>(null) }
    var isViewable by remember { mutableStateOf(false) }

    LaunchedEffect(placement, language.tag, topic.orEmpty(), city.orEmpty()) {
        ad = supabase.fetchServedAds(
            placement = placement,
            limit = 1,
            language = language,
            topic = topic,
            city = city,
            viewerToken = viewerToken,
        ).getOrNull()?.firstOrNull()
        isViewable = false
    }

    val activeAd = ad ?: return
    if (!AdSafetyValidator.isSafeTargetUrl(activeAd.targetUrl)) return

    LaunchedEffect(activeAd.creativeId, isViewable) {
        if (isViewable && impressionReportedId != activeAd.creativeId) {
            delay(1000L)
            if (isViewable && impressionReportedId != activeAd.creativeId) {
                impressionReportedId = activeAd.creativeId
                supabase.recordAdEvent(
                    creativeId = activeAd.creativeId,
                    kind = AdEventKind.IMPRESSION,
                    viewerToken = viewerToken,
                )
            }
        }
    }

    BsdcSponsoredAdCard(
        ad = activeAd,
        imageLoader = imageLoader,
        language = language,
        modifier = modifier,
        onViewabilityChanged = { visible -> isViewable = visible },
        onClick = {
            scope.launch {
                supabase.recordAdEvent(
                    creativeId = activeAd.creativeId,
                    kind = AdEventKind.CLICK,
                    viewerToken = viewerToken,
                )
            }
            onOpenExternal(activeAd.targetUrl)
        },
    )
}

@Composable
fun BsdcSponsoredAdCard(
    ad: ServedAdModel,
    imageLoader: ImageLoader,
    language: AppLanguage,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    onViewabilityChanged: (Boolean) -> Unit = {},
) {
    val bn = language == AppLanguage.BN
    val tokens = BsdcThemeTokens.colors
    val rootView = LocalView.current
    val layout = remember(ad.layout) { AdLayout.fromWire(ad.layout) }
    val accentColor = remember(ad.accentColor) {
        AdSafetyValidator.sanitizeHexColor(ad.accentColor)?.let { hex ->
            runCatching { Color(AndroidColor.parseColor(hex)) }.getOrNull()
        }
    }
    val hasImage = ad.imageUrl.isNotBlank() && ImgbbUrlAllowlist.isRepairableImageUrl(ad.imageUrl)
    val badgeText = if (bn) "স্পনসরড" else "Sponsored"
    val ctaText = ad.ctaLabel.trim().ifEmpty { if (bn) "বিস্তারিত দেখুন" else "Learn more" }
    val imageDescription = ad.imageAlt.trim().ifEmpty { ad.headline }

    Surface(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .onGloballyPositioned { coords ->
                val rect = coords.boundsInWindow()
                val winW = rootView.width.toFloat().coerceAtLeast(1f)
                val winH = rootView.height.toFloat().coerceAtLeast(1f)
                val area = (rect.width * rect.height).coerceAtLeast(1f)
                val visW = (minOf(rect.right, winW) - maxOf(rect.left, 0f)).coerceAtLeast(0f)
                val visH = (minOf(rect.bottom, winH) - maxOf(rect.top, 0f)).coerceAtLeast(0f)
                onViewabilityChanged((visW * visH) / area >= 0.5f)
            },
        shape = RoundedCornerShape(18.dp),
        color = if (layout == AdLayout.NATIVE) {
            MaterialTheme.colorScheme.surface
        } else {
            MaterialTheme.colorScheme.surfaceVariant
        },
        tonalElevation = if (layout == AdLayout.NATIVE) 2.dp else 0.dp,
        border = BorderStroke(1.dp, accentColor ?: tokens.border),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Campaign,
                    contentDescription = null,
                    tint = accentColor ?: tokens.brandStrong,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = badgeText.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = tokens.mutedText,
                    fontWeight = FontWeight.SemiBold,
                )
                if (ad.badgeLabel.isNotBlank()) {
                    BsdcBadge(label = ad.badgeLabel, tone = BsdcTone.INFO)
                }
            }

            if (layout == AdLayout.COMPACT && hasImage) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    BsdcImgbbImage(
                        fullUrl = ad.imageUrl,
                        thumbUrl = ad.thumbUrl.ifBlank { ad.imageUrl },
                        contentDescription = imageDescription,
                        imageLoader = imageLoader,
                        targetWidthPx = 160,
                        cornerRadiusDp = 12,
                        modifier = Modifier.size(72.dp),
                    )
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            text = ad.headline,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (ad.body.isNotBlank()) {
                            Text(
                                text = ad.body,
                                style = MaterialTheme.typography.bodySmall,
                                color = tokens.mutedText,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Spacer(Modifier.height(2.dp))
                        AdCtaPill(label = ctaText, accentColor = accentColor)
                    }
                }
            } else {
                if (hasImage) {
                    BsdcImgbbImage(
                        fullUrl = ad.imageUrl,
                        thumbUrl = ad.thumbUrl.ifBlank { ad.imageUrl },
                        contentDescription = imageDescription,
                        imageLoader = imageLoader,
                        targetWidthPx = 720,
                        contentScale = ContentScale.Crop,
                        cornerRadiusDp = 12,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(if (layout == AdLayout.BANNER) 130.dp else 180.dp),
                    )
                }
                Text(
                    text = ad.headline,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                if (ad.body.isNotBlank()) {
                    Text(
                        text = ad.body,
                        style = MaterialTheme.typography.bodyMedium,
                        color = tokens.mutedText,
                    )
                }
                AdCtaPill(label = ctaText, accentColor = accentColor)
            }
        }
    }
}

@Composable
private fun AdCtaPill(label: String, accentColor: Color?) {
    val bg = accentColor ?: BsdcThemeTokens.colors.brandStrong
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = bg,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = Color.White,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }
}
