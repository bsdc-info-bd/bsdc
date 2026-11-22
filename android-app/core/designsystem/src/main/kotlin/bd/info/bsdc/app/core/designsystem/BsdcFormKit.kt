package bd.info.bsdc.app.core.designsystem

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.common.ListingTags

/**
 * The form kit every long editor in the app is built from.
 *
 * The listing editors, the job application and the gig proposal all ask the same five things of a
 * member — what is this field for, what is still missing, what happens if I stop, is my typo
 * already saved, and can I get out of here — and before this file each screen answered those in its
 * own ad-hoc way, which is why the same app felt like three apps. A field here always has a label,
 * a hint or a counter, an error that sits under the thing it is about, and a tick that arrives when
 * the value is accepted.
 *
 * Nothing in this file decides anything: no validation, no limits, no payloads. Those rules live in
 * the `*Logic` objects of the feature modules, where they are unit-tested against the website's own
 * numbers. Keeping the kit dumb is what lets a screen be reviewed by reading its fields, and not its
 * conditionals.
 */

/** One option in a choice row. `value` is what is sent; `label` is what the member reads. */
data class BsdcFormChoice(
    val value: String,
    val label: String,
)

/** One line of the readiness checklist: a sentence, and whether it is satisfied. */
data class BsdcChecklistItem(
    val label: String,
    val done: Boolean,
    /** A non-blocking line is advice, so it never reddens the meter when it is open. */
    val blocking: Boolean = true,
)

/**
 * One labelled group of fields inside a form.
 *
 * It is a card with a header rather than a divider because the long forms scroll: the heading has to
 * travel with its fields, or the member loses track of which section a budget belongs to.
 */
@Composable
fun BsdcFormSection(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String = "",
    content: @Composable ColumnScope.() -> Unit,
) {
    BsdcCard(modifier = modifier) {
        BsdcSectionHeader(title = title, subtitle = subtitle.takeIf { it.isNotBlank() })
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            content = content,
        )
    }
}

/**
 * A text field with its hint, its counter and its error in the one place they belong.
 *
 * [error] wins over [hint]: a member who has typed something wrong needs the correction, not the
 * instruction they already read. [complete] is the tick that says a value was accepted — it is passed
 * in rather than computed here because "accepted" is the screen's business, not the field's.
 */
@Composable
fun BsdcFormText(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    hint: String = "",
    error: String = "",
    counter: String = "",
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = 1,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    leadingIcon: ImageVector? = null,
    complete: Boolean = false,
    enabled: Boolean = true,
) {
    val tokens = BsdcThemeTokens.colors
    val reduced = BsdcThemeTokens.reducedMotion
    val showError = error.isNotBlank()
    val supporting = when {
        showError -> error
        else -> hint
    }
    val tickColor by animateColorAsState(
        targetValue = if (complete && !showError) tokens.brandStrong else tokens.mutedText,
        animationSpec = if (reduced) {
            spring(stiffness = Spring.StiffnessHigh)
        } else {
            spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMedium)
        },
        label = "formFieldTick",
    )
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = singleLine,
        minLines = minLines,
        maxLines = maxLines,
        enabled = enabled,
        isError = showError,
        leadingIcon = leadingIcon?.let { vector ->
            {
                Icon(
                    imageVector = vector,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = tokens.mutedText,
                )
            }
        },
        trailingIcon = if (complete && !showError) {
            {
                Icon(
                    imageVector = Icons.Rounded.CheckCircle,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = tickColor,
                )
            }
        } else {
            null
        },
        supportingText = if (supporting.isNotBlank() || counter.isNotBlank()) {
            {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (supporting.isNotBlank()) {
                        Text(
                            text = supporting,
                            style = MaterialTheme.typography.labelSmall,
                            color = if (showError) MaterialTheme.colorScheme.error else tokens.mutedText,
                            modifier = Modifier.weight(1f),
                        )
                    } else {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                    if (counter.isNotBlank()) {
                        Text(
                            text = counter,
                            style = MaterialTheme.typography.labelSmall,
                            color = tokens.mutedText,
                        )
                    }
                }
            }
        } else {
            null
        },
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType, imeAction = imeAction),
        modifier = modifier.fillMaxWidth(),
    )
}

