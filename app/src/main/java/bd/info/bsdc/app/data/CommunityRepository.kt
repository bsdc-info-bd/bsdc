package bd.info.bsdc.app.data

import bd.info.bsdc.app.core.FirebaseGate
import bd.info.bsdc.app.core.RepositoryResult
import bd.info.bsdc.app.model.CommunityPost
import bd.info.bsdc.app.model.MediaAttachment
import bd.info.bsdc.app.model.PostComment
import bd.info.bsdc.app.model.PostVisibility
import bd.info.bsdc.app.model.ReactionType
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

data class PostDraft(
    val body: String,
    val language: String,
    val tags: List<String>,
    val visibility: PostVisibility,
    val media: List<MediaAttachment> = emptyList()
)

class CommunityRepository(private val gate: FirebaseGate) {
    private val database get() = FirebaseFirestore.getInstance()

    fun observePublicFeed(limit: Long = 50): Flow<List<CommunityPost>> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(emptyList())
            close()
            return@callbackFlow
        }
        val registration = database.collection("posts")
            .whereEqualTo("visibility", PostVisibility.PUBLIC.name)
            .whereEqualTo("status", "published")
            .orderBy("createdAt", Query.Direction.DESCENDING)
            .limit(limit)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                } else {
                    trySend(snapshot?.documents.orEmpty().mapNotNull { it.toObject(CommunityPost::class.java) })
                }
            }
        awaitClose(registration::remove)
    }

    suspend fun publish(draft: PostDraft): RepositoryResult<String> = try {
        gate.requireConfigured()
        val user = FirebaseAuth.getInstance().currentUser ?: error("Sign in to publish.")
        val profile = database.collection("profiles").document(user.uid).get().await()
        val body = draft.body.trim()
        require(body.isNotBlank() || draft.media.isNotEmpty()) { "Write something or attach media." }
        require(body.length <= 10_000) { "Posts are limited to 10,000 characters." }
        require(draft.tags.size <= 8) { "Use no more than 8 topics." }
        val post = hashMapOf<String, Any?>(
            "authorId" to user.uid,
            "authorHandle" to (profile.getString("username") ?: ""),
            "authorName" to (profile.getString("displayName") ?: user.displayName ?: ""),
            "authorPhotoUrl" to profile.getString("photoUrl"),
            "body" to body,
            "language" to draft.language,
            "tags" to draft.tags.map { it.trim().lowercase() }.filter { it.isNotBlank() }.distinct(),
            "media" to draft.media,
            "visibility" to draft.visibility.name,
            "status" to "published",
            "createdAt" to FieldValue.serverTimestamp(),
            "updatedAt" to FieldValue.serverTimestamp(),
            "reactionCount" to 0L,
            "commentCount" to 0L,
            "shareCount" to 0L,
            "saveCount" to 0L,
            "ranking" to mapOf("quality" to 0.0)
        )
        val ref = database.collection("posts").document()
        ref.set(post).await()
        RepositoryResult.Success(ref.id)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not publish post.", t)
    }

    suspend fun toggleReaction(postId: String, type: ReactionType): RepositoryResult<Boolean> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: error("Sign in to react.")
        val postRef = database.collection("posts").document(postId)
        val reactionRef = postRef.collection("reactions").document(uid)
        val nowReacted = database.runTransaction { tx ->
            val existing = tx.get(reactionRef)
            if (existing.exists()) {
                tx.delete(reactionRef)
                false
            } else {
                tx.set(reactionRef, mapOf("type" to type.name, "createdAt" to FieldValue.serverTimestamp()))
                true
            }
        }.await()
        RepositoryResult.Success(nowReacted)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not update reaction.", t)
    }

    fun observeComments(postId: String): Flow<List<PostComment>> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(emptyList()); close(); return@callbackFlow
        }
        val registration = database.collection("posts").document(postId).collection("comments")
            .whereEqualTo("status", "published")
            .orderBy("createdAt", Query.Direction.ASCENDING)
            .limit(200)
            .addSnapshotListener { snapshot, error ->
                if (error != null) close(error)
                else trySend(snapshot?.documents.orEmpty().mapNotNull { it.toObject(PostComment::class.java) })
            }
        awaitClose(registration::remove)
    }

    suspend fun addComment(postId: String, body: String, parentId: String? = null): RepositoryResult<String> = try {
        gate.requireConfigured()
        val user = FirebaseAuth.getInstance().currentUser ?: error("Sign in to comment.")
        val text = body.trim()
        require(text.length in 1..2_000) { "Comments must be 1–2,000 characters." }
        val profile = database.collection("profiles").document(user.uid).get().await()
        val commentRef = database.collection("posts").document(postId).collection("comments").document()
        commentRef.set(mapOf(
            "authorId" to user.uid,
            "authorName" to (profile.getString("displayName") ?: user.displayName ?: ""),
            "authorPhotoUrl" to profile.getString("photoUrl"),
            "body" to text,
            "parentId" to parentId,
            "createdAt" to FieldValue.serverTimestamp(),
            "reactionCount" to 0L,
            "status" to "published"
        )).await()
        RepositoryResult.Success(commentRef.id)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not publish comment.", t)
    }

    suspend fun reportPost(postId: String, reason: String, details: String = ""): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: error("Sign in to report content.")
        require(reason.isNotBlank()) { "Select a report reason." }
        database.collection("reports").document().set(mapOf(
            "targetType" to "post",
            "targetId" to postId,
            "reporterId" to uid,
            "reason" to reason.take(80),
            "details" to details.take(1_000),
            "state" to "open",
            "createdAt" to FieldValue.serverTimestamp()
        )).await()
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not submit report.", t)
    }

    suspend fun recordDwell(postId: String, visibleMillis: Long): RepositoryResult<Unit> {
        return try {
            gate.requireConfigured()
            val uid = FirebaseAuth.getInstance().currentUser?.uid
            if (uid == null || visibleMillis < 1_500) {
                RepositoryResult.Success(Unit)
            } else {
                database.collection("profiles").document(uid).collection("engagement").document(postId).set(
                    mapOf("lastDwellMs" to visibleMillis.coerceAtMost(120_000), "updatedAt" to Timestamp.now()),
                    com.google.firebase.firestore.SetOptions.merge()
                ).await()
                RepositoryResult.Success(Unit)
            }
        } catch (t: Throwable) {
            RepositoryResult.Failure(t.message ?: "Could not record engagement.", t)
        }
    }
}
