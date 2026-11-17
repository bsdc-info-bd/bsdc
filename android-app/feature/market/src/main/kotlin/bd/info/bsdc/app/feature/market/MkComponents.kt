package bd.info.bsdc.app.feature.market

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.designsystem.bsdcShimmerPlaceholder
import bd.info.bsdc.app.core.media.ImgbbUrlAllowlist
import bd.info.bsdc.app.core.model.BsdcHosts
import coil3.ImageLoader
import coil3.compose.SubcomposeAsyncImage
import coil3.request.ImageRequest

/** Picks the Bangla or English string. Keeps every marketplace label bilingual in one place. */
internal fun mkText(bn: Boolean, en: String, bnText: String): String = if (bn) bnText else en

@Composable
fun MkStatusChip(status: String, bn: Boolean, modifier: Modifier = Modifier) {
    val label: String
    val tone: BsdcTone
    when (status) {
        "placed" -> { label = mkText(bn, "Placed", "দেওয়া হয়েছে"); tone = BsdcTone.INFO }
        "accepted" -> { label = mkText(bn, "Accepted", "গৃহীত"); tone = BsdcTone.INFO }
        "packaged" -> { label = mkText(bn, "Packed", "প্যাক হয়েছে"); tone = BsdcTone.WARN }
        "out_for_delivery" -> { label = mkText(bn, "On the way", "পথে আছে"); tone = BsdcTone.WARN }
        "delivered" -> { label = mkText(bn, "Delivered", "পৌঁছে গেছে"); tone = BsdcTone.OK }
        "cancelled" -> { label = mkText(bn, "Cancelled", "বাতিল"); tone = BsdcTone.BAD }
        else -> { label = status; tone = BsdcTone.NEUTRAL }
    }
    BsdcBadge(label = label, tone = tone, modifier = modifier)
}

/** Five-step tracker: placed, accepted, packed, on the way, delivered. Cancelled shows no progress. */
@Composable
fun MkTimeline(status: String, bn: Boolean, modifier: Modifier = Modifier) {
    val steps = listOf(
        mkText(bn, "Placed", "দেওয়া"),
        mkText(bn, "Accepted", "গৃহীত"),
        mkText(bn, "Packed", "প্যাক"),
        mkText(bn, "On the way", "পথে"),
        mkText(bn, "Delivered", "পৌঁছেছে"),
    )
    val active = MkLogic.timelineIndex(status)
    Row(modifier = modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        steps.forEachIndexed { index, label ->
            val done = index <= active
            val dotColor by animateColorAsState(
                targetValue = if (done) BsdcThemeTokens.colors.brandStrong else BsdcThemeTokens.colors.border,
                label = "mkDot$index",
            )
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(56.dp)) {
                Box(Modifier.size(12.dp).clip(CircleShape).background(dotColor))
                Spacer(Modifier.height(4.dp))
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (done) BsdcThemeTokens.colors.brandStrong else BsdcThemeTokens.colors.mutedText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (index < steps.lastIndex) {
                val lineColor by animateColorAsState(
                    targetValue = if (index < active) BsdcThemeTokens.colors.brandStrong else BsdcThemeTokens.colors.border,
                    label = "mkLine$index",
                )
                Box(Modifier.weight(1f).height(2.dp).background(lineColor))
            }
        }
    }
}

@Composable
fun MkQtyStepper(
    qty: Int,
    max: Int,
    bn: Boolean,
    onChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { onChange(qty - 1) }, enabled = qty > 0) {
            Icon(Icons.Rounded.Remove, contentDescription = mkText(bn, "Decrease", "কমান"))
        }
        AnimatedContent(targetState = qty, label = "mkQty") { value ->
            Text(
                text = value.toString(),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.width(32.dp),
            )
        }
        IconButton(onClick = { onChange(qty + 1) }, enabled = qty < max) {
            Icon(Icons.Rounded.Add, contentDescription = mkText(bn, "Increase", "বাড়ান"))
        }
    }
}

@Composable
fun MkStars(rating: Double, modifier: Modifier = Modifier) {
    Row(modifier = modifier) {
        for (i in 1..5) {
            Icon(
                imageVector = if (rating >= i - 0.5) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                contentDescription = null,
                tint = BsdcThemeTokens.colors.warn,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

/**
 * Rounded product, shop or post image.
 *
 * Three states, all visibly different, because a blank tile used to mean three unrelated
 * things at once: still downloading, broken URL, or no URL at all. It also retries through
 * BSDC's own edge cache (`/media/i`) when ImgBB refuses the device directly, which is the
 * common failure on mobile networks in Bangladesh.
 */
@Composable
fun MkImage(
    url: String,
    contentDescription: String?,
    imageLoader: ImageLoader,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    fallbackIcon: ImageVector = Icons.Rounded.Storefront,
) {
    val context = LocalContext.current
    val normalized = remember(url) {
        ImgbbUrlAllowlist.normalizeImageUrl(url).ifEmpty { url.trim() }
    }
    var viaProxy by remember(normalized) { mutableStateOf(false) }
    var failed by remember(normalized) { mutableStateOf(false) }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(BsdcThemeTokens.colors.brandSoft),
        contentAlignment = Alignment.Center,
    ) {
        val active = when {
            normalized.isBlank() -> ""
            viaProxy -> ImgbbUrlAllowlist.edgeRepairUrl(BsdcHosts.SITE_ORIGIN, normalized)
            else -> normalized
        }
        if (active.isBlank() || failed) {
            Icon(
                imageVector = fallbackIcon,
                contentDescription = contentDescription,
                tint = BsdcThemeTokens.colors.mutedText,
            )
        } else {
            SubcomposeAsyncImage(
                model = ImageRequest.Builder(context).data(active).build(),
                contentDescription = contentDescription,
                imageLoader = imageLoader,
                contentScale = contentScale,
                onError = {
                    // One repair attempt through the edge cache, then show the empty state.
                    if (!viaProxy && ImgbbUrlAllowlist.isRepairableImageUrl(normalized)) {
                        viaProxy = true
                    } else {
                        failed = true
                    }
                },
                modifier = Modifier.fillMaxSize(),
                loading = {
                    Box(modifier = Modifier.fillMaxSize().bsdcShimmerPlaceholder())
                },
                error = {
                    Icon(
                        imageVector = fallbackIcon,
                        contentDescription = contentDescription,
                        tint = BsdcThemeTokens.colors.mutedText,
                    )
                },
            )
        }
    }
}

@Composable
fun MkPrice(poisha: Long, bn: Boolean, modifier: Modifier = Modifier) {
    Text(
        text = MkLogic.formatTaka(poisha, bn),
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        color = BsdcThemeTokens.colors.brandStrong,
        modifier = modifier,
    )
}
