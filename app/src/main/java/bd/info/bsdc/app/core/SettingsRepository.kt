package bd.info.bsdc.app.core

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "bsdc_preferences")

enum class ThemePreference { SYSTEM, LIGHT, DARK }
enum class LanguagePreference { ENGLISH, BANGLA }

data class AppPreferences(
    val theme: ThemePreference = ThemePreference.SYSTEM,
    val language: LanguagePreference = LanguagePreference.ENGLISH,
    val reduceMotion: Boolean = false,
    val useRankedFeed: Boolean = true
)

class SettingsRepository(private val context: Context) {
    val preferences: Flow<AppPreferences> = context.dataStore.data.map { values ->
        AppPreferences(
            theme = values[THEME]?.let { runCatching { ThemePreference.valueOf(it) }.getOrNull() }
                ?: ThemePreference.SYSTEM,
            language = values[LANGUAGE]?.let { runCatching { LanguagePreference.valueOf(it) }.getOrNull() }
                ?: LanguagePreference.ENGLISH,
            reduceMotion = values[REDUCE_MOTION] ?: false,
            useRankedFeed = values[RANKED_FEED] ?: true
        )
    }

    suspend fun setTheme(value: ThemePreference) = context.dataStore.edit { it[THEME] = value.name }
    suspend fun setLanguage(value: LanguagePreference) = context.dataStore.edit { it[LANGUAGE] = value.name }
    suspend fun setReduceMotion(value: Boolean) = context.dataStore.edit { it[REDUCE_MOTION] = value }
    suspend fun setRankedFeed(value: Boolean) = context.dataStore.edit { it[RANKED_FEED] = value }

    private companion object {
        val THEME = stringPreferencesKey("theme")
        val LANGUAGE = stringPreferencesKey("language")
        val REDUCE_MOTION = booleanPreferencesKey("reduce_motion")
        val RANKED_FEED = booleanPreferencesKey("ranked_feed")
    }
}
