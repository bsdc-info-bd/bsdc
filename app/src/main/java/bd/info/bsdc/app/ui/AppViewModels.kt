package bd.info.bsdc.app.ui

import android.app.Activity
import android.content.Context
import android.content.Intent
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
import bd.info.bsdc.app.data.PostDraft
import bd.info.bsdc.app.model.CommunityPost
import bd.info.bsdc.app.model.MediaAttachment
import bd.info.bsdc.app.model.MediaKind
import bd.info.bsdc.app.model.PostVisibility
import bd.info.bsdc.app.model.ReactionType
import bd.info.bsdc.app.model.UserProfile
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
    fun googleIntent(context: Context): Intent? = runCatching { repository.googleIntent(context) }
        .onFailure { _state.value = _state.value.copy(error = it.message) }.getOrNull()

    fun signIn(email: String, password: String) = launch { repository.signIn(email, password) }
    fun signUp(email: String, password: String, displayName: String, username: String) = launch {
        repository.signUp(email, password, displayName, username)
    }
    fun finishGoogle(data: Intent?) = launch { repository.finishGoogleSignIn(data) }
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

data class ComposerUiState(
    val body: String = "",
    val tags: String = "",
    val language: String = "en",
    val visibility: PostVisibility = PostVisibility.PUBLIC,
    val media: List<MediaAttachment> = emptyList(),
    val uploading: Boolean = false,
    val publishing: Boolean = false,
    val error: String? = null,
    val completed: Boolean = false
)

class ComposerViewModel(private val container: AppContainer) : ViewModel() {
    private val _state = MutableStateFlow(ComposerUiState())
    val state = _state.asStateFlow()

    fun updateBody(value: String) { _state.value = _state.value.copy(body = value, error = null) }
    fun updateTags(value: String) { _state.value = _state.value.copy(tags = value) }
    fun updateLanguage(value: String) { _state.value = _state.value.copy(language = value) }
    fun updateVisibility(value: PostVisibility) { _state.value = _state.value.copy(visibility = value) }

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
            is RepositoryResult.Failure -> _state.value = _state.value.copy(uploading = false, error = result.message)
        }
    }

    fun removeMedia(url: String) { _state.value = _state.value.copy(media = _state.value.media.filterNot { it.url == url }) }

    fun publish() = viewModelScope.launch {
        val current = _state.value
        _state.value = current.copy(publishing = true, error = null, completed = false)
        val tags = current.tags.split(',', ' ', '\n').map { it.trim().removePrefix("#") }.filter { it.isNotBlank() }.distinct()
        when (val result = container.community.publish(PostDraft(current.body, current.language, tags, current.visibility, current.media))) {
            is RepositoryResult.Success -> _state.value = ComposerUiState(completed = true)
            is RepositoryResult.Failure -> _state.value = current.copy(publishing = false, error = result.message)
        }
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

class NotificationsViewModel(private val container: AppContainer) : ViewModel() {
    val notifications = container.notifications.observeMine().catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun markRead(id: String) = viewModelScope.launch { container.notifications.markRead(id) }
}

class InboxViewModel(private val container: AppContainer) : ViewModel() {
    val conversations = container.chat.observeConversations()
        .catch { emit(emptyList()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}

data class ChatRoomUiState(
    val messages: List<bd.info.bsdc.app.model.ChatMessage> = emptyList(),
    val typing: Set<String> = emptySet(),
    val sending: Boolean = false,
    val error: String? = null
)

class ChatRoomViewModel(private val container: AppContainer, private val conversationId: String) : ViewModel() {
    private val _state = MutableStateFlow(ChatRoomUiState())
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch {
            container.chat.observeMessages(conversationId).catch { error ->
                _state.value = _state.value.copy(error = error.message)
            }.collect { messages -> _state.value = _state.value.copy(messages = messages) }
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

    fun typing(value: Boolean) = viewModelScope.launch { container.chat.setTyping(conversationId, value) }
}

class BsdcViewModelFactory(private val create: () -> ViewModel) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = create() as T
}
