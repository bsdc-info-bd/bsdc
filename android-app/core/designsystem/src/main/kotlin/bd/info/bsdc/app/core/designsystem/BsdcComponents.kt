package bd.info.bsdc.app.core.designsystem

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

enum class BsdcTone {
    NEUTRAL,
    OK,
    WARN,
    BAD,
    INFO,
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
    Text(text = label, style = MaterialTheme.typography.labelLarge)
}

@Composable
fun BsdcCard(
    modifier: Modifier = Modifier,
    elevated: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = BsdcThemeTokens.colors
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = if (elevated) colors.surfaceElevated else MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(1.dp, colors.border),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            content = content,
        )
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
                Text(
                    text = body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
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
    Box(modifier = modifier.size(size)) {
        Box(
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .background(ext.brandSoft),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = initials.take(2).uppercase(),
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = ext.brandStrong,
            )
        }
        if (online) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(size * 0.28f)
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
                .padding(vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(BsdcThemeTokens.colors.brandSoft),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = BsdcThemeTokens.colors.brandStrong,
                    modifier = Modifier.size(28.dp),
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
