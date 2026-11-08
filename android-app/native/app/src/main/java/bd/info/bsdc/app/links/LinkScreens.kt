package bd.info.bsdc.app.links

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView

@Composable
fun NewsReaderScreen(url: String, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, contentDescription = "Back") }
            Text("BSDC News", style = MaterialTheme.typography.titleMedium)
        }
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context -> createNewsWebView(context) },
            update = { view -> if (view.url != url) view.loadUrl(url) },
        )
    }
}

@Composable
fun UnsupportedLinkScreen(path: String, onHome: () -> Unit, onOpenBrowser: (String) -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text("BSDC link", style = MaterialTheme.typography.headlineSmall)
        Text("This destination has not been implemented natively yet.", Modifier.padding(top = 12.dp), color = Color.Gray)
        Text("The app has not substituted the website inside a WebView.", Modifier.padding(top = 6.dp), color = Color.Gray, fontSize = 13.sp)
        Button(onClick = onHome, Modifier.fillMaxWidth().padding(top = 24.dp), shape = RoundedCornerShape(14.dp)) { Text("Go to home") }
        OutlinedButton(onClick = { onOpenBrowser("https://www.bsdc.info.bd${path.takeUnless { it.startsWith("//") } ?: "/"}") }, Modifier.fillMaxWidth().padding(top = 8.dp), shape = RoundedCornerShape(14.dp)) {
            Icon(Icons.Filled.OpenInNew, null); Spacer(Modifier.width(8.dp)); Text("Open BSDC website")
        }
    }
}

fun openInTrustedBrowser(context: Context, raw: String) {
    val uri = runCatching { Uri.parse(raw) }.getOrNull() ?: return
    if (uri.scheme != "https" || uri.host !in setOf("www.bsdc.info.bd", "bsdc.info.bd", "vf.main.bsdc.info.bd") || uri.userInfo != null || uri.port != -1) return
    runCatching { CustomTabsIntent.Builder().build().launchUrl(context, uri) }
}
