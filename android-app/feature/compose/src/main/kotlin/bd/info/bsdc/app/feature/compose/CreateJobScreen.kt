package bd.info.bsdc.app.feature.compose

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddCircleOutline
import androidx.compose.material.icons.rounded.AddPhotoAlternate
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Event
import androidx.compose.material.icons.rounded.Groups
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.Work
import androidx.compose.material.icons.rounded.Publish
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcActionTile
import bd.info.bsdc.app.core.designsystem.BsdcBadge
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcEmptyState
import bd.info.bsdc.app.core.designsystem.BsdcHeroBanner
import bd.info.bsdc.app.core.designsystem.BsdcSectionHeader
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcTone
import bd.info.bsdc.app.core.media.BsdcImgbbImage
import bd.info.bsdc.app.core.media.BsdcMediaRepository
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.MediaPurpose
import coil3.ImageLoader
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * The job screen, on its own.
 *
 * Jobs are the one kind where a missing field is a wasted applicant: salary band, work mode and city
 * are what a reader filters on, which is why the checklist under the fields stays on screen while the
 * member types rather than appearing only after a refusal.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MkCreateJobScreen(
    posterUid: String,
    repository: ComposeRepository,
    language: AppLanguage,
    onCreated: (String) -> Unit,
    onBack: () -> Unit,
) {
    MkCreateScaffold(
        mode = CreateHubMode.JOB,
        bn = language == AppLanguage.BN,
        onBack = onBack,
    ) {
    val bn = language == AppLanguage.BN
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf(JobDraftInput()) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val salaryMin = draft.salaryMinText.trim().toIntOrNull()
    val salaryMax = draft.salaryMaxText.trim().toIntOrNull()
    val skills = draft.skillsText.split(",").map { it.trim() }.filter { it.isNotBlank() }
    val issues = ComposerValidationEngine.validateJobDraft(
        draft.title, draft.company, draft.description, draft.workMode, draft.city,
        salaryMin, salaryMax, skills, draft.applyUrl,
    )

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        error?.let { item { BsdcStatusBanner("Check Job Details", it, BsdcTone.BAD) } }
        item {
            BsdcCard {
                BsdcSectionHeader(
                    title = if (bn) "চাকরি পোস্ট করুন" else "Post a job opening",
                    subtitle = if (bn) {
                        "ভূমিকা, বেতন আর দক্ষতা স্পষ্ট লিখলে সঠিক প্রার্থী আসে।"
                    } else {
                        "A clear role, pay range and skill list find the right applicant."
                    },
                )
                OutlinedTextField(value = draft.title, onValueChange = { draft = draft.copy(title = it) }, label = { Text(if (bn) "পদের নাম" else "Role title") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.company, onValueChange = { draft = draft.copy(company = it) }, label = { Text(if (bn) "প্রতিষ্ঠান" else "Company") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.description, onValueChange = { draft = draft.copy(description = it) }, label = { Text(if (bn) "ভূমিকার বিবরণ (২০+ অক্ষর)" else "Role description (20+ chars)") }, minLines = 4, modifier = Modifier.fillMaxWidth())
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("onsite", "hybrid", "remote").forEach { mode ->
                        FilterChip(
                            selected = draft.workMode == mode,
                            onClick = { draft = draft.copy(workMode = mode) },
                            label = { Text(mode.uppercase()) },
                        )
                    }
                }
                OutlinedTextField(value = draft.city, onValueChange = { draft = draft.copy(city = it) }, label = { Text(if (bn) "শহর" else "City") }, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = draft.salaryMinText, onValueChange = { draft = draft.copy(salaryMinText = it.filter(Char::isDigit)) }, label = { Text(if (bn) "সর্বনিম্ন BDT" else "Min BDT") }, singleLine = true, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = draft.salaryMaxText, onValueChange = { draft = draft.copy(salaryMaxText = it.filter(Char::isDigit)) }, label = { Text(if (bn) "সর্বোচ্চ BDT" else "Max BDT") }, singleLine = true, modifier = Modifier.weight(1f))
                }
                OutlinedTextField(value = draft.skillsText, onValueChange = { draft = draft.copy(skillsText = it) }, label = { Text(if (bn) "দক্ষতা (কমা দিয়ে)" else "Skills (comma-separated)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = draft.applyUrl, onValueChange = { draft = draft.copy(applyUrl = it) }, label = { Text(if (bn) "আবেদনের লিংক (ঐচ্ছিক)" else "Apply URL (optional)") }, modifier = Modifier.fillMaxWidth())
            }
        }

        item {
            BsdcCard {
                BsdcSectionHeader(
                    title = if (bn) "লাইভ প্রিভিউ" else "Live preview",
                    subtitle = if (bn) "প্রার্থীরা এভাবেই দেখবে।" else "This is how applicants will see it.",
                )
                Text(
                    text = draft.title.ifBlank { if (bn) "পদের নাম" else "Role title" },
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text = listOf(draft.company, draft.city).filter { it.isNotBlank() }
                        .joinToString(" · ")
                        .ifBlank { if (bn) "প্রতিষ্ঠান" else "Company" },
                    style = MaterialTheme.typography.bodySmall,
                )
                Text(
                    text = when {
                        salaryMin == null && salaryMax == null -> if (bn) "আলোচনা সাপেক্ষ" else "Negotiable"
                        salaryMin != null && salaryMax != null -> "BDT $salaryMin – $salaryMax /month"
                        salaryMin != null -> "BDT $salaryMin /month"
                        else -> "BDT $salaryMax /month"
                    },
                    style = MaterialTheme.typography.labelLarge,
                    color = bd.info.bsdc.app.core.designsystem.BsdcThemeTokens.colors.brandStrong,
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    BsdcBadge(label = draft.workMode.uppercase(), tone = BsdcTone.INFO)
                    skills.take(6).forEach { BsdcBadge(label = it.lowercase(), tone = BsdcTone.NEUTRAL) }
                }
            }
        }

        item {
            BsdcCard {
                BsdcSectionHeader(title = if (bn) "প্রকাশের চেকলিস্ট" else "Ready to publish?")
                ChecklistRow(if (bn) "পদের নাম লেখা হয়েছে" else "Role title is written", draft.title.trim().length >= 3)
                ChecklistRow(if (bn) "প্রতিষ্ঠানের নাম" else "Company is named", draft.company.trim().isNotBlank())
                ChecklistRow(
                    if (bn) "বিবরণ ২০+ অক্ষর" else "Description is at least 20 characters",
                    draft.description.trim().length >= 20,
                )
                ChecklistRow(
                    if (bn) "বেতনের ক্রম ঠিক" else "Salary bounds are in order",
                    salaryMax == null || salaryMin == null || salaryMax >= salaryMin,
                    blocking = false,
                )
                if (issues.isNotEmpty()) {
                    Text(
                        text = issues.first(),
                        style = MaterialTheme.typography.bodySmall,
                        color = bd.info.bsdc.app.core.designsystem.BsdcThemeTokens.colors.warn,
                    )
                }
                BsdcButton(
                    label = if (bn) "চাকরি প্রকাশ করুন" else "Publish job",
                    busy = submitting,
                    leadingIcon = Icons.Rounded.Publish,
                    enabled = issues.isEmpty(),
                    onClick = {
                        if (issues.isNotEmpty()) {
                            error = issues.first()
                            return@BsdcButton
                        }
                        submitting = true
                        error = null
                        scope.launch {
                            runCatching { repository.createJob(posterUid, draft) }
                                .onSuccess { onCreated(it) }
                                .onFailure { error = it.message ?: "Failed to create job." }
                            submitting = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
    }
}
