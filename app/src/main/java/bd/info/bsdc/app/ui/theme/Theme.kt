package bd.info.bsdc.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import bd.info.bsdc.app.core.ThemePreference

private val Green = Color(0xFF1B4332)
private val GreenBright = Color(0xFF2D6A4F)
private val Mint = Color(0xFF52B788)
private val Blue = Color(0xFF2563EB)

private val Light = lightColorScheme(
    primary = Green,
    secondary = GreenBright,
    tertiary = Blue,
    surface = Color(0xFFFCFDFB),
    surfaceVariant = Color(0xFFE9F2ED),
    background = Color(0xFFF7FAF8),
    onPrimary = Color.White
)

private val Dark = darkColorScheme(
    primary = Mint,
    secondary = Color(0xFF95D5B2),
    tertiary = Color(0xFF93C5FD),
    background = Color(0xFF101513),
    surface = Color(0xFF151C18),
    surfaceVariant = Color(0xFF25332B),
    onPrimary = Color(0xFF09281A)
)

@Composable
fun BsdcTheme(theme: ThemePreference, content: @Composable () -> Unit) {
    val dark = when (theme) {
        ThemePreference.SYSTEM -> isSystemInDarkTheme()
        ThemePreference.DARK -> true
        ThemePreference.LIGHT -> false
    }
    MaterialTheme(colorScheme = if (dark) Dark else Light, content = content)
}
