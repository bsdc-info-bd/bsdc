package bd.info.bsdc.app.core.auth

import android.app.Activity
import android.content.Context
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.BsdcBackendConfig
import bd.info.bsdc.app.core.model.BsdcUserSession
import bd.info.bsdc.app.core.model.MemberProfile
import bd.info.bsdc.app.core.model.ProfileDraft
import bd.info.bsdc.app.core.model.SessionClaims
import bd.info.bsdc.app.core.network.BsdcPlatformApi
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.OAuthProvider
import com.google.firebase.auth.UserProfileChangeRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

enum class AuthGateState {
    INITIALIZING,
    SIGNED_OUT,
    NEEDS_EMAIL_VERIFICATION,
    NEEDS_ONBOARDING,
    READY,
}

data class AuthStateSnapshot(
    val gate: AuthGateState = AuthGateState.INITIALIZING,
    val session: BsdcUserSession? = null,
    val profile: MemberProfile? = null,
    val isBusy: Boolean = false,
    val infoMessage: String? = null,
    val errorMessage: String? = null,
)

class AuthRepository(
    private val appContext: Context,
    private val config: BsdcBackendConfig,
    private val firebaseAuth: FirebaseAuth,
    private val platformApi: BsdcPlatformApi,
    private val bootstrapManager: DataAccessBootstrapManager,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _state = MutableStateFlow(AuthStateSnapshot())
    val state: StateFlow<AuthStateSnapshot> = _state.asStateFlow()

    private val authListener = FirebaseAuth.AuthStateListener { auth ->
        val user = auth.currentUser
        if (user == null) {
            _state.value = AuthStateSnapshot(gate = AuthGateState.SIGNED_OUT)
        } else {
            scope.launch { hydrateUserSession(user) }
        }
    }

    init {
        firebaseAuth.addAuthStateListener(authListener)
    }

    fun clearMessages() {
        _state.update { it.copy(infoMessage = null, errorMessage = null) }
    }

    suspend fun refreshSessionAndProfile() {
        val user = firebaseAuth.currentUser ?: run {
            _state.value = AuthStateSnapshot(gate = AuthGateState.SIGNED_OUT)
            return
        }
        hydrateUserSession(user)
    }

    private suspend fun hydrateUserSession(user: FirebaseUser) {
        _state.update { it.copy(isBusy = true, errorMessage = null) }
        val isPassword = user.providerData.any { it.providerId == "password" }
        val baseSession = BsdcUserSession(
            uid = user.uid,
            email = user.email.orEmpty(),
            emailVerified = user.isEmailVerified,
            displayName = user.displayName.orEmpty(),
            photoUrl = user.photoUrl?.toString().orEmpty(),
            isPasswordProvider = isPassword,
            claims = SessionClaims(),
        )

        if (isPassword && !user.isEmailVerified) {
            _state.value = AuthStateSnapshot(
                gate = AuthGateState.NEEDS_EMAIL_VERIFICATION,
                session = baseSession,
                profile = null,
                isBusy = false,
            )
            return
        }

        val result = runCatching {
            val (_, claims) = bootstrapManager.ensureDataAccess(user)
            val fallbackName = user.displayName?.takeIf { it.isNotBlank() }
                ?: user.email?.substringBefore('@')
                ?: "Member"
            platformApi.ensureProfile(user.uid, fallbackName)
            val profile = platformApi.fetchProfile(user.uid)
            claims to profile
        }

        result.onSuccess { (claims, profile) ->
            val resolvedSession = baseSession.copy(claims = claims)
            val needsOnboarding = profile == null || !profile.hasClaimedHandle || !profile.onboardingComplete
            _state.value = AuthStateSnapshot(
                gate = if (needsOnboarding) AuthGateState.NEEDS_ONBOARDING else AuthGateState.READY,
                session = resolvedSession,
                profile = profile,
                isBusy = false,
            )
        }.onFailure { err ->
            // Stay safely signed in so retry works without losing Firebase identity
            _state.value = AuthStateSnapshot(
                gate = AuthGateState.NEEDS_ONBOARDING,
                session = baseSession,
                profile = _state.value.profile,
                isBusy = false,
                errorMessage = err.localizedMessage,
            )
        }
    }

    suspend fun signInWithEmail(email: String, password: String, language: AppLanguage): Result<Unit> {
        _state.update { it.copy(isBusy = true, errorMessage = null, infoMessage = null) }
        return runCatching {
            val authResult = firebaseAuth.signInWithEmailAndPassword(email.trim(), password).await()
            val user = authResult.user ?: throw IllegalStateException("User unavailable")
            hydrateUserSession(user)
        }.onFailure { err ->
            val msg = AuthErrorTranslator.toUserMessage(err, language)
            _state.update { it.copy(isBusy = false, errorMessage = msg.ifEmpty { null }) }
        }
    }

    suspend fun signUpWithEmail(
        email: String,
        password: String,
        displayName: String,
        language: AppLanguage,
    ): Result<Unit> {
        _state.update { it.copy(isBusy = true, errorMessage = null, infoMessage = null) }
        return runCatching {
            val authResult = firebaseAuth.createUserWithEmailAndPassword(email.trim(), password).await()
            val user = authResult.user ?: throw IllegalStateException("User unavailable")
            val cleanName = displayName.trim().take(60)
            if (cleanName.isNotEmpty()) {
                user.updateProfile(
                    UserProfileChangeRequest.Builder().setDisplayName(cleanName).build(),
                ).await()
            }
            user.sendEmailVerification().await()
            hydrateUserSession(user)
        }.onFailure { err ->
            val msg = AuthErrorTranslator.toUserMessage(err, language)
            _state.update { it.copy(isBusy = false, errorMessage = msg.ifEmpty { null }) }
        }
    }

    suspend fun sendPasswordReset(email: String, language: AppLanguage): Result<Unit> {
        _state.update { it.copy(isBusy = true, errorMessage = null, infoMessage = null) }
        return runCatching {
            firebaseAuth.sendPasswordResetEmail(email.trim()).await()
            val bn = language == AppLanguage.BN
            _state.update {
                it.copy(
                    isBusy = false,
                    infoMessage = if (bn) {
                        "পাসওয়ার্ড রিসেট লিংক আপনার ইমেইলে পাঠানো হয়েছে।"
                    } else {
                        "Password reset instructions were sent to your email."
                    },
                )
            }
        }.onFailure { err ->
            val msg = AuthErrorTranslator.toUserMessage(err, language)
            _state.update { it.copy(isBusy = false, errorMessage = msg.ifEmpty { null }) }
        }
    }

    suspend fun resendEmailVerification(language: AppLanguage): Result<Unit> {
        val user = firebaseAuth.currentUser ?: return Result.failure(IllegalStateException("Signed out"))
        _state.update { it.copy(isBusy = true, errorMessage = null, infoMessage = null) }
        return runCatching {
            user.sendEmailVerification().await()
            val bn = language == AppLanguage.BN
            _state.update {
                it.copy(
                    isBusy = false,
                    infoMessage = if (bn) {
                        "যাচাই লিংক পুনরায় পাঠানো হয়েছে — অনুগ্রহ করে ইনবক্স বা স্প্যাম ফোল্ডার দেখুন।"
                    } else {
                        "Verification link resent — check your inbox and spam folder."
                    },
                )
            }
        }.onFailure { err ->
            val msg = AuthErrorTranslator.toUserMessage(err, language)
            _state.update { it.copy(isBusy = false, errorMessage = msg.ifEmpty { null }) }
        }
    }

    suspend fun reloadVerificationStatus(language: AppLanguage): Boolean {
        val user = firebaseAuth.currentUser ?: return false
        _state.update { it.copy(isBusy = true, errorMessage = null, infoMessage = null) }
        return runCatching {
            user.reload().await()
            val reloaded = firebaseAuth.currentUser ?: return@runCatching false
            if (reloaded.isEmailVerified) {
                hydrateUserSession(reloaded)
                true
            } else {
                val bn = language == AppLanguage.BN
                _state.update {
                    it.copy(
                        isBusy = false,
                        infoMessage = if (bn) {
                            "ইমেইল এখনও যাচাই হয়নি। ইনবক্সের লিংকে ক্লিক করে আবার চেষ্টা করুন।"
                        } else {
                            "Email is not verified yet. Open the verification link in your inbox, then tap again."
                        },
                    )
                }
                false
            }
        }.getOrElse { err ->
            val msg = AuthErrorTranslator.toUserMessage(err, language)
            _state.update { it.copy(isBusy = false, errorMessage = msg.ifEmpty { null }) }
            false
        }
    }

    suspend fun signInWithGoogle(activity: Activity, language: AppLanguage): Result<Unit> {
        val webClientId = config.firebaseWebClientId.trim()
        if (webClientId.isEmpty()) {
            val bn = language == AppLanguage.BN
            val errMsg = if (bn) {
                "এই বিল্ডে Google সাইন-ইন কনফিগার করা হয়নি। ইমেইল সাইন-ইন ব্যবহার করুন।"
            } else {
                "Google Sign-In is not configured in this build. Please use Email or GitHub sign-in."
            }
            _state.update { it.copy(errorMessage = errMsg) }
            return Result.failure(IllegalStateException(errMsg))
        }

        _state.update { it.copy(isBusy = true, errorMessage = null, infoMessage = null) }
        return runCatching {
            val credentialManager = CredentialManager.create(activity)
            val googleIdOption = GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(webClientId)
                .setAutoSelectEnabled(false)
                .build()
            val request = GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build()
            val response = credentialManager.getCredential(activity, request)
            val credential = response.credential
            if (credential is CustomCredential &&
                credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
            ) {
                val googleCred = GoogleIdTokenCredential.createFrom(credential.data)
                val firebaseCred = GoogleAuthProvider.getCredential(googleCred.idToken, null)
                val authResult = firebaseAuth.signInWithCredential(firebaseCred).await()
                val user = authResult.user ?: throw IllegalStateException("Google user missing")
                hydrateUserSession(user)
            } else {
                throw IllegalStateException("Unsupported credential type")
            }
        }.onFailure { err ->
            val msg = AuthErrorTranslator.toUserMessage(err, language)
            _state.update { it.copy(isBusy = false, errorMessage = msg.ifEmpty { null }) }
        }
    }

    suspend fun signInWithGitHub(activity: Activity, language: AppLanguage): Result<Unit> {
        _state.update { it.copy(isBusy = true, errorMessage = null, infoMessage = null) }
        return runCatching {
            val provider = OAuthProvider.newBuilder("github.com")
                .setScopes(listOf("read:user", "user:email"))
                .build()
            val pending = firebaseAuth.pendingAuthResult
            val authResult = if (pending != null) {
                pending.await()
            } else {
                firebaseAuth.startActivityForSignInWithProvider(activity, provider).await()
            }
            val user = authResult.user ?: throw IllegalStateException("GitHub user missing")
            hydrateUserSession(user)
        }.onFailure { err ->
            val msg = AuthErrorTranslator.toUserMessage(err, language)
            _state.update { it.copy(isBusy = false, errorMessage = msg.ifEmpty { null }) }
        }
    }

    suspend fun checkUsernameAvailability(rawUsername: String): Boolean {
        if (AuthDomainValidators.validateUsername(rawUsername) != AuthDomainValidators.UsernameValidation.VALID) {
            return false
        }
        return platformApi.isUsernameAvailable(AuthDomainValidators.normalizeUsername(rawUsername))
    }

    suspend fun saveOnboardingProfile(draft: ProfileDraft, language: AppLanguage): Result<MemberProfile> {
        val user = firebaseAuth.currentUser
            ?: return Result.failure(IllegalStateException("auth/required"))
        _state.update { it.copy(isBusy = true, errorMessage = null, infoMessage = null) }
        return runCatching {
            bootstrapManager.ensureDataAccess(user)
            val saved = platformApi.saveOnboardingProfile(user.uid, draft)
            _state.update {
                it.copy(
                    gate = AuthGateState.READY,
                    profile = saved,
                    isBusy = false,
                )
            }
            saved
        }.onFailure { err ->
            val msg = AuthErrorTranslator.toUserMessage(err, language)
            _state.update { it.copy(isBusy = false, errorMessage = msg.ifEmpty { null }) }
        }
    }

    suspend fun atomicSignOut(onAfterSignOutCleanup: suspend () -> Unit = {}) {
        runCatching { onAfterSignOutCleanup() }
        runCatching {
            CredentialManager.create(appContext).clearCredentialState(ClearCredentialStateRequest())
        }
        firebaseAuth.signOut()
        _state.value = AuthStateSnapshot(gate = AuthGateState.SIGNED_OUT)
    }

    fun close() {
        firebaseAuth.removeAuthStateListener(authListener)
    }
}
