package bd.info.bsdc.app.notifications

import bd.info.bsdc.app.core.FirebaseGate
import bd.info.bsdc.app.core.RepositoryResult
import bd.info.bsdc.app.model.AppNotification
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import java.security.MessageDigest

class NotificationRepository(private val gate: FirebaseGate) {
    private val database get() = FirebaseFirestore.getInstance()

    fun observeMine(): Flow<List<AppNotification>> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(emptyList()); close(); return@callbackFlow
        }
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (uid == null) {
            trySend(emptyList()); close(); return@callbackFlow
        }
        val registration = database.collection("profiles").document(uid).collection("notifications")
            .orderBy("createdAt", Query.Direction.DESCENDING).limit(80)
            .addSnapshotListener { snapshot, error ->
                if (error != null) close(error)
                else trySend(snapshot?.documents.orEmpty().mapNotNull { it.toObject(AppNotification::class.java)?.copy(id = it.id) })
            }
        awaitClose(registration::remove)
    }

    suspend fun registerDevice(token: String): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return RepositoryResult.Success(Unit)
        require(token.isNotBlank())
        database.collection("profiles").document(uid).collection("devices").document(sha256(token)).set(
            mapOf(
                "token" to token,
                "platform" to "android",
                "updatedAt" to FieldValue.serverTimestamp()
            )
        ).await()
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not register this device.", t)
    }

    suspend fun markRead(notificationId: String): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return RepositoryResult.Success(Unit)
        database.collection("profiles").document(uid).collection("notifications").document(notificationId)
            .update("isRead", true).await()
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not update notification.", t)
    }

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
}
