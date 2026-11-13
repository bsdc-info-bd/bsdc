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
    @SerialName("applications_count") val applicationsCount: Int = 0,
    @SerialName("published_at") val publishedAt: String? = null,
    @SerialName("my_status") val myStatus: String? = null,
)

@Serializable
data class GigDto(
    val id: String,
    val slug: String,
    val title: String,
    val description: String = "",
    @SerialName("budget_min") val budgetMin: Int = 0,
    @SerialName("budget_max") val budgetMax: Int = 0,
    val currency: String = "BDT",
    @SerialName("is_hourly") val isHourly: Boolean = false,
    @SerialName("duration_days") val durationDays: Int = 7,
    val skills: List<String> = emptyList(),
    @SerialName("proposals_count") val proposalsCount: Int = 0,
    @SerialName("client_uid") val clientUid: String = "",
    val status: String = "open",
)

@Serializable
data class ProjectDto(
    val id: String,
    val slug: String,
    val name: String,
    val tagline: String = "",
    val description: String = "",
    @SerialName("repo_url") val repoUrl: String = "",
    @SerialName("demo_url") val demoUrl: String = "",
    @SerialName("cover_url") val coverUrl: String = "",
    val tech: List<String> = emptyList(),
    val license: String = "MIT",
    @SerialName("looking_for_contributors") val lookingForContributors: Boolean = false,
    @SerialName("stars_count") val starsCount: Int = 0,
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
