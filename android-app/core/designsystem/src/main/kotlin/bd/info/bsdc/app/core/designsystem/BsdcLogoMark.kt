package bd.info.bsdc.app.core.designsystem

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Exact Compose Canvas rendering of BSDC's official geometric verified-shield mark
 * from `main-site/src/design-system/Logo.tsx`.
 */
@Composable
fun BsdcShieldMark(
    modifier: Modifier = Modifier,
    size: Dp = 36.dp,
    contentDesc: String = "BSDC",
) {
    Canvas(
        modifier = modifier
            .size(size)
            .semantics { contentDescription = contentDesc },
    ) {
        val w = this.size.width
        val h = this.size.height
        val sx = w / 64f
        val sy = h / 64f

        drawRoundRect(
            brush = Brush.linearGradient(
                colors = listOf(BsdcPalette.LightGreen700, BsdcPalette.LightGreen800),
            ),
            cornerRadius = CornerRadius(16f * sx, 16f * sy),
        )

        val shield = Path().apply {
            moveTo(32f * sx, 12f * sy)
            lineTo(16f * sx, 20f * sy)
            lineTo(16f * sx, 34f * sy)
            cubicTo(
                16f * sx, 45f * sy,
                23.5f * sx, 51f * sy,
                32f * sx, 53f * sy,
            )
            cubicTo(
                40.5f * sx, 51f * sy,
                48f * sx, 45f * sy,
                48f * sx, 34f * sy,
            )
            lineTo(48f * sx, 20f * sy)
            close()
        }
        drawPath(
            path = shield,
            color = BsdcPalette.LightGreen200,
            style = Stroke(width = 3f * sx, join = StrokeJoin.Round),
        )

        val check = Path().apply {
            moveTo(25f * sx, 32f * sy)
            lineTo(30f * sx, 37f * sy)
            lineTo(39f * sx, 27f * sy)
        }
        drawPath(
            path = check,
            color = Color.White,
            style = Stroke(width = 3.5f * sx, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
    }
}

@Composable
fun BsdcBrandWordmark(
    modifier: Modifier = Modifier,
    subtitle: String = "BANGLADESH SOFTWARE DEV COMMUNITY",
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        BsdcShieldMark(size = 34.dp)
        Column {
            Text(
                text = "BSDC",
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = (-0.6).sp,
                ),
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.labelMedium.copy(
                    fontSize = 12.sp,
                    letterSpacing = 0.3.sp,
                ),
                color = BsdcThemeTokens.colors.mutedText,
            )
        }
    }
}
