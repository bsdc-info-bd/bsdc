package bd.info.bsdc.app.feature.discover

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcEditSheet
import bd.info.bsdc.app.core.designsystem.BsdcFilterPill
import bd.info.bsdc.app.core.designsystem.BsdcFormChecklist
import bd.info.bsdc.app.core.designsystem.BsdcFormNumber
import bd.info.bsdc.app.core.designsystem.BsdcFormSection
import bd.info.bsdc.app.core.designsystem.BsdcFormSwitchRow
import bd.info.bsdc.app.core.designsystem.BsdcFormTagField
import bd.info.bsdc.app.core.designsystem.BsdcFormText
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import coil3.ImageLoader
/**
 * The gig editor, in the app.
 *
 * The client's own brief used to be uncorrectable here: the owner card ended with a button reading
 * "Edit on the web" that opened `/freelance/<slug>` in a browser. That was honest — `update_gig` had
 * been callable from this screen since migration 0128 and nothing called it — and it was also the gap
 * members complain about most, because a wrong budget or a stale line in the scope is exactly what you
 * notice on a phone, on a sofa, with no browser open.
 *
 * Every field here is the web `GigEditDialog`'s field, sent through [GigEditLogic.toPayload] so a gig
 * edited from the app lands on the same row as one edited from the site. What this sheet adds is the
 * cover picker: the picture is already on the phone, and asking a member to upload it somewhere else
 * and paste the address back is a form written for somebody with a laptop.
 */
