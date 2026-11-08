package bd.info.bsdc.app.links

import android.content.Context
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.browser.customtabs.CustomTabsIntent

private const val NEWS_HOST = "news.bsdc.info.bd"

/** News has a separate origin boundary: only its exact HTTPS host renders in WebView. */
fun createNewsWebView(context: Context, onExternalBlocked: (String) -> Unit = {}): WebView = WebView(context).apply {
    android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true
    settings.allowFileAccess = false
    settings.allowContentAccess = false
    settings.javaScriptCanOpenWindowsAutomatically = false
    settings.setSupportMultipleWindows(false)
    settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
    settings.safeBrowsingEnabled = true
    webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            if (uri.scheme.equals("https", true) && uri.host.equals(NEWS_HOST, true) && uri.userInfo == null && uri.port == -1) return false
            val safeUrl = uri.takeIf { it.scheme.equals("https", true) && it.host != null && it.userInfo == null && it.port == -1 }?.toString()
            if (safeUrl != null) runCatching { CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(safeUrl)) }
            else onExternalBlocked("Only secure external links can be opened.")
            return true
        }
    }
}