/** A numeric field that only ever accepts digits, so no screen has to re-derive the filter. */
@Composable
fun BsdcFormNumber(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    hint: String = "",
    error: String = "",
    prefix: String = "",
    enabled: Boolean = true,
) {
    BsdcFormText(
        label = if (prefix.isNotBlank() && hint.isBlank()) "$label · $prefix" else label,
        value = value,
        onValueChange = { next -> onValueChange(next.filter(Char::isDigit).take(9)) },
        hint = if (prefix.isNotBlank() && hint.isNotBlank()) "$prefix · $hint" else hint,
        error = error,
        keyboardType = KeyboardType.Number,
        imeAction = ImeAction.Next,
        enabled = enabled,
        modifier = modifier,
    )
}

/**
 * A closed set of options, chosen by tapping one.
 *
 * Fourteen fields of the same shape is what makes a form feel cheap; a `full_time` that reads as a
 * word instead of a value is also a third less to read on a phone. The row is the same pill the
 * filters use, so a member who has filtered the job board already knows how to use this.
 */
@Composable
fun BsdcFormChoiceRow(
    label: String,
    options: List<BsdcFormChoice>,
    selected: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    hint: String = "",
    error: String = "",
    enabled: Boolean = true,
) {
    val tokens = BsdcThemeTokens.colors
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = tokens.mutedText,
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            options.forEachIndexed { index, choice ->
                // A weighted row of pills is what keeps five levels from pushing the last one off the
                // screen in Bengali, where every label is longer than its English.
                BsdcFilterPill(
                    label = choice.label,
                    selected = selected == choice.value,
                    onClick = { if (enabled) onChange(choice.value) },
                    modifier = if (index == options.lastIndex && options.size <= 3) {
                        Modifier.weight(1f)
                    } else {
                        Modifier
                    },
                )
            }
        }
        if (error.isNotBlank() || hint.isNotBlank()) {
            Text(
                text = if (error.isNotBlank()) error else hint,
                style = MaterialTheme.typography.labelSmall,
                color = if (error.isNotBlank()) MaterialTheme.colorScheme.error else tokens.mutedText,
            )
        }
    }
}

/** A labelled switch with its sentence beside it, not under it — one tap target, one line. */
@Composable
fun BsdcFormSwitchRow(
    label: String,
    checked: Boolean,
    onChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    hint: String = "",
    enabled: Boolean = true,
) {
    val tokens = BsdcThemeTokens.colors
    Surface(
        onClick = { if (enabled) onChange(!checked) },
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        border = androidx.compose.foundation.BorderStroke(1.dp, tokens.border),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                if (hint.isNotBlank()) {
                    Text(
                        text = hint,
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.mutedText,
                    )
                }
            }
            Switch(checked = checked, onCheckedChange = { if (enabled) onChange(it) })
        }
    }
}

/**
 * A list of tags, typed or tapped in, with the ceiling the form enforces.
 *
 * Skills used to be a comma-separated `OutlinedTextField` on every listing form, which is fine on a
 * keyboard and hopeless on a phone: no way to see where one skill ends, no way to remove one without
 * retyping the line, and no sign that the twenty-first will be refused. Here each tag is a chip with
 * its own cross, suggestions are one tap, and the counter says `7/20` while there is still room.
 */
