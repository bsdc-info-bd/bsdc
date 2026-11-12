package bd.info.bsdc.app.feature.discover

import bd.info.bsdc.app.core.database.BsdcDatabase
import bd.info.bsdc.app.core.database.SavedSearchEntity
import bd.info.bsdc.app.core.media.ImgbbUrlAllowlist
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.FeedPost
import bd.info.bsdc.app.core.model.MemberProfile
import bd.info.bsdc.app.core.model.PollOptionModel
import bd.info.bsdc.app.core.model.PostAuthorSummary
import bd.info.bsdc.app.core.model.PostKind
import bd.info.bsdc.app.core.model.PostMediaModel
import bd.info.bsdc.app.core.network.BsdcPlatformApi
import bd.info.bsdc.app.core.network.ProfileRowCoercer
import bd.info.bsdc.app.core.network.ProfileRowDto
import bd.info.bsdc.app.core.network.SupabaseRestClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
private data class MemberPostAuthorDto(
    val uid: String = "",
    val username: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
)

@Serializable
private data class MemberPostTagDto(
    @SerialName("tag_slug") val tagSlug: String = "",
)

@Serializable
private data class MemberMediaAssetDto(
    val url: String = "",
    @SerialName("thumb_url") val thumbUrl: String = "",
    val width: Int? = null,
    val height: Int? = null,
)

@Serializable
private data class MemberPostMediaDto(
    @SerialName("media_id") val mediaId: String = "",
    val position: Int = 0,
    @SerialName("alt_text") val altText: String = "",
    @SerialName("media_assets") val mediaAssets: MemberMediaAssetDto? = null,
)

@Serializable
private data class MemberPollOptionDto(
    val id: String = "",
    val label: String = "",
    val votes: Int = 0,
    val position: Int = 0,
)

@Serializable
private data class MemberPostJoinedDto(
    val id: String = "",
    val slug: String = "",
    val kind: String = "post",
    val title: String = "",
    val body: String = "",
    val excerpt: String = "",
    @SerialName("cover_url") val coverUrl: String = "",
    val code: String = "",
    @SerialName("code_language") val codeLanguage: String = "",
    val language: String = "bn",
    @SerialName("reading_time") val readingTime: Int = 1,
    @SerialName("views_count") val viewsCount: Int = 0,
    @SerialName("likes_count") val likesCount: Int = 0,
    @SerialName("comments_count") val commentsCount: Int = 0,
    @SerialName("is_sensitive") val isSensitive: Boolean = false,
    @SerialName("allow_comments") val allowComments: Boolean = true,
    @SerialName("published_at") val publishedAt: String? = null,
    @SerialName("created_at") val createdAt: String = "",
    val profiles: MemberPostAuthorDto? = null,
    @SerialName("post_tags") val postTags: List<MemberPostTagDto>? = null,
    @SerialName("post_media") val postMedia: List<MemberPostMediaDto>? = null,
    @SerialName("poll_options") val pollOptions: List<MemberPollOptionDto>? = null,
)

