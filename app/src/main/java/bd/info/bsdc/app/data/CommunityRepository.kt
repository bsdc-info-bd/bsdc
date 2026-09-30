package bd.info.bsdc.app.data

import bd.info.bsdc.app.content.PostEmbed
import bd.info.bsdc.app.core.FirebaseGate
import bd.info.bsdc.app.core.RepositoryResult
import bd.info.bsdc.app.model.CommunityPost
import bd.info.bsdc.app.model.ContentSeries
import bd.info.bsdc.app.model.MediaAttachment
import bd.info.bsdc.app.model.PostComment
import bd.info.bsdc.app.model.PostVisibility
import bd.info.bsdc.app.model.ReactionType
import bd.info.bsdc.app.model.UserProfile
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.tasks.await

data class PostDraft(
    val body: String,
    val language: String,
    val tags: List<String>,
    val visibility: PostVisibility,
    val media: List<MediaAttachment> = emptyList(),
    val format: String = "markdown",
    val frontmatter: Map<String, String> = emptyMap(),
    val embeds: List<PostEmbed> = emptyList(),
    val seriesId: String? = null,
    val seriesTitle: String? = null,
    val seriesOrder: Long? = null,
    val organizationId: String? = null,
    val organizationName: String? = null,
    val organizationHandle: String? = null,
    val coAuthorIds: List<String> = emptyList(),
    val coAuthorNames: List<String> = emptyList()
)

/** Firestore access for durable posts, drafts, series and discussion interaction. */
class CommunityRepository(private val gate: FirebaseGate) {
    private val database get() = FirebaseFirestore.getInstance()

    fun observePublicFeed(limit: Long = 50): Flow<List<CommunityPost>> = observePosts(
        database.collection("posts")
            .whereEqualTo("visibility", PostVisibility.PUBLIC.name)
            .whereEqualTo("status", "published")
            .orderBy("publishedAt", Query.Direction.DESCENDING)
            .limit(limit)
    )

    /** Private, real-time save list. The post itself remains subject to public-post Rules. */
    fun observeBookmarkIds(): Flow<List<String>> = callbackFlow {
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (!gate.isConfigured || uid == null) {
            trySend(emptyList())
            close()
            return@callbackFlow
        }
        val registration = database.collection("profiles").document(uid).collection("bookmarks")
            .orderBy("savedAt", Query.Direction.DESCENDING)
            .limit(60)
            .addSnapshotListener { snapshot, error ->
                if (error != null) close(error)
                else trySend(snapshot?.documents.orEmpty().map { it.id })
            }
        awaitClose(registration::remove)
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    fun observeBookmarkedPosts(): Flow<List<CommunityPost>> = observeBookmarkIds().flatMapLatest { ids ->
        if (ids.isEmpty()) flowOf(emptyList())
        else combine(ids.map { id -> observePost(id).catch { emit(null) } }) { snapshots ->
            // A post that is removed or ceases to be public simply leaves the private list.
            snapshots.filterIsInstance<CommunityPost>()
        }
    }

    suspend fun toggleBookmark(postId: String): RepositoryResult<Boolean> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: error("Sign in to save a post.")
        require(postId.isNotBlank()) { "This post cannot be saved." }
        val bookmark = database.collection("profiles").document(uid).collection("bookmarks").document(postId)
        val saved = database.runTransaction { transaction ->
            if (transaction.get(bookmark).exists()) {
                transaction.delete(bookmark)
                false
            } else {
                transaction.set(bookmark, mapOf("postId" to postId, "savedAt" to FieldValue.serverTimestamp()))
                true
            }
        }.await()
        RepositoryResult.Success(saved)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not update saved posts.", t)
    }

