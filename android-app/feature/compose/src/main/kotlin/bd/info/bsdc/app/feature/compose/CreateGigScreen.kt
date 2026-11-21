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
 * The gig screen, on its own.
 *
 * A gig post is a small contract, so the form asks for scope, budget and deadline in the order a
 * client would write them, and the scope ideas are the web's list — the same four sentences on both
 * clients, so a member who saw the site is not relearning the vocabulary here.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MkCreateGigScreen(
    clientUid: String,
    repository: ComposeRepository,
    language: AppLanguage,
    onCreated: (String) -> Unit,
    onBack: () -> Unit,
) {
    MkCreateScaffold(
        mode = CreateHubMode.GIG,
        bn = language == AppLanguage.BN,
        onBack = onBack,
    ) {
    val bn = language == AppLanguage.BN
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf(GigDraftInput()) }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scopeIdeas = remember {
        listOf(
            "Landing page" to "One responsive page, mobile-first, with the copy you supply.",
            "Logo and identity" to "A wordmark, a mark and the two files a print shop asks for.",
            "API integration" to "Connect one REST API to one screen, with error states handled.",
            "Bug fix sprint" to "A time-boxed pass over a list of reproducible defects.",
        )
    }

    val budgetMin = draft.budgetMinText.trim().toIntOrNull()
    val budgetMax = draft.budgetMaxText.trim().toIntOrNull()
    val days = draft.durationDaysText.trim().toIntOrNull()
    val skills = draft.skillsText.split(",").map { it.trim() }.filter { it.isNotBlank() }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        error?.let { item { BsdcStatusBanner("Check Gig Details", it, BsdcTone.BAD) } }
        item {
            BsdcCard {
                BsdcSectionHeader(
                    title = if (bn) "ফ্রিল্যান্স গিগ প্রকাশ করুন" else "Post a freelance gig",
                    subtitle = if (bn) {
                        "যত স্পষ্ট স্কোপ, তত ভালো প্রস্তাব।"
                    } else {
                        "The clearer the scope, the better the proposals."
                    },
                )
                OutlinedTextField(
                    value = draft.title,
                    onValueChange = { draft = draft.copy(title = it) },
                    label = { Text(if (bn) "গিগের শিরোনাম" else "Gig title") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = draft.description,
                    onValueChange = { draft = draft.copy(description = it) },
                    label = { Text(if (bn) "কাজের বিবরণ ও ডেলিভারেবল (২০+ অক্ষর)" else "Scope & deliverables (20+ chars)") },
                    minLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    scopeIdeas.forEach { (label, body) ->
                        FilterChip(
                            selected = false,
                            onClick = {
                                draft = draft.copy(
                                    title = draft.title.ifBlank { label },
                                    description = if (draft.description.isBlank()) body else draft.description,
                                )
                            },
                            label = { Text(label) },
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = draft.budgetMinText,
                        onValueChange = { draft = draft.copy(budgetMinText = it.filter(Char::isDigit)) },
                        label = { Text(if (bn) "সর্বনিম্ন (BDT)" else "Min budget (BDT)") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        value = draft.budgetMaxText,
                        onValueChange = { draft = draft.copy(budgetMaxText = it.filter(Char::isDigit)) },
                        label = { Text(if (bn) "সর্বোচ্চ (BDT)" else "Max budget (BDT)") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                }
                if (budgetMin != null && budgetMax != null && budgetMax < budgetMin) {
                    Text(
                        text = if (bn) {
                            "সর্বোচ্চ বাজেট সর্বনিম্নের চেয়ে কম হতে পারে না।"
                        } else {
                            "The maximum budget cannot be lower than the minimum."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = bd.info.bsdc.app.core.designsystem.BsdcThemeTokens.colors.warn,
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(if (bn) "ঘণ্টাভিত্তিক হার" else "Hourly billing rate")
                    Switch(checked = draft.isHourly, onCheckedChange = { draft = draft.copy(isHourly = it) })
                }
                OutlinedTextField(
                    value = draft.durationDaysText,
                    onValueChange = { draft = draft.copy(durationDaysText = it.filter(Char::isDigit)) },
                    label = { Text(if (bn) "আনুমানিক দিন" else "Estimated days") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = draft.skillsText,
                    onValueChange = { draft = draft.copy(skillsText = it) },
                    label = { Text(if (bn) "দক্ষতা (কমা দিয়ে আলাদা)" else "Skills (comma-separated)") },
                    modifier = Modifier.fillMaxWidth(),
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("Kotlin", "Compose", "Android", "React", "Node", "Postgres", "Figma", "SEO")
                        .forEach { suggestion ->
                            FilterChip(
                                selected = skills.any { it.equals(suggestion, ignoreCase = true) },
                                onClick = {
                                    val already = skills.any { it.equals(suggestion, ignoreCase = true) }
                                    val next = if (already) {
                                        skills.filterNot { it.equals(suggestion, ignoreCase = true) }
                                    } else {
                                        skills + suggestion
                                    }
                                    draft = draft.copy(skillsText = next.joinToString(", "))
                                },
                                label = { Text(suggestion) },
                            )
                        }
                }
            }
        }

        // Live preview: what a freelancer will see in the directory.
        item {
            BsdcCard {
                BsdcSectionHeader(
                    title = if (bn) "লাইভ প্রিভিউ" else "Live preview",
                    subtitle = if (bn) "ফ্রিল্যান্সাররা এভাবেই দেখবে।" else "This is how freelancers will see it.",
                )
                Text(
                    text = draft.title.ifBlank { if (bn) "গিগের শিরোনাম" else "Gig title" },
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text = when {
                        budgetMin == null && budgetMax == null -> if (bn) "আলোচনা সাপেক্ষ" else "Negotiable"
                        budgetMin != null && budgetMax != null -> "BDT $budgetMin – $budgetMax"
                        budgetMin != null -> "BDT $budgetMin"
                        else -> "BDT $budgetMax"
                    } + if (draft.isHourly) (if (bn) " /ঘণ্টা" else " /hr") else "",
                    style = MaterialTheme.typography.labelLarge,
                    color = bd.info.bsdc.app.core.designsystem.BsdcThemeTokens.colors.brandStrong,
                )
                if (draft.description.isNotBlank()) {
                    Text(
                        text = draft.description.take(180),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (days != null && days > 0) {
                        BsdcBadge(
                            label = if (bn) "$days দিন" else "$days day delivery",
                            tone = BsdcTone.INFO,
                        )
                    }
                    skills.take(6).forEach { skill ->
                        BsdcBadge(label = skill.lowercase(), tone = BsdcTone.NEUTRAL)
                    }
                }
            }
        }

        // Validation checklist, computed from the same engine the publish button uses.
        item {
            val issues = ComposerValidationEngine.validateGigDraft(
                draft.title,
                draft.description,
                budgetMin,
                budgetMax,
                days,
                skills,
            )
            BsdcCard {
                BsdcSectionHeader(title = if (bn) "প্রকাশের চেকলিস্ট" else "Ready to publish?")
                ChecklistRow(if (bn) "শিরোনাম লেখা হয়েছে" else "Title is written", draft.title.trim().length >= 3)
                ChecklistRow(
                    if (bn) "বিবরণ ২০+ অক্ষর" else "Scope is at least 20 characters",
                    draft.description.trim().length >= 20,
                )
                val budgetOrdered = budgetMax == null || budgetMin == null || budgetMax >= budgetMin
                ChecklistRow(
                    if (bn) "বাজেটের ক্রম ঠিক আছে" else "Budget bounds are in order",
                    budgetOrdered,
                    blocking = false,
                )
                ChecklistRow(
                    if (bn) "কমপক্ষে একটি দক্ষতা" else "At least one skill",
                    skills.isNotEmpty(),
                    blocking = false,
                )
                BsdcButton(
                    label = if (bn) "গিগ প্রকাশ করুন" else "Publish gig",
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
                            runCatching { repository.createGig(clientUid, draft) }
                                .onSuccess { onCreated(it) }
                                .onFailure { error = it.message ?: "Failed to post gig." }
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
