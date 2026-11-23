package bd.info.bsdc.app.feature.discover

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Link
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcAnimatedEntrance
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcFilterPill
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens

/**
 * The group editor, in the app.
 *
 * Until now the group page had a button that said "Edit on the web" — honest, and the gap the user
 * reported: `update_group` has been in the schema for a long time, so the only thing standing between
 * a moderator and a typo in their group's name was a browser. The fields, their order, and what each
 * one sends are the web's `GroupEditDialog`'s, and the per-field nulls come from
 * [GroupEditLogic.toPayload], which is unit-tested rather than eyeballed.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MkGroupEditSheet(
    visible: Boolean,
    group: GroupDetailDto,
    bn: Boolean,
    saving: Boolean,
    errorMessage: String?,
    onDismiss: () -> Unit,
    onSave: (GroupEditPayload) -> Unit,
) {
    if (!visible) return
    val tokens = BsdcThemeTokens.colors
    var form by remember(group.id) { mutableStateOf(GroupEditLogic.formFrom(group)) }
    // `initial` is keyed the same way the fields are, so a group that reloads under the sheet — a
    // moderator renaming it from the browser at the same moment — re-seeds both, and the Save button
    // cannot stay enabled against a row that is already what the member asked for.
    val initial = remember(group.id, group.name, group.description, group.rules) {
        GroupEditLogic.formFrom(group)
    }

    val issues = GroupEditLogic.validate(form)
    val dirty = GroupEditLogic.isDirty(initial, form)
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(start = 20.dp, end = 20.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // One entrance for the sheet's content, then AnimatedVisibility for what changes after it
            // has landed. Cascading every field instead would replay a fade under the member's fingers
            // the moment the keyboard opens, which reads as a bug, not as motion design.
            BsdcAnimatedEntrance {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
            Text(
                text = if (bn) "গ্রুপ সম্পাদনা" else "Edit group",
                style = MaterialTheme.typography.titleLarge,
            )
            Text(
                text = if (bn) {
                    "নাম, বিবরণ ও নিয়ম বদলান। ঠিকানা (slug) বদলানো যায় না।"
                } else {
                    "Change the name, description or rules. The address stays where it is."
                },
                style = MaterialTheme.typography.bodySmall,
                color = tokens.mutedText,
            )
            Text(
                text = "/g/${group.slug}",
                style = MaterialTheme.typography.labelMedium,
                color = tokens.mutedText,
            )

            AnimatedVisibility(visible = errorMessage != null) {
                errorMessage?.let { message ->
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            OutlinedTextField(
                value = form.name,
                onValueChange = { form = form.copy(name = it) },
                label = { Text(if (bn) "নাম" else "Name") },
                singleLine = true,
                isError = issues.isNotEmpty() &&
                    form.name.trim().length !in GroupEditLogic.NAME_MIN..GroupEditLogic.NAME_MAX,
                supportingText = {
                    Text(
                        text = "${form.name.trim().length}/${GroupEditLogic.NAME_MAX}",
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.mutedText,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = form.description,
                onValueChange = { form = form.copy(description = it) },
                label = { Text(if (bn) "বিবরণ" else "Description") },
                minLines = 3,
                maxLines = 6,
                supportingText = {
                    Text(
                        text = "${form.description.length}/${GroupEditLogic.DESCRIPTION_MAX}",
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.mutedText,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = form.rules,
                onValueChange = { form = form.copy(rules = it) },
                label = { Text(if (bn) "নিয়ম" else "Rules") },
                placeholder = {
                    Text(
                        text = if (bn) "খালি রাখলে নিয়ম মুছে যাবে" else "Leave empty to clear the rules",
                        style = MaterialTheme.typography.bodySmall,
                    )
                },
                minLines = 2,
                maxLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )

            Text(
                text = if (bn) "গোপনীয়তা" else "Privacy",
                style = MaterialTheme.typography.labelLarge,
                color = tokens.mutedText,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GroupPrivacy.entries.forEach { privacy ->
                    BsdcFilterPill(
                        label = privacyLabel(privacy, bn),
                        selected = form.privacy == privacy,
                        onClick = { form = form.copy(privacy = privacy) },
                    )
                }
            }

            Text(
                text = if (bn) "ভাষা" else "Language",
                style = MaterialTheme.typography.labelLarge,
                color = tokens.mutedText,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GroupEditLogic.LANGUAGES.forEach { code ->
                    BsdcFilterPill(
                        label = if (code == "bn") "বাংলা" else "English",
                        selected = form.language == code,
                        onClick = { form = form.copy(language = code) },
                    )
                }
            }

            OutlinedTextField(
                value = form.avatarUrl,
                onValueChange = { form = form.copy(avatarUrl = it) },
                label = { Text(if (bn) "অ্যাভাটারের ঠিকানা" else "Avatar URL") },
                singleLine = true,
                leadingIcon = { Icon(Icons.Rounded.Link, contentDescription = null, modifier = Modifier.size(18.dp)) },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Next,
                ),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = form.coverUrl,
                onValueChange = { form = form.copy(coverUrl = it) },
                label = { Text(if (bn) "কভারের ঠিকানা" else "Cover URL") },
                singleLine = true,
                supportingText = {
                    Text(
                        text = if (bn) {
                            "খালি করলে কভার মুছে যাবে"
                        } else {
                            "Clear this box to remove the cover"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.mutedText,
                    )
                },
                leadingIcon = { Icon(Icons.Rounded.Link, contentDescription = null, modifier = Modifier.size(18.dp)) },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Done,
                ),
                modifier = Modifier.fillMaxWidth(),
            )

            if (issues.isNotEmpty()) {
                issues.forEach { issue ->
                    Text(
                        text = issue,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BsdcButton(
                    label = if (bn) "বাতিল" else "Cancel",
                    onClick = onDismiss,
                    secondary = true,
                    enabled = !saving,
                    modifier = Modifier.weight(1f),
                )
                BsdcButton(
                    label = if (bn) "সংরক্ষণ" else "Save changes",
                    onClick = { onSave(GroupEditLogic.toPayload(form)) },
                    enabled = issues.isEmpty() && dirty,
                    busy = saving,
                    leadingIcon = Icons.Rounded.Check,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(4.dp))
            }
            }
        }
    }
}

private fun privacyLabel(privacy: GroupPrivacy, bn: Boolean): String = when (privacy) {
    GroupPrivacy.PUBLIC -> if (bn) "সবার জন্য" else "Public"
    GroupPrivacy.PRIVATE -> if (bn) "আমন্ত্রণে" else "Private"
    GroupPrivacy.SECRET -> if (bn) "গোপন" else "Secret"
}
