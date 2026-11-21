package bd.info.bsdc.app.feature.compose

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Publish
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.model.AppLanguage
import kotlinx.coroutines.launch

/**
 * The group screen, on its own.
 *
 * Slug discipline is the whole of it — a group's address is permanent and public, so the rule is shown
 * beside the field as the member types, not after the insert. `groups/create-with-slug` collision
 * errors are translated the same way the hub translated them.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MkCreateGroupScreen(
    repository: ComposeRepository,
    language: AppLanguage,
    onCreated: (String) -> Unit,
    onBack: () -> Unit,
) {
    MkCreateScaffold(
        mode = CreateHubMode.GROUP,
        bn = language == AppLanguage.BN,
        onBack = onBack,
    ) {
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf(GroupDraftInput(language = language.tag)) }
    var slugEdited by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        error?.let { item { BsdcStatusBanner("Check Group Details", it, BsdcTone.BAD) } }
        item {
            BsdcCard {
                Text(if (language == AppLanguage.BN) "নতুন কমিউনিটি গ্রুপ তৈরি করুন" else "Create a Community Group", style = MaterialTheme.typography.titleLarge)
                OutlinedTextField(
                    value = draft.name,
                    onValueChange = { next ->
                        val nextSlug = if (!slugEdited) ComposerValidationEngine.slugify(next, "group") else draft.slug
                        draft = draft.copy(name = next, slug = nextSlug)
                    },
                    label = { Text("Group Name") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = draft.slug,
                    onValueChange = {
                        slugEdited = true
                        draft = draft.copy(slug = it.lowercase().filter { c -> c.isLetterOrDigit() || c == '-' })
                    },
                    label = { Text("Group Handle (/g/...)") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = draft.description,
                    onValueChange = { draft = draft.copy(description = it) },
                    label = { Text("Description") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("public", "private").forEach { priv ->
                        FilterChip(
                            selected = draft.privacy == priv,
                            onClick = { draft = draft.copy(privacy = priv) },
                            label = { Text(priv.uppercase()) },
                        )
                    }
                }
                BsdcButton(
                    label = "Create Group",
                    busy = submitting,
                    leadingIcon = Icons.Rounded.Publish,
                    onClick = {
                        val issues = ComposerValidationEngine.validateGroupDraft(draft.slug, draft.name, draft.description)
                        if (issues.isNotEmpty()) {
                            error = issues.first()
                            return@BsdcButton
                        }
                        submitting = true
                        error = null
                        scope.launch {
                            runCatching { repository.createGroupListing(draft) }
                                .onSuccess { onCreated(it) }
                                .onFailure { error = it.message ?: "Failed to create group." }
                            submitting = false
                        }
                    },
                )
            }
        }
    }
    }
}
