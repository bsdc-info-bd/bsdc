package bd.info.bsdc.app.ui

import android.app.Activity
import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import bd.info.bsdc.app.auth.AuthRepository
import bd.info.bsdc.app.auth.AuthState
import bd.info.bsdc.app.core.AppContainer
import bd.info.bsdc.app.core.AppPreferences
import bd.info.bsdc.app.core.RepositoryResult
import bd.info.bsdc.app.feed.FeedRankingEngine
import bd.info.bsdc.app.content.PublishingTools
import bd.info.bsdc.app.data.PostDraft
import bd.info.bsdc.app.model.CommunityPost
import bd.info.bsdc.app.model.ContentSeries
import bd.info.bsdc.app.model.OrganizationMembership
import bd.info.bsdc.app.model.CommunityOrganization
import bd.info.bsdc.app.model.MediaAttachment
import bd.info.bsdc.app.model.MediaKind
import bd.info.bsdc.app.model.PostVisibility
import bd.info.bsdc.app.model.ReactionType
import bd.info.bsdc.app.model.UserProfile
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseUser
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AppViewModel(private val container: AppContainer) : ViewModel() {
    val auth: StateFlow<AuthState> = container.auth.observeAuth()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AuthState.Loading)
    val preferences: StateFlow<AppPreferences> = container.settings.preferences
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppPreferences())

    fun signOut() = container.auth.signOut()
}

data class AuthUiState(
    val createAccount: Boolean = false,
    val busy: Boolean = false,
    val error: String? = null,
    val message: String? = null
)

class AuthViewModel(private val repository: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state = _state.asStateFlow()

    fun setCreateAccount(value: Boolean) { _state.value = _state.value.copy(createAccount = value, error = null, message = null) }

    fun signIn(email: String, password: String) = launch { repository.signIn(email, password) }
    fun signUp(email: String, password: String, displayName: String, username: String) = launch {
        repository.signUp(email, password, displayName, username)
    }
    fun google(context: Context) = launch { repository.signInWithGoogle(context) }
    fun provider(activity: Activity, providerId: String) = launch { repository.signInWithProvider(activity, providerId) }
    fun resetPassword(email: String) = launch(success = "If an account exists, a reset email has been sent.") {
        repository.sendPasswordReset(email)
    }

    private fun launch(success: String? = null, action: suspend () -> RepositoryResult<*>) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, error = null, message = null)
            when (val result = action()) {
                is RepositoryResult.Success -> _state.value = _state.value.copy(busy = false, message = success)
                is RepositoryResult.Failure -> _state.value = _state.value.copy(busy = false, error = result.message)
            }
        }
    }
}

data class FeedUiState(
    val loading: Boolean = true,
    val posts: List<CommunityPost> = emptyList(),
    val error: String? = null,
    val actionMessage: String? = null
)

class FeedViewModel(private val container: AppContainer) : ViewModel() {
    private val ranking = FeedRankingEngine()
    private val _state = MutableStateFlow(FeedUiState())
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch {
            container.community.observePublicFeed().catch { error ->
                _state.value = _state.value.copy(loading = false, error = error.message)
            }.collect { candidates ->
                // The query has already been access-controlled by Firestore. This layer only
                // performs deterministic local ordering; an anonymous key is used until the
                // protected backend provides per-user candidate retrieval.
                _state.value = FeedUiState(loading = false, posts = ranking.rank(candidates, "viewer").map { it.post })
            }
        }
    }

    fun react(postId: String) = viewModelScope.launch {
        when (val result = container.community.toggleReaction(postId, ReactionType.LIKE)) {
            is RepositoryResult.Success -> _state.value = _state.value.copy(actionMessage = if (result.value) "Reaction added" else "Reaction removed")
            is RepositoryResult.Failure -> _state.value = _state.value.copy(actionMessage = result.message)
        }
    }
}