@Composable
fun BsdcFormTagField(
    label: String,
    tags: List<String>,
    onAdd: (String) -> Unit,
    onRemoveAt: (Int) -> Unit,
    modifier: Modifier = Modifier,
    hint: String = "",
    error: String = "",
    suggestions: List<String> = emptyList(),
    addLabel: String = "Add",
    enabled: Boolean = true,
    rules: ListingTags.Rules = ListingTags.LISTINGS,
) {
    val tokens = BsdcThemeTokens.colors
    var typed by remember(label) { mutableStateOf("") }
    val cap = rules.maxTags
    val full = tags.size >= cap

    // The decision is not this composable's: `ListingTags` holds the rules the website's tag input
    // applies, and [rules] says which of its two sets this screen is — a listing's twenty tags of
    // thirty-two characters kept as typed, or an application's thirty of sixty-four, lower-cased on the
    // way in. A tap the browser would have refused is refused here too, and the field simply stays as
    // it was rather than explaining a rule the member cannot usefully act on.
    fun commit(raw: String) {
        val accepted = ListingTags.accept(rules, tags, raw)
        if (accepted == null) return
        onAdd(accepted)
        typed = ""
    }

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = tokens.mutedText,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "${tags.size}/$cap",
                style = MaterialTheme.typography.labelSmall,
                color = if (full) tokens.warn else tokens.mutedText,
            )
        }
        if (tags.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 132.dp)
                    .verticalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                tags.forEachIndexed { index, tag ->
                    BsdcTagChip(
                        text = tag,
                        onRemove = { if (enabled) onRemoveAt(index) },
                    )
                }
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            BsdcFormText(
                label = if (full) "$label · $cap" else label,
                value = if (full) "" else typed,
                onValueChange = { typed = it },
                singleLine = true,
                imeAction = ImeAction.Done,
                enabled = enabled && !full,
                modifier = Modifier.weight(1f),
            )
            Surface(
                onClick = { if (enabled && !full) commit(typed) },
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.size(48.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(imageVector = Icons.Rounded.Add, contentDescription = addLabel, modifier = Modifier.size(20.dp))
                }
            }
        }
        if (error.isNotBlank() || hint.isNotBlank()) {
            Text(
                text = if (error.isNotBlank()) error else hint,
                style = MaterialTheme.typography.labelSmall,
                color = if (error.isNotBlank()) MaterialTheme.colorScheme.error else tokens.mutedText,
            )
        }
        if (!full) {
            val offered = ListingTags.availableSuggestions(tags, suggestions)
            if (offered.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    offered.forEach { suggestion ->
                        BsdcFilterPill(
                            label = suggestion,
                            selected = false,
                            // A pill is an addition like any other, so it passes the same refusal: a
                            // suggestion that no longer fits is not a loophole.
                            onClick = { commit(suggestion) },
                        )
                    }
                }
            }
        }
    }
}

