package bd.info.bsdc.app.core.designsystem

import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.ThemeMode

val LocalReducedMotion = staticCompositionLocalOf { false }
val LocalAppLanguage = staticCompositionLocalOf { AppLanguage.BN }

@Composable
fun rememberPrefersReducedMotion(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        val scale = Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        )
        scale == 0f
    }
}

@Composable
fun BsdcTheme(
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    dynamicColor: Boolean = false,
    language: AppLanguage = AppLanguage.BN,
    content: @Composable () -> Unit,
) {
    val darkTheme = when (themeMode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }

    val context = LocalContext.current
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> BsdcDarkColorScheme
        else -> BsdcLightColorScheme
    }

    val extendedColors = if (darkTheme) DarkExtendedColors else LightExtendedColors
    val reducedMotion = rememberPrefersReducedMotion()

    CompositionLocalProvider(
        LocalBsdcColors provides extendedColors,
        LocalReducedMotion provides reducedMotion,
        LocalAppLanguage provides language,
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = BsdcTypography,
            content = content,
        )
    }
}

object BsdcThemeTokens {
    val colors: BsdcExtendedColors
        @Composable
        @ReadOnlyComposable
        get() = LocalBsdcColors.current

    val reducedMotion: Boolean
        @Composable
        @ReadOnlyComposable
        get() = LocalReducedMotion.current

    val language: AppLanguage
        @Composable
        @ReadOnlyComposable
        get() = LocalAppLanguage.current
}
