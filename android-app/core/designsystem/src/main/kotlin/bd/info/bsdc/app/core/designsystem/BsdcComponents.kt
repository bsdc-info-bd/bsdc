package bd.info.bsdc.app.core.designsystem

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

enum class BsdcTone {
    NEUTRAL,
    OK,
    WARN,
    BAD,
    INFO,
}

fun bsdcInitialsOf(displayName: String, fallback: String = "B"): String {
    val parts = displayName.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.take(2)
    val joined = parts.mapNotNull { it.firstOrNull()?.uppercaseChar() }.joinToString("")
    return joined.ifEmpty { fallback.take(2).uppercase() }
}

@Composable
fun BsdcResponsiveContainer(
    modifier: Modifier = Modifier,
    maxWidth: Dp = 780.dp,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier = modifier.fillMaxWidth(),
        contentAlignment = Alignment.TopCenter,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = maxWidth),
            content = content,
        )
    }
}

@Composable
fun BsdcButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
    secondary: Boolean = false,
    leadingIcon: ImageVector? = null,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val scaleMod = modifier
        .heightIn(min = 48.dp)
        .pressBounceScale(interactionSource)

    if (secondary) {
        OutlinedButton(
            onClick = onClick,
            modifier = scaleMod,
            enabled = enabled && !busy,
            interactionSource = interactionSource,
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(1.dp, BsdcThemeTokens.colors.border),
            contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
        ) {
            ButtonContent(label = label, busy = busy, leadingIcon = leadingIcon)
        }
    } else {
        Button(
            onClick = onClick,
            modifier = scaleMod,
            enabled = enabled && !busy,
            interactionSource = interactionSource,
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            ),
            contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp),
        ) {
            ButtonContent(label = label, busy = busy, leadingIcon = leadingIcon)
        }
    }
}

@Composable
private fun ButtonContent(
    label: String,
    busy: Boolean,
    leadingIcon: ImageVector?,
) {
    if (busy) {
        CircularProgressIndicator(
            modifier = Modifier.size(18.dp),
            strokeWidth = 2.dp,
        )
        Spacer(Modifier.width(8.dp))
    } else if (leadingIcon != null) {
        Icon(
            imageVector = leadingIcon,
            contentDescription = null,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(8.dp))
    }
    Text(
        text = label,
        style = MaterialTheme.typography.labelLarge,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
fun BsdcCard(
    modifier: Modifier = Modifier,
    elevated: Boolean = false,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = BsdcThemeTokens.colors
    val reducedMotion = BsdcThemeTokens.reducedMotion
    val cardColor = if (elevated) colors.surfaceElevated else MaterialTheme.colorScheme.surfaceVariant
    val animMod = if (reducedMotion) Modifier else Modifier.animateContentSize(
        animationSpec = tween(durationMillis = 220, easing = BsdcMotionSpecs.SmoothDecelerateEasing),
    )

    if (onClick != null) {
        val interactionSource = remember { MutableInteractionSource() }
        Surface(
            onClick = onClick,
            interactionSource = interactionSource,
            modifier = modifier
                .fillMaxWidth()
                .pressBounceScale(interactionSource)
                .then(animMod),
            shape = RoundedCornerShape(20.dp),
            color = cardColor,
            tonalElevation = if (elevated) 2.dp else 0.dp,
            border = BorderStroke(1.dp, colors.border),
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                content = content,
            )
        }
    } else {
        Surface(
            modifier = modifier
                .fillMaxWidth()
                .then(animMod),
            shape = RoundedCornerShape(20.dp),
            color = cardColor,
            tonalElevation = if (elevated) 2.dp else 0.dp,
            border = BorderStroke(1.dp, colors.border),
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                content = content,
            )
        }
    }
}

@Composable
fun BsdcSectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = BsdcThemeTokens.colors.mutedText,
                )
            }
        }
        if (!actionLabel.isNullOrBlank() && onAction != null) {
            TextButton(onClick = onAction) {
                Text(actionLabel)
            }
        }
    }
}

@Composable
fun BsdcMetricTile(
    label: String,
    value: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    tone: BsdcTone = BsdcTone.NEUTRAL,
) {
    val ext = BsdcThemeTokens.colors
    val tint = when (tone) {
        BsdcTone.OK -> ext.brandStrong
        BsdcTone.INFO -> ext.accentBlue
        BsdcTone.WARN -> ext.warn
        BsdcTone.BAD -> ext.danger
        BsdcTone.NEUTRAL -> MaterialTheme.colorScheme.primary
    }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        color = ext.surfaceElevated.copy(alpha = 0.72f),
        border = BorderStroke(1.dp, ext.border),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = ext.mutedText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = value,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
            )
        }
    }
}

