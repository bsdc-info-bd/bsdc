package bd.info.bsdc.app.feature.market

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Inventory2
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import bd.info.bsdc.app.core.model.MediaPurpose
import coil3.ImageLoader
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Editable copy of one product. Prices stay as text until they are checked. */
internal data class MkProductDraft(
    val id: String? = null,
    val name: String = "",
    val description: String = "",
    val priceText: String = "",
    val stockText: String = "0",
    val status: String = "draft",
    val categoryId: String? = null,
    val images: List<String> = emptyList(),
)

private const val MAX_PRODUCT_IMAGES = 8
private val PRODUCT_STATUSES = listOf("draft", "active", "archived")

/**
 * The vendor's catalogue: categories and products. Every write goes through the mk_vendor_* RPCs,
 * which check ownership, the shop's status and the stock and price limits on the server.
 */
@Composable
fun MkVendorCatalogPanel(
    repository: MkRepository,
    mediaRepository: BsdcMediaRepository,
    imageLoader: ImageLoader,
    bn: Boolean,
    onChanged: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var catalog by remember { mutableStateOf<MkVendorCatalogDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var refreshTick by rememberSaveable { mutableStateOf(0) }
    var editing by remember { mutableStateOf<MkProductDraft?>(null) }
    var categoryDialog by remember { mutableStateOf<MkCatalogCategoryDto?>(null) }
    var creatingCategory by remember { mutableStateOf(false) }
    var newCategoryName by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var actionError by remember { mutableStateOf<String?>(null) }

    fun refresh() {
        refreshTick++
        onChanged()
    }

    LaunchedEffect(refreshTick) {
        repository.fetchVendorCatalog()
            .onSuccess { catalog = it; loadError = null }
            .onFailure { loadError = it.message ?: "load_failed" }
        loading = false
    }

    val data = catalog
    val draft = editing
    if (draft != null) {
        ProductEditor(
            draft = draft,
            categories = data?.categories.orEmpty(),
            bn = bn,
            imageLoader = imageLoader,
            mediaRepository = mediaRepository,
            busy = busy,
            error = actionError,
            onChange = { editing = it },
            onCancel = {
                editing = null
                actionError = null
            },
            onSave = { current ->
                scope.launch {
                    busy = true
                    actionError = null
                    val payload = buildProductPayload(current)
                    if (payload == null) {
                        actionError = mkText(bn, "Check the name, price and stock.", "নাম, দাম ও স্টক ঠিক আছে কি না দেখুন।")
                        busy = false
                        return@launch
                    }
                    repository.saveVendorProduct(current.id, payload)
                        .onSuccess {
                            editing = null
                            refresh()
                        }
                        .onFailure {
                            actionError = it.message?.takeIf { m -> m.isNotBlank() }
                                ?: mkText(bn, "Could not save the product.", "পণ্য সংরক্ষণ করা যায়নি।")
                        }
                    busy = false
                }
            },
            modifier = modifier,
        )
        return
    }

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (loading && data == null) {
            CircularProgressIndicator(modifier = Modifier.height(28.dp))
            return@Column
        }
        loadError?.let {
            BsdcStatusBanner(
                title = mkText(bn, "Could not load your catalogue", "পণ্যের তালিকা লোড করা যায়নি"),
                body = it,
                tone = BsdcTone.BAD,
                actionLabel = mkText(bn, "Try again", "আবার চেষ্টা করুন"),
                onAction = { refresh() },
            )
        }

        // Categories
        BsdcCard(modifier = Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    mkText(bn, "Categories", "ক্যাটাগরি"),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = { creatingCategory = true }) {
                    Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(mkText(bn, "Add", "যোগ করুন"))
                }
            }
            val categories = data?.categories.orEmpty()
            if (categories.isEmpty()) {
                Text(
                    mkText(bn, "No categories yet. Products can still be added without one.", "এখনো কোনো ক্যাটাগরি নেই। ক্যাটাগরি ছাড়াও পণ্য যোগ করা যায়।"),
                    style = MaterialTheme.typography.bodySmall,
                    color = BsdcThemeTokens.colors.mutedText,
                )
            } else {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(categories, key = { it.id }) { category ->
                        FilterChip(
                            selected = false,
                            onClick = { categoryDialog = category },
                            label = { Text(category.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            trailingIcon = { Icon(Icons.Rounded.Edit, contentDescription = null, modifier = Modifier.size(14.dp)) },
                        )
                    }
                }
            }
        }

        // Products
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                mkText(bn, "Products", "পণ্য"),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            Button(onClick = { editing = MkProductDraft() }) {
                Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text(mkText(bn, "Add product", "পণ্য যোগ করুন"))
            }
        }
        val products = data?.products.orEmpty()
        if (products.isEmpty()) {
            BsdcEmptyState(
                icon = Icons.Rounded.Inventory2,
                title = mkText(bn, "No products yet", "এখনো কোনো পণ্য নেই"),
                subtitle = mkText(bn, "Add your first product with a photo and a price.", "একটি ছবি ও দাম দিয়ে প্রথম পণ্য যোগ করুন।"),
            )
        } else {
            products.forEach { product ->
                ProductRow(
                    product = product,
                    categoryName = data?.categories?.firstOrNull { it.id == product.category_id }?.name,
                    bn = bn,
                    imageLoader = imageLoader,
                    onClick = {
                        editing = MkProductDraft(
                            id = product.id,
                            name = product.name,
                            description = product.description,
                            priceText = (product.price_poisha / 100.0).let { value ->
                                if (product.price_poisha % 100L == 0L) value.toLong().toString() else "%.2f".format(value)
                            },
                            stockText = product.stock.toString(),
                            status = product.status,
                            categoryId = product.category_id,
                            images = product.images,
                        )
                        actionError = null
                    },
                )
            }
        }
    }

    if (creatingCategory) {
        CategoryDialog(
            title = mkText(bn, "New category", "নতুন ক্যাটাগরি"),
            initial = newCategoryName,
            bn = bn,
            busy = busy,
            onDismiss = { creatingCategory = false },
            onSave = { name ->
                scope.launch {
                    busy = true
                    repository.saveVendorCategory(null, name, (catalog?.categories?.size ?: 0) + 1)
                        .onSuccess {
                            creatingCategory = false
                            newCategoryName = ""
                            refresh()
                        }
                        .onFailure { actionError = it.message }
                    busy = false
                }
            },
        )
    }

    categoryDialog?.let { category ->
        CategoryDialog(
            title = mkText(bn, "Rename category", "ক্যাটাগরির নাম বদলান"),
            initial = category.name,
            bn = bn,
            busy = busy,
            onDismiss = { categoryDialog = null },
            onSave = { name ->
                scope.launch {
                    busy = true
                    repository.saveVendorCategory(category.id, name, category.sort)
                        .onSuccess {
                            categoryDialog = null
                            refresh()
                        }
                        .onFailure { actionError = it.message }
                    busy = false
                }
            },
        )
    }
}