enum class EditorMode { RICH, MARKDOWN }
enum class ComposerAction { DRAFT, SCHEDULE, PUBLISH }

data class CoAuthorUi(val id: String, val name: String, val handle: String)

data class ComposerUiState(
    val body: String = "",
    val metadataText: String = "",
    val tags: String = "",
    val language: String = "en",
    val visibility: PostVisibility = PostVisibility.PUBLIC,
    val editorMode: EditorMode = EditorMode.RICH,
    val media: List<MediaAttachment> = emptyList(),
    val series: List<ContentSeries> = emptyList(),
    val selectedSeriesId: String? = null,
    val organizations: List<OrganizationMembership> = emptyList(),
    val selectedOrganizationId: String? = null,
    val coAuthors: List<CoAuthorUi> = emptyList(),
    val workingPosts: List<CommunityPost> = emptyList(),
    val draftId: String? = null,
    val scheduledAtMillis: Long? = null,
    val uploading: Boolean = false,
    val publishing: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
    val completed: Boolean = false
)

/** State holder for a Markdown-first writer. Rich mode is a safe native preview/tooling layer;
 * HTML and executable embed code are never rendered inside the client. */
class ComposerViewModel(private val container: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(ComposerUiState())
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch {
            container.community.observeMySeries().catch { setError(it.message) }.collect { items ->
                _state.value = _state.value.copy(series = items)
            }
        }
        viewModelScope.launch {
            container.organizations.observeMine().catch { setError(it.message) }.collect { items ->
                _state.value = _state.value.copy(organizations = items)
            }
        }
        viewModelScope.launch {
            container.community.observeMyWorkingPosts().catch { setError(it.message) }.collect { items ->
                _state.value = _state.value.copy(workingPosts = items)
            }
        }
    }

    fun updateBody(value: String) { _state.value = _state.value.copy(body = value, error = null, notice = null) }
    fun updateMetadata(value: String) { _state.value = _state.value.copy(metadataText = value, error = null) }
    fun updateTags(value: String) { _state.value = _state.value.copy(tags = value.take(160)) }
    fun updateLanguage(value: String) { _state.value = _state.value.copy(language = value) }
    fun updateVisibility(value: PostVisibility) { _state.value = _state.value.copy(visibility = value) }
    fun updateEditorMode(value: EditorMode) { _state.value = _state.value.copy(editorMode = value) }
    fun selectSeries(id: String?) { _state.value = _state.value.copy(selectedSeriesId = id) }
    fun selectOrganization(id: String?) { _state.value = _state.value.copy(selectedOrganizationId = id, coAuthors = emptyList()) }
    fun updateScheduledAt(value: Long?) { _state.value = _state.value.copy(scheduledAtMillis = value, error = null) }

    fun insertMarkdown(snippet: String) {
        val body = _state.value.body
        _state.value = _state.value.copy(body = if (body.isBlank()) snippet else "$body\n$snippet")
    }

    fun insertEmbed(type: String, url: String) {
        val tag = PublishingTools.liquidTag(type, url)
        if (tag == null) setError("Use a supported public URL for this embed.") else insertMarkdown(tag)
    }

    fun attach(uri: Uri) = viewModelScope.launch {
        _state.value = _state.value.copy(uploading = true, error = null)
        when (val result = container.media.upload(uri)) {
            is RepositoryResult.Success -> {
                val upload = result.value
                _state.value = _state.value.copy(
                    uploading = false,
                    media = _state.value.media + MediaAttachment(
                        url = upload.secureUrl,
                        publicId = upload.publicId,
                        kind = upload.resourceType.name,
                        width = upload.width,
                        height = upload.height,
                        durationMs = upload.durationMs
                    )
                )
            }
            is RepositoryResult.Failure -> setError(result.message, uploading = false)
        }
    }

    fun removeMedia(url: String) { _state.value = _state.value.copy(media = _state.value.media.filterNot { it.url == url }) }

    fun addCoAuthors(handles: String) = viewModelScope.launch {
        if (_state.value.selectedOrganizationId == null) {
            setError("Choose an organization before adding organization co-authors.")
            return@launch
        }
        val requested = handles.split(',', ' ', '\n').map { it.trim() }.filter { it.isNotBlank() }
        when (val result = container.community.resolveMemberHandles(requested)) {
            is RepositoryResult.Success -> {
                val current = _state.value.coAuthors
                val combined = (current + result.value.map { CoAuthorUi(it.id, it.displayName, it.username) })
                    .distinctBy { it.id }
                    .take(5)
                _state.value = _state.value.copy(coAuthors = combined, error = null)
            }
            is RepositoryResult.Failure -> setError(result.message)
        }
    }

    fun removeCoAuthor(id: String) { _state.value = _state.value.copy(coAuthors = _state.value.coAuthors.filterNot { it.id == id }) }

    fun createSeries(title: String, description: String) = viewModelScope.launch {
        when (val result = container.community.createSeries(title, description)) {
            is RepositoryResult.Success -> {
                val current = _state.value
                _state.value = current.copy(
                    series = (listOf(ContentSeries(id = result.value, title = title.trim(), description = description.trim())) + current.series).distinctBy { it.id },
                    selectedSeriesId = result.value,
                    notice = "Series created. Add this post as its next part."
                )
            }
            is RepositoryResult.Failure -> setError(result.message)
        }
    }

    fun createOrganization(name: String, handle: String, description: String) = viewModelScope.launch {
        when (val result = container.organizations.create(name, handle, description)) {
            is RepositoryResult.Success -> {
                val current = _state.value
                _state.value = current.copy(
                    organizations = (listOf(OrganizationMembership(
                        id = result.value,
                        organizationId = result.value,
                        organizationName = name.trim(),
                        organizationHandle = handle.trim().removePrefix("@").lowercase(),
                        role = "owner"
                    )) + current.organizations).distinctBy { it.organizationId },
                    selectedOrganizationId = result.value,
                    notice = "Organization profile created."
                )
            }
            is RepositoryResult.Failure -> setError(result.message)
        }
    }

    fun loadWorkingPost(post: CommunityPost) {
        val parsed = PublishingTools.splitFrontmatter(post.body)
        val metadata = if (post.frontmatter.isNotEmpty()) post.frontmatter else parsed.metadata
        _state.value = _state.value.copy(
            body = parsed.content,
            metadataText = PublishingTools.metadataLines(metadata),
            tags = post.tags.joinToString(", "),
            language = post.language,
            visibility = runCatching { PostVisibility.valueOf(post.visibility) }.getOrDefault(PostVisibility.PUBLIC),
            media = post.media,
            selectedSeriesId = post.seriesId,
            selectedOrganizationId = post.organizationId,
            coAuthors = post.coAuthorIds.zip(post.coAuthorNames).map { CoAuthorUi(it.first, it.second, "") },
            draftId = post.id,
            scheduledAtMillis = post.scheduledAt?.toDate()?.time,
            error = null,
            notice = if (post.status == "scheduled") "Editing a scheduled post" else "Editing private draft",
            completed = false
        )
    }

    fun newPost() {
        val current = _state.value
        _state.value = ComposerUiState(series = current.series, organizations = current.organizations, workingPosts = current.workingPosts)
    }

    fun submit(action: ComposerAction) = viewModelScope.launch {
        val current = _state.value
        val metadata = PublishingTools.parseMetadataLines(current.metadataText)
        val source = PublishingTools.withFrontmatter(current.body, metadata)
        val selectedSeries = current.series.firstOrNull { it.id == current.selectedSeriesId }
        val selectedOrganization = current.organizations.firstOrNull { it.organizationId == current.selectedOrganizationId }
        val tags = current.tags.split(',', ' ', '\n').map { it.trim().removePrefix("#") }.filter { it.isNotBlank() }.distinct()
        if (tags.size > 4) {
            setError("Choose up to 4 tags.")
            return@launch
        }
        val draft = PostDraft(
            body = source,
            language = current.language,
            tags = tags,
            visibility = current.visibility,
            media = current.media,
            format = "markdown",
            frontmatter = metadata,
            embeds = PublishingTools.extractEmbeds(source),
            seriesId = selectedSeries?.id,
            seriesTitle = selectedSeries?.title,
            seriesOrder = selectedSeries?.postCount?.plus(1),
            organizationId = selectedOrganization?.organizationId,
            organizationName = selectedOrganization?.organizationName,
            organizationHandle = selectedOrganization?.organizationHandle,
            coAuthorIds = current.coAuthors.map { it.id },
            coAuthorNames = current.coAuthors.map { it.name }
        )
        _state.value = current.copy(publishing = true, error = null, notice = null, completed = false)
        val result = when (action) {
            ComposerAction.DRAFT -> container.community.saveDraft(draft, current.draftId)
            ComposerAction.PUBLISH -> container.community.publish(draft, current.draftId)
            ComposerAction.SCHEDULE -> {
                val whenMillis = current.scheduledAtMillis ?: run {
                    setError("Choose a date and time before scheduling.")
                    return@launch
                }
                container.community.schedule(draft, Timestamp(java.util.Date(whenMillis)), current.draftId)
            }
        }
        when (result) {
            is RepositoryResult.Success -> when (action) {
                ComposerAction.PUBLISH -> _state.value = ComposerUiState(
                    series = current.series,
                    organizations = current.organizations,
                    workingPosts = current.workingPosts,
                    completed = true
                )
                ComposerAction.DRAFT -> _state.value = _state.value.copy(publishing = false, draftId = result.value, notice = "Private draft saved")
                ComposerAction.SCHEDULE -> _state.value = _state.value.copy(publishing = false, draftId = result.value, notice = "Post scheduled")
            }
            is RepositoryResult.Failure -> setError(result.message)
        }
    }

    private fun setError(message: String?, uploading: Boolean = false) {
        _state.value = _state.value.copy(uploading = uploading, publishing = false, error = message ?: "Something went wrong.")
    }
}

