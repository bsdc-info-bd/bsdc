package bd.info.bsdc.app.data

import bd.info.bsdc.app.core.FirebaseGate
import bd.info.bsdc.app.core.RepositoryResult
import bd.info.bsdc.app.model.UserProfile
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class ProfileRepository(private val gate: FirebaseGate) {
    private val database get() = FirebaseFirestore.getInstance()

    fun observeProfile(uid: String): Flow<UserProfile?> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(null); close(); return@callbackFlow
        }
        val registration = database.collection("profiles").document(uid)
            .addSnapshotListener { snapshot, error ->
                if (error != null) close(error)
                else trySend(snapshot?.toObject(UserProfile::class.java))
            }
        awaitClose(registration::remove)
    }

    suspend fun updateMyProfile(
        displayName: String,
        bio: String,
        skills: List<String>,
        locationLabel: String?
    ): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: error("Sign in to edit your profile.")
        require(displayName.trim().length in 2..60) { "Display name must be 2–60 characters." }
        require(bio.length <= 500) { "Bio must be at most 500 characters." }
        require(skills.size <= 20) { "Use no more than 20 skills." }
        database.collection("profiles").document(uid).set(mapOf(
            "displayName" to displayName.trim(),
            "bio" to bio.trim(),
            "skills" to skills.map(String::trim).filter(String::isNotEmpty).distinct().take(20),
            "locationLabel" to locationLabel?.trim()?.takeIf(String::isNotEmpty),
            "updatedAt" to FieldValue.serverTimestamp()
        ), SetOptions.merge()).await()
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not update profile.", t)
    }

    suspend fun follow(targetUid: String): RepositoryResult<Boolean> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: error("Sign in to follow members.")
        require(uid != targetUid) { "You cannot follow yourself." }
        val me = database.collection("profiles").document(uid)
        val target = database.collection("profiles").document(targetUid)
        val following = me.collection("following").document(targetUid)
        val follower = target.collection("followers").document(uid)
        val nowFollowing = database.runTransaction { tx ->
            if (tx.get(following).exists()) {
                tx.delete(following)
                tx.delete(follower)
                false
            } else {
                tx.set(following, mapOf("createdAt" to FieldValue.serverTimestamp()))
                tx.set(follower, mapOf("createdAt" to FieldValue.serverTimestamp()))
                true
            }
        }.await()
        RepositoryResult.Success(nowFollowing)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not update follow status.", t)
    }
}
