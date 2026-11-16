package bd.info.bsdc.app.feature.news

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.FormatSize
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.viewinterop.AndroidView
import bd.info.bsdc.app.core.model.AppLanguage

@SuppressLint("SetJavaScriptEnabled")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewsReaderScreen(
    initialUrl: String,
    language: AppLanguage,
    onBack: () -> Unit,
    onRouteNativeUrl: (String) -> Unit,
    onOpenExternal: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val context = LocalContext.current
    val safeStartUrl = remember(initialUrl) {
        NewsWebSecurityEngine.normalizeNewsStartUrl(initialUrl)
    }

    var currentUrl by remember(safeStartUrl) { mutableStateOf(safeStartUrl) }
    var pageTitle by remember { mutableStateOf(if (bn) "BSDC নিউজ" else "BSDC News") }
    var progress by remember { mutableIntStateOf(0) }
    var textZoom by remember { mutableIntStateOf(100) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }

    DisposableEffect(Unit) {
        onDispose {
            webViewRef?.apply {
                stopLoading()
                destroy()
            }
            webViewRef = null
        }
    }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = {
                        Column {
                            Text(
                                text = pageTitle,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = "news.bsdc.info.bd",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    },
                    navigationIcon = {
                        IconButton(
                            onClick = {
                                val wv = webViewRef
                                if (wv != null && wv.canGoBack()) {
                                    wv.goBack()
                                } else {
                                    onBack()
                                }
                            },
                        ) {
                            Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Back")
                        }
                    },
                    actions = {
                        IconButton(
                            onClick = {
                                val nextZoom = if (textZoom >= 130) 100 else textZoom + 15
                                textZoom = NewsWebSecurityEngine.clampTextZoom(nextZoom)
                                webViewRef?.settings?.textZoom = textZoom
                            },
                        ) {
                            Icon(Icons.Rounded.FormatSize, contentDescription = "Text size")
                        }
                        IconButton(onClick = { webViewRef?.reload() }) {
                            Icon(Icons.Rounded.Refresh, contentDescription = "Reload")
                        }
                        IconButton(
                            onClick = {
                                val share = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, "$pageTitle\n$currentUrl")
                                }
                                context.startActivity(Intent.createChooser(share, pageTitle))
                            },
                        ) {
                            Icon(Icons.Rounded.Share, contentDescription = "Share")
                        }
                    },
                )
                if (progress in 1..99) {
                    LinearProgressIndicator(
                        progress = { progress / 100f },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        },
        modifier = modifier,
    ) { innerPadding ->
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    WebView(ctx).apply {
                        // Isolated news sandbox: zero file access, zero mixed content, zero JS bridges
                        CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.allowFileAccess = false
                        settings.allowContentAccess = false
                        @Suppress("DEPRECATION")
                        settings.allowFileAccessFromFileURLs = false
                        @Suppress("DEPRECATION")
                        settings.allowUniversalAccessFromFileURLs = false
                        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        settings.safeBrowsingEnabled = true
                        settings.textZoom = textZoom
                        settings.useWideViewPort = true
                        settings.loadWithOverviewMode = true

                        webChromeClient = object : WebChromeClient() {
                            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                                progress = newProgress
                            }

                            override fun onReceivedTitle(view: WebView?, title: String?) {
                                if (!title.isNullOrBlank()) pageTitle = title
                            }
                        }

                        webViewClient = object : WebViewClient() {
                            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                                if (!url.isNullOrBlank()) currentUrl = url
                            }

                            override fun shouldOverrideUrlLoading(
                                view: WebView?,
                                request: WebResourceRequest?,
                            ): Boolean {
                                val target = request?.url?.toString().orEmpty()
                                return when (NewsWebSecurityEngine.classifyNavigation(target)) {
                                    NewsWebSecurityEngine.NavigationDecision.ALLOW_IN_NEWS_WEBVIEW -> false
                                    NewsWebSecurityEngine.NavigationDecision.ROUTE_NATIVE_APP -> {
                                        onRouteNativeUrl(target)
                                        true
                                    }
                                    NewsWebSecurityEngine.NavigationDecision.OPEN_EXTERNAL_BROWSER -> {
                                        onOpenExternal(target)
                                        true
                                    }
                                    NewsWebSecurityEngine.NavigationDecision.REJECT -> true
                                }
                            }
                        }

                        loadUrl(safeStartUrl)
                        webViewRef = this
                    }
                },
            )
        }
    }
}