data class ProfileActionState(
    val busy: Boolean = false,
    val message: String? = null,
    val error: String? = null
)

/** Shared model for the signed-in profile and real public member profile routes. */
class ProfileViewModel(private val container: AppContainer, val profileId: String) : ViewModel() {
    private val viewerId = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid.orEmpty()
    val isOwnProfile: Boolean = viewerId == profileId
    val state = container.profiles.observeProfile(profileId).catch { emit(null) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)
    val posts = container.community.observePostsByAuthor(profileId).catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val isFollowing = container.profiles.observeFollowing(profileId).catch { emit(false) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    private val _action = MutableStateFlow(ProfileActionState())
    val action = _action.asStateFlow()
    private val _conversationId = MutableStateFlow<String?>(null)
    val conversationId = _conversationId.asStateFlow()

    fun update(displayName: String, bio: String, skills: String, location: String) = viewModelScope.launch {
        if (!isOwnProfile) return@launch
        _action.value = ProfileActionState(busy = true)
        val skillList = skills.split(',', '\n').map(String::trim).filter(String::isNotBlank)
        _action.value = when (val result = container.profiles.updateMyProfile(displayName, bio, skillList, location)) {
            is RepositoryResult.Success -> ProfileActionState(message = "Profile updated")
            is RepositoryResult.Failure -> ProfileActionState(error = result.message)
        }
    }

    fun updateTechnologySkills(skills: List<String>) = viewModelScope.launch {
        if (!isOwnProfile) return@launch
        val current = state.value ?: return@launch
        _action.value = ProfileActionState(busy = true)
        _action.value = when (val result = container.profiles.updateMyProfile(
            displayName = current.displayName,
            bio = current.bio,
            skills = skills.distinct().take(20),
            locationLabel = current.locationLabel
        )) {
            is RepositoryResult.Success -> ProfileActionState(message = "Technology stack saved")
            is RepositoryResult.Failure -> ProfileActionState(error = result.message)
        }
    }

    fun changeUsername(username: String) = viewModelScope.launch {
        if (!isOwnProfile) return@launch
        _action.value = ProfileActionState(busy = true)
        _action.value = when (val result = container.profiles.changeMyUsername(username)) {
            is RepositoryResult.Success -> ProfileActionState(message = "Username changed to @${result.value}")
            is RepositoryResult.Failure -> ProfileActionState(error = result.message)
        }
    }

    fun uploadAvatar(uri: Uri) = uploadProfileImage(uri, isAvatar = true)
    fun uploadCover(uri: Uri) = uploadProfileImage(uri, isAvatar = false)

    private fun uploadProfileImage(uri: Uri, isAvatar: Boolean) = viewModelScope.launch {
        if (!isOwnProfile) return@launch
        _action.value = ProfileActionState(busy = true)
        when (val upload = container.media.upload(uri, if (isAvatar) "BSDC profile photo" else "BSDC profile cover")) {
            is RepositoryResult.Failure -> _action.value = ProfileActionState(error = upload.message)
            is RepositoryResult.Success -> {
                if (upload.value.resourceType != bd.info.bsdc.app.model.MediaKind.IMAGE) {
                    _action.value = ProfileActionState(error = "Profile media must be an image.")
                } else {
                    val update = if (isAvatar) container.profiles.updateMyMedia(photoUrl = upload.value.secureUrl)
                    else container.profiles.updateMyMedia(coverUrl = upload.value.secureUrl)
                    _action.value = when (update) {
                        is RepositoryResult.Success -> ProfileActionState(message = if (isAvatar) "Profile photo updated" else "Cover image updated")
                        is RepositoryResult.Failure -> ProfileActionState(error = update.message)
                    }
                }
            }
        }
    }

    fun toggleFollow() = viewModelScope.launch {
        if (isOwnProfile) return@launch
        _action.value = ProfileActionState(busy = true)
        _action.value = when (val result = container.profiles.follow(profileId)) {
            is RepositoryResult.Success -> ProfileActionState(message = if (result.value) "Following this developer" else "Unfollowed this developer")
            is RepositoryResult.Failure -> ProfileActionState(error = result.message)
        }
    }

    fun messageMember() = viewModelScope.launch {
        if (isOwnProfile) return@launch
        _action.value = ProfileActionState(busy = true)
        when (val result = container.chat.ensureDirectConversation(profileId)) {
            is RepositoryResult.Success -> {
                _action.value = ProfileActionState()
                _conversationId.value = result.value
            }
            is RepositoryResult.Failure -> _action.value = ProfileActionState(error = result.message)
        }
    }

    fun consumeConversation() { _conversationId.value = null }
}

data class PostDetailUiState(
    val post: CommunityPost? = null,
    val comments: List<bd.info.bsdc.app.model.PostComment> = emptyList(),
    val sending: Boolean = false,
    val error: String? = null
)

class PostDetailViewModel(private val container: AppContainer, private val postId: String) : ViewModel() {
    private val _state = MutableStateFlow(PostDetailUiState())
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch {
            container.community.observePost(postId).catch { error ->
                _state.value = _state.value.copy(error = error.message)
            }.collect { post -> _state.value = _state.value.copy(post = post) }
        }
        viewModelScope.launch {
            container.community.observeComments(postId).catch { error ->
                _state.value = _state.value.copy(error = error.message)
            }.collect { comments -> _state.value = _state.value.copy(comments = comments) }
        }
    }