@Composable
fun BsdcBadge(
    label: String,
    tone: BsdcTone = BsdcTone.NEUTRAL,
    modifier: Modifier = Modifier,
) {
    val ext = BsdcThemeTokens.colors
    val (bg, fg) = when (tone) {
        BsdcTone.OK -> ext.brandSoft to ext.brandStrong
        BsdcTone.WARN -> ext.warnSoft to ext.warn
        BsdcTone.BAD -> ext.dangerSoft to ext.danger
        BsdcTone.INFO -> ext.accentBlueSoft to ext.accentBlue
        BsdcTone.NEUTRAL -> ext.surfaceElevated to ext.mutedText
    }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(999.dp),
        color = bg,
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
            color = fg,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun BsdcStatusBanner(
    title: String,
    body: String,
    tone: BsdcTone,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val ext = BsdcThemeTokens.colors
    val (bg, border, fg) = when (tone) {
        BsdcTone.OK -> Triple(ext.brandSoft, ext.brandStrong.copy(alpha = 0.35f), ext.brandStrong)
        BsdcTone.WARN -> Triple(ext.warnSoft, ext.warn.copy(alpha = 0.45f), ext.warn)
        BsdcTone.BAD -> Triple(ext.dangerSoft, ext.danger.copy(alpha = 0.45f), ext.danger)
        BsdcTone.INFO -> Triple(ext.accentBlueSoft, ext.accentBlue.copy(alpha = 0.35f), ext.accentBlue)
        BsdcTone.NEUTRAL -> Triple(ext.surfaceElevated, ext.border, MaterialTheme.colorScheme.onSurface)
    }
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = bg,
        border = BorderStroke(1.dp, border),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    color = fg,
                )
                if (body.isNotBlank()) {
                    Text(
                        text = body,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
            if (actionLabel != null && onAction != null) {
                BsdcButton(label = actionLabel, onClick = onAction, secondary = true)
            }
        }
    }
}

@Composable
fun BsdcAvatarCircle(
    initials: String,
    online: Boolean = false,
    size: Dp = 42.dp,
    modifier: Modifier = Modifier,
) {
    val ext = BsdcThemeTokens.colors
    val displayInitials = remember(initials) { bsdcInitialsOf(initials) }
    val textStyle = when {
        size <= 30.dp -> MaterialTheme.typography.labelSmall
        size <= 50.dp -> MaterialTheme.typography.titleMedium
        else -> MaterialTheme.typography.headlineSmall
    }
    val gradient = Brush.linearGradient(
        colors = listOf(
            ext.brandSoft,
            MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
        ),
    )
    Box(modifier = modifier.size(size)) {
        Box(
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .background(gradient)
                .border(1.dp, ext.border, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = displayInitials,
                style = textStyle.copy(fontWeight = FontWeight.Bold),
                color = ext.brandStrong,
                maxLines = 1,
            )
        }
        if (online) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size((size * 0.28f).coerceAtLeast(10.dp))
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.background)
                    .padding(2.dp)
                    .clip(CircleShape)
                    .background(ext.online),
            )
        }
    }
}

@Composable
fun BsdcFeedSkeletonCard(modifier: Modifier = Modifier) {
    BsdcCard(modifier = modifier) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .bsdcShimmerPlaceholder(),
            )
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(
                    modifier = Modifier
                        .width(140.dp)
                        .height(14.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .bsdcShimmerPlaceholder(),
                )
                Box(
                    modifier = Modifier
                        .width(96.dp)
                        .height(10.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .bsdcShimmerPlaceholder(),
                )
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth(0.85f)
                .height(18.dp)
                .clip(RoundedCornerShape(6.dp))
                .bsdcShimmerPlaceholder(),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(14.dp)
                .clip(RoundedCornerShape(6.dp))
                .bsdcShimmerPlaceholder(),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(140.dp)
                .clip(RoundedCornerShape(14.dp))
                .bsdcShimmerPlaceholder(),
        )
    }
}

@Composable
fun BsdcEmptyState(
    icon: ImageVector,
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    BsdcCard(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(60.dp)
                    .clip(CircleShape)
                    .background(BsdcThemeTokens.colors.brandSoft),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = BsdcThemeTokens.colors.brandStrong,
                    modifier = Modifier.size(30.dp),
                )
            }
            Text(text = title, style = MaterialTheme.typography.titleLarge)
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = BsdcThemeTokens.colors.mutedText,
            )
            if (actionLabel != null && onAction != null) {
                BsdcButton(label = actionLabel, onClick = onAction)
            }
        }
    }
}
