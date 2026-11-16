package bd.info.bsdc.app.feature.compose

import android.net.Uri
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.PostKind
import java.util.UUID

enum class CreateHubMode(val labelEn: String, val labelBn: String) {
    POST("Post / Article", "পোস্ট / নিবন্ধ"),
    EVENT("Event", "ইভেন্ট"),
    JOB("Job", "চাকরি"),
    GIG("Freelance Gig", "গিগ"),
    PROJECT("Project", "প্রজেক্ট"),
    GROUP("Group", "গ্রুপ"),
}

enum class AttachmentUploadStage {
    UPLOADING,
    READY,
    FAILED,
}

data class ComposerMediaAttachment(
    val localKey: String = UUID.randomUUID().toString(),
    val localUri: Uri? = null,
    val mediaId: String = "",
    val url: String = "",
    val thumbUrl: String = "",
    val altText: String = "",
    val progressPct: Int = 0,
    val stage: AttachmentUploadStage = AttachmentUploadStage.UPLOADING,
    val error: String? = null,
) {
    val isReady: Boolean get() = stage == AttachmentUploadStage.READY && mediaId.isNotBlank() && url.isNotBlank()
}

data class PostComposerDraft(
    val localDraftId: String = UUID.randomUUID().toString(),
    val remotePostId: String? = null,
    val kind: PostKind = PostKind.POST,
    val visibility: String = "public", // public, members
    val language: AppLanguage = AppLanguage.BN,
    val title: String = "",
    val body: String = "",
    val coverUrl: String = "",
    val code: String = "",
    val codeLanguage: String = "kotlin",
    val tags: List<String> = emptyList(),
    val pollOptions: List<String> = listOf("", ""),
    val media: List<ComposerMediaAttachment> = emptyList(),
    val isSensitive: Boolean = false,
    val allowComments: Boolean = true,
)

data class PublishedResult(
    val id: String,
    val slug: String,
)

data class CuratedTagItem(
    val slug: String,
    val nameEn: String,
    val nameBn: String,
    val postsCount: Int = 0,
)

data class EventDraftInput(
    val title: String = "",
    val description: String = "",
    val mode: String = "online", // online, in_person, hybrid
    val venue: String = "",
    val city: String = "Dhaka",
    val joinUrl: String = "",
    val coverUrl: String = "",
    val startsAtIso: String = "",
    val endsAtIso: String = "",
    val capacityText: String = "",
)

data class JobDraftInput(
    val title: String = "",
    val company: String = "",
    val description: String = "",
    val jobType: String = "full_time",
    val workMode: String = "hybrid",
    val level: String = "mid",
    val city: String = "Dhaka",
    val salaryMinText: String = "",
    val salaryMaxText: String = "",
    val salaryPeriod: String = "month",
    val skillsText: String = "",
    val applyUrl: String = "",
)

data class GigDraftInput(
    val title: String = "",
    val description: String = "",
    val budgetMinText: String = "",
    val budgetMaxText: String = "",
    val isHourly: Boolean = false,
    val durationDaysText: String = "",
    val skillsText: String = "",
)

data class ProjectDraftInput(
    val name: String = "",
    val tagline: String = "",
    val description: String = "",
    val repoUrl: String = "",
    val demoUrl: String = "",
    val coverUrl: String = "",
    val techText: String = "",
    val license: String = "MIT",
    val lookingForContributors: Boolean = true,
)

data class GroupDraftInput(
    val name: String = "",
    val slug: String = "",
    val description: String = "",
    val privacy: String = "public",
    val language: String = "bn",
)