    fun addComment(body: String) = viewModelScope.launch {
        _state.value = _state.value.copy(sending = true, error = null)
        _state.value = when (val result = container.community.addComment(postId, body)) {
            is RepositoryResult.Success -> _state.value.copy(sending = false)
            is RepositoryResult.Failure -> _state.value.copy(sending = false, error = result.message)
        }
    }
}

data class SeriesUiState(
    val series: ContentSeries? = null,
    val posts: List<CommunityPost> = emptyList(),
    val error: String? = null
)

class SeriesViewModel(private val container: AppContainer, private val seriesId: String) : ViewModel() {
    private val _state = MutableStateFlow(SeriesUiState())
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch {
            container.community.observeSeries(seriesId).catch { error ->
                _state.value = _state.value.copy(error = error.message)
            }.collect { series -> _state.value = _state.value.copy(series = series) }
        }
        viewModelScope.launch {
            container.community.observeSeriesPosts(seriesId).catch { error ->
                _state.value = _state.value.copy(error = error.message)
            }.collect { posts -> _state.value = _state.value.copy(posts = posts) }
        }
    }
}

data class OrganizationUiState(
    val organization: CommunityOrganization? = null,
    val posts: List<CommunityPost> = emptyList(),
    val members: List<OrganizationMembership> = emptyList(),
    val busy: Boolean = false,
    val message: String? = null,
    val error: String? = null
)

