package bd.info.bsdc.app.feature.discover

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Badge
import androidx.compose.material.icons.rounded.Email
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material.icons.rounded.School
import androidx.compose.material.icons.rounded.Work
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcChecklistItem
import bd.info.bsdc.app.core.designsystem.BsdcEditSheet
import bd.info.bsdc.app.core.designsystem.BsdcFilterPill
import bd.info.bsdc.app.core.designsystem.BsdcFormChecklist
import bd.info.bsdc.app.core.designsystem.BsdcFormNumber
import bd.info.bsdc.app.core.designsystem.BsdcFormReviewRow
import bd.info.bsdc.app.core.designsystem.BsdcFormSection
import bd.info.bsdc.app.core.designsystem.BsdcFormTagField
import bd.info.bsdc.app.core.designsystem.BsdcFormText
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.common.ListingTags

/**
 * Applying to a job, as a form rather than a dialog of five boxes.
 *
 * The application used to be an `AlertDialog` with a name, a phone, an email, a cover letter and a
 * résumé link, and it sent one sentence for every problem at once. That left two things broken at the
 * same time. The member could not say the things an employer actually reads — expected salary,
 * experience, notice period, skills, portfolio, LinkedIn — so a phone application was a thinner
 * candidate than a browser one, even though `apply_to_job` takes all of it. And when a field was wrong,
 * the screen printed a summary and reddened the box, so the member had to guess which of five fields the
 * summary meant.
 *
 * So this is the website's flow, which is two steps: *Your details*, then *Review and submit*. Every
 * field carries the rule that refuses it, in the member's language, under the field; the step
 * caption is the web's own; and the review step repeats the application back before a single byte
 * leaves the phone, because an application cannot be edited after it is sent.
 *
 * What the sheet holds is the draft. It decides nothing: [JobDetailLogic.validateApplicationDraft] is
 * the rule, and this file only knows which sentence belongs under which box.
 */
