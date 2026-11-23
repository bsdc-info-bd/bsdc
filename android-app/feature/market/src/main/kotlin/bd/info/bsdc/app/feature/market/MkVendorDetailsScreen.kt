package bd.info.bsdc.app.feature.market

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.ImageLoader
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState

private enum class VendorDetailsTab { INFO, REVIEWS }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MkVendorDetailsScreen(
    repository: MkRepository,
    imageLoader: ImageLoader,
    slug: String,
    bn: Boolean,
    onBack: () -> Unit,
    onOpenShop: (String) -> Unit,
    onOpenGoogleMaps: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var details by remember { mutableStateOf<MkVendorDetailsDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(slug) {
        loading = true
        repository.fetchVendorDetails(slug).onSuccess { details = it; error = null }.onFailure { error = it.message ?: "load_failed" }
        loading = false
    }
    val data = details
    if (loading && data == null) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }
    if (data == null) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            BsdcEmptyState(icon = Icons.Rounded.Storefront, title = mkText(bn, "Shop not found", "দোকান পাওয়া যায়নি"), subtitle = error ?: mkText(bn, "It may be closed", "এটি বন্ধ"))
        }
        return
    }
    Scaffold(modifier = modifier.fillMaxSize(), topBar = { TopAppBar(title = { Text(text = data.vendor.name, maxLines = 1, overflow = TextOverflow.Ellipsis) }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Rounded.ArrowBack, contentDescription = null) } }) }) { innerPadding ->
        LazyColumn(modifier = Modifier.padding(innerPadding).fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { Text(text = "Hello " + data.vendor.name, modifier = Modifier.padding(16.dp)) }
        }
    }
}
private fun mkText(bn: Boolean, en: String, bnText: String = en): String = if (bn) bnText else en
