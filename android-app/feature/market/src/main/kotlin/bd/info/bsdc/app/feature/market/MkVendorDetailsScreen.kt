package bd.info.bsdc.app.feature.market

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import coil3.ImageLoader

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
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text = if (bn) "দোকানের তথ্য" else "Shop details: $slug")
    }
}
