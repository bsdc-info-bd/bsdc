package bd.info.bsdc.app.feature.discover

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AlternateEmail
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Work
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
import bd.info.bsdc.app.core.designsystem.BsdcFormChoiceRow
import bd.info.bsdc.app.core.designsystem.BsdcFormNumber
import bd.info.bsdc.app.core.designsystem.BsdcFormSection
import bd.info.bsdc.app.core.designsystem.BsdcFormTagField
import bd.info.bsdc.app.core.designsystem.BsdcFormText
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import coil3.ImageLoader

/**
 * The job editor, in the app.
 *
 * The role a member posted from their phone could not be corrected from their phone: the owner card
 * ended in "Edit on the web". `update_job` had been reachable from here since migration 0128 — this
 * sheet is the missing half, and it carries the fields the app's create form never asked for either,
 * because a job whose salary is wrong or whose deadline has passed is corrected far more often than
 * one whose title is.
 *
 * The field set is the web `JobEditDialog`'s, in the web's order, with the web's labels, so the same
 * posting edited from either client ends up with the same row. The one thing this screen does that the
 * website does not is refuse a closing date that has already passed: the routine refuses it too, but
 * only after Save, which makes the deadline on an old posting look like a corruption rather than a
 * choice.
 */
@Composable
fun MkJobEditSheet(
    visible: Boolean,
    job: JobDetailDto,
    bn: Boolean,
    saving: Boolean,
    errorMessage: String,
    imageLoader: ImageLoader,
    onSave: (JobEditPayload) -> Unit,
    onDismiss: () -> Unit,
    mediaRepository: BsdcMediaRepository? = null,
) {
    if (!visible) return
    val tokens = BsdcThemeTokens.colors
    // One instant for the life of the sheet, so the deadline rule cannot change under a member who is
    // still typing, and so the logic object stays free of a clock of its own.
    val nowMillis = remember(job.id) { System.currentTimeMillis() }
    val seed = remember(job.id, job.publishedAt, job.title, job.expiresAt) { JobEditLogic.formFrom(job) }
    var form by remember(job.id, job.publishedAt, job.title, job.expiresAt) { mutableStateOf(seed) }

    val issues = JobEditLogic.validate(form, nowMillis)
    val dirty = JobEditLogic.isDirty(seed, form)

    fun issue(prefix: String): String = issues.firstOrNull { it.startsWith(prefix) }.orEmpty()

    BsdcEditSheet(
        visible = true,
        title = if (bn) "পদ সম্পাদনা" else "Edit role",
        subtitle = if (bn) {
            "ভূমিকা, বেতন, শহর ও বন্ধ হওয়ার তারিখ বদলান। ঠিকানা (slug) বদলানো যায় না।"
        } else {
            "Change the role, the band, the city or the deadline. The address stays where it is."
        },
        kicker = "/jobs/${job.slug}",
        onDismiss = onDismiss,
        primaryLabel = if (bn) "সংরক্ষণ" else "Save changes",
        primaryEnabled = issues.isEmpty() && dirty,
        busy = saving,
        errorMessage = errorMessage,
        secondaryLabel = if (bn) "বাতিল" else "Cancel",
        onSecondary = onDismiss,
        onPrimary = { onSave(JobEditLogic.toPayload(form)) },
    ) {
        BsdcFormSection(
            title = if (bn) "ভূমিকা" else "The role",
            subtitle = if (bn) {
                "প্রার্থীরা প্রথমে এই তিনটিই পড়ে।"
            } else {
                "These three lines are what an applicant reads first."
            },
        ) {
            BsdcFormText(
                label = if (bn) "শিরোনাম" else "Title",
                value = form.title,
                onValueChange = { form = form.copy(title = it) },
                counter = "${form.title.trim().length}/${JobEditLogic.TITLE_MAX}",
                error = issue("Job title"),
                complete = form.title.trim().length in JobEditLogic.TITLE_MIN..JobEditLogic.TITLE_MAX,
                leadingIcon = Icons.Rounded.Work,
                enabled = !saving,
            )
            BsdcFormText(
                label = if (bn) "কোম্পানি বা সংগঠন" else "Company or organisation",
                value = form.company,
                onValueChange = { form = form.copy(company = it) },
                counter = "${form.company.trim().length}/${JobEditLogic.COMPANY_MAX}",
                error = issue("Company name"),
                complete = form.company.trim().length in JobEditLogic.COMPANY_MIN..JobEditLogic.COMPANY_MAX,
                enabled = !saving,
            )
            BsdcFormText(
                label = if (bn) "ভূমিকার বিবরণ" else "Description",
                value = form.description,
                onValueChange = { form = form.copy(description = it) },
                hint = if (bn) {
                    "কমপক্ষে ${JobEditLogic.DESCRIPTION_MIN} অক্ষর — দায়িত্ব ও প্রত্যাখ্যা লিখুন।"
                } else {
                    "At least ${JobEditLogic.DESCRIPTION_MIN} characters. Say what the work is."
                },
                error = issue("Job description"),
                singleLine = false,
                minLines = 6,
                maxLines = 12,
                counter = "${form.description.trim().length}/${JobEditLogic.DESCRIPTION_MAX}",
                complete = form.description.trim().length >= JobEditLogic.DESCRIPTION_MIN,
                imeAction = ImeAction.Default,
                enabled = !saving,
            )
        }

        BsdcFormSection(
            title = if (bn) "কোথায় ও কীভাবে" else "How it is hired",
            subtitle = if (bn) {
                "এই তিনটি ফিল্টারেও ব্যবহৃত হয়, তাই মিলিয়ে বাছুন।"
            } else {
                "These three also decide which filters the role appears in."
            },
        ) {
            BsdcFormChoiceRow(
                label = if (bn) "ধরন" else "Type",
                options = JobEditLogic.choices(JobEditLogic.JOB_TYPES, bn),
                selected = form.jobType,
                onChange = { form = form.copy(jobType = it) },
                enabled = !saving,
            )
            BsdcFormChoiceRow(
                label = if (bn) "কাজ কোথায় হবে" else "Where the work happens",
                options = JobEditLogic.choices(JobEditLogic.WORK_MODES, bn),
                selected = form.workMode,
                onChange = { form = form.copy(workMode = it) },
                error = if (form.workMode != "remote" && form.city.isBlank()) issue("Non-remote") else "",
                enabled = !saving,
            )
            BsdcFormChoiceRow(
                label = if (bn) "স্তর" else "Level",
                options = JobEditLogic.choices(JobEditLogic.LEVELS, bn),
                selected = form.level,
                onChange = { form = form.copy(level = it) },
                enabled = !saving,
            )
            BsdcFormText(
                label = if (bn) "শহর" else "City",
                value = form.city,
                onValueChange = { form = form.copy(city = it) },
                hint = if (bn) {
                    "রিমোট কাজে লাগবে না।"
                } else {
                    "Not needed for remote work."
                },
                error = if (form.workMode == "remote") "" else issue("Non-remote").ifEmpty { issue("A city") },
                counter = "${form.city.trim().length}/${JobEditLogic.CITY_MAX}",
                complete = form.city.trim().isNotEmpty() && form.city.trim().length <= JobEditLogic.CITY_MAX,
                leadingIcon = Icons.Rounded.LocationOn,
                enabled = !saving,
            )
        }

        BsdcFormSection(
            title = if (bn) "বেতন" else "Pay",
            subtitle = if (bn) {
                "সংখ্যা না দিলে পড়বে «আলোচনা সাপেক্ষ» — শূন্য নয়।"
            } else {
                "A blank box means the role does not say, not that it pays nothing."
            },
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BsdcFormNumber(
                    label = if (bn) "বেতন সর্বনিম্ন" else "Salary from",
                    value = form.salaryMinText,
                    onValueChange = { form = form.copy(salaryMinText = it) },
                    error = issue("Salary figures"),
                    modifier = Modifier.weight(1f),
                    enabled = !saving,
                )
                BsdcFormNumber(
                    label = if (bn) "বেতন সর্বোচ্চ" else "Salary up to",
                    value = form.salaryMaxText,
                    onValueChange = { form = form.copy(salaryMaxText = it) },
                    error = issue("Maximum salary"),
                    modifier = Modifier.weight(1f),
                    enabled = !saving,
                )
            }
            BsdcFormChoiceRow(
                label = if (bn) "যে হিসেবে" else "Paid per",
                options = JobEditLogic.choices(JobEditLogic.PERIODS, bn),
                selected = form.salaryPeriod,
                onChange = { form = form.copy(salaryPeriod = it) },
                enabled = !saving,
            )
            Text(
                text = JobEditLogic.salaryLine(form, job.salaryCurrency, bn),
                style = MaterialTheme.typography.labelLarge,
                color = tokens.brandStrong,
            )
        }

        BsdcFormSection(
            title = if (bn) "আবেদন" else "Applications",
            subtitle = if (bn) {
                "তারিখ বা শূন্য দুটোই বৈধ; শূন্য মানে পদটি খোলা থাকবে।"
            } else {
                "A date or none: empty means the role stays open until it is closed by hand."
            },
        ) {
            BsdcFormText(
                label = if (bn) "বন্ধ হবে" else "Closes",
                value = form.expiresAtText,
                onValueChange = { form = form.copy(expiresAtText = it) },
                hint = if (bn) {
                    "২০২৬-১২-০৬ ১৮:০০ বা শুধু ২০২৬-১২-০৬। খোলা রাখতে খালি দিন।"
                } else {
                    "2026-12-06 18:00, or just 2026-12-06. Leave empty to keep it open."
                },
                error = issue("Reads like").ifEmpty { issue("A closing date") },
                leadingIcon = Icons.Rounded.CalendarMonth,
                complete = form.expiresAtText.isBlank() ||
                    (JobEditLogic.parsesExpiry(form.expiresAtText) &&
                        JobEditLogic.isFuture(JobEditLogic.expiresIso(form.expiresAtText), nowMillis)),
                enabled = !saving,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                JobEditLogic.expirySuggestions(nowMillis, bn).forEach { (caption, value) ->
                    BsdcFilterPill(
                        label = caption,
                        selected = form.expiresAtText == value,
                        onClick = { form = form.copy(expiresAtText = value) },
                    )
                }
                if (form.expiresAtText.isNotBlank()) {
                    BsdcFilterPill(
                        label = if (bn) "খোলা রাখুন" else "Keep it open",
                        selected = false,
                        onClick = { form = form.copy(expiresAtText = "") },
                    )
                }
            }
            BsdcFormText(
                label = if (bn) "বাইরে আবেদনের ঠিকানা" else "Apply somewhere else instead",
                value = form.applyUrl,
                onValueChange = { form = form.copy(applyUrl = it) },
                hint = if (bn) {
                    "এখানেই আবেদন নিতে চাইলে খালি রাখুন।"
                } else {
                    "Leave it empty to take applications here."
                },
                error = issue("An apply link"),
                complete = form.applyUrl.isNotBlank() && JobDetailLogic.isValidApplicationHttpsUrl(form.applyUrl),
                leadingIcon = Icons.Rounded.AlternateEmail,
                keyboardType = KeyboardType.Uri,
                enabled = !saving,
            )
            if (form.applyUrl.isBlank()) {
                // Worth saying out loud: an empty link is not a missing field, it is the in-app
                // application form, and a poster who did not mean that should know before saving.
                Text(
                    text = if (bn) {
                        "পদটি এই অ্যাপেই আবেদন নেবে — আবেদনকারীর তথ্য আপনার কাছেই জমা হবে।"
                    } else {
                        "The role will take applications here, and you will read them on this page."
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = tokens.mutedText,
                )
            }
        }

        BsdcFormTagField(
            label = if (bn) "দক্ষতা" else "Skills",
            hint = if (bn) {
                "প্রতিটির পর এন্টার চাপুন; সর্বোচ্চ বিশটি।"
            } else {
                "Two characters or more, up to twenty."
            },
            tags = form.skills,
            onAdd = { tag -> form = form.copy(skills = form.skills + tag) },
            onRemoveAt = { index -> form = form.copy(skills = form.skills.filterIndexed { i, _ -> i != index }) },
            suggestions = JobEditLogic.SKILL_SUGGESTIONS,
            addLabel = if (bn) "যোগ করুন" else "Add skill",
            error = issue("Select at most"),
            enabled = !saving,
        )

        BsdcFormSection(
            title = if (bn) "কভার" else "Cover",
            subtitle = if (bn) {
                "যা পদটির ছবিতে দেখানো হবে।"
            } else {
                "The picture the role is shown with, on the board and when shared."
            },
        ) {
            MkListingCoverField(
                coverUrl = form.coverUrl,
                onCoverUrl = { form = form.copy(coverUrl = it) },
                bn = bn,
                allowed = JobEditLogic.coverAllowed(form.coverUrl),
                error = issue("A cover"),
                imageLoader = imageLoader,
                mediaRepository = mediaRepository,
                enabled = !saving,
            )
        }

        BsdcFormChecklist(
            caption = if (bn) "সংরক্ষণের প্রস্তুতি" else "Ready to save?",
            items = JobEditLogic.checklist(form, bn, nowMillis),
        )

        Text(
            text = if (bn) {
                "আবেদনের সংখ্যা, পোস্ট করার তারিখ ও পদের অবস্থা এখান থেকে বদলানো যায় না — সেগুলো " +
                    "পোস্ট করার ফলাফল, পছন্দ নয়।"
            } else {
                "The application count, the published date and the status are consequences of posting " +
                    "rather than settings, so they are not on this form. Closing the role to further " +
                    "applications is its own button, because it tells every applicant."
            },
            style = MaterialTheme.typography.labelSmall,
            color = tokens.mutedText,
            modifier = Modifier.padding(bottom = 2.dp),
        )
    }
}
