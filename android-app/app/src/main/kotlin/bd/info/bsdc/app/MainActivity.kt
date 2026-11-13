package bd.info.bsdc.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.os.LocaleListCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import bd.info.bsdc.app.core.common.AppLinkUriRouter
import bd.info.bsdc.app.core.designsystem.BsdcTheme
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.LinkDestination
import bd.info.bsdc.app.core.model.ThemeMode
import bd.info.bsdc.app.core.network.AppUiPreferences
import bd.info.bsdc.app.ui.BsdcAppShell

class MainActivity : AppCompatActivity() {

    private var activeDestination by mutableStateOf<LinkDestination>(LinkDestination.NativeRoute("/"))
    private var destinationNonce by mutableLongStateOf(0L)
    private var appLanguage by mutableStateOf(AppLanguage.BN)
    private var themeMode by mutableStateOf(ThemeMode.SYSTEM)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        appLanguage = AppUiPreferences.getLanguage(this)
        themeMode = AppUiPreferences.getThemeMode(this)
        val desiredTags = appLanguage.tag
        if (AppCompatDelegate.getApplicationLocales().toLanguageTags() != desiredTags) {
            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(desiredTags))
        }

        resolveIncomingIntent(intent)

        val container = (application as BsdcApplication).container

        setContent {
            BsdcTheme(
                themeMode = themeMode,
                language = appLanguage,
            ) {
                BsdcAppShell(
                    container = container,
                    incomingDestination = activeDestination,
                    destinationNonce = destinationNonce,
                    language = appLanguage,
                    themeMode = themeMode,
                    onChangeLanguage = { next ->
                        AppUiPreferences.setLanguage(this, next)
                        appLanguage = next
                        AppCompatDelegate.setApplicationLocales(
                            LocaleListCompat.forLanguageTags(next.tag),
                        )
                    },
                    onChangeTheme = { next ->
                        AppUiPreferences.setThemeMode(this, next)
                        themeMode = next
                    },
                    onRouteEvaluated = { destination -> activeDestination = destination },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        resolveIncomingIntent(intent)
    }

    private fun resolveIncomingIntent(incoming: Intent?) {
        if (incoming == null) return
        val dataUri = incoming.dataString
        if (!dataUri.isNullOrBlank()) {
            activeDestination = AppLinkUriRouter.resolveLink(dataUri)
            destinationNonce += 1L
            return
        }

        val extras = incoming.extras ?: return
        val payload = buildMap {
            for (key in listOf("url", "path", "link", "kind", "id")) {
                val value = extras.getString(key)
                if (!value.isNullOrBlank()) put(key, value)
            }
        }
        if (payload.isNotEmpty()) {
            activeDestination = AppLinkUriRouter.pushDestination(payload)
            destinationNonce += 1L
        }
    }
}