class OrganizationViewModel(private val container: AppContainer, private val organizationId: String) : ViewModel() {
    private val _state = MutableStateFlow(OrganizationUiState())
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch {
            container.organizations.observeOrganization(organizationId).catch { error ->
                _state.value = _state.value.copy(error = error.message)
            }.collect { org -> _state.value = _state.value.copy(organization = org) }
        }
        viewModelScope.launch {
            container.organizations.observeMembers(organizationId).catch { error ->
                _state.value = _state.value.copy(error = error.message)
            }.collect { members -> _state.value = _state.value.copy(members = members) }
        }
        viewModelScope.launch {
            container.community.observeOrganizationPosts(organizationId).catch { error ->
                _state.value = _state.value.copy(error = error.message)
            }.collect { posts -> _state.value = _state.value.copy(posts = posts) }
        }
    }

    fun addEditor(handle: String) = viewModelScope.launch {
        val organization = _state.value.organization ?: return@launch
        _state.value = _state.value.copy(busy = true, error = null, message = null)
        _state.value = when (val result = container.organizations.addEditor(organization, handle)) {
            is RepositoryResult.Success -> _state.value.copy(busy = false, message = "Editor added to ${organization.name}")
            is RepositoryResult.Failure -> _state.value.copy(busy = false, error = result.message)
        }
    }
}

