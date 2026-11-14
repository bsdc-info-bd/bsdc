package bd.info.bsdc.app.core.designsystem

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer

object BsdcMotionSpecs {
    val SmoothDecelerateEasing = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)

    val ReactionPopSpring = spring<Float>(
        dampingRatio = Spring.DampingRatioMediumBouncy,
        stiffness = Spring.StiffnessMediumLow,
    )

    val PressScaleSpring = spring<Float>(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessMedium,
    )

    fun screenTransition(reducedMotion: Boolean, forward: Boolean = true): ContentTransform {
        if (reducedMotion) {
            return fadeIn(tween(1)) togetherWith fadeOut(tween(1))
        }
        val dir = if (forward) 1 else -1
        return (
            slideInHorizontally(
                animationSpec = tween(durationMillis = 280, easing = SmoothDecelerateEasing),
                initialOffsetX = { fullWidth -> (fullWidth * 0.14f * dir).toInt() },
            ) + fadeIn(animationSpec = tween(durationMillis = 220))
            ) togetherWith (
            slideOutHorizontally(
                animationSpec = tween(durationMillis = 240, easing = SmoothDecelerateEasing),
                targetOffsetX = { fullWidth -> (-fullWidth * 0.08f * dir).toInt() },
            ) + fadeOut(animationSpec = tween(durationMillis = 160))
            )
    }

    fun tabTransition(reducedMotion: Boolean): ContentTransform {
        if (reducedMotion) {
            return fadeIn(tween(1)) togetherWith fadeOut(tween(1))
        }
        return (
            fadeIn(animationSpec = tween(durationMillis = 210, easing = SmoothDecelerateEasing)) +
                scaleIn(
                    initialScale = 0.985f,
                    animationSpec = tween(durationMillis = 220, easing = SmoothDecelerateEasing),
                )
            ) togetherWith fadeOut(animationSpec = tween(durationMillis = 130))
    }
}

fun Modifier.pressBounceScale(interactionSource: MutableInteractionSource): Modifier = composed {
    val reduced = BsdcThemeTokens.reducedMotion
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (!reduced && pressed) 0.968f else 1f,
        animationSpec = BsdcMotionSpecs.PressScaleSpring,
        label = "bsdcPressScale",
    )
    graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}

@Composable
fun BsdcAnimatedEntrance(
    modifier: Modifier = Modifier,
    delayMillis: Int = 0,
    content: @Composable () -> Unit,
) {
    val reduced = BsdcThemeTokens.reducedMotion
    if (reduced) {
        content()
        return
    }
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (delayMillis > 0) kotlinx.coroutines.delay(delayMillis.toLong())
        visible = true
    }
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = fadeIn(
            animationSpec = tween(durationMillis = 260, easing = BsdcMotionSpecs.SmoothDecelerateEasing),
        ) + slideInVertically(
            animationSpec = tween(durationMillis = 300, easing = BsdcMotionSpecs.SmoothDecelerateEasing),
            initialOffsetY = { (it * 0.06f).toInt().coerceAtMost(32) },
        ),
    ) {
        content()
    }
}

@Composable
fun rememberBsdcPulseAlpha(minAlpha: Float = 0.45f, maxAlpha: Float = 1f): Float {
    if (BsdcThemeTokens.reducedMotion) return maxAlpha
    val transition = rememberInfiniteTransition(label = "bsdcPulse")
    val alpha by transition.animateFloat(
        initialValue = minAlpha,
        targetValue = maxAlpha,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1100, easing = BsdcMotionSpecs.SmoothDecelerateEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "bsdcPulseAlpha",
    )
    return alpha
}

fun Modifier.bsdcShimmerPlaceholder(): Modifier = composed {
    val reduced = BsdcThemeTokens.reducedMotion
    val base = BsdcThemeTokens.colors.surfaceElevated
    val highlight = BsdcThemeTokens.colors.border
    if (reduced) {
        return@composed background(base)
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
    background(brush)
}