@Composable
fun MkGigEditSheet(
    visible: Boolean,
    gig: GigDto,
    bn: Boolean,
    saving: Boolean,
    errorMessage: String,
    imageLoader: ImageLoader,
    onSave: (GigEditPayload) -> Unit,
    onDismiss: () -> Unit,
    mediaRepository: BsdcMediaRepository? = null,
) {
    if (!visible) return
    val tokens = BsdcThemeTokens.colors
    // Keyed on `updatedAt`, so the row that comes back from the save re-seeds the fields. `update_gig`
    // trims and normalises what it is given, and an editor still showing the untrimmed text would
    // report a difference that no longer exists.
    val seed = remember(gig.id, gig.updatedAt) { GigEditLogic.formFrom(gig) }
    var form by remember(gig.id, gig.updatedAt) { mutableStateOf(seed) }
    val issues = GigEditLogic.validate(form)
    val dirty = GigEditLogic.isDirty(seed, form)
    // Uploading a cover happens inside `MkListingCoverField`; this only needs to know that
    // the sheet is busy, so a save cannot start while a picture is still in flight.
    BsdcEditSheet(
        visible = true,
        title = if (bn) "গিগ সম্পাদনা" else "Edit gig",
        subtitle = if (bn) {
            "স্কোপ, বাজেট, সময়সীমা ও দক্ষতা বদলান। ঠিকানা (slug) বদলানো যায় না।"
        } else {
            "Change the brief, the budget, the timeline or the skills. The address stays where it is."
        },
        kicker = "/freelance/${gig.slug}",
        onDismiss = onDismiss,
        primaryLabel = if (bn) "সংরক্ষণ" else "Save changes",
        primaryEnabled = issues.isEmpty() && dirty,
        busy = saving,
        errorMessage = errorMessage,
        secondaryLabel = if (bn) "বাতিল" else "Cancel",
        onSecondary = onDismiss,
        onPrimary = { onSave(GigEditLogic.toPayload(form)) },
    ) {
        BsdcFormSection(
            title = if (bn) "স্কোপ" else "The brief",
            subtitle = if (bn) {
                "প্রতিটি প্রস্তাব এখান থেকেই শুরু হয়।"
            } else {
                "Every proposal starts from these two boxes."
            },
        ) {
            BsdcFormText(
                label = if (bn) "শিরোনাম" else "Title",
                value = form.title,
                onValueChange = { form = form.copy(title = it) },
                counter = "${form.title.trim().length}/${GigEditLogic.TITLE_MAX}",
                error = issues.firstOrNull { issue -> issue.startsWith("Gig title") }.orEmpty(),
                complete = form.title.trim().length in GigEditLogic.TITLE_MIN..GigEditLogic.TITLE_MAX,
                enabled = !saving,
            )
            BsdcFormText(
                label = if (bn) "কাজের বিবরণ ও ডেলিভারেবল" else "Description and deliverables",
                value = form.description,
                onValueChange = { form = form.copy(description = it) },
                hint = if (bn) {
                    "কমপক্ষে ${GigEditLogic.DESCRIPTION_MIN} অক্ষর — যা যা দেবেন সেগুলো লিখুন।"
                } else {
                    "At least ${GigEditLogic.DESCRIPTION_MIN} characters. Say what is delivered."
                },
                error = issues.firstOrNull { issue -> issue.startsWith("Gig scope") }.orEmpty(),
                singleLine = false,
                minLines = 5,
                maxLines = 10,
                counter = "${form.description.trim().length}/${GigEditLogic.DESCRIPTION_MAX}",
                complete = form.description.trim().length >= GigEditLogic.DESCRIPTION_MIN,
                imeAction = ImeAction.Default,
                keyboardType = KeyboardType.Text,
                enabled = !saving,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                GigEditLogic.SCOPE_IDEAS.forEach { (idea, body) ->
                    BsdcFilterPill(
                        label = idea,
                        selected = false,
                        onClick = {
                            // A suggestion fills what is still empty and never overwrites what was
                            // written: a member halfway through their own brief does not want it
                            // replaced by a template tapped by accident.
                            form = form.copy(
                                title = if (form.title.isBlank()) idea else form.title,
                                description = if (form.description.isBlank()) body else form.description,
                            )
                        },
                    )
                }
            }
        }
        BsdcFormSection(
            title = if (bn) "বাজেট ও সময়" else "Budget and timeline",
            subtitle = if (bn) {
                "খালি রাখলে বলা হয়নি বলে গণ্য হবে, শূন্য বলে নয়।"
            } else {
                "An empty box means the gig says nothing about it — not that it is zero."
            },
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BsdcFormNumber(
                    label = if (bn) "বাজেট সর্বনিম্ন (${gig.currency})" else "Budget from (${gig.currency})",
                    value = form.budgetMinText,
                    onValueChange = { form = form.copy(budgetMinText = it) },
                    error = issues.firstOrNull { issue -> issue.startsWith("Budget values") }.orEmpty(),
                    modifier = Modifier.weight(1f),
                    enabled = !saving,
                )
                BsdcFormNumber(
                    label = if (bn) "বাজেট সর্বোচ্চ (${gig.currency})" else "Budget up to (${gig.currency})",
                    value = form.budgetMaxText,
                    onValueChange = { form = form.copy(budgetMaxText = it) },
                    error = issues.firstOrNull { issue -> issue.startsWith("Maximum budget") }.orEmpty(),
                    modifier = Modifier.weight(1f),
                    enabled = !saving,
                )
            }
            BsdcFormNumber(
                label = if (bn) "ডেলিভারির দিন" else "Days to deliver",
                value = form.durationDaysText,
                onValueChange = { form = form.copy(durationDaysText = it) },
                hint = if (bn) {
                    "১ থেকে ${GigEditLogic.DURATION_DAYS_MAX} দিন"
                } else {
                    "Between 1 and ${GigEditLogic.DURATION_DAYS_MAX} days"
                },
                error = issues.firstOrNull { issue -> issue.startsWith("Duration") }.orEmpty(),
                enabled = !saving,
            )
            BsdcFormSwitchRow(
                label = if (bn) "ঘণ্টা হিসেবে দাম" else "Priced by the hour",
                hint = if (bn) {
                    "বাজেটটি প্রতি ঘণ্টা হিসেবে দেখানো হবে"
                } else {
                    "The band is read per hour instead of per project"
                },
                checked = form.isHourly,
                onChange = { form = form.copy(isHourly = it) },
                enabled = !saving,
            )
            // The line a freelancer reads in the directory, recomputed as the member types, so the
            // numbers they are about to send are seen the way the other side will see them.
            Text(
                text = GigEditLogic.budgetLine(form, gig.currency),
                style = MaterialTheme.typography.labelLarge,
                color = tokens.brandStrong,
            )
        }
        BsdcFormTagField(
            label = if (bn) "দক্ষতা" else "Skills",
            hint = if (bn) {
                "২ অক্ষর বা তার বেশি, সর্বোচ্চ ${GigEditLogic.SKILLS_MAX}টি"
            } else {
                "Two characters or more, up to ${GigEditLogic.SKILLS_MAX}"
            },
            tags = form.skills,
            onAdd = { tag -> form = form.copy(skills = form.skills + tag) },
            onRemoveAt = { index -> form = form.copy(skills = form.skills.filterIndexed { i, _ -> i != index }) },
            suggestions = GigEditLogic.SKILL_SUGGESTIONS,
            addLabel = if (bn) "যোগ করুন" else "Add skill",
            error = issues.firstOrNull { issue -> issue.startsWith("Select at most") }.orEmpty(),
            enabled = !saving,
        )
        BsdcFormSection(
            title = if (bn) "কভার" else "Cover",
            subtitle = if (bn) {
                "খালি করলে কভার মুছে যাবে।"
            } else {
                "Clear this box to remove the cover."
            },
        ) {
            MkListingCoverField(
                coverUrl = form.coverUrl,
                onCoverUrl = { form = form.copy(coverUrl = it) },
                bn = bn,
                allowed = GigEditLogic.coverAllowed(form.coverUrl),
                error = issues.firstOrNull { issue -> issue == GigEditLogic.coverRefusal }.orEmpty(),
                imageLoader = imageLoader,
                mediaRepository = mediaRepository,
                enabled = !saving,
            )
        }
        BsdcFormChecklist(
            caption = if (bn) "সংরক্ষণের প্রস্তুতি" else "Ready to save?",
            items = GigEditLogic.checklist(form, bn),
        )
        Text(
            text = if (bn) {
                "প্রকাশের তারিখ ও প্রস্তাবের সংখ্যা এখান থেকে বদলানো যায় না — সেগুলো গিগের ইতিহাস।"
            } else {
                "The published date and the proposal count are history rather than settings, so they " +
                    "are not on this form."
            },
            style = MaterialTheme.typography.labelSmall,
            color = tokens.mutedText,
            modifier = Modifier.padding(bottom = 2.dp),
        )
    }
}