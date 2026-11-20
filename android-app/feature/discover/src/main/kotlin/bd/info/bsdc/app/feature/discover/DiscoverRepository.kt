package bd.info.bsdc.app.feature.discover

import bd.info.bsdc.app.core.database.BsdcDatabase
import bd.info.bsdc.app.core.database.SavedOpportunityEntity
import bd.info.bsdc.app.core.database.SavedSearchEntity
import bd.info.bsdc.app.core.media.ImgbbUrlAllowlist
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.FeedPost
import bd.info.bsdc.app.core.model.MemberProfile
import bd.info.bsdc.app.core.model.PollOptionModel
import bd.info.bsdc.app.core.model.PostAuthorSummary
import bd.info.bsdc.app.core.model.PostKind
import bd.info.bsdc.app.core.model.PostMediaModel
import bd.info.bsdc.app.core.model.PrivacyPrefs
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
import kotlinx.serialization.json.JsonObjectBuilder
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
    val restClient: SupabaseRestClient get() = supabase

    fun observeRecentSearches(): Flow<List<SavedSearchEntity>> =
        database.savedSearchDao().observeRecent()

    suspend fun clearRecentSearches() = withContext(Dispatchers.IO) {
        database.savedSearchDao().deleteAll()
    }

    // ---- Saved opportunities (gigs, jobs, projects, events) ----

    /** Every opportunity the member has kept, newest first, as a live shelf. */
    fun observeSavedOpportunities(kind: String? = null): Flow<List<SavedOpportunityEntity>> =
        if (kind.isNullOrBlank()) {
            database.savedOpportunityDao().observeAll()
        } else {
            database.savedOpportunityDao().observeKind(kind)
        }

    /**
     * Whether this exact opportunity is already on the shelf. A `Result` rather than a plain
     * `Boolean` so a caller can tell "not saved" apart from "the lookup failed", and so the
     * three detail screens can drive a bookmark from one `isSuccess`/`getOrDefault` path.
     */
    suspend fun isOpportunitySaved(kind: String, remoteId: String): Result<Boolean> =
        withContext(Dispatchers.IO) {
            runCatching { database.savedOpportunityDao().contains(savedKey(kind, remoteId)) }
        }

    /**
     * Adds or removes one opportunity from the shelf. The key is `kind:id`, so the same gig
     * cannot be saved twice and a tap always toggles what the button shows.
     */
    suspend fun toggleSavedOpportunity(
        kind: String,
        remoteId: String,
        slug: String,
        title: String,
        subtitle: String,
        nowMillis: Long,
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            val key = savedKey(kind, remoteId)
            val dao = database.savedOpportunityDao()
            if (dao.contains(key)) {
                dao.delete(key)
                false
            } else {
                dao.upsert(
                    SavedOpportunityEntity(
                        key = key,
                        kind = kind,
                        remoteId = remoteId,
                        slug = slug,
                        title = title,
                        subtitle = subtitle,
                        savedAtEpochMs = nowMillis,
                    ),
                )
                true
            }
        }
    }

    suspend fun clearSavedOpportunities(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching { database.savedOpportunityDao().deleteAll() }
    }

    private fun savedKey(kind: String, remoteId: String): String =
        kind.trim().lowercase() + ":" + remoteId.trim()

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

    suspend fun fetchRichSuggestions(prefix: String, limit: Int = 10): Result<List<RichSearchSuggestionDto>> =
        withContext(Dispatchers.IO) {
            val rawInput = prefix.trim()
            val clean = DiscoverSearchEngine.sanitizeSearchQuery(rawInput)
            if (clean.removePrefix("@").length < 2) return@withContext Result.success(emptyList())
            runCatching {
                val raw = supabase.rpcText(
                    "search_suggestions_rich",
                    params = buildJsonObject {
                        put("p_prefix", if (rawInput.startsWith("@")) "@${clean.removePrefix("@")}" else clean)
                        put("p_limit", limit.coerceIn(1, 20))
                    },
                    requireAuth = false,
                )
                supabase.decode<List<RichSearchSuggestionDto>>(raw)
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

    /** One group by slug. Null when it does not exist or is hidden from this viewer. */
    suspend fun fetchGroupBySlug(slug: String): Result<GroupDetailDto?> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.getJsonText(
                table = "groups",
                queryPairs = listOf("slug" to "eq.${slug.trim()}", "limit" to "1"),
                requireAuth = false,
            )
            supabase.decode<List<GroupDetailDto>>(raw).firstOrNull()
        }
    }

    /** The viewer's role in a group, or their pending request when they are not a member. */
    suspend fun fetchGroupViewer(groupId: String, uid: String): Result<GroupViewerState> = withContext(Dispatchers.IO) {
        runCatching {
            val membership = supabase.decode<List<GroupMembershipDto>>(
                supabase.getJsonText(
                    table = "group_members",
                    queryPairs = listOf(
                        "select" to "role",
                        "group_id" to "eq.$groupId",
                        "uid" to "eq.$uid",
                        "limit" to "1",
                    ),
                    requireAuth = true,
                ),
            ).firstOrNull()?.role
            val request = if (membership == null) {
                supabase.decode<List<GroupRequestDto>>(
                    supabase.getJsonText(
                        table = "group_join_requests",
                        queryPairs = listOf(
                            "select" to "status",
                            "group_id" to "eq.$groupId",
                            "uid" to "eq.$uid",
                            "limit" to "1",
                        ),
                        requireAuth = true,
                    ),
                ).firstOrNull()?.status
            } else {
                null
            }
            GroupViewerState(role = membership, requestStatus = request)
        }
    }

    suspend fun fetchGroupChannels(groupId: String): Result<List<GroupChannelDto>> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.getJsonText(
                table = "channels",
                queryPairs = listOf(
                    "select" to "id,name,topic,position,is_read_only",
                    "group_id" to "eq.$groupId",
                    "order" to "position.asc",
                    "limit" to "100",
                ),
                requireAuth = false,
            )
            supabase.decode<List<GroupChannelDto>>(raw)
        }
    }

    suspend fun fetchGroupMembers(groupId: String): Result<List<GroupMemberDto>> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.getJsonText(
                table = "group_members",
                queryPairs = listOf(
                    "select" to "uid,role,joined_at,profiles:uid(uid,username,display_name,avatar_url)",
                    "group_id" to "eq.$groupId",
                    "limit" to "200",
                ),
                requireAuth = false,
            )
            supabase.decode<List<GroupMemberDto>>(raw)
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
            supabase.wakePushDelivery("group-join")
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

    /** One event by slug. Null when it does not exist. The join link is only sent to attendees. */
    suspend fun fetchEventDetail(slug: String): Result<EventDetailDto?> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "event_detail",
                params = buildJsonObject { put("p_slug", slug.trim()) },
                requireAuth = false,
            )
            supabase.decode<List<EventDetailDto>>(raw).firstOrNull()
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
            if (status != "declined") supabase.wakePushDelivery("event-rsvp")
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

    /** One job by slug. Null when it does not exist; my_status is filled in for a signed-in reader. */
    suspend fun fetchJobDetail(slug: String): Result<JobDetailDto?> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "job_detail",
                params = buildJsonObject { put("p_slug", slug.trim()) },
                requireAuth = false,
            )
            supabase.decode<List<JobDetailDto>>(raw).firstOrNull()
        }
    }

    suspend fun recordJobView(jobId: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "increment_job_view",
                params = buildJsonObject { put("p_job_id", jobId) },
                requireAuth = false,
            )
            Unit
        }
    }

    suspend fun applyToJob(
        jobId: String,
        submission: JobDetailLogic.ApplicationSubmission,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "apply_to_job",
                params = buildJsonObject {
                    put("p_job_id", jobId)
                    put("p_cover_letter", submission.coverLetter)
                    put("p_resume_url", submission.resumeUrl)
                    put("p_applicant_name", submission.applicantName)
                    put("p_phone", submission.phone)
                    put("p_email", submission.email)
                    put("p_location", submission.location)
                    put("p_years_experience", submission.yearsExperience?.let(::JsonPrimitive) ?: JsonNull)
                    put("p_education", submission.education)
                    put("p_expected_salary_poisha", submission.expectedSalaryPoisha?.let(::JsonPrimitive) ?: JsonNull)
                    put("p_portfolio_url", submission.portfolioUrl)
                    put("p_linkedin_url", submission.linkedinUrl)
                    put("p_notice_period", submission.noticePeriod)
                    put("p_skills", buildJsonArray { submission.skills.forEach { add(JsonPrimitive(it)) } })
                    put(
                        "p_certification_image_urls",
                        buildJsonArray { submission.certificationImageUrls.forEach { add(JsonPrimitive(it)) } },
                    )
                },
                requireAuth = true,
            )
            supabase.wakePushDelivery("job-apply")
            Unit
        }
    }

    /**
     * A signed-in applicant retracts their application on this job. The decision RPC takes an
     * application id, so the caller's own live row is read first — the read is scoped to the
     * caller's uid and `job_applications_read_parties` scopes it again in the database.
     */
    suspend fun withdrawMyJobApplication(jobId: String, applicantUid: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.getJsonText(
                    table = "job_applications",
                    queryPairs = listOf(
                        "select" to "id,status",
                        "job_id" to "eq.$jobId",
                        "applicant_uid" to "eq.$applicantUid",
                        "limit" to "1",
                    ),
                    requireAuth = true,
                )
                val applicationId = supabase.decode<List<JobApplicationDto>>(raw).firstOrNull()?.id
                    ?: error("no application to withdraw")
                supabase.rpcText(
                    "withdraw_application",
                    params = buildJsonObject { put("p_application_id", applicationId) },
                    requireAuth = true,
                )
                Unit
            }
        }

    /** A signed-in applicant retracts their own application (`withdraw_application`). */
    suspend fun withdrawApplication(applicationId: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                supabase.rpcText(
                    "withdraw_application",
                    params = buildJsonObject { put("p_application_id", applicationId) },
                    requireAuth = true,
                )
                Unit
            }
        }

    /** The employer's decision on one application: `reviewing`, `shortlisted`, `hired` or `rejected`. */
    suspend fun decideApplication(applicationId: String, status: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                supabase.rpcText(
                    "decide_application",
                    params = buildJsonObject {
                        put("p_application_id", applicationId)
                        put("p_status", status)
                    },
                    requireAuth = true,
                )
                supabase.wakePushDelivery("application-decision")
                Unit
            }
        }

    /**
     * Every application on a job the reader posted. RLS hides other members' rows.
     *
     * Same repair as [fetchGigProposalsForClient]: `profiles` has no `verified` column, so the
     * embedded select was a 400 and an employer's queue never rendered. The join now happens
     * in `job_application_queue()` (migration 0113), where `verified` is derived from `role`.
     */
    suspend fun fetchJobApplications(jobId: String): Result<List<JobApplicationDto>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.rpcText(
                    "job_application_queue",
                    params = buildJsonObject {
                        put("p_job_id", jobId)
                        put("p_limit", 100)
                    },
                    requireAuth = true,
                )
                supabase.decode<List<JobApplicationDto>>(raw)
            }
        }

    /** The signed-in member's own applications, newest first, with the job they were sent to. */
    suspend fun fetchMyApplications(applicantUid: String, limit: Int = 40): Result<List<JobApplicationDto>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.getJsonText(
                    table = "job_applications",
                    queryPairs = listOf(
                        "select" to "*,job_id",
                        "applicant_uid" to "eq.$applicantUid",
                        "order" to "created_at.desc",
                        "limit" to limit.toString(),
                    ),
                    requireAuth = true,
                )
                supabase.decode<List<JobApplicationDto>>(raw)
            }
        }

    suspend fun fetchGigs(limit: Int = 60): Result<List<GigDto>> = withContext(Dispatchers.IO) {
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

    suspend fun fetchMyGigs(clientUid: String, limit: Int = 40): Result<List<GigDto>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.getJsonText(
                    table = "gigs",
                    queryPairs = listOf(
                        "client_uid" to "eq.$clientUid",
                        "order" to "created_at.desc.nullslast",
                        "limit" to limit.toString(),
                    ),
                    requireAuth = true,
                )
                supabase.decode<List<GigDto>>(raw)
            }
        }

    /** One gig by slug or UUID. RLS allows open gigs to everyone and closed/draft to the client. */
    suspend fun fetchGigDetail(slugOrId: String): Result<GigDto?> = withContext(Dispatchers.IO) {
        runCatching {
            val clean = slugOrId.trim()
            val bySlug = supabase.getJsonText(
                table = "gigs",
                queryPairs = listOf(
                    "slug" to "eq.$clean",
                    "limit" to "1",
                ),
                requireAuth = false,
            )
            val found = supabase.decode<List<GigDto>>(bySlug).firstOrNull()
            if (found != null) {
                found
            } else {
                val byId = supabase.getJsonText(
                    table = "gigs",
                    queryPairs = listOf(
                        "id" to "eq.$clean",
                        "limit" to "1",
                    ),
                    requireAuth = false,
                )
                supabase.decode<List<GigDto>>(byId).firstOrNull()
            }
        }
    }

    /** The signed-in freelancer's own proposal on this gig, if any. */
    suspend fun fetchMyGigProposal(gigId: String, uid: String): Result<GigProposalDto?> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.getJsonText(
                    table = "gig_proposals",
                    queryPairs = listOf(
                        "select" to "*",
                        "gig_id" to "eq.$gigId",
                        "freelancer_uid" to "eq.$uid",
                        "limit" to "1",
                    ),
                    requireAuth = true,
                )
                supabase.decode<List<GigProposalDto>>(raw).firstOrNull()
            }
        }

    /** All proposals submitted on a gig owned by the signed-in client (protected by RLS). */
    /**
     * Every proposal on a gig the reader posted.
     *
     * This used to ask PostgREST for `profiles:freelancer_uid(...,verified)`. `profiles` has
     * no `verified` column — it is derived from `role` on the server — and an unknown column
     * in a `select=` list is a 400, so the whole queue failed and the client saw nothing.
     * `gig_proposal_queue()` (migration 0112) does the join and the derivation server-side,
     * behind the same "client of the gig or staff" check that guards a decision.
     */
    suspend fun fetchGigProposalsForClient(gigId: String): Result<List<GigProposalDto>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.rpcText(
                    "gig_proposal_queue",
                    params = buildJsonObject {
                        put("p_gig_id", gigId)
                        put("p_limit", 100)
                    },
                    requireAuth = true,
                )
                supabase.decode<List<GigProposalDto>>(raw)
            }
        }

    /** Retracts the signed-in freelancer's own proposal (`gig_proposals_delete_own` RLS policy). */
    suspend fun withdrawGigProposal(proposalId: String, uid: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                supabase.deleteRows(
                    table = "gig_proposals",
                    queryPairs = listOf(
                        "id" to "eq.$proposalId",
                        "freelancer_uid" to "eq.$uid",
                    ),
                )
                Unit
            }
        }

    /**
     * The gig client's decision on one proposal: `reviewing`, `shortlisted`, `hired` or
     * `rejected`. Goes through `decide_gig_proposal`, so the status column itself is never
     * writable from a client.
     */
    suspend fun decideGigProposal(proposalId: String, status: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                supabase.rpcText(
                    "decide_gig_proposal",
                    params = buildJsonObject {
                        put("p_proposal_id", proposalId)
                        put("p_status", status)
                    },
                    requireAuth = true,
                )
                supabase.wakePushDelivery("gig-proposal-decision")
                Unit
            }
        }

    /** Allows the gig client to update their gig status (`open`, `paused`, `closed`). */
    suspend fun updateGigStatus(gigId: String, clientUid: String, nextStatus: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                supabase.patchJson(
                    table = "gigs",
                    body = buildJsonObject { put("status", nextStatus) },
                    queryPairs = listOf(
                        "id" to "eq.$gigId",
                        "client_uid" to "eq.$clientUid",
                    ),
                )
                Unit
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
            supabase.wakePushDelivery("gig-proposal")
            Unit
        }
    }

    suspend fun fetchProjects(sort: String = "popular", limit: Int = 50): Result<List<ProjectDto>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val orderClause = if (sort == "recent") {
                    "created_at.desc"
                } else {
                    "stars_count.desc,created_at.desc"
                }
                val raw = supabase.getJsonText(
                    table = "projects",
                    queryPairs = listOf(
                        "order" to orderClause,
                        "limit" to limit.toString(),
                    ),
                    requireAuth = false,
                )
                supabase.decode<List<ProjectDto>>(raw)
            }
        }

    /** One project by its slug, including attached gallery screenshots. */
    suspend fun fetchProject(slug: String): Result<ProjectDto?> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.getJsonText(
                table = "projects",
                queryPairs = listOf(
                    "select" to "*,project_media(media_id,position,alt_text,media_assets(url,thumb_url,width,height))",
                    "slug" to "eq.${slug.trim()}",
                    "limit" to "1",
                ),
                requireAuth = false,
            )
            supabase.decode<List<ProjectDto>>(raw).firstOrNull()
        }
    }

    /** Whether this viewer has starred the project. Reads only the viewer's own star rows. */
    suspend fun fetchViewerStarred(projectId: String, viewerUid: String): Result<Boolean> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.getJsonText(
                    table = "project_stars",
                    queryPairs = listOf(
                        "select" to "project_id",
                        "project_id" to "eq.$projectId",
                        "uid" to "eq.$viewerUid",
                        "limit" to "1",
                    ),
                    requireAuth = true,
                )
                supabase.decode<List<ProjectStarRowDto>>(raw).isNotEmpty()
            }
        }

    suspend fun toggleProjectStar(projectId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "toggle_project_star",
                params = buildJsonObject { put("p_project_id", projectId) },
                requireAuth = true,
            )
            val starred = raw.trim().equals("true", ignoreCase = true)
            if (starred) supabase.wakePushDelivery("project-star")
            starred
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
                    supabase.wakePushDelivery("follow")
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

    suspend fun fetchFollowers(uid: String, limit: Int = 30, offset: Int = 0): Result<List<SocialProfileItemDto>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.rpcText(
                    "profile_followers",
                    params = buildJsonObject {
                        put("p_uid", uid)
                        put("p_limit", limit.coerceIn(1, 60))
                        put("p_offset", offset.coerceAtLeast(0))
                    },
                    requireAuth = false,
                )
                supabase.decode<List<SocialProfileItemDto>>(raw)
            }
        }

    suspend fun fetchFollowing(uid: String, limit: Int = 30, offset: Int = 0): Result<List<SocialProfileItemDto>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.rpcText(
                    "profile_following",
                    params = buildJsonObject {
                        put("p_uid", uid)
                        put("p_limit", limit.coerceIn(1, 60))
                        put("p_offset", offset.coerceAtLeast(0))
                    },
                    requireAuth = false,
                )
                supabase.decode<List<SocialProfileItemDto>>(raw)
            }
        }

    suspend fun updatePrivacyPrefs(uid: String, privacy: PrivacyPrefs): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                platformApi.updatePrivacyPrefs(uid, privacy)
            }
        }

    // ---- Correcting and ending a listing (migration 0128) ----
    //
    // Every routine here decides who may write. The app never asks the database whether the
    // reader is the owner before offering a control; it works that out from the row it already
    // has (`OwnerActionsLogic`) and sends the write anyway — a refusal arrives as a `Result`
    // failure and the screen shows it, rather than the app inventing a permission rule of its
    // own that could drift from the one the SQL enforces.

    /**
     * Corrects a gig. Every field is sent, because the routine treats a JSON null as "leave
     * this column alone" and an empty string as "clear it" — which is how a cover is removed.
     * Returns the gig's slug, which changes only when a new one is passed.
     */
    suspend fun updateGig(
        gigId: String,
        title: String,
        description: String,
        budgetMin: Int?,
        budgetMax: Int?,
        isHourly: Boolean,
        durationDays: Int?,
        skills: List<String>,
        coverUrl: String,
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "update_gig",
                params = buildJsonObject {
                    put("p_gig_id", gigId)
                    put("p_title", title.trim())
                    put("p_description", description.trim())
                    putNullableInt("p_budget_min", budgetMin)
                    putNullableInt("p_budget_max", budgetMax)
                    put("p_is_hourly", isHourly)
                    putNullableInt("p_duration_days", durationDays)
                    put("p_skills", buildJsonArray { skills.forEach { add(it) } })
                    put("p_cover_url", coverUrl.trim())
                },
                requireAuth = true,
            )
            // A scalar return arrives as a bare JSON string (`"slug"`), which the JSON
            // decoder refuses — trim the quotes the same way `joinGroup` does.
            runCatching { supabase.decode<String>(raw) }.getOrDefault(raw.trim().trim('"'))
        }
    }

    /** Closes a gig: it stops taking proposals, and every bidder is told. Nothing is removed. */
    suspend fun closeGig(gigId: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "close_gig",
                params = buildJsonObject { put("p_gig_id", gigId) },
                requireAuth = true,
            )
            supabase.wakePushDelivery("gig-closed")
            Unit
        }
    }

    /**
     * Deletes a gig and, with it, every proposal on it. [confirmBids] must be true when the
     * client was told how many proposals would go; the routine refuses the delete otherwise,
     * so a stale screen cannot destroy work nobody was warned about.
     */
    suspend fun deleteGig(gigId: String, confirmBids: Boolean): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                supabase.rpcText(
                    "delete_gig",
                    params = buildJsonObject {
                        put("p_gig_id", gigId)
                        put("p_confirm_bids", confirmBids)
                    },
                    requireAuth = true,
                )
                supabase.wakePushDelivery("gig-deleted")
                Unit
            }
        }

    /** Corrects a job. Null budget-like fields clear the column; the slug only moves on request. */
    suspend fun updateJob(
        jobId: String,
        title: String,
        company: String,
        description: String,
        jobType: String,
        workMode: String,
        level: String,
        city: String,
        salaryMin: Int?,
        salaryMax: Int?,
        salaryPeriod: String,
        skills: List<String>,
        applyUrl: String,
        expiresAt: String?,
        coverUrl: String,
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "update_job",
                params = buildJsonObject {
                    put("p_job_id", jobId)
                    put("p_title", title.trim())
                    put("p_company", company.trim())
                    put("p_description", description.trim())
                    put("p_job_type", jobType)
                    put("p_work_mode", workMode)
                    put("p_level", level)
                    put("p_city", city.trim())
                    putNullableInt("p_salary_min", salaryMin)
                    putNullableInt("p_salary_max", salaryMax)
                    put("p_salary_period", salaryPeriod)
                    put("p_skills", buildJsonArray { skills.forEach { add(it) } })
                    put("p_apply_url", applyUrl.trim())
                    if (expiresAt.isNullOrBlank()) {
                        put("p_expires_at", JsonNull)
                    } else {
                        put("p_expires_at", expiresAt)
                    }
                    put("p_cover_url", coverUrl.trim())
                },
                requireAuth = true,
            )
            runCatching { supabase.decode<String>(raw) }.getOrDefault(raw.trim().trim('"'))
        }
    }

    /** Closes a job: no further applications, and everyone still waiting is told. */
    suspend fun closeJob(jobId: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "close_job",
                params = buildJsonObject { put("p_job_id", jobId) },
                requireAuth = true,
            )
            supabase.wakePushDelivery("job-closed")
            Unit
        }
    }

    /** Deletes a job and every application on it; [confirmApplications] records the warning. */
    suspend fun deleteJob(jobId: String, confirmApplications: Boolean): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                supabase.rpcText(
                    "delete_job",
                    params = buildJsonObject {
                        put("p_job_id", jobId)
                        put("p_confirm_applications", confirmApplications)
                    },
                    requireAuth = true,
                )
                supabase.wakePushDelivery("job-deleted")
                Unit
            }
        }

    /** Corrects a group. Its address is not a setting: `update_group` does not take a slug. */
    suspend fun updateGroup(
        groupId: String,
        name: String,
        description: String,
        rules: String?,
        privacy: String?,
        language: String?,
        avatarUrl: String?,
        coverUrl: String?,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "update_group",
                params = buildJsonObject {
                    put("p_group_id", groupId)
                    put("p_name", name.trim())
                    put("p_description", description.trim())
                    putNullableText("p_rules", rules)
                    putNullableText("p_privacy", privacy)
                    putNullableText("p_language", language)
                    putNullableText("p_avatar_url", avatarUrl)
                    putNullableText("p_cover_url", coverUrl)
                },
                requireAuth = true,
            )
            Unit
        }
    }

    /**
     * Deletes a group. Its channels go with it; posts inside them are kept by their authors but
     * detached from the channel and archived, so a private discussion never becomes public.
     */
    suspend fun deleteGroup(groupId: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "delete_group",
                params = buildJsonObject { put("p_group_id", groupId) },
                requireAuth = true,
            )
            Unit
        }
    }

    /**
     * Corrects an event. Its host, a moderator of its group, or staff — decided by the routine.
     * Attendees are told when the date moves, which is why [startsAt] and [endsAt] are required
     * rather than optional: a correction that silently leaves the old instant is the one case
     * somebody else has to hear about.
     */
    suspend fun updateEvent(
        eventId: String,
        title: String,
        description: String,
        startsAt: String,
        endsAt: String,
        mode: String?,
        venue: String?,
        city: String?,
        joinUrl: String?,
        coverUrl: String?,
        timezone: String?,
        capacity: Int?,
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = supabase.rpcText(
                "update_event",
                params = buildJsonObject {
                    put("p_event_id", eventId)
                    put("p_title", title.trim())
                    put("p_description", description.trim())
                    put("p_starts_at", startsAt)
                    put("p_ends_at", endsAt)
                    putNullableText("p_mode", mode)
                    putNullableText("p_venue", venue)
                    putNullableText("p_city", city)
                    putNullableText("p_join_url", joinUrl)
                    putNullableText("p_cover_url", coverUrl)
                    putNullableText("p_timezone", timezone)
                    putNullableInt("p_capacity", capacity)
                },
                requireAuth = true,
            )
            supabase.wakePushDelivery("event-update")
            runCatching { supabase.decode<String>(raw) }.getOrDefault(raw.trim().trim('"'))
        }
    }

    /** Cancels an event: the page stays, the RSVPs stay, and everyone who did not decline is told. */
    suspend fun cancelEvent(eventId: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "cancel_event",
                params = buildJsonObject { put("p_event_id", eventId) },
                requireAuth = true,
            )
            supabase.wakePushDelivery("event-cancelled")
            Unit
        }
    }

    /** Deletes an event and its RSVPs; everybody who had not declined is told. */
    suspend fun deleteEvent(eventId: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                "delete_event",
                params = buildJsonObject { put("p_event_id", eventId) },
                requireAuth = true,
            )
            supabase.wakePushDelivery("event-deleted")
            Unit
        }
    }

    /**
     * The viewer's own role in the group organising an event.
     *
     * `event_detail` reports the event, not what the reader may do to it, and the group that
     * owns it may be private — so this asks `group_members`, whose policy admits a member and
     * quietly answers nothing for anybody else.
     */
    suspend fun fetchGroupRole(groupId: String, uid: String): Result<String?> =
        withContext(Dispatchers.IO) {
            runCatching {
                val raw = supabase.getJsonText(
                    table = "group_members",
                    queryPairs = listOf(
                        "select" to "role",
                        "group_id" to "eq.$groupId",
                        "uid" to "eq.$uid",
                        "limit" to "1",
                    ),
                    requireAuth = true,
                )
                supabase.decode<List<GroupRoleRowDto>>(raw).firstOrNull()?.role
            }
        }

}

/** A JSON null where the routine expects "leave this column alone". */
private fun JsonObjectBuilder.putNullableInt(key: String, value: Int?) {
    if (value == null) put(key, JsonNull) else put(key, value)
}

private fun JsonObjectBuilder.putNullableText(key: String, value: String?) {
    if (value == null) put(key, JsonNull) else put(key, value)
}
