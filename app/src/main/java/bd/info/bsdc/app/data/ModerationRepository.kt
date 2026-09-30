package bd.info.bsdc.app.data

import bd.info.bsdc.app.core.FirebaseGate
import bd.info.bsdc.app.core.RepositoryResult
import bd.info.bsdc.app.model.CommunityPost
import bd.info.bsdc.app.model.ContentReport
import bd.info.bsdc.app.model.ModerationAction
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Staff visibility is only a convenience for native navigation. Firestore Rules and callable
 * Functions independently require a trusted role custom claim; this repository grants no role.
 */
class ModerationRepository(private val gate: FirebaseGate) {
    private val database get() = FirebaseFirestore.getInstance()
    private val functions get() = FirebaseFunctions.getInstance()

    suspend fun hasStaffRole(): Boolean = runCatching {
        gate.requireConfigured()
        val user = FirebaseAuth.getInstance().currentUser ?: return@runCatching false
        val role = user.getIdToken(true).await().claims["role"] as? String
        role in STAFF_ROLES
    }.getOrDefault(false)

    fun observeOpenReports(): Flow<List<ContentReport>> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(emptyList()); close(); return@callbackFlow
        }
        val registration = database.collection("reports")
            .whereEqualTo("state", "OPEN")
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(MAX_STAFF_RESULTS)
            .addSnapshotListener { snapshot, error ->
                if (error != null) close(error)
                else trySend(snapshot?.documents.orEmpty().mapNotNull { it.toObject(ContentReport::class.java) })
            }
        awaitClose(registration::remove)
    }

    fun observeModeratedPosts(): Flow<List<CommunityPost>> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(emptyList()); close(); return@callbackFlow
        }
        val registration = database.collection("posts")
            .whereEqualTo("status", "moderated")
            .orderBy("updatedAt", Query.Direction.DESCENDING)
            .limit(MAX_STAFF_RESULTS)
            .addSnapshotListener { snapshot, error ->
                if (error != null) close(error)
                else trySend(snapshot?.documents.orEmpty().mapNotNull { it.toObject(CommunityPost::class.java) })
            }
        awaitClose(registration::remove)
    }

    suspend fun resolveReport(reportId: String, action: ModerationAction, note: String): RepositoryResult<Unit> = invokeModeration(
        function = "moderateReport",
        payload = mapOf("reportId" to reportId, "action" to action.name, "note" to note.trim())
    )

    suspend fun restorePost(postId: String, note: String): RepositoryResult<Unit> = invokeModeration(
        function = "restoreModeratedPost",
        payload = mapOf("postId" to postId, "note" to note.trim())
    )

    private suspend fun invokeModeration(function: String, payload: Map<String, String>): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        require(hasStaffRole()) { "A trusted BSDC staff role is required for moderation." }
        functions.getHttpsCallable(function).call(payload).await()
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not complete the moderation action.", t)
    }

    private companion object {
        val STAFF_ROLES = setOf("admin", "moderator")
        const val MAX_STAFF_RESULTS = 100L
    }
}
