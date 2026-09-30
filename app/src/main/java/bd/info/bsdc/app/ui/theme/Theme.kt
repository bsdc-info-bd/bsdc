package bd.info.bsdc.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.ThemePreference

/** BSDC's native palette: composed for readable, calm community surfaces rather than web branding. */
private val BsdcForest = Color(0xFF006B4F)
private val BsdcForestDeep = Color(0xFF003D2D)
private val BsdcMintContainer = Color(0xFFC9F7DE)
private val BsdcBlue = Color(0xFF155EEF)
private val BsdcBlueContainer = Color(0xFFDCE8FF)
private val Ink = Color(0xFF17201B)

private val LightColors = lightColorScheme(
    primary = BsdcForest,
    onPrimary = Color.White,
    primaryContainer = BsdcMintContainer,
    onPrimaryContainer = BsdcForestDeep,
    secondary = BsdcBlue,
    onSecondary = Color.White,
    secondaryContainer = BsdcBlueContainer,
    onSecondaryContainer = Color(0xFF002A78),
    tertiary = Color(0xFF735B00),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFFFE9A6),
    onTertiaryContainer = Color(0xFF241A00),
    background = Color(0xFFF6F8F7),
    onBackground = Ink,
    surface = Color(0xFFFFFFFF),
    onSurface = Ink,
    surfaceVariant = Color(0xFFE4EEE8),
    onSurfaceVariant = Color(0xFF3F4B44),
    outline = Color(0xFF728078),
    outlineVariant = Color(0xFFC3CEC7),
    error = Color(0xFFB3261E),
    onError = Color.White,
    errorContainer = Color(0xFFF9DEDC),
    onErrorContainer = Color(0xFF410E0B)
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF81DCB0),
    onPrimary = Color(0xFF003824),
    primaryContainer = Color(0xFF005138),
    onPrimaryContainer = Color(0xFFA0F8C9),
    secondary = Color(0xFFB3C5FF),
    onSecondary = Color(0xFF002B77),
    secondaryContainer = Color(0xFF17489D),
    onSecondaryContainer = Color(0xFFDCE6FF),
    tertiary = Color(0xFFFFDE7A),
    onTertiary = Color(0xFF3C2F00),
    tertiaryContainer = Color(0xFF594700),
    onTertiaryContainer = Color(0xFFFFEBAA),
    background = Color(0xFF101613),
    onBackground = Color(0xFFE0E8E2),
    surface = Color(0xFF151D18),
    onSurface = Color(0xFFE0E8E2),
    surfaceVariant = Color(0xFF26342C),
    onSurfaceVariant = Color(0xFFC0CBC3),
    outline = Color(0xFF8B9A90),
    outlineVariant = Color(0xFF3F4D45),
    error = Color(0xFFFFB4AB),
    onError = Color(0xFF690005),
    errorContainer = Color(0xFF93000A),
    onErrorContainer = Color(0xFFFFDAD6)
)

private val BsdcTypography = Typography(
    displaySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 36.sp,
        lineHeight = 42.sp,
        letterSpacing = (-0.6).sp
    ),
    headlineLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 30.sp,
        lineHeight = 36.sp,
        letterSpacing = (-0.4).sp
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 25.sp,
        lineHeight = 31.sp,
        letterSpacing = (-0.25).sp
    ),
    headlineSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 21.sp,
        lineHeight = 27.sp
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 20.sp,
        lineHeight = 26.sp
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 22.sp
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 20.sp
    )
)

private val BsdcShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(32.dp)
)

@Composable
fun BsdcTheme(theme: ThemePreference, content: @Composable () -> Unit) {
    val dark = when (theme) {
        ThemePreference.SYSTEM -> isSystemInDarkTheme()
        ThemePreference.DARK -> true
        ThemePreference.LIGHT -> false
    }
    MaterialTheme(
        colorScheme = if (dark) DarkColors else LightColors,
        typography = BsdcTypography,
        shapes = BsdcShapes,
        content = content
    )
}