@Composable
fun MkJobApplySheet(
    visible: Boolean,
    job: JobDetailDto,
    bn: Boolean,
    saving: Boolean,
    errorMessage: String,
    initialDraft: JobDetailLogic.ApplicationDraft,
    onSubmit: (JobDetailLogic.ApplicationDraft) -> Unit,
    onDismiss: () -> Unit,
) {
    if (!visible) return
    val tokens = BsdcThemeTokens.colors
    var draft by remember(job.id) { mutableStateOf(initialDraft) }
    var reviewing by remember(job.id) { mutableStateOf(false) }

    val errors = JobDetailLogic.validateApplicationDraft(draft)
    fun errorOf(key: String): String = if (key in errors) applyCopy(key, bn) else ""
    fun update(field: String, value: String): JobDetailLogic.ApplicationDraft = when (field) {
        "name" -> draft.copy(applicantName = value.take(60))
        "phone" -> draft.copy(phone = value.take(20))
        "email" -> draft.copy(email = value.take(320))
        "location" -> draft.copy(location = value.take(80))
        "experience" -> draft.copy(yearsExperience = value.filter { it.isDigit() || it == ' ' }.take(2))
        "education" -> draft.copy(education = value.take(200))
        "salary" -> draft.copy(expectedSalaryTaka = value.take(20))
        "notice" -> draft.copy(noticePeriod = value.take(60))
        "resume" -> draft.copy(resumeUrl = value)
        "portfolio" -> draft.copy(portfolioUrl = value)
        "linkedin" -> draft.copy(linkedinUrl = value)
        "coverLetter" -> draft.copy(coverLetter = value.take(6000))
        else -> draft
    }

    BsdcEditSheet(
        visible = true,
        title = if (bn) "আবেদন" else "Your application",
        subtitle = if (reviewing) {
            if (bn) {
                "পাঠানোর আগে সবকিছু যাচাই করুন — নিয়োগদাতা নিচের তথ্যগুলো পাবেন।"
            } else {
                "Check everything before sending. The employer will receive the details below."
            }
        } else {
            if (bn) {
                "যোগাযোগের তথ্য ও অভিজ্ঞতা দিন যা নিয়োগদাতা দেখতে চান।"
            } else {
                "Share the contact details and experience you want this employer to review."
            }
        },
        kicker = if (reviewing) {
            if (bn) "ধাপ ২ / ২ · দেখে পাঠান" else "Step 2 of 2 · Review and submit"
        } else {
            if (bn) "ধাপ ১ / ২ · আপনার তথ্য" else "Step 1 of 2 · Your details"
        },
        onDismiss = onDismiss,
        primaryLabel = when {
            saving -> if (bn) "পাঠানো হচ্ছে…" else "Sending…"
            reviewing -> if (bn) "আবেদন জমা দিন" else "Submit application"
            else -> if (bn) "আবেদন দেখে নিন" else "Review application"
        },
        primaryEnabled = (errors.isEmpty() || reviewing) && !saving,
        onPrimary = {
            if (reviewing) {
                onSubmit(draft)
            } else {
                reviewing = true
            }
        },
        secondaryLabel = if (reviewing) {
            if (bn) "তথ্য সম্পাদনা" else "Edit details"
        } else {
            if (bn) "বাতিল" else "Cancel"
        },
        onSecondary = {
            if (reviewing) {
                reviewing = false
            } else {
                onDismiss()
            }
        },
        busy = saving,
        errorMessage = errorMessage,
    ) {
        if (!reviewing) {
            BsdcFormSection(
                title = if (bn) "যোগাযোগের তথ্য" else "Contact details",
                subtitle = if (bn) {
                    "ফোন বা ইমেইল — অন্তত একটি দিন, নিয়োগদাতা যাতে আপনাকে ডাকতে পারেন।"
                } else {
                    "Give a phone number or an email address, so the employer can reach you."
                },
            ) {
                BsdcFormText(
                    label = if (bn) "পুরো নাম" else "Full name",
                    value = draft.applicantName,
                    onValueChange = { draft = update("name", it) },
                    error = errorOf("name").ifEmpty { errorOf("contact") },
                    complete = draft.applicantName.trim().isNotEmpty() && draft.applicantName.trim().length <= 60,
                    counter = "${draft.applicantName.trim().length}/60",
                    leadingIcon = Icons.Rounded.Person,
                    enabled = !saving,
                )
                BsdcFormText(
                    label = if (bn) "ফোন নম্বর" else "Phone number",
                    value = draft.phone,
                    onValueChange = { draft = update("phone", it) },
                    error = errorOf("phone"),
                    hint = if (bn) {
                        "শুধু সংখ্যা, প্লাস চিহ্ন, স্পেস ও হাইফেন।"
                    } else {
                        "Digits, plus signs, spaces and hyphens."
                    },
                    complete = "phone" !in errors,
                    keyboardType = KeyboardType.Phone,
                    leadingIcon = Icons.Rounded.Phone,
                    enabled = !saving,
                )
                BsdcFormText(
                    label = if (bn) "যোগাযোগের ইমেইল" else "Contact email",
                    value = draft.email,
                    onValueChange = { draft = update("email", it) },
                    error = errorOf("email"),
                    complete = "email" !in errors,
                    keyboardType = KeyboardType.Email,
                    leadingIcon = Icons.Rounded.Email,
                    enabled = !saving,
                )
                BsdcFormText(
                    label = if (bn) "অবস্থান" else "Location",
                    value = draft.location,
                    onValueChange = { draft = update("location", it) },
                    error = errorOf("location"),
                    hint = if (bn) "শহর বা দেশ, যেকোনো একটি।" else "A city or a country, either is enough.",
                    complete = draft.location.trim().isNotEmpty(),
                    leadingIcon = Icons.Rounded.LocationOn,
                    enabled = !saving,
                )
            }

            BsdcFormSection(
                title = if (bn) "অভিজ্ঞতা ও পছন্দ" else "Experience and preferences",
                subtitle = if (bn) {
                    "খালি রাখা ঘর «দেওয়া হয়নি» বলে গণ্য হবে, শূন্য নয়।"
                } else {
                    "A box you leave empty is read as not stated, never as zero."
                },
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BsdcFormNumber(
                        label = if (bn) "অভিজ্ঞতার বছর" else "Years of experience",
                        value = draft.yearsExperience,
                        onValueChange = { draft = update("experience", it) },
                        error = errorOf("experience"),
                        modifier = Modifier.weight(1f),
                        enabled = !saving,
                    )
                    BsdcFormNumber(
                        label = if (bn) "প্রত্যাশিত মাসিক বেতন (টাকা)" else "Expected monthly salary (taka)",
                        value = draft.expectedSalaryTaka,
                        onValueChange = { draft = update("salary", it) },
                        error = errorOf("salary"),
                        prefix = "৳",
                        modifier = Modifier.weight(1f),
                        enabled = !saving,
                    )
                }
                if (JobDetailLogic.takaToPoisha(draft.expectedSalaryTaka) != null) {
                    // The number the employer reads is the number the row stores: poisha, formatted the
                    // way a Bangla reader expects, so "45000.5" cannot arrive as 45000.
                    Text(
                        text = if (bn) {
                            "পাঠানো হবে ${JobDetailLogic.formatApplicationSalary(JobDetailLogic.takaToPoisha(draft.expectedSalaryTaka)!!, bn)}"
                        } else {
                            "Will be sent as ${JobDetailLogic.formatApplicationSalary(JobDetailLogic.takaToPoisha(draft.expectedSalaryTaka)!!, bn)}"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = tokens.brandStrong,
                    )
                }
                BsdcFormText(
                    label = if (bn) "শিক্ষা" else "Education",
                    value = draft.education,
                    onValueChange = { draft = update("education", it) },
                    error = errorOf("education"),
                    singleLine = false,
                    minLines = 2,
                    maxLines = 4,
                    counter = "${draft.education.trim().length}/200",
                    imeAction = ImeAction.Default,
                    leadingIcon = Icons.Rounded.School,
                    enabled = !saving,
                )
                BsdcFormText(
                    label = if (bn) "নোটিশ পিরিয়ড" else "Notice period",
                    value = draft.noticePeriod,
                    onValueChange = { draft = update("notice", it) },
                    error = errorOf("notice"),
                    hint = if (bn) {
                        "যেমন «৩০ দিনের নোটিশ» বা «তাৎক্ষণিক»।"
                    } else {
                        "For example \"30 days' notice\" or \"immediate\"."
                    },
                    counter = "${draft.noticePeriod.trim().length}/60",
                    complete = draft.noticePeriod.trim().isNotEmpty(),
                    leadingIcon = Icons.Rounded.Work,
                    enabled = !saving,
                )
                BsdcFormTagField(
                    label = if (bn) "প্রাসঙ্গিক দক্ষতা" else "Relevant skills",
                    tags = skillsShown(draft.skillsInput),
                    onAdd = { tag -> draft = draft.copy(skillsInput = joinSkills(draft.skillsInput, tag)) },
                    onRemoveAt = { index ->
                        draft = draft.copy(skillsInput = dropSkillAt(draft.skillsInput, index))
                    },
                    hint = if (bn) {
                        "প্রতিটি দক্ষতার পর এন্টার চাপুন। সর্বোচ্চ ৩০টি।"
                    } else {
                        "Press enter after each skill. Up to 30."
                    },
                    error = errorOf("skills"),
                    suggestions = JobEditLogic.SKILL_SUGGESTIONS,
                    addLabel = if (bn) "যোগ করুন" else "Add skill",
                    enabled = !saving,
                    rules = ListingTags.APPLICATIONS,
                )
            }

            BsdcFormSection(
                title = if (bn) "সিভি ও কাজের নমুনা" else "Resume and work samples",
                subtitle = if (bn) {
                    "সরাসরি HTTPS লিংক দিন — ফাইল আপলোড সমর্থিত নয়।"
                } else {
                    "Paste a direct HTTPS link. Uploads are not supported."
                },
            ) {
                ApplyLinkField(
                    label = if (bn) "সিভির লিংক" else "Resume link",
                    value = draft.resumeUrl,
                    onValueChange = { draft = update("resume", it) },
                    error = errorOf("resume"),
                    bn = bn,
                    saving = saving,
                )
                ApplyLinkField(
                    label = if (bn) "পোর্টফোলিও লিংক" else "Portfolio link",
                    value = draft.portfolioUrl,
                    onValueChange = { draft = update("portfolio", it) },
                    error = errorOf("portfolio"),
                    bn = bn,
                    saving = saving,
                )
                ApplyLinkField(
                    label = if (bn) "লিংকডইন প্রোফাইল" else "LinkedIn profile",
                    value = draft.linkedinUrl,
                    onValueChange = { draft = update("linkedin", it) },
                    error = errorOf("linkedin"),
                    bn = bn,
                    saving = saving,
                )
            }

            BsdcFormSection(
                title = if (bn) "আপনার বক্তব্য" else "Your statement",
                subtitle = if (bn) {
                    "একটি ভালো বক্তব্য ছবির চেয়ে বেশি কাজ করে — এই পদের জন্য কেন, সেটাই লিখুন।"
                } else {
                    "Say why this role, in your own words. It is the part an employer reads."
                },
            ) {
                BsdcFormText(
                    label = if (bn) "কভার লেটার" else "Cover letter",
                    value = draft.coverLetter,
                    onValueChange = { draft = update("coverLetter", it) },
                    error = errorOf("coverLetter"),
                    hint = if (bn) {
                        "২০ থেকে ৬,০০০ অক্ষর।"
                    } else {
                        "Between 20 and 6,000 characters."
                    },
                    singleLine = false,
                    minLines = 6,
                    maxLines = 14,
                    counter = "${draft.coverLetter.trim().length}/6000",
                    imeAction = ImeAction.Default,
                    complete = JobDetailLogic.coverLetterValid(draft.coverLetter),
                    enabled = !saving,
                )
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = if (bn) {
                            "সার্টিফিকেশনের ছবি — সর্বোচ্চ ৩টি, ImgBB-র লিংক"
                        } else {
                            "Certification images — up to three, ImgBB links"
                        },
                        style = MaterialTheme.typography.labelLarge,
                        color = tokens.mutedText,
                    )
                    val images = draft.certificationImageUrls
                    images.forEachIndexed { index, url ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text(
                                text = if (bn) "সার্টিফিকেশন ছবি ${index + 1}" else "Certification image ${index + 1}",
                                style = MaterialTheme.typography.labelMedium,
                                modifier = Modifier.weight(1f),
                            )
                            BsdcFilterPill(
                                label = if (bn) "সরান" else "Remove",
                                selected = false,
                                onClick = {
                                    draft = draft.copy(
                                        certificationImageUrls = images.filterIndexed { i, _ -> i != index },
                                    )
                                },
                            )
                        }
                        Text(
                            text = url,
                            style = MaterialTheme.typography.labelSmall,
                            color = tokens.mutedText,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (images.size < 3) {
                        var pending by remember { mutableStateOf("") }
                        val allowed = JobDetailLogic.isValidApplicationImageUrl(pending)
                        BsdcFormText(
                            label = if (images.isEmpty()) {
                                if (bn) "ছবির লিংক যোগ করুন" else "Add an image link"
                            } else {
                                if (bn) "আরেকটি ছবির লিংক" else "Another image link"
                            },
                            value = pending,
                            onValueChange = { pending = it },
                            error = if (pending.isNotBlank() && !allowed) applyCopy("image", bn) else "",
                            hint = if (bn) {
                                "পাবলিক ImgBB HTTPS লিংক; ফাইল আপলোড হয় না।"
                            } else {
                                "A public ImgBB HTTPS link. No file upload."
                            },
                            complete = allowed,
                            leadingIcon = Icons.Rounded.Badge,
                            keyboardType = KeyboardType.Uri,
                            imeAction = ImeAction.Done,
                            enabled = !saving,
                        )
                        if (pending.isNotBlank() && allowed) {
                            BsdcFilterPill(
                                label = if (bn) "যুক্ত করুন" else "Add image",
                                selected = false,
                                onClick = {
                                    draft = draft.copy(certificationImageUrls = images + pending.trim())
                                    pending = ""
                                },
                            )
                        }
                    }
                }
            }

            BsdcFormChecklist(
                caption = if (bn) "পাঠানোর প্রস্তুতি" else "Ready to send?",
                items = listOf(
                    BsdcChecklistItem(
                        label = if (bn) "নাম লেখা হয়েছে" else "A name is given",
                        done = "name" !in errors,
                    ),
                    BsdcChecklistItem(
                        label = if (bn) "যোগাযোগের একটি পদ্ধতি আছে" else "One way to contact you",
                        done = "contact" !in errors,
                    ),
                    BsdcChecklistItem(
                        label = if (bn) "কমপক্ষে ২০ অক্ষরের কভার লেটার" else "A cover letter of at least 20 characters",
                        done = "coverLetter" !in errors,
                    ),
                    BsdcChecklistItem(
                        label = if (bn) "দক্ষতা বা নমুনা — যেকোনো একটি" else "A skill or a sample of the work",
                        done = draft.skillsInput.isNotBlank() ||
                            draft.portfolioUrl.isNotBlank() ||
                            draft.resumeUrl.isNotBlank(),
                        blocking = false,
                    ),
                ),
            )
        } else {
            BsdcFormSection(
                title = if (bn) "নিয়োগদাতা যা পাবেন" else "What the employer receives",
                subtitle = if (bn) {
                    "পাঠানোর পর আবেদনটি আর বদলানো যায় না।"
                } else {
                    "An application cannot be edited once it is sent."
                },
            ) {
                val missing = if (bn) "দেওয়া হয়নি" else "Not provided"
                BsdcFormReviewRow(label = if (bn) "পুরো নাম" else "Full name", value = draft.applicantName, missingLabel = missing)
                BsdcFormReviewRow(label = if (bn) "ফোন" else "Phone", value = draft.phone, missingLabel = missing)
                BsdcFormReviewRow(label = if (bn) "ইমেইল" else "Email", value = draft.email, missingLabel = missing)
                BsdcFormReviewRow(label = if (bn) "অবস্থান" else "Location", value = draft.location, missingLabel = missing)
                BsdcFormReviewRow(
                    label = if (bn) "অভিজ্ঞতা" else "Experience",
                    value = if (draft.yearsExperience.isNotBlank()) {
                        if (bn) "${draft.yearsExperience} বছর" else "${draft.yearsExperience.trim()} years"
                    } else {
                        ""
                    },
                    missingLabel = missing,
                )
                BsdcFormReviewRow(label = if (bn) "শিক্ষা" else "Education", value = draft.education, missingLabel = missing)
                BsdcFormReviewRow(
                    label = if (bn) "প্রত্যাশিত বেতন" else "Expected salary",
                    value = JobDetailLogic.takaToPoisha(draft.expectedSalaryTaka)
                        ?.let { JobDetailLogic.formatApplicationSalary(it, bn) }
                        .orEmpty(),
                    missingLabel = missing,
                )
                BsdcFormReviewRow(label = if (bn) "নোটিশ" else "Notice period", value = draft.noticePeriod, missingLabel = missing)
                BsdcFormReviewRow(
                    label = if (bn) "দক্ষতা" else "Skills",
                    value = ListingTags.join(skillsShown(draft.skillsInput)),
                    missingLabel = missing,
                )
                BsdcFormReviewRow(label = if (bn) "সিভি" else "Resume", value = draft.resumeUrl, missingLabel = missing)
                BsdcFormReviewRow(label = if (bn) "পোর্টফোলিও" else "Portfolio", value = draft.portfolioUrl, missingLabel = missing)
                BsdcFormReviewRow(label = if (bn) "লিংকডইন" else "LinkedIn", value = draft.linkedinUrl, missingLabel = missing)
                BsdcFormReviewRow(
                    label = if (bn) "সার্টিফিকেশন" else "Certifications",
                    value = if (draft.certificationImageUrls.isEmpty()) {
                        ""
                    } else {
                        if (bn) {
                            "${draft.certificationImageUrls.size} টি ছবি"
                        } else {
                            "${draft.certificationImageUrls.size} images"
                        }
                    },
                    missingLabel = missing,
                )
                if (draft.coverLetter.isNotBlank()) {
                    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = if (bn) "কভার লেটার" else "Cover letter",
                            style = MaterialTheme.typography.labelMedium,
                            color = tokens.mutedText,
                        )
                        Text(text = draft.coverLetter, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
            Text(
                text = if (bn) {
                    "আপনার আবেদন ও যোগাযোগের তথ্য শুধু আপনি, পদদাতা ও অনুমোদিত কর্মীরা দেখতে পাবেন।"
                } else {
                    "Your application and contact details are private to you, the job poster and authorised staff."
                },
                style = MaterialTheme.typography.labelSmall,
                color = tokens.mutedText,
                modifier = Modifier.padding(bottom = 2.dp),
            )
        }
    }
}

/** One https field, with the web's own refusal under it. */
@Composable
private fun ApplyLinkField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    error: String,
    bn: Boolean,
    saving: Boolean,
) {
    BsdcFormText(
        label = label,
        value = value,
        onValueChange = onValueChange,
        hint = if (error.isBlank()) {
            if (bn) "সরাসরি HTTPS লিংক দিন।" else "Paste a direct HTTPS link."
        } else {
            ""
        },
        error = error,
        complete = value.isNotBlank() && JobDetailLogic.isValidApplicationHttpsUrl(value),
        leadingIcon = if (label.contains("LinkedIn") || label.contains("লিংকডইন")) {
            Icons.Rounded.Language
        } else {
            Icons.Rounded.Public
        },
        keyboardType = KeyboardType.Uri,
        enabled = !saving,
    )
}

