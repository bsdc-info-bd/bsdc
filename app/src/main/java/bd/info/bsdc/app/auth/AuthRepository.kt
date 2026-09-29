package bd.info.bsdc.app.auth

import android.app.Activity
import android.content.Context
import android.content.Intent
import bd.info.bsdc.app.BuildConfig
import bd.info.bsdc.app.core.FirebaseGate
import bd.info.bsdc.app.core.RepositoryResult
import bd.info.bsdc.app.core.guarded
import bd.info.bsdc.app.model.UserProfile
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.firebase.auth.AuthCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.OAuthProvider
import com.google.firebase.auth.UserProfileChangeRequest
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

sealed interface AuthState {
    data object Loading : AuthState
    data object ConfigurationRequired : AuthState
    data object SignedOut : AuthState
    data class SignedIn(val user: FirebaseUser) : AuthState
}

class AuthRepository(private val gate: FirebaseGate) {
    fun observeAuth(): Flow<AuthState> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(AuthState.ConfigurationRequired)
            close()
            return@callbackFlow
        }
        val listener = FirebaseAuth.getInstance().addAuthStateListener { auth ->
            trySend(auth.currentUser?.let(AuthState::SignedIn) ?: AuthState.SignedOut)
        }
        awaitClose { FirebaseAuth.getInstance().removeAuthStateListener(listener) }
    }

    suspend fun signIn(email: String, password: String): RepositoryResult<FirebaseUser> = guarded(gate) {
        FirebaseAuth.getInstance().signInWithEmailAndPassword(email.trim(), password).await().user
            ?: error("Authentication did not return an account.")
    }

    suspend fun signUp(
        email: String,
        password: String,
        displayName: String,
        username: String
    ): RepositoryResult<FirebaseUser> = try {
        gate.requireConfigured()
        require(displayName.trim().length in 2..60) { "Enter a display name between 2 and 60 characters." }
        require(UsernamePolicy.isValid(username)) { UsernamePolicy.message }
        val auth = FirebaseAuth.getInstance()
        val user = auth.createUserWithEmailAndPassword(email.trim(), password).await().user
            ?: error("Account could not be created.")
        user.updateProfile(UserProfileChangeRequest.Builder().setDisplayName(displayName.trim()).build()).await()
        val handle = UsernamePolicy.normalise(username)
        FirebaseFirestore.getInstance().runTransaction { transaction ->
            val handleRef = FirebaseFirestore.getInstance().collection("handles").document(handle)
            check(!transaction.get(handleRef).exists()) { "That username is unavailable." }
            transaction.set(handleRef, mapOf("uid" to user.uid, "createdAt" to FieldValue.serverTimestamp()))
            transaction.set(
                FirebaseFirestore.getInstance().collection("profiles").document(user.uid),
                mapOf(
                    "username" to handle,
                    "displayName" to displayName.trim(),
                    "bio" to "",
                    "skills" to emptyList<String>(),
                    "followerCount" to 0L,
                    "followingCount" to 0L,
                    "verified" to false,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                )
            )
        }.await()
        user.sendEmailVerification().await()
        RepositoryResult.Success(user)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not create account.", t)
    }

    fun googleIntent(context: Context): Intent {
        gate.requireConfigured()
        check(BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank()) {
            "Google sign-in has not been configured for this build."
        }
        val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(BuildConfig.GOOGLE_WEB_CLIENT_ID)
            .requestEmail()
            .build()
        return GoogleSignIn.getClient(context, options).signInIntent
    }

    suspend fun finishGoogleSignIn(data: Intent?): RepositoryResult<FirebaseUser> = try {
        gate.requireConfigured()
        val account = GoogleSignIn.getSignedInAccountFromIntent(data)
            .getResult(ApiException::class.java)
        val token = account.idToken ?: error("Google did not return an identity token.")
        authenticate(GoogleAuthProvider.getCredential(token, null))
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Google sign-in failed.", t)
    }

    suspend fun signInWithProvider(activity: Activity, providerId: String): RepositoryResult<FirebaseUser> = try {
        gate.requireConfigured()
        require(providerId in setOf("github.com", "yahoo.com")) { "Unsupported identity provider." }
        val provider = OAuthProvider.newBuilder(providerId).build()
        val user = FirebaseAuth.getInstance()
            .startActivityForSignInWithProvider(activity, provider)
            .await()
            .user ?: error("Provider did not return an account.")
        ensureProfile(user)
        RepositoryResult.Success(user)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Sign-in failed.", t)
    }

    suspend fun sendPasswordReset(email: String): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        FirebaseAuth.getInstance().sendPasswordResetEmail(email.trim()).await()
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not send reset email.", t)
    }

    suspend fun sendVerificationEmail(): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        val user = FirebaseAuth.getInstance().currentUser ?: error("Sign in first.")
        user.sendEmailVerification().await()
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not send verification email.", t)
    }

    fun signOut() {
        if (gate.isConfigured) FirebaseAuth.getInstance().signOut()
    }

    private suspend fun authenticate(credential: AuthCredential): RepositoryResult<FirebaseUser> = try {
        val user = FirebaseAuth.getInstance().signInWithCredential(credential).await().user
            ?: error("Authentication did not return an account.")
        ensureProfile(user)
        RepositoryResult.Success(user)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Authentication failed.", t)
    }

    private suspend fun ensureProfile(user: FirebaseUser) {
        val ref = FirebaseFirestore.getInstance().collection("profiles").document(user.uid)
        val existing = ref.get().await()
        if (!existing.exists()) {
            val safeBase = UsernamePolicy.suggestFrom(user.displayName ?: user.email ?: "member")
            ref.set(
                mapOf(
                    "username" to safeBase,
                    "displayName" to (user.displayName ?: "BSDC member"),
                    "photoUrl" to user.photoUrl?.toString(),
                    "bio" to "",
                    "skills" to emptyList<String>(),
                    "followerCount" to 0L,
                    "followingCount" to 0L,
                    "verified" to false,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                )
            ).await()
        }
    }
}

object UsernamePolicy {
    const val message = "Use 3–30 lowercase letters, numbers, or underscores."
    private val pattern = Regex("^[a-z0-9_]{3,30}$")
    fun normalise(value: String) = value.trim().lowercase()
    fun isValid(value: String) = pattern.matches(normalise(value))
    fun suggestFrom(value: String): String {
        val basic = value.lowercase().replace(Regex("[^a-z0-9]+"), "_").trim('_')
        return (basic.ifBlank { "member" }).take(24).padEnd(3, 'x')
    }
}
