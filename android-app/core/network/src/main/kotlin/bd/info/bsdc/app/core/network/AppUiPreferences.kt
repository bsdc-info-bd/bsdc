package bd.info.bsdc.app.core.network

import android.content.Context
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.ThemeMode

/**
 * Shared UI preference store accessible by `:app` (MainActivity) and `:core:push`
 * background workers/services so FCM registration and locales always match the user's choice.
 */
object AppUiPreferences {
    private const val PREFS_NAME = "bsdc_ui_prefs"
    private const val KEY_LANGUAGE = "app_language"
    private const val KEY_THEME_MODE = "theme_mode"

    fun getLanguage(context: Context): AppLanguage {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_LANGUAGE, null)
        if (raw.equals("en", ignoreCase = true)) return AppLanguage.EN
        if (raw.equals("bn", ignoreCase = true)) return AppLanguage.BN
        val sysLang = context.resources.configuration.locales[0]?.language
        return if (sysLang == "en") AppLanguage.EN else AppLanguage.BN
    }

    fun setLanguage(context: Context, language: AppLanguage) {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_LANGUAGE, language.tag).apply()
    }

    fun getThemeMode(context: Context): ThemeMode {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return when (prefs.getString(KEY_THEME_MODE, null)?.lowercase()) {
            "light" -> ThemeMode.LIGHT
            "dark" -> ThemeMode.DARK
            else -> ThemeMode.SYSTEM
        }
    }

    fun setThemeMode(context: Context, mode: ThemeMode) {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val raw = when (mode) {
            ThemeMode.SYSTEM -> "system"
            ThemeMode.LIGHT -> "light"
            ThemeMode.DARK -> "dark"
        }
        prefs.edit().putString(KEY_THEME_MODE, raw).apply()
    }
}