/**
 * The skill line as chips, and back again.
 *
 * The draft keeps skills as one comma-separated string, because that is the shape
 * `apply_to_job`'s own normaliser takes and the shape the create drafts use. The member should still
 * get chips: a list you can remove one item from, rather than a line you retype. So the string is only
 * the storage — split on the way in, joined on the way out, and no rule applied here, because
 * `BsdcFormTagField` refuses an illegal addition through `ListingTags` before it reaches this file. The
 * apply form's numbers are its own: thirty skills of sixty-four characters, lower-cased, which is
 * [ListingTags.APPLICATIONS] rather than a listing's twenty of thirty-two.
 */
private fun skillsShown(raw: String): List<String> = raw.split(',').map { it.trim() }.filter { it.isNotEmpty() }

private fun joinSkills(current: String, tag: String): String =
    ListingTags.join(skillsShown(current) + tag)

private fun dropSkillAt(current: String, index: Int): String =
    ListingTags.join(skillsShown(current).filterIndexed { i, _ -> i != index })

/** The web's `jobs.application.validation.*`, verbatim, under the box that broke the rule. */
private fun applyCopy(key: String, bn: Boolean): String = when (key) {
    "name" -> if (bn) "৬০ অক্ষরের মধ্যে একটি নাম লিখুন।" else "Enter a name up to 60 characters."
    "phone" -> if (bn) {
        "শুধু সংখ্যা, প্লাস চিহ্ন, স্পেস ও হাইফেন ব্যবহার করুন।"
    } else {
        "Use only digits, plus signs, spaces and hyphens."
    }
    "email" -> if (bn) "সঠিক ইমেইল ঠিকানা লিখুন।" else "Enter a valid email address."
    "contact" -> if (bn) {
        "যোগাযোগের অন্তত একটি পদ্ধতি দিন: ফোন বা ইমেইল।"
    } else {
        "Add at least one contact method: phone or email."
    }
    "location" -> if (bn) "অবস্থান ৮০ অক্ষরের মধ্যে রাখুন।" else "Keep the location under 80 characters."
    "experience" -> if (bn) "০ থেকে ৬০-এর মধ্যে পূর্ণ সংখ্যা দিন।" else "Enter a whole number from 0 to 60."
    "education" -> if (bn) "শিক্ষার তথ্য ২০০ অক্ষরের মধ্যে রাখুন।" else "Keep education under 200 characters."
    "salary" -> if (bn) {
        "সর্বোচ্চ দুই দশমিকসহ শূন্য বা তার বেশি টাকার অঙ্ক দিন।"
    } else {
        "Enter taka as a non-negative amount with at most two decimals."
    }
    "resume", "portfolio", "linkedin" -> if (bn) {
        "স্পেস ছাড়া সম্পূর্ণ HTTPS লিংক দিন।"
    } else {
        "Enter a complete HTTPS URL without spaces."
    }
    "notice" -> if (bn) "নোটিশ পিরিয়ড ৬০ অক্ষরের মধ্যে রাখুন।" else "Keep the notice period under 60 characters."
    "skills" -> if (bn) {
        "সর্বোচ্চ ৩০টি অ-ফাঁকা দক্ষতা দিন, প্রতিটি ৬৪ অক্ষরের মধ্যে।"
    } else {
        "Use up to 30 non-empty skills, each no longer than 64 characters."
    }
    "certifications" -> if (bn) {
        "অনুমোদিত ImgBB HTTPS ছবির লিংক দিন; সর্বোচ্চ তিনটি।"
    } else {
        "Use an allowed ImgBB HTTPS image link, with no more than three images."
    }
    "image" -> if (bn) {
        "অনুমোদিত ImgBB HTTPS ছবির লিংক দিন; সর্বোচ্চ তিনটি।"
    } else {
        "Use an allowed ImgBB HTTPS image link, with no more than three images."
    }
    "coverLetter" -> if (bn) {
        "২০ থেকে ৬০০০ অক্ষরের মধ্যে কভার লেটার লিখুন।"
    } else {
        "Write a cover letter between 20 and 6000 characters."
    }
    else -> if (bn) "এই ঘরটি ঠিক করুন।" else "Fix this field."
}