/** Builds the mk_vendor_save_product payload. Returns null when a field is not valid. */
internal fun buildProductPayload(draft: MkProductDraft): JsonObject? {
    val price = MkLogic.parseTakaToPoisha(draft.priceText) ?: return null
    val stock = draft.stockText.trim().toIntOrNull()?.takeIf { it in 0..100_000 } ?: return null
    if (draft.name.trim().length < 2) return null
    if (draft.images.any { !it.startsWith("https://") }) return null
    return buildJsonObject {
        put("name", draft.name.trim())
        put("description", draft.description.trim())
        put("price_poisha", price)
        put("stock", stock)
        put("status", draft.status)
        put("category_id", draft.categoryId?.let { JsonPrimitive(it) } ?: JsonNull)
        put(
            "images",
            JsonArray(draft.images.map { JsonPrimitive(it) as JsonElement }),
        )
    }
}

@Composable
private fun ProductRow(
    product: MkCatalogProductDto,
    categoryName: String?,
    bn: Boolean,
    imageLoader: ImageLoader,
    onClick: () -> Unit,
) {
    BsdcCard(modifier = Modifier.fillMaxWidth(), onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(12.dp)),
            ) {
                val first = product.images.firstOrNull()
                if (first != null) {
                    MkImage(
                        url = first,
                        contentDescription = product.name,
                        imageLoader = imageLoader,
                        modifier = Modifier.fillMaxWidth().height(64.dp),
                        contentScale = ContentScale.Crop,
                    )
                } else {
                    Box(
                        modifier = Modifier.fillMaxWidth().height(64.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Rounded.CameraAlt, contentDescription = null, tint = BsdcThemeTokens.colors.mutedText)
                    }
                }
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    product.name,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MkPrice(poisha = product.price_poisha, bn = bn)
                    Text(
                        mkText(bn, "Stock ${product.stock}", "স্টক ${product.stock}"),
                        style = MaterialTheme.typography.bodySmall,
                        color = BsdcThemeTokens.colors.mutedText,
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    BsdcBadge(
                        label = productStatusLabel(product.status, bn),
                        tone = when (product.status) {
                            "active" -> BsdcTone.OK
                            "archived" -> BsdcTone.NEUTRAL
                            else -> BsdcTone.WARN
                        },
                    )
                    categoryName?.let { BsdcBadge(label = it, tone = BsdcTone.INFO) }
                }
            }
        }
    }
}

