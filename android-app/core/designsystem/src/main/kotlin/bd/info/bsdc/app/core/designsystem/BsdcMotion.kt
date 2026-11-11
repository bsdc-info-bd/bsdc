package bd.info.bsdc.app.core.designsystem

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer

object BsdcMotionSpecs {
    val ReactionPopSpring = spring<Float>(
        dampingRatio = Spring.DampingRatioMediumBouncy,
        stiffness = Spring.StiffnessMediumLow,
    )

    val PressScaleSpring = spring<Float>(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessMedium,
    )
}

fun Modifier.pressBounceScale(interactionSource: MutableInteractionSource): Modifier = composed {
    val reduced = BsdcThemeTokens.reducedMotion
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (!reduced && pressed) 0.965f else 1f,
        animationSpec = BsdcMotionSpecs.PressScaleSpring,
        label = "bsdcPressScale",
    )
    graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}

@Composable
fun Modifier.bsdcShimmerPlaceholder(): Modifier {
    val reduced = BsdcThemeTokens.reducedMotion
    val base = BsdcThemeTokens.colors.surfaceElevated
    val highlight = BsdcThemeTokens.colors.border
    if (reduced) {
        return background(base)
    }
    val transition = rememberInfiniteTransition(label = "bsdcShimmer")
    val offset by transition.animateFloat(
        initialValue = -300f,
        targetValue = 900f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1250, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "bsdcShimmerOffset",
    )
    val brush = remember(offset, base, highlight) {
        Brush.linearGradient(
            colors = listOf(base, highlight, base),
            start = Offset(offset, 0f),
            end = Offset(offset + 320f, 180f),
        )
    }
    return background(brush)
}