class NotificationsViewModel(private val container: AppContainer) : ViewModel() {
    val notifications = container.notifications.observeMine().catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun markRead(id: String) = viewModelScope.launch { container.notifications.markRead(id) }
}

data class InboxUiState(
    val conversations: List<bd.info.bsdc.app.model.DirectConversation> = emptyList(),
    val creatingGroup: Boolean = false,
    val error: String? = null,
    val createdConversationId: String? = null
)

class InboxViewModel(private val container: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(InboxUiState())
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch {
            container.chat.observeConversations().catch { error ->
                _state.value = _state.value.copy(error = error.message)
            }.collect { conversations -> _state.value = _state.value.copy(conversations = conversations) }
        }
    }

    fun createGroup(title: String, description: String, handles: String) = viewModelScope.launch {
        _state.value = _state.value.copy(creatingGroup = true, error = null)
        when (val result = container.chat.createGroup(title, description, handles)) {
            is RepositoryResult.Success -> _state.value = _state.value.copy(creatingGroup = false, createdConversationId = result.value)
            is RepositoryResult.Failure -> _state.value = _state.value.copy(creatingGroup = false, error = result.message)
        }
    }

    fun consumeCreatedConversation() { _state.value = _state.value.copy(createdConversationId = null) }
}

data class ChatRoomUiState(
    val conversation: bd.info.bsdc.app.model.DirectConversation? = null,
    val messages: List<bd.info.bsdc.app.model.ChatMessage> = emptyList(),
    val typing: Set<String> = emptySet(),
    val sending: Boolean = false,
    val uploading: Boolean = false,
    val error: String? = null
)