private fun productStatusLabel(status: String, bn: Boolean): String = when (status) {
    "active" -> mkText(bn, "Active", "চালু")
    "archived" -> mkText(bn, "Archived", "সরানো")
    else -> mkText(bn, "Draft", "খসড়া")
}

@Composable
private fun ProductEditor(
    draft: MkProductDraft,
    categories: List<MkCatalogCategoryDto>,
    bn: Boolean,
    imageLoader: ImageLoader,
    mediaRepository: BsdcMediaRepository,
    busy: Boolean,
    error: String?,
    onChange: (MkProductDraft) -> Unit,
    onCancel: () -> Unit,
    onSave: (MkProductDraft) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var uploading by remember { mutableStateOf(false) }
    var uploadError by remember { mutableStateOf<String?>(null) }
    val nameBad = draft.name.trim().length < 2
    val priceBad = MkLogic.parseTakaToPoisha(draft.priceText) == null
    val stockBad = draft.stockText.trim().toIntOrNull()?.let { it !in 0..100_000 } ?: true
    var showErrors by rememberSaveable { mutableStateOf(false) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        val room = MAX_PRODUCT_IMAGES - draft.images.size
        if (room <= 0) return@rememberLauncherForActivityResult
        scope.launch {
            uploading = true
            uploadError = null
            val added = mutableListOf<String>()
            for (uri in uris.take(room)) {
                runCatching { mediaRepository.uploadImageUri(uri, MediaPurpose.PRODUCT_IMAGE) }
                    .onSuccess { added += it.url }
                    .onFailure {
                        uploadError = it.message?.takeIf { m -> m.isNotBlank() }
                            ?: mkText(bn, "A photo could not be uploaded.", "একটি ছবি আপলোড করা যায়নি।")
                    }
            }
            if (added.isNotEmpty()) onChange(draft.copy(images = (draft.images + added).distinct()))
            uploading = false
        }
    }

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (draft.id == null) mkText(bn, "New product", "নতুন পণ্য") else mkText(bn, "Edit product", "পণ্য সম্পাদনা"),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            IconButton(onClick = onCancel, enabled = !busy) {
                Icon(Icons.Rounded.Close, contentDescription = mkText(bn, "Close", "বন্ধ করুন"))
            }
        }

        // Photos
        Text(mkText(bn, "Photos (up to $MAX_PRODUCT_IMAGES)", "ছবি (সর্বোচ্চ $MAX_PRODUCT_IMAGES)"), style = MaterialTheme.typography.labelLarge)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(draft.images, key = { it }) { url ->
                Box(modifier = Modifier.size(84.dp).clip(RoundedCornerShape(12.dp))) {
                    MkImage(
                        url = url,
                        contentDescription = null,
                        imageLoader = imageLoader,
                        modifier = Modifier.fillMaxWidth().height(84.dp),
                    )
                    IconButton(
                        onClick = { onChange(draft.copy(images = draft.images - url)) },
                        modifier = Modifier.align(Alignment.TopEnd).size(28.dp),
                    ) {
                        Icon(Icons.Rounded.Close, contentDescription = mkText(bn, "Remove photo", "ছবি সরান"))
                    }
                }
            }
            if (draft.images.size < MAX_PRODUCT_IMAGES) {
                item {
                    OutlinedButton(
                        onClick = { picker.launch("image/*") },
                        enabled = !uploading && !busy,
                        modifier = Modifier.size(84.dp),
                    ) {
                        if (uploading) {
                            CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Rounded.CameraAlt, contentDescription = mkText(bn, "Add photos", "ছবি যোগ করুন"))
                        }
                    }
                }
            }
        }
        uploadError?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }

        OutlinedTextField(
            value = draft.name,
            onValueChange = { onChange(draft.copy(name = it.take(120))) },
            label = { Text(mkText(bn, "Product name", "পণ্যের নাম")) },
            isError = showErrors && nameBad,
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = draft.description,
            onValueChange = { onChange(draft.copy(description = it.take(2000))) },
            label = { Text(mkText(bn, "Description", "বিবরণ")) },
            minLines = 3,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = draft.priceText,
                onValueChange = { onChange(draft.copy(priceText = it)) },
                label = { Text(mkText(bn, "Price (৳)", "দাম (৳)")) },
                isError = showErrors && priceBad,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                value = draft.stockText,
                onValueChange = { onChange(draft.copy(stockText = it.filter { ch -> ch.isDigit() }.take(6))) },
                label = { Text(mkText(bn, "Stock", "স্টক")) },
                isError = showErrors && stockBad,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
        }

        Text(mkText(bn, "Status", "অবস্থা"), style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PRODUCT_STATUSES.forEach { status ->
                FilterChip(
                    selected = draft.status == status,
                    onClick = { onChange(draft.copy(status = status)) },
                    label = { Text(productStatusLabel(status, bn)) },
                )
            }
        }

        if (categories.isNotEmpty()) {
            Text(mkText(bn, "Category", "ক্যাটাগরি"), style = MaterialTheme.typography.labelLarge)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    FilterChip(
                        selected = draft.categoryId == null,
                        onClick = { onChange(draft.copy(categoryId = null)) },
                        label = { Text(mkText(bn, "None", "নেই")) },
                    )
                }
                items(categories, key = { it.id }) { category ->
                    FilterChip(
                        selected = draft.categoryId == category.id,
                        onClick = { onChange(draft.copy(categoryId = category.id)) },
                        label = { Text(category.name, maxLines = 1) },
                    )
                }
            }
        }

        if (showErrors && (nameBad || priceBad || stockBad)) {
            Text(
                mkText(bn, "Check the name, price and stock.", "নাম, দাম ও স্টক ঠিক আছে কি না দেখুন।"),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
        error?.let {
            BsdcStatusBanner(
                title = mkText(bn, "Not saved", "সংরক্ষণ হয়নি"),
                body = it,
                tone = BsdcTone.BAD,
            )
        }

        Button(
            onClick = {
                if (nameBad || priceBad || stockBad) {
                    showErrors = true
                } else {
                    onSave(draft)
                }
            },
            enabled = !busy && !uploading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (busy) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
            }
            Text(mkText(bn, "Save product", "পণ্য সংরক্ষণ করুন"))
        }
    }
}

@Composable
private fun CategoryDialog(
    title: String,
    initial: String,
    bn: Boolean,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var name by rememberSaveable(initial) { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it.take(60) },
                label = { Text(mkText(bn, "Category name", "ক্যাটাগরির নাম")) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(
                onClick = { onSave(name.trim()) },
                enabled = !busy && name.trim().length >= 2,
            ) {
                Text(mkText(bn, "Save", "সংরক্ষণ"))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !busy) {
                Text(mkText(bn, "Cancel", "বাতিল"))
            }
        },
    )
}
