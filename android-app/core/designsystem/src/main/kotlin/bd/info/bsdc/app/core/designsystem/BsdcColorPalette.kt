package bd.info.bsdc.app.core.designsystem

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Exact BSDC semantic brand palette ported directly from `main-site/src/styles/base.css`.
 */
object BsdcPalette {
    val LightBg = Color(0xFFFFFFFF)
    val LightSurface = Color(0xFFF2F7F5)
    val LightSurface2 = Color(0xFFE8F0EC)
    val LightBorder = Color(0xFFD7E3DC)
    val LightText = Color(0xFF10241B)
    val LightTextMuted = Color(0xFF5C6F66)

    val LightGreen900 = Color(0xFF081C15)
    val LightGreen800 = Color(0xFF1B4332)
    val LightGreen700 = Color(0xFF2D6A4F)
    val LightGreen500 = Color(0xFF40916C)
    val LightGreen300 = Color(0xFF74C69D)
    val LightGreen200 = Color(0xFF52B788)

    val LightBlue = Color(0xFF1877F2)
    val LightBlueSoft = Color(0xFFE7F0FE)
    val LightDanger = Color(0xFFD9363E)
    val LightDangerSoft = Color(0xFFFDECEC)
    val LightWarn = Color(0xFFE5A50A)
    val LightWarnSoft = Color(0xFFFEF7E2)
    val LightOnline = Color(0xFF31A24C)
    val ChatOutgoing = Color(0xFF245D44)

    val DarkBg = Color(0xFF0B1512)
    val DarkSurface = Color(0xFF101E19)
    val DarkSurface2 = Color(0xFF16281F)
    val DarkBorder = Color(0xFF1F3A2E)
    val DarkText = Color(0xFFE9F2ED)
    val DarkTextMuted = Color(0xFF9DB4A9)

    val DarkGreen900 = Color(0xFFD8F3E6)
    val DarkGreen800 = Color(0xFFB7E4C7)
    val DarkGreen700 = Color(0xFF74C69D)
    val DarkGreen500 = Color(0xFF52B788)
    val DarkGreen300 = Color(0xFF40916C)

    val DarkBlue = Color(0xFF4E9BFF)
    val DarkBlueSoft = Color(0xFF15263C)
    val DarkDanger = Color(0xFFFF6B70)
    val DarkDangerSoft = Color(0xFF3A181A)
    val DarkWarn = Color(0xFFF4C04B)
    val DarkWarnSoft = Color(0xFF352A11)
    val DarkOnline = Color(0xFF42B72A)
}

@Immutable
data class BsdcExtendedColors(
    val surfaceElevated: Color,
    val border: Color,
    val mutedText: Color,
    val brandStrong: Color,
    val brandSoft: Color,
    val accentBlue: Color,
    val accentBlueSoft: Color,
    val danger: Color,
    val dangerSoft: Color,
    val warn: Color,
    val warnSoft: Color,
    val online: Color,
    val chatOutgoing: Color,
)

val LightExtendedColors = BsdcExtendedColors(
    surfaceElevated = BsdcPalette.LightSurface2,
    border = BsdcPalette.LightBorder,
    mutedText = BsdcPalette.LightTextMuted,
    brandStrong = BsdcPalette.LightGreen800,
    brandSoft = BsdcPalette.LightSurface2,
    accentBlue = BsdcPalette.LightBlue,
    accentBlueSoft = BsdcPalette.LightBlueSoft,
    danger = BsdcPalette.LightDanger,
    dangerSoft = BsdcPalette.LightDangerSoft,
    warn = BsdcPalette.LightWarn,
    warnSoft = BsdcPalette.LightWarnSoft,
    online = BsdcPalette.LightOnline,
    chatOutgoing = BsdcPalette.ChatOutgoing,
)

val DarkExtendedColors = BsdcExtendedColors(
    surfaceElevated = BsdcPalette.DarkSurface2,
    border = BsdcPalette.DarkBorder,
    mutedText = BsdcPalette.DarkTextMuted,
    brandStrong = BsdcPalette.DarkGreen800,
    brandSoft = BsdcPalette.DarkSurface2,
    accentBlue = BsdcPalette.DarkBlue,
    accentBlueSoft = BsdcPalette.DarkBlueSoft,
    danger = BsdcPalette.DarkDanger,
    dangerSoft = BsdcPalette.DarkDangerSoft,
    warn = BsdcPalette.DarkWarn,
    warnSoft = BsdcPalette.DarkWarnSoft,
    online = BsdcPalette.DarkOnline,
    chatOutgoing = BsdcPalette.ChatOutgoing,
)

val BsdcLightColorScheme = lightColorScheme(
    primary = BsdcPalette.LightGreen800,
    onPrimary = Color.White,
    primaryContainer = BsdcPalette.LightSurface2,
    onPrimaryContainer = BsdcPalette.LightGreen900,
    secondary = BsdcPalette.LightGreen700,
    onSecondary = Color.White,
    secondaryContainer = BsdcPalette.LightSurface,
    onSecondaryContainer = BsdcPalette.LightGreen900,
    tertiary = BsdcPalette.LightBlue,
    onTertiary = Color.White,
    tertiaryContainer = BsdcPalette.LightBlueSoft,
    onTertiaryContainer = BsdcPalette.LightGreen900,
    background = BsdcPalette.LightBg,
    onBackground = BsdcPalette.LightText,
    surface = BsdcPalette.LightBg,
    onSurface = BsdcPalette.LightText,
    surfaceVariant = BsdcPalette.LightSurface,
    onSurfaceVariant = BsdcPalette.LightTextMuted,
    outline = BsdcPalette.LightBorder,
    outlineVariant = BsdcPalette.LightSurface2,
    error = BsdcPalette.LightDanger,
    onError = Color.White,
    errorContainer = BsdcPalette.LightDangerSoft,
    onErrorContainer = BsdcPalette.LightDanger,
)

val BsdcDarkColorScheme = darkColorScheme(
    primary = BsdcPalette.DarkGreen500,
    onPrimary = Color(0xFF062116),
    primaryContainer = BsdcPalette.DarkSurface2,
    onPrimaryContainer = BsdcPalette.DarkGreen900,
    secondary = BsdcPalette.DarkGreen700,
    onSecondary = Color(0xFF062116),
    secondaryContainer = BsdcPalette.DarkSurface,
    onSecondaryContainer = BsdcPalette.DarkText,
    tertiary = BsdcPalette.DarkBlue,
    onTertiary = Color(0xFF061B36),
    tertiaryContainer = BsdcPalette.DarkBlueSoft,
    onTertiaryContainer = Color(0xFFD5E6FF),
    background = BsdcPalette.DarkBg,
    onBackground = BsdcPalette.DarkText,
    surface = BsdcPalette.DarkBg,
    onSurface = BsdcPalette.DarkText,
    surfaceVariant = BsdcPalette.DarkSurface,
    onSurfaceVariant = BsdcPalette.DarkTextMuted,
    outline = BsdcPalette.DarkBorder,
    outlineVariant = BsdcPalette.DarkSurface2,
    error = BsdcPalette.DarkDanger,
    onError = Color(0xFF38070B),
    errorContainer = BsdcPalette.DarkDangerSoft,
    onErrorContainer = BsdcPalette.DarkDanger,
)

val LocalBsdcColors = staticCompositionLocalOf { LightExtendedColors }