class ChatRoomViewModel(private val container: AppContainer, private val conversationId: String) : ViewModel() {
    private val _state = MutableStateFlow(ChatRoomUiState())
    val state = _state.asStateFlow()
    private var typingJob: kotlinx.coroutines.Job? = null

    init {
        viewModelScope.launch {
            container.chat.observeConversation(conversationId).catch { error ->
                _state.value = _state.value.copy(error = error.message)
            }.collect { conversation -> _state.value = _state.value.copy(conversation = conversation) }
        }
        viewModelScope.launch {
            container.chat.observeMessages(conversationId).catch { error ->
                _state.value = _state.value.copy(error = error.message)
            }.collect { messages ->
                _state.value = _state.value.copy(messages = messages)
                container.chat.markSeen(conversationId)
            }
        }
        viewModelScope.launch {
            container.chat.observeTyping(conversationId).catch { emit(emptySet()) }
                .collect { typing -> _state.value = _state.value.copy(typing = typing) }
        }
        viewModelScope.launch { container.chat.markSeen(conversationId) }
    }

    fun send(text: String) = viewModelScope.launch {
        _state.value = _state.value.copy(sending = true, error = null)
        when (val result = container.chat.sendText(conversationId, text)) {
            is RepositoryResult.Success -> _state.value = _state.value.copy(sending = false)
            is RepositoryResult.Failure -> _state.value = _state.value.copy(sending = false, error = result.message)
        }
    }

    fun attach(uri: Uri) = viewModelScope.launch {
        _state.value = _state.value.copy(uploading = true, error = null)
        when (val upload = container.media.upload(uri)) {
            is RepositoryResult.Failure -> _state.value = _state.value.copy(uploading = false, error = upload.message)
            is RepositoryResult.Success -> {
                val kind = if (upload.value.resourceType == bd.info.bsdc.app.model.MediaKind.IMAGE) "image" else "audio"
                when (val result = container.chat.sendAttachment(conversationId, kind, upload.value.secureUrl)) {
                    is RepositoryResult.Success -> _state.value = _state.value.copy(uploading = false)
                    is RepositoryResult.Failure -> _state.value = _state.value.copy(uploading = false, error = result.message)
                }
            }
        }
    }

    fun edit(messageId: String, body: String) = viewModelScope.launch {
        when (val result = container.chat.editMessage(conversationId, messageId, body)) {
            is RepositoryResult.Failure -> _state.value = _state.value.copy(error = result.message)
            is RepositoryResult.Success -> Unit
        }
    }

    fun remove(messageId: String) = viewModelScope.launch {
        when (val result = container.chat.deleteMessage(conversationId, messageId)) {
            is RepositoryResult.Failure -> _state.value = _state.value.copy(error = result.message)
            is RepositoryResult.Success -> Unit
        }
    }

    fun draftChanged(hasText: Boolean) {
        typingJob?.cancel()
        if (!hasText) {
            viewModelScope.launch { container.chat.setTyping(conversationId, false) }
            return
        }
        viewModelScope.launch { container.chat.setTyping(conversationId, true) }
        typingJob = viewModelScope.launch {
            kotlinx.coroutines.delay(1_800)
            container.chat.setTyping(conversationId, false)
        }
    }

    override fun onCleared() {
        typingJob?.cancel()
        viewModelScope.launch { container.chat.setTyping(conversationId, false) }
        super.onCleared()
    }
}

class BsdcViewModelFactory(private val create: () -> ViewModel) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = create() as T
}
