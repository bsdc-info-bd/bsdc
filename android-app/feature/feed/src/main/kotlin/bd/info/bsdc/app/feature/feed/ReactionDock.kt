package bd.info.bsdc.app.feature.feed

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ThumbUp
import androidx.compose.material.icons.rounded.Celebration
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.Lightbulb
import androidx.compose.material.icons.rounded.Psychology
import androidx.compose.material.icons.rounded.ThumbUp
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import bd.info.bsdc.app.core.common.BanglaDigitFormatter
import bd.info.bsdc.app.core.designsystem.BsdcMotionSpecs
import bd.info.bsdc.app.core.designsystem.BsdcPalette
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.ReactionKind

private data class ReactionVisual(
    val kind: ReactionKind,
    val labelEn: String,
    val labelBn: String,
    val icon: ImageVector,
    val tint: Color,
)

private val ReactionVisuals = listOf(
    ReactionVisual(ReactionKind.LIKE, "Like", "পছন্দ", Icons.Rounded.ThumbUp, BsdcPalette.LightGreen700),
    ReactionVisual(ReactionKind.INSIGHTFUL, "Insightful", "চমৎকার", Icons.Rounded.Lightbulb, BsdcPalette.LightWarn),
    ReactionVisual(ReactionKind.CELEBRATE, "Celebrate", "অভিনন্দন", Icons.Rounded.Celebration, BsdcPalette.LightBlue),
    ReactionVisual(ReactionKind.SUPPORT, "Support", "সমর্থন", Icons.Rounded.Favorite, BsdcPalette.LightDanger),
    ReactionVisual(ReactionKind.CURIOUS, "Curious", "কৌতূহল", Icons.Rounded.Psychology, Color(0xFF8B5CF6)),
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ReactionButtonWithDock(
    activeReaction: ReactionKind?,
    totalLikes: Int,
    language: AppLanguage,
    onSelectReaction: (ReactionKind) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = BsdcThemeTokens.colors
    val haptics = LocalHapticFeedback.current
    var showDock by remember { mutableStateOf(false) }

    val activeVisual = ReactionVisuals.firstOrNull { it.kind == activeReaction }
    val scale by animateFloatAsState(
        targetValue = if (activeReaction != null) 1.08f else 1f,
        animationSpec = BsdcMotionSpecs.ReactionPopSpring,
        label = "reactionScale",
    )

    val displayLabel = when {
        activeVisual != null -> if (language == AppLanguage.BN) activeVisual.labelBn else activeVisual.labelEn
        else -> if (language == AppLanguage.BN) "পছন্দ" else "Like"
    }
    val formattedCount = BanglaDigitFormatter.formatCount(totalLikes.coerceAtLeast(0).toLong(), language)

    Box(modifier = modifier) {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(
                    if (activeVisual != null) activeVisual.tint.copy(alpha = 0.12f)
                    else Color.Transparent,
                )
                .combinedClickable(
                    onClick = {
                        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onSelectReaction(activeReaction ?: ReactionKind.LIKE)
                    },
                    onLongClick = {
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        showDock = true
                    },
                )
                .padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Icon(
                imageVector = activeVisual?.icon ?: Icons.Outlined.ThumbUp,
                contentDescription = displayLabel,
                tint = activeVisual?.tint ?: tokens.mutedText,
                modifier = Modifier
                    .size(18.dp)
                    .scale(scale),
            )
            Text(
                text = if (totalLikes > 0) "$displayLabel · $formattedCount" else displayLabel,
                style = MaterialTheme.typography.labelLarge,
                color = activeVisual?.tint ?: tokens.mutedText,
                fontWeight = if (activeVisual != null) FontWeight.SemiBold else FontWeight.Medium,
            )
        }

        if (showDock) {
            Popup(
                alignment = Alignment.TopStart,
                offset = IntOffset(0, -142),
                onDismissRequest = { showDock = false },
                properties = PopupProperties(focusable = true),
            ) {
                AnimatedVisibility(
                    visible = true,
                    enter = fadeIn() + scaleIn(initialScale = 0.85f),
                    exit = fadeOut() + scaleOut(targetScale = 0.85f),
                ) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = tokens.surfaceElevated,
                        shadowElevation = 10.dp,
                        modifier = Modifier.border(1.dp, tokens.border, RoundedCornerShape(999.dp)),
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            ReactionVisuals.forEach { visual ->
                                val selected = visual.kind == activeReaction
                                Column(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(if (selected) visual.tint.copy(alpha = 0.16f) else Color.Transparent)
                                        .clickable {
                                            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                            showDock = false
                                            onSelectReaction(visual.kind)
                                        }
                                        .padding(horizontal = 8.dp, vertical = 4.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(30.dp)
                                            .clip(CircleShape)
                                            .background(visual.tint.copy(alpha = 0.14f)),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(
                                            imageVector = visual.icon,
                                            contentDescription = visual.labelEn,
                                            tint = visual.tint,
                                            modifier = Modifier.size(18.dp),
                                        )
                                    }
                                    Text(
                                        text = if (language == AppLanguage.BN) visual.labelBn else visual.labelEn,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = if (selected) visual.tint else tokens.mutedText,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