class DiscoverRepository(
    private val supabase: SupabaseRestClient,
    private val platformApi: BsdcPlatformApi,
    private val database: BsdcDatabase,
) {
    fun observeRecentSearches(): Flow<List<SavedSearchEntity>> =
        database.savedSearchDao().observeRecent()

    suspend fun clearRecentSearches() = withContext(Dispatchers.IO) {
        database.savedSearchDao().deleteAll()
    }

    suspend fun resolveCityFromCoords(
        latitude: Double,
        longitude: Double,
        language: AppLanguage,
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            platformApi.reverseGeocode(latitude, longitude, language).place
        }
    }

    // ---- Search ----

    suspend fun globalSearch(
        rawQuery: String,
        kinds: List<String> = emptyList(),
        isVoice: Boolean = false,
        limit: Int = 40,
    ): Result<List<SearchResultDto>> = withContext(Dispatchers.IO) {
        val query = DiscoverSearchEngine.sanitizeSearchQuery(rawQuery)
        if (query.isEmpty()) return@withContext Result.success(emptyList())
        runCatching {
            val params = buildJsonObject {
                put("p_query", query)
                if (kinds.isEmpty()) {
                    put("p_kinds", JsonNull)
                } else {
                    put("p_kinds", buildJsonArray { kinds.forEach { add(JsonPrimitive(it)) } })
                }
                put("p_limit", limit)
            }
            val raw = supabase.rpcText("global_search", params = params, requireAuth = false)
            val rows = supabase.decode<List<SearchResultDto>>(raw)
            database.savedSearchDao().upsert(
                SavedSearchEntity(
                    query = query,
                    isVoiceQuery = isVoice,
                    searchedAtEpochMs = System.currentTimeMillis(),
                ),
            )
            runCatching {
                supabase.rpcText(
                    "log_search",
                    params = buildJsonObject {
                        put("p_term", query)
                        put("p_results", rows.size)
                    },
                    requireAuth = false,
                )
            }
            rows
        }
    }

    suspend fun fetchSuggestions(prefix: String): Result<List<SearchSuggestionDto>> = withContext(Dispatchers.IO) {
        val clean = DiscoverSearchEngine.sanitizeSearchQuery(prefix)
        if (clean.length < 2) return@withContext Result.success(emptyList())
        runCatching {
            val raw = supabase.rpcText(
                "search_suggestions",
                params = buildJsonObject {
                    put("p_prefix", clean)
                    put("p_limit", 8)
                },
                requireAuth = false,
            )
            supabase.decode<List<SearchSuggestionDto>>(raw)
        }
    }

    suspend fun fetchTrending(): Result<List<TrendingSearchDto>> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "trending_searches",
                params = buildJsonObject { put("p_limit", 8) },
                requireAuth = false,
            )
            supabase.decode<List<TrendingSearchDto>>(raw)
        }
    }

    // ---- Groups & Events ----

    suspend fun fetchGroups(limit: Int = 40): Result<List<GroupDirectoryDto>> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "group_directory",
                params = buildJsonObject { put("p_limit", limit) },
                requireAuth = false,
            )
            supabase.decode<List<GroupDirectoryDto>>(raw)
        }
    }

    suspend fun joinGroup(groupId: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "join_group",
                params = buildJsonObject {
                    put("p_group_id", groupId)
                    put("p_message", "")
                },
                requireAuth = true,
            )
            runCatching { supabase.decode<String>(raw) }.getOrDefault(raw.trim('"'))
        }
    }

    suspend fun leaveGroup(groupId: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "leave_group",
                params = buildJsonObject { put("p_group_id", groupId) },
                requireAuth = true,
            )
            Unit
        }
    }

    suspend fun fetchEvents(limit: Int = 40): Result<List<EventCalendarDto>> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "event_calendar",
                params = buildJsonObject { put("p_limit", limit) },
                requireAuth = false,
            )
            supabase.decode<List<EventCalendarDto>>(raw)
        }
    }

    suspend fun rsvpEvent(eventId: String, status: String): Result<Int> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "rsvp_event",
                params = buildJsonObject {
                    put("p_event_id", eventId)
                    put("p_status", status)
                },
                requireAuth = true,
            )
            raw.trim().toIntOrNull() ?: 0
        }
    }

    // ---- Jobs, Gigs & Projects ----

    suspend fun fetchJobs(workMode: String? = null, limit: Int = 50): Result<List<JobBoardDto>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.rpcText(
                    "job_board",
                    params = buildJsonObject {
                        put("p_limit", limit)
                        if (workMode.isNullOrBlank()) put("p_work_mode", JsonNull) else put("p_work_mode", workMode)
                        put("p_skill", JsonNull)
                    },
                    requireAuth = false,
                )
                supabase.decode<List<JobBoardDto>>(raw)
            }
        }

    suspend fun applyToJob(jobId: String, coverLetter: String, resumeUrl: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                supabase.rpcText(
                    "apply_to_job",
                    params = buildJsonObject {
                        put("p_job_id", jobId)
                        put("p_cover_letter", coverLetter.trim())
                        put("p_resume_url", resumeUrl.trim())
                    },
                    requireAuth = true,
                )
                Unit
            }
        }

    suspend fun fetchGigs(limit: Int = 40): Result<List<GigDto>> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.getJsonText(
                table = "gigs",
                queryPairs = listOf(
                    "status" to "eq.open",
                    "order" to "published_at.desc.nullslast",
                    "limit" to limit.toString(),
                ),
                requireAuth = false,
            )
            supabase.decode<List<GigDto>>(raw)
        }
    }

    suspend fun submitProposal(
        gigId: String,
        pitch: String,
        bidAmount: Int,
        deliveryDays: Int,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "submit_proposal",
                params = buildJsonObject {
                    put("p_gig_id", gigId)
                    put("p_pitch", pitch.trim())
                    put("p_bid_amount", bidAmount)
                    put("p_delivery_days", deliveryDays)
                },
                requireAuth = true,
            )
            Unit
        }
    }

    suspend fun fetchProjects(limit: Int = 40): Result<List<ProjectDto>> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.getJsonText(
                table = "projects",
                queryPairs = listOf(
                    "order" to "stars_count.desc",
                    "limit" to limit.toString(),
                ),
                requireAuth = false,
            )
            supabase.decode<List<ProjectDto>>(raw)
        }
    }

    suspend fun toggleProjectStar(projectId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "toggle_project_star",
                params = buildJsonObject { put("p_project_id", projectId) },
                requireAuth = true,
            )
            raw.trim().equals("true", ignoreCase = true)
        }
    }

    // ---- Learning (Courses & Quizzes) ----

    suspend fun fetchCourses(level: String? = null, limit: Int = 40): Result<List<CourseCatalogDto>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.rpcText(
                    "course_catalog",
                    params = buildJsonObject {
                        put("p_limit", limit)
                        if (level.isNullOrBlank()) put("p_level", JsonNull) else put("p_level", level)
                        put("p_tag", JsonNull)
                    },
                    requireAuth = false,
                )
                supabase.decode<List<CourseCatalogDto>>(raw)
            }
        }

    suspend fun fetchCourseOutline(slug: String): Result<List<CourseOutlineRowDto>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.rpcText(
                    "course_outline",
                    params = buildJsonObject { put("p_slug", slug) },
                    requireAuth = false,
                )
                supabase.decode<List<CourseOutlineRowDto>>(raw)
            }
        }

    suspend fun fetchCourseQuizId(courseId: String): String? = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.getJsonText(
                table = "quizzes",
                queryPairs = listOf(
                    "course_id" to "eq.$courseId",
                    "order" to "created_at.asc",
                    "limit" to "1",
                ),
                requireAuth = false,
            )
            supabase.decode<List<QuizHeaderRowDto>>(raw).firstOrNull()?.id
        }.getOrNull()
    }

    suspend fun enrollInCourse(courseId: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "enroll_in_course",
                params = buildJsonObject { put("p_course_id", courseId) },
                requireAuth = true,
            )
            Unit
        }
    }

    suspend fun completeLesson(lessonId: String): Result<Int> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "complete_lesson",
                params = buildJsonObject {
                    put("p_lesson_id", lessonId)
                    put("p_seconds", 60)
                },
                requireAuth = true,
            )
            raw.trim().toIntOrNull() ?: 0
        }
    }

    suspend fun fetchQuizPaper(quizId: String): Result<List<QuizQuestionUi>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.rpcText(
                    "quiz_paper",
                    params = buildJsonObject { put("p_quiz_id", quizId) },
                    requireAuth = true,
                )
                val rows = supabase.decode<List<QuizPaperRowDto>>(raw)
                val grouped = LinkedHashMap<String, QuizQuestionUi>()
                for (row in rows) {
                    val existing = grouped[row.questionId]
                    if (existing == null) {
                        grouped[row.questionId] = QuizQuestionUi(
                            id = row.questionId,
                            prompt = row.prompt,
                            marks = row.marks,
                            options = listOf(QuizOptionUi(row.optionId, row.label)),
                        )
                    } else {
                        grouped[row.questionId] = existing.copy(
                            options = existing.options + QuizOptionUi(row.optionId, row.label),
                        )
                    }
                }
                grouped.values.toList()
            }
        }

    suspend fun gradeQuiz(quizId: String, answers: Map<String, String>): Result<GradeResultDto> =
        withContext(Dispatchers.IO) {
            runCatching {
                val answersJson = buildJsonObject {
                    answers.forEach { (qId, optId) -> put(qId, JsonPrimitive(optId)) }
                }
                val raw = supabase.rpcText(
                    "grade_quiz_attempt",
                    params = buildJsonObject {
                        put("p_quiz_id", quizId)
                        put("p_answers", answersJson)
                    },
                    requireAuth = true,
                )
                supabase.decode<List<GradeResultDto>>(raw).firstOrNull() ?: GradeResultDto()
            }
        }

    // ---- People & Profiles ----

    suspend fun fetchFollowSuggestions(limit: Int = 18): Result<List<FollowSuggestionDto>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.rpcText(
                    "follow_suggestions",
                    params = buildJsonObject { put("p_limit", limit) },
                    requireAuth = true,
                )
                supabase.decode<List<FollowSuggestionDto>>(raw)
            }
        }

    suspend fun fetchProfileByUsername(username: String): Result<MemberProfile?> =
        withContext(Dispatchers.IO) {
            runCatching {
                val clean = username.trim().removePrefix("@").lowercase()
                val raw = supabase.getJsonText(
                    table = "profiles",
                    queryPairs = listOf("username" to "eq.$clean", "limit" to "1"),
                    requireAuth = false,
                )
                supabase.decode<List<ProfileRowDto>>(raw).firstOrNull()?.let { ProfileRowCoercer.coerce(it) }
            }
        }

    suspend fun fetchProfileByUid(uid: String): Result<MemberProfile?> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.getJsonText(
                    table = "profiles",
                    queryPairs = listOf("uid" to "eq.$uid", "limit" to "1"),
                    requireAuth = false,
                )
                supabase.decode<List<ProfileRowDto>>(raw).firstOrNull()?.let { ProfileRowCoercer.coerce(it) }
            }
        }

    suspend fun fetchMemberPosts(uid: String, limit: Int = 20): Result<List<FeedPost>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.getJsonText(
                    table = "posts",
                    queryPairs = listOf(
                        "select" to "*,profiles:author_uid(uid,username,display_name,avatar_url),post_tags(tag_slug),poll_options(id,label,votes,position),post_media(media_id,position,alt_text,media_assets(url,thumb_url,width,height))",
                        "author_uid" to "eq.$uid",
                        "status" to "eq.published",
                        "deleted_at" to "is.null",
                        "order" to "published_at.desc.nullslast",
                        "limit" to limit.toString(),
                    ),
                    requireAuth = false,
                )
                supabase.decode<List<MemberPostJoinedDto>>(raw)
                    .filter { it.id.isNotBlank() }
                    .map { dto ->
                        val kind = PostKind.entries.firstOrNull {
                            it.name.equals(dto.kind, ignoreCase = true)
                        } ?: PostKind.POST
                        val media = dto.postMedia.orEmpty()
                            .sortedBy { it.position }
                            .mapNotNull { item ->
                                val url = ImgbbUrlAllowlist.normalizeImageUrl(item.mediaAssets?.url.orEmpty())
                                if (url.isEmpty()) return@mapNotNull null
                                val thumb = ImgbbUrlAllowlist.normalizeImageUrl(item.mediaAssets?.thumbUrl.orEmpty()).ifEmpty { url }
                                PostMediaModel(
                                    mediaId = item.mediaId,
                                    url = url,
                                    thumbUrl = thumb,
                                    altText = item.altText,
                                    position = item.position,
                                    width = item.mediaAssets?.width,
                                    height = item.mediaAssets?.height,
                                )
                            }
                        FeedPost(
                            id = dto.id,
                            slug = dto.slug,
                            kind = kind,
                            title = dto.title,
                            body = dto.body,
                            excerpt = dto.excerpt,
                            coverUrl = ImgbbUrlAllowlist.normalizeImageUrl(dto.coverUrl),
                            code = dto.code,
                            codeLanguage = dto.codeLanguage,
                            language = if (dto.language == "en") AppLanguage.EN else AppLanguage.BN,
                            readingTime = dto.readingTime.coerceAtLeast(1),
                            views = dto.viewsCount.coerceAtLeast(0),
                            likes = dto.likesCount.coerceAtLeast(0),
                            comments = dto.commentsCount.coerceAtLeast(0),
                            isSensitive = dto.isSensitive,
                            allowComments = dto.allowComments,
                            publishedAt = dto.publishedAt.orEmpty(),
                            createdAt = dto.createdAt,
                            author = dto.profiles?.takeIf { it.uid.isNotBlank() }?.let { prof ->
                                PostAuthorSummary(
                                    uid = prof.uid,
                                    username = prof.username.orEmpty(),
                                    displayName = prof.displayName?.ifBlank { "Member" } ?: "Member",
                                    avatarUrl = prof.avatarUrl.orEmpty(),
                                )
                            },
                            tags = dto.postTags.orEmpty().map { it.tagSlug }.filter { it.isNotBlank() },
                            media = media,
                            poll = dto.pollOptions.orEmpty().sortedBy { it.position }.map { opt ->
                                PollOptionModel(opt.id, opt.label, opt.votes.coerceAtLeast(0), opt.position)
                            },
                        )
                    }
            }
        }

    suspend fun updateOwnProfile(
        uid: String,
        displayName: String,
        bio: String,
        location: String,
        website: String,
        skills: List<String>,
        interests: List<String>? = null,
        avatarUrl: String? = null,
        coverUrl: String? = null,
        language: AppLanguage? = null,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val safeWeb = DiscoverSearchEngine.safeHttpUrlOrEmpty(website)
            val body = buildJsonObject {
                put("display_name", displayName.trim().take(60))
                put("bio", bio.trim().take(280))
                put("location", location.trim().take(80))
                put("website", safeWeb)
                put("skills", buildJsonArray { skills.take(15).forEach { add(JsonPrimitive(it.trim())) } })
                if (interests != null) {
                    put("interests", buildJsonArray { interests.take(15).forEach { add(JsonPrimitive(it.trim())) } })
                }
                if (avatarUrl != null) {
                    put("avatar_url", ImgbbUrlAllowlist.normalizeImageUrl(avatarUrl))
                }
                if (coverUrl != null) {
                    put("cover_url", ImgbbUrlAllowlist.normalizeImageUrl(coverUrl))
                }
                if (language != null) {
                    put("language", language.tag)
                }
            }
            supabase.patchJson(
                table = "profiles",
                body = body,
                queryPairs = listOf("uid" to "eq.$uid"),
            )
            Unit
        }
    }

    suspend fun updateProfilePhoto(
        uid: String,
        avatarUrl: String? = null,
        coverUrl: String? = null,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val body = buildJsonObject {
                if (avatarUrl != null) {
                    put("avatar_url", ImgbbUrlAllowlist.normalizeImageUrl(avatarUrl))
                }
                if (coverUrl != null) {
                    put("cover_url", ImgbbUrlAllowlist.normalizeImageUrl(coverUrl))
                }
            }
            supabase.patchJson(
                table = "profiles",
                body = body,
                queryPairs = listOf("uid" to "eq.$uid"),
            )
            Unit
        }
    }

    suspend fun isFollowing(followerUid: String, followeeUid: String): Boolean =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.getJsonText(
                    table = "follows",
                    queryPairs = listOf(
                        "select" to "follower_uid",
                        "follower_uid" to "eq.$followerUid",
                        "followee_uid" to "eq.$followeeUid",
                        "limit" to "1",
                    ),
                    requireAuth = true,
                )
                supabase.decode<List<JsonObject>>(raw).isNotEmpty()
            }.getOrDefault(false)
        }

    suspend fun toggleFollow(followerUid: String, followeeUid: String, currentlyFollowing: Boolean): Result<Boolean> =
        withContext(Dispatchers.IO) {
            runCatching {
                if (currentlyFollowing) {
                    supabase.deleteRows(
                        table = "follows",
                        queryPairs = listOf(
                            "follower_uid" to "eq.$followerUid",
                            "followee_uid" to "eq.$followeeUid",
                        ),
                    )
                    false
                } else {
                    supabase.postJson(
                        table = "follows",
                        body = buildJsonObject {
                            put("follower_uid", followerUid)
                            put("followee_uid", followeeUid)
                        },
                        prefer = "resolution=ignore-duplicates,return=minimal",
                        requireAuth = true,
                    )
                    true
                }
            }
        }

    suspend fun blockMember(blockerUid: String, blockedUid: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                supabase.postJson(
                    table = "blocks",
                    body = buildJsonObject {
                        put("blocker_uid", blockerUid)
                        put("blocked_uid", blockedUid)
                    },
                    prefer = "resolution=ignore-duplicates,return=minimal",
                    requireAuth = true,
                )
                Unit
            }
        }
}
