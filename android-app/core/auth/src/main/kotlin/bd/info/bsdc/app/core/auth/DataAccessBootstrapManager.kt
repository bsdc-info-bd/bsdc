package bd.info.bsdc.app.core.auth

import bd.info.bsdc.app.core.model.SessionClaims
import bd.info.bsdc.app.core.network.BsdcPlatformApi
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await

/**
 * Kotlin coroutine port of main-site/src/lib/auth/data-access.ts.
 *
 * Ensures every authenticated member holds `role = "authenticated"` in their
 * Firebase ID token before any Supabase PostgREST request fires, sharing one
 * single-flight mutex per user session.
 */
class DataAccessBootstrapManager(
    private val firebaseAuth: FirebaseAuth,
    private val platformApi: BsdcPlatformApi,
) {
    private val mutex = Mutex()

    suspend fun ensureDataAccess(user: FirebaseUser): Pair<String, SessionClaims> = mutex.withLock {
        val currentResult = user.getIdToken(false).await()
        val initialClaims = AuthDomainValidators.parseSessionClaims(currentResult.claims)
        val initialToken = currentResult.token

        if (initialClaims.postgresAuthenticated && !initialToken.isNullOrBlank()) {
            return@withLock initialToken to initialClaims
        }

        val freshToken = initialToken ?: user.getIdToken(true).await().token
            ?: throw IllegalStateException("Firebase ID token missing")

        platformApi.mintAuthClaims(
            idToken = freshToken,
            uid = user.uid,
            bootstrapRole = initialClaims.role,
        )

        // Verify the active Firebase user hasn't switched mid-flight
        val activeUser = firebaseAuth.currentUser
        if (activeUser == null || activeUser.uid != user.uid) {
            throw IllegalStateException("auth/required")
        }

        val refreshedResult = activeUser.getIdToken(true).await()
        val refreshedClaims = AuthDomainValidators.parseSessionClaims(refreshedResult.claims)
        val refreshedToken = refreshedResult.token
            ?: throw IllegalStateException("Refreshed token missing")

        refreshedToken to refreshedClaims
    }

    suspend fun currentSupabaseToken(): String? {
        val user = firebaseAuth.currentUser ?: return null
        return runCatching { ensureDataAccess(user).first }.getOrNull()
    }
}
