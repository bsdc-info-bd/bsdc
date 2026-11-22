package bd.info.bsdc.app.feature.discover

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

enum class DiscoverSection {
    SEARCH,
    GROUPS,
    EVENTS,
    JOBS,
    GIGS,
    PROJECTS,
    COURSES,
    PEOPLE,
}

@Serializable
data class SearchResultDto(
    val kind: String,
    val id: String,
    val slug: String = "",
    val title: String = "",
    val subtitle: String = "",
    @SerialName("image_url") val imageUrl: String = "",
    val rank: Double = 0.0,
    @SerialName("created_at") val createdAt: String = "",
)

@Serializable
data class SearchSuggestionDto(
    val kind: String,
    val slug: String = "",
    val title: String = "",
)

@Serializable
data class RichSearchSuggestionDto(
    val kind: String,
    val id: String = "",
    val slug: String = "",
    val title: String = "",
    val subtitle: String = "",
    @SerialName("image_url") val imageUrl: String = "",
)

@Serializable
data class SocialProfileItemDto(
    val uid: String,
    val username: String = "",
    @SerialName("display_name") val displayName: String = "Member",
    @SerialName("avatar_url") val avatarUrl: String = "",
    val bio: String = "",
    val location: String = "",
    val verified: Boolean = false,
    @SerialName("viewer_follows") val viewerFollows: Boolean = false,
    @SerialName("followed_at") val followedAt: String = "",
)

@Serializable
data class TrendingSearchDto(
    val term: String,
    val uses: Int = 0,
)

@Serializable
data class GroupDirectoryDto(
    val id: String,
    val slug: String,
    val name: String,
    val description: String = "",
    val privacy: String = "public",
    @SerialName("avatar_url") val avatarUrl: String = "",
    @SerialName("members_count") val membersCount: Int = 0,
    @SerialName("posts_count") val postsCount: Int = 0,
    @SerialName("my_role") val myRole: String? = null,
    @SerialName("request_status") val requestStatus: String? = null,
)

@Serializable
data class EventCalendarDto(
    val id: String,
    val slug: String,
    val title: String,
    val mode: String = "online",
    val venue: String = "",
    val city: String = "",
    @SerialName("cover_url") val coverUrl: String = "",
    @SerialName("starts_at") val startsAt: String = "",
    @SerialName("ends_at") val endsAt: String = "",
    val capacity: Int? = null,
    @SerialName("going_count") val goingCount: Int = 0,
    @SerialName("my_status") val myStatus: String? = null,
    val timezone: String? = null,
)

/** One event in full, from the event_detail RPC. Text columns may be null, so they are nullable. */
@Serializable
data class EventDetailDto(
    val id: String,
    val slug: String,
    val title: String,
    val description: String? = null,
    val mode: String = "online",
    val venue: String? = null,
    val city: String? = null,
    @SerialName("join_url") val joinUrl: String? = null,
    @SerialName("cover_url") val coverUrl: String? = null,
    @SerialName("starts_at") val startsAt: String? = null,
    @SerialName("ends_at") val endsAt: String? = null,
    val timezone: String? = null,
    val capacity: Int? = null,
    @SerialName("going_count") val goingCount: Int = 0,
    @SerialName("is_cancelled") val isCancelled: Boolean = false,
    @SerialName("host_uid") val hostUid: String? = null,
    /** The organising group, when there is one — needed to know whether the viewer moderates it. */
    @SerialName("group_id") val groupId: String? = null,
    @SerialName("my_status") val myStatus: String? = null,
)

@Serializable
data class JobBoardDto(
    val id: String,
    val slug: String,
    val title: String,
    val company: String = "",
    @SerialName("job_type") val jobType: String = "full_time",
    @SerialName("work_mode") val workMode: String = "remote",
    val level: String = "mid",
    val city: String = "",
    @SerialName("salary_min") val salaryMin: Int? = null,
    @SerialName("salary_max") val salaryMax: Int? = null,
    @SerialName("salary_currency") val salaryCurrency: String = "BDT",
    @SerialName("salary_period") val salaryPeriod: String = "month",
    val skills: List<String> = emptyList(),
    /** Added by 0128 to `job_board`, so a card can show the role's cover. */
    @SerialName("cover_url") val coverUrl: String = "",
    @SerialName("applications_count") val applicationsCount: Int = 0,
    @SerialName("published_at") val publishedAt: String? = null,
    @SerialName("my_status") val myStatus: String? = null,
)