/** One removable tag. */
@Composable
private fun BsdcTagChip(text: String, onRemove: () -> Unit) {
    val tokens = BsdcThemeTokens.colors
    Surface(
        onClick = onRemove,
        shape = RoundedCornerShape(12.dp),
        color = tokens.surfaceElevated,
        border = androidx.compose.foundation.BorderStroke(1.dp, tokens.border),
    ) {
        Row(
            modifier = Modifier.padding(start = 10.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(text = text, style = MaterialTheme.typography.labelMedium)
            Icon(
                imageVector = Icons.Rounded.Close,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = tokens.mutedText,
            )
        }
    }
}

/**
 * What is still missing, as a meter and a list.
 *
 * The create screens have had this for a while and the *edit* screens had nothing, so a member
 * changing one word on a gig had no way to know a save would be refused before they pressed it. The
 * fraction is animated because the row a member is watching changes under their fingers, and a
 * number that jumps reads as a glitch rather than as progress.
 */
@Composable
fun BsdcFormChecklist(
    items: List<BsdcChecklistItem>,
    modifier: Modifier = Modifier,
    caption: String = "",
) {
    val tokens = BsdcThemeTokens.colors
    val reduced = BsdcThemeTokens.reducedMotion
    if (items.isEmpty()) return
    val blocking = items.filter { it.blocking }
    val satisfied = blocking.count { it.done }
    val fraction = if (blocking.isEmpty()) {
        if (items.all { it.done }) 1f else 0.5f
    } else {
        (satisfied.toFloat() / blocking.size.toFloat()).coerceIn(0f, 1f)
    }
    val width by animateFloatAsState(
        targetValue = fraction,
        animationSpec = if (reduced) {
            spring(stiffness = Spring.StiffnessHigh)
        } else {
            spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMedium)
        },
        label = "formChecklistMeter",
    )
    BsdcCard(modifier = modifier) {
        if (caption.isNotBlank()) {
            BsdcSectionHeader(
                title = caption,
                subtitle = if (blocking.isEmpty()) {
                    ""
                } else {
                    "$satisfied/${blocking.size}"
                },
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(tokens.border),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(width)
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(
                        if (fraction >= 1f) tokens.brandStrong else MaterialTheme.colorScheme.primary,
                    ),
            )
        }
        items.forEach { item ->
            val tick by animateColorAsState(
                targetValue = if (item.done) {
                    tokens.brandStrong
                } else if (item.blocking) {
                    MaterialTheme.colorScheme.error
                } else {
                    tokens.mutedText
                },
                animationSpec = if (reduced) {
                    spring(stiffness = Spring.StiffnessHigh)
                } else {
                    spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMedium)
                },
                label = "formChecklistTick",
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = if (item.done) Icons.Rounded.CheckCircle else Icons.Rounded.Check,
                    contentDescription = null,
                    modifier = Modifier.size(15.dp),
                    tint = tick,
                )
                Text(
                    text = item.label,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

/**
 * The frame every editor and application sheet in the app wears.
 *
 * One sheet, one drag handle, one scroll, one sticky action row. Before this, the group editor had
 * built its own bottom sheet, the job application was an `AlertDialog` of five stacked fields, and
 * the gig proposal was another — three frames, three keyboard behaviours, three ideas of what "Save"
 * looks like. Anything the member fills in now arrives in this.
 *
 * [content] is a column the caller fills with sections. It scrolls, and it is padded for the
 * keyboard, because a form that hides its own submit button under the keyboard is a form that cannot
 * be submitted — which is the one thing a sheet of this height must never do.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BsdcEditSheet(
    visible: Boolean,
    title: String,
    subtitle: String,
    onDismiss: () -> Unit,
    primaryLabel: String,
    primaryEnabled: Boolean,
    onPrimary: () -> Unit,
    modifier: Modifier = Modifier,
    busy: Boolean = false,
    errorMessage: String = "",
    secondaryLabel: String = "",
    onSecondary: () -> Unit = {},
    kicker: String = "",
    content: @Composable ColumnScope.() -> Unit,
) {
    if (!visible) return
    val tokens = BsdcThemeTokens.colors
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, modifier = modifier) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 240.dp, max = 560.dp)
                    .verticalScroll(rememberScrollState())
                    .imePadding()
                    .padding(start = 20.dp, end = 20.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (kicker.isNotBlank()) {
                    Text(
                        text = kicker,
                        style = MaterialTheme.typography.labelMedium,
                        color = tokens.brandStrong,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Text(text = title, style = MaterialTheme.typography.titleLarge)
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.mutedText,
                )
                if (errorMessage.isNotBlank()) {
                    BsdcStatusBanner(
                        title = if (errorMessage.length <= 60) errorMessage else "Something went wrong",
                        body = if (errorMessage.length <= 60) "" else errorMessage,
                        tone = BsdcTone.BAD,
                    )
                }
                content()
                Spacer(modifier = Modifier.height(4.dp))
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(tokens.border),
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (secondaryLabel.isNotBlank()) {
                    BsdcButton(
                        label = secondaryLabel,
                        onClick = onSecondary,
                        secondary = true,
                        enabled = !busy,
                        modifier = Modifier.weight(1f),
                    )
                }
                BsdcButton(
                    label = primaryLabel,
                    onClick = onPrimary,
                    enabled = primaryEnabled && !busy,
                    busy = busy,
                    leadingIcon = Icons.Rounded.Check,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** One line of the review step: what the member typed, under what it was called. */
@Composable
fun BsdcFormReviewRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    missingLabel: String = "",
) {
    val tokens = BsdcThemeTokens.colors
    val shown = value.trim()
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = tokens.mutedText,
            modifier = Modifier.weight(0.36f),
        )
        Text(
            text = if (shown.isBlank()) missingLabel else shown,
            style = MaterialTheme.typography.bodyMedium,
            color = if (shown.isBlank()) tokens.mutedText else MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(0.64f),
        )
    }
}