    fun observePost(postId: String): Flow<CommunityPost?> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(null)
            close()
            return@callbackFlow
        }
        val registration = database.collection("posts").document(postId).addSnapshotListener { snapshot, error ->
            if (error != null) close(error) else trySend(snapshot?.toObject(CommunityPost::class.java))
        }
        awaitClose(registration::remove)
    }

    fun observePostsByAuthor(authorId: String, limit: Long = 50): Flow<List<CommunityPost>> = observePosts(
        database.collection("posts")
            .whereEqualTo("authorId", authorId)
            .whereEqualTo("visibility", PostVisibility.PUBLIC.name)
            .whereEqualTo("status", "published")
            .orderBy("publishedAt", Query.Direction.DESCENDING)
            .limit(limit)
    )

    fun observeSeriesPosts(seriesId: String, limit: Long = 50): Flow<List<CommunityPost>> = observePosts(
        database.collection("posts")
            .whereEqualTo("seriesId", seriesId)
            .whereEqualTo("visibility", PostVisibility.PUBLIC.name)
            .whereEqualTo("status", "published")
            .orderBy("seriesOrder", Query.Direction.ASCENDING)
            .limit(limit)
    )

    fun observeOrganizationPosts(organizationId: String, limit: Long = 50): Flow<List<CommunityPost>> = observePosts(
        database.collection("posts")
            .whereEqualTo("organizationId", organizationId)
            .whereEqualTo("visibility", PostVisibility.PUBLIC.name)
            .whereEqualTo("status", "published")
            .orderBy("publishedAt", Query.Direction.DESCENDING)
            .limit(limit)
    )

    fun observeMyWorkingPosts(limit: Long = 40): Flow<List<CommunityPost>> = callbackFlow {
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (!gate.isConfigured || uid == null) {
            trySend(emptyList())
            close()
            return@callbackFlow
        }
        val registration = database.collection("posts")
            .whereEqualTo("authorId", uid)
            .whereIn("status", listOf("draft", "scheduled"))
            .orderBy("updatedAt", Query.Direction.DESCENDING)
            .limit(limit)
            .addSnapshotListener { snapshot, error ->
                if (error != null) close(error)
                else trySend(snapshot?.documents.orEmpty().mapNotNull { it.toObject(CommunityPost::class.java) })
            }
        awaitClose(registration::remove)
    }

    fun observeMySeries(): Flow<List<ContentSeries>> = callbackFlow {
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (!gate.isConfigured || uid == null) {
            trySend(emptyList()); close(); return@callbackFlow
        }
        val registration = database.collection("series")
            .whereEqualTo("ownerId", uid)
            .orderBy("updatedAt", Query.Direction.DESCENDING)
            .limit(60)
            .addSnapshotListener { snapshot, error ->
                if (error != null) close(error)
                else trySend(snapshot?.documents.orEmpty().mapNotNull { it.toObject(ContentSeries::class.java) })
            }
        awaitClose(registration::remove)
    }

    fun observeSeries(seriesId: String): Flow<ContentSeries?> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(null); close(); return@callbackFlow
        }
        val registration = database.collection("series").document(seriesId).addSnapshotListener { snapshot, error ->
            if (error != null) close(error) else trySend(snapshot?.toObject(ContentSeries::class.java))
        }
        awaitClose(registration::remove)
    }

    suspend fun createSeries(title: String, description: String): RepositoryResult<String> = try {
        gate.requireConfigured()
        val user = FirebaseAuth.getInstance().currentUser ?: error("Sign in to create a series.")
        val cleanTitle = title.trim()
        require(cleanTitle.length in 3..90) { "Series titles must be 3–90 characters." }
        require(description.trim().length <= 280) { "Series descriptions are limited to 280 characters." }
        val ref = database.collection("series").document()
        ref.set(mapOf(
            "ownerId" to user.uid,
            "title" to cleanTitle,
            "description" to description.trim(),
            "postCount" to 0L,
            "createdAt" to FieldValue.serverTimestamp(),
            "updatedAt" to FieldValue.serverTimestamp()
        )).await()
        RepositoryResult.Success(ref.id)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not create series.", t)
    }

    suspend fun saveDraft(draft: PostDraft, existingId: String? = null): RepositoryResult<String> = persist(draft, "draft", null, existingId)

    suspend fun schedule(draft: PostDraft, scheduledAt: Timestamp, existingId: String? = null): RepositoryResult<String> {
        if (scheduledAt.toDate().time <= System.currentTimeMillis() + 60_000L) {
            return RepositoryResult.Failure("Choose a publishing time at least one minute in the future.")
        }
        return persist(draft, "scheduled", scheduledAt, existingId)
    }

    suspend fun publish(draft: PostDraft, existingId: String? = null): RepositoryResult<String> = persist(draft, "published", null, existingId)

    private suspend fun persist(
        draft: PostDraft,
        status: String,
        scheduledAt: Timestamp?,
        existingId: String?
    ): RepositoryResult<String> = try {
        gate.requireConfigured()
        val user = FirebaseAuth.getInstance().currentUser ?: error("Sign in to publish.")
        val profile = database.collection("profiles").document(user.uid).get().await()
        val body = draft.body.trim()
        require(body.isNotBlank() || draft.media.isNotEmpty()) { "Write something or attach media." }
        require(body.length <= 10_000) { "Posts are limited to 10,000 characters." }
        val tags = draft.tags.map { it.trim().lowercase().removePrefix("#") }.filter { it.isNotBlank() }.distinct()
        require(tags.size <= 4) { "Use up to 4 tags." }
        require(draft.media.size <= 10) { "A post can include up to 10 media items." }
        require(draft.frontmatter.size <= 12) { "Use up to 12 frontmatter fields." }
        require(draft.embeds.size <= 8) { "Use up to 8 safe embeds." }
        require(draft.coAuthorIds.size <= 5) { "Use up to 5 co-authors." }
        require(draft.coAuthorIds.size == draft.coAuthorNames.size) { "Co-author information is incomplete." }

        val payload = linkedMapOf<String, Any?>(
            "authorId" to user.uid,
            "authorHandle" to (profile.getString("username") ?: ""),
            "authorName" to (profile.getString("displayName") ?: user.displayName ?: ""),
            "authorPhotoUrl" to profile.getString("photoUrl"),
            "body" to body,
            "format" to draft.format.take(24),
            "frontmatter" to draft.frontmatter,
            "embeds" to draft.embeds,
            "language" to draft.language.take(10),
            "tags" to tags,
            "media" to draft.media,
            "visibility" to draft.visibility.name,
            "status" to status,
            "scheduledAt" to scheduledAt,
            "seriesId" to draft.seriesId,
            "seriesTitle" to draft.seriesTitle,
            "seriesOrder" to draft.seriesOrder,
            "organizationId" to draft.organizationId,
            "organizationName" to draft.organizationName,
            "organizationHandle" to draft.organizationHandle,
            "coAuthorIds" to draft.coAuthorIds,
            "coAuthorNames" to draft.coAuthorNames,
            "updatedAt" to FieldValue.serverTimestamp()
        )
        if (status == "published") payload["publishedAt"] = FieldValue.serverTimestamp()
        if (existingId == null) {
            payload += mapOf(
                "createdAt" to FieldValue.serverTimestamp(),
                "reactionCount" to 0L,
                "commentCount" to 0L,
                "shareCount" to 0L,
                "saveCount" to 0L,
                "ranking" to mapOf("quality" to 0.0)
            )
            val ref = database.collection("posts").document()
            ref.set(payload).await()
            RepositoryResult.Success(ref.id)
        } else {
            database.collection("posts").document(existingId).update(payload).await()
            RepositoryResult.Success(existingId)
        }
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not save post.", t)
    }

    suspend fun resolveMemberHandles(handles: List<String>): RepositoryResult<List<UserProfile>> = try {
        gate.requireConfigured()
        require(FirebaseAuth.getInstance().currentUser != null) { "Sign in to add co-authors." }
        val normalized = handles.map { it.trim().removePrefix("@").lowercase() }.filter { it.isNotBlank() }.distinct()
        require(normalized.size <= 5) { "Use up to 5 co-authors." }
        val profiles = normalized.map { handle ->
            val handleDoc = database.collection("handles").document(handle).get().await()
            val uid = handleDoc.getString("uid") ?: error("@$handle is not a BSDC member.")
            database.collection("profiles").document(uid).get().await().toObject(UserProfile::class.java)
                ?: error("@$handle does not have a public profile.")
        }
        RepositoryResult.Success(profiles)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not find co-authors.", t)
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

    suspend fun recordDwell(postId: String, visibleMillis: Long): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (uid == null || visibleMillis < 1_500) RepositoryResult.Success(Unit)
        else {
            database.collection("profiles").document(uid).collection("engagement").document(postId).set(
                mapOf("lastDwellMs" to visibleMillis.coerceAtMost(120_000), "updatedAt" to Timestamp.now()),
                com.google.firebase.firestore.SetOptions.merge()
            ).await()
            RepositoryResult.Success(Unit)
        }
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not record engagement.", t)
    }

    private fun observePosts(query: Query): Flow<List<CommunityPost>> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(emptyList()); close(); return@callbackFlow
        }
        val registration = query.addSnapshotListener { snapshot, error ->
            if (error != null) close(error)
            else trySend(snapshot?.documents.orEmpty().mapNotNull { it.toObject(CommunityPost::class.java) })
        }
        awaitClose(registration::remove)
    }
}