/** One job in full, from the job_detail RPC. Salary bounds are whole taka or poisha as stored. */
@Serializable
data class JobDetailDto(
    val id: String,
    val slug: String,
    val title: String,
    val company: String = "",
    val description: String = "",
    @SerialName("job_type") val jobType: String = "full_time",
    @SerialName("work_mode") val workMode: String = "remote",
    val level: String = "mid",
    val city: String = "",
    val country: String = "",
    @SerialName("salary_min") val salaryMin: Int? = null,
    @SerialName("salary_max") val salaryMax: Int? = null,
    @SerialName("salary_currency") val salaryCurrency: String = "BDT",
    @SerialName("salary_period") val salaryPeriod: String = "month",
    val skills: List<String> = emptyList(),
    @SerialName("apply_url") val applyUrl: String = "",
    val status: String = "open",
    @SerialName("applications_count") val applicationsCount: Int = 0,
    @SerialName("published_at") val publishedAt: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
    @SerialName("poster_uid") val posterUid: String = "",
    @SerialName("my_status") val myStatus: String? = null,
    /** Sent by `job_detail` since 0128 re-created it with the column; '' for none. */
    @SerialName("cover_url") val coverUrl: String = "",
)

@Serializable
data class GigDto(
    val id: String = "",
    val slug: String = "",
    val title: String = "",
    val description: String = "",
    @SerialName("budget_min") val budgetMin: Int? = null,
    @SerialName("budget_max") val budgetMax: Int? = null,
    val currency: String = "BDT",
    @SerialName("is_hourly") val isHourly: Boolean = false,
    @SerialName("duration_days") val durationDays: Int? = null,
    val skills: List<String> = emptyList(),
    @SerialName("proposals_count") val proposalsCount: Int = 0,
    @SerialName("client_uid") val clientUid: String = "",
    val status: String = "open",
    @SerialName("published_at") val publishedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class GigProposalProfileDto(
    val uid: String = "",
    val username: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val verified: Boolean = false,
)

/**
 * One proposal, from `gig_proposal_queue()`.
 *
 * The freelancer's card arrives flat (`display_name`, `avatar_url`, `verified`) because the
 * server does the join. [profiles] is kept so a row carrying the older embedded shape still
 * deserialises, and [freelancer] resolves either shape into the one the screens read.
 */
@Serializable
data class GigProposalDto(
    val id: String = "",
    @SerialName("gig_id") val gigId: String = "",
    @SerialName("freelancer_uid") val freelancerUid: String = "",
    val username: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val verified: Boolean = false,
    val pitch: String = "",
    @SerialName("bid_amount") val bidAmount: Int = 0,
    @SerialName("delivery_days") val deliveryDays: Int = 7,
    val status: String = "submitted",
    @SerialName("created_at") val createdAt: String? = null,
    val profiles: GigProposalProfileDto? = null,
) {
    /** The freelancer's public card, whichever shape the server sent. Never null. */
    val freelancer: GigProposalProfileDto
        get() = profiles ?: GigProposalProfileDto(
            uid = freelancerUid,
            username = username,
            displayName = displayName,
            avatarUrl = avatarUrl,
            verified = verified,
        )
}

@Serializable
data class ProjectMediaAssetDto(
    val url: String = "",
    @SerialName("thumb_url") val thumbUrl: String = "",
    val width: Int? = null,
    val height: Int? = null,
)

@Serializable
data class ProjectMediaJoinDto(
    @SerialName("media_id") val mediaId: String = "",
    val position: Int = 0,
    @SerialName("alt_text") val altText: String = "",
    @SerialName("media_assets") val mediaAssets: ProjectMediaAssetDto? = null,
)

@Serializable
data class ProjectDto(
    val id: String = "",
    val slug: String = "",
    val name: String = "",
    val tagline: String = "",
    val description: String = "",
    @SerialName("repo_url") val repoUrl: String = "",
    @SerialName("demo_url") val demoUrl: String = "",
    @SerialName("cover_url") val coverUrl: String = "",
    val tech: List<String> = emptyList(),
    val license: String = "MIT",
    @SerialName("looking_for_contributors") val lookingForContributors: Boolean = false,
    @SerialName("owner_uid") val ownerUid: String = "",
    @SerialName("stars_count") val starsCount: Int = 0,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("project_media") val projectMedia: List<ProjectMediaJoinDto>? = null,
)

@Serializable
data class ProjectStarRowDto(
    @SerialName("project_id") val projectId: String = "",
)

@Serializable
data class ApplicationProfileDto(
    val uid: String = "",
    val username: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val verified: Boolean = false,
    val bio: String = "",
)

/** One application on the signed-in poster's job, as the employer's review queue reads it. */
@Serializable
data class JobApplicationDto(
    val id: String = "",
    @SerialName("job_id") val jobId: String = "",
    @SerialName("applicant_uid") val applicantUid: String = "",
    // Flat columns from `job_application_queue()` (migration 0126).
    @SerialName("applicant_name") val applicantName: String = "",
    val username: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val verified: Boolean = false,
    val phone: String = "",
    val email: String = "",
    val location: String = "",
    @SerialName("years_experience") val yearsExperience: Int? = null,
    val education: String = "",
    @SerialName("expected_salary_poisha") val expectedSalaryPoisha: Long? = null,
    @SerialName("portfolio_url") val portfolioUrl: String = "",
    @SerialName("linkedin_url") val linkedinUrl: String = "",
    @SerialName("notice_period") val noticePeriod: String = "",
    val skills: List<String> = emptyList(),
    @SerialName("certification_image_urls") val certificationImageUrls: List<String> = emptyList(),
    @SerialName("cover_letter") val coverLetter: String = "",
    @SerialName("resume_url") val resumeUrl: String = "",
    @SerialName("rejection_reason") val rejectionReason: String = "",
    val status: String = "submitted",
    @SerialName("decided_at") val decidedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    // Older embedded shape, still accepted so a cached payload deserialises.
    @SerialName("profiles:applicant_uid") val applicant: ApplicationProfileDto? = null,
) {
    /** The applicant's public card, whichever shape the server sent. Never null. */
    val applicantCard: ApplicationProfileDto
        get() = applicant ?: ApplicationProfileDto(
            uid = applicantUid,
            username = username,
            displayName = displayName,
            avatarUrl = avatarUrl,
            verified = verified,
        )
}

/** Contact-free response for the signed-in applicant's private tracker. */
@Serializable
data class MyJobApplicationDto(
    val id: String = "",
    @SerialName("job_id") val jobId: String = "",
    @SerialName("job_slug") val jobSlug: String = "",
    @SerialName("job_title") val jobTitle: String = "",
    val company: String = "",
    @SerialName("job_status") val jobStatus: String = "",
    @SerialName("expires_at") val expiresAt: String? = null,
    @SerialName("applicant_name") val applicantName: String = "",
    @SerialName("cover_letter") val coverLetter: String = "",
    @SerialName("resume_url") val resumeUrl: String = "",
    @SerialName("portfolio_url") val portfolioUrl: String = "",
    @SerialName("linkedin_url") val linkedinUrl: String = "",
    val location: String = "",
    @SerialName("years_experience") val yearsExperience: Int? = null,
    val education: String = "",
    @SerialName("expected_salary_poisha") val expectedSalaryPoisha: Long? = null,
    @SerialName("notice_period") val noticePeriod: String = "",
    val skills: List<String> = emptyList(),
    @SerialName("certification_image_urls") val certificationImageUrls: List<String> = emptyList(),
    val status: String = "submitted",
    @SerialName("rejection_reason") val rejectionReason: String = "",
    @SerialName("decided_at") val decidedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

/** A saved opportunity, kept on the device so the shelf survives a cold start offline. */
@Serializable
data class SavedOpportunityDto(
    val kind: String = "gig",
    val id: String = "",
    val slug: String = "",
    val title: String = "",
    val subtitle: String = "",
    val savedAtEpochMs: Long = 0L,
)

@Serializable
data class CourseCatalogDto(
    val id: String,
    val slug: String,
    val title: String,
    val summary: String = "",
    @SerialName("cover_url") val coverUrl: String = "",
    val level: String = "beginner",
    val language: String = "bn",
    val tags: List<String> = emptyList(),
    @SerialName("duration_minutes") val durationMinutes: Int = 0,
    @SerialName("lesson_count") val lessonCount: Int = 0,
    @SerialName("enrolled_count") val enrolledCount: Int = 0,
    @SerialName("my_progress") val myProgress: Int? = null,
    @SerialName("my_status") val myStatus: String? = null,
    @SerialName("has_certificate") val hasCertificate: Boolean = false,
)

@Serializable
data class CourseOutlineRowDto(
    @SerialName("lesson_id") val lessonId: String,
    @SerialName("lesson_slug") val lessonSlug: String = "",
    val title: String,
    val kind: String = "article",
    @SerialName("duration_minutes") val durationMinutes: Int = 5,
    val position: Int = 0,
    @SerialName("module_title") val moduleTitle: String = "",
    @SerialName("is_preview") val isPreview: Boolean = false,
    val body: String = "",
    val completed: Boolean = false,
)

@Serializable
data class CourseMetaRowDto(
    val id: String,
    val slug: String,
    val title: String,
)

@Serializable
data class QuizHeaderRowDto(
    val id: String,
    @SerialName("course_id") val courseId: String,
    @SerialName("max_attempts") val maxAttempts: Int = 3,
)

@Serializable
data class QuizPaperRowDto(
    @SerialName("question_id") val questionId: String,
    val prompt: String,
    val kind: String = "single",
    val marks: Int = 1,
    val position: Int = 0,
    @SerialName("option_id") val optionId: String,
    val label: String,
    @SerialName("option_position") val optionPosition: Int = 0,
)

data class QuizOptionUi(val id: String, val label: String)

data class QuizQuestionUi(
    val id: String,
    val prompt: String,
    val marks: Int,
    val options: List<QuizOptionUi>,
)

@Serializable
data class GradeResultDto(
    val score: Int = 0,
    @SerialName("earned_marks") val earnedMarks: Int = 0,
    @SerialName("total_marks") val totalMarks: Int = 0,
    val passed: Boolean = false,
    @SerialName("certificate_code") val certificateCode: String? = null,
)

@Serializable
data class FollowSuggestionDto(
    val uid: String,
    val username: String = "",
    @SerialName("display_name") val displayName: String = "",
    @SerialName("avatar_url") val avatarUrl: String = "",
    val bio: String = "",
    val location: String = "",
    @SerialName("followers_count") val followersCount: Int = 0,
    @SerialName("mutual_count") val mutualCount: Int = 0,
    @SerialName("shared_skills") val sharedSkills: List<String> = emptyList(),
    val reason: String = "active",
)

/** One group in full, from the groups table. Text columns can be null, so they are nullable. */
@Serializable
data class GroupDetailDto(
    val id: String,
    val slug: String,
    val name: String,
    val description: String? = null,
    val privacy: String = "public",
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("cover_url") val coverUrl: String? = null,
    val rules: String? = null,
    val language: String? = null,
    @SerialName("owner_uid") val ownerUid: String? = null,
    @SerialName("members_count") val membersCount: Int = 0,
    @SerialName("posts_count") val postsCount: Int = 0,
    @SerialName("is_archived") val isArchived: Boolean = false,
    @SerialName("created_at") val createdAt: String? = null,
)

/** The viewer's standing in one group: their role when a member, otherwise any pending request. */
data class GroupViewerState(val role: String?, val requestStatus: String?)

@Serializable
data class GroupMembershipDto(val role: String? = null)

@Serializable
data class GroupRequestDto(val status: String? = null)

@Serializable
data class GroupChannelDto(
    val id: String,
    /** The room's address, so the card can open `/g/{group}/c/{slug}`. Empty when the row predates it. */
    val slug: String = "",
    val name: String,
    val topic: String? = null,
    val position: Int = 0,
    @SerialName("is_read_only") val isReadOnly: Boolean = false,
)

@Serializable
data class GroupMemberProfileDto(
    val username: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
)

@Serializable
data class GroupMemberDto(
    val uid: String,
    val role: String = "member",
    @SerialName("joined_at") val joinedAt: String? = null,
    val profiles: GroupMemberProfileDto? = null,
)

/** Just the viewer's role on `group_members`, asked on its own rather than as part of a group. */
@Serializable
data class GroupRoleRowDto(
    val role: String = "member",
)
