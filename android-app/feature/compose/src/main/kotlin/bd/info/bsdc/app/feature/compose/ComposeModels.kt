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
    ;

    companion object {
        /**
         * Which creation screen a deep link opens.
         *
         * The website's `/create?kind=job` has five kinds and one default: `CreatePage.tsx` reads
         * `params.get('kind')`, keeps it if `isKind` recognises it, and falls back to the event form.
         * The app used to answer every `/create` link with the event form whatever it said, so a job
         * link opened the wrong screen and a group link opened it too. Same query, same answer here —
         * including the fallback, because an unrecognised kind is not an error, it is the page the
         * member would have seen in a browser.
         *
         * A link with no query at all keeps [POST] only for the shell's `/compose` route; `/create`
         * alone means the event form, exactly as the web's default.
         */
        fun fromRoute(path: String?): CreateHubMode {
            val query = path?.substringAfter('?', "")?.substringBefore('#') ?: return EVENT
            val kind = query.split('&')
                .firstNotNullOfOrNull { part ->
                    val key = part.substringBefore('=').trim().lowercase()
                    if (key != "kind") return@firstNotNullOfOrNull null
                    part.substringAfter('=', "").trim().lowercase().ifBlank { null }
                }
            return when (kind) {
                "event" -> EVENT
                "job" -> JOB
                "gig" -> GIG
                "project" -> PROJECT
                "group" -> GROUP
                else -> EVENT
            }
        }
    }
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
    /** `bsdc_visibility`: public | followers | private. See [ComposerVisibility]. */
    val visibility: String = "public",
    /**
     * The group channel this post belongs to, or null for the feed.
     *
     * [channelTouched] is not decoration. `save_post` distinguishes "the client said no channel"
     * (explicit null — move the post out to the feed) from "the client said nothing" (key absent —
     * leave the channel alone). A composer that always sent the key would silently pull a post out of
     * a room it never displayed, so the key goes only after the member has used the selector.
     */
    val channelId: String? = null,
    val channelTouched: Boolean = false,
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
