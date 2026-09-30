package bd.info.bsdc.app.data

import bd.info.bsdc.app.core.FirebaseGate
import bd.info.bsdc.app.core.RepositoryResult
import bd.info.bsdc.app.model.CommunityPost
import bd.info.bsdc.app.model.UserProfile
import com.google.firebase.firestore.FieldPath
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.tasks.await

/**
 * Bounded discovery over public Firestore data. This intentionally does not claim arbitrary
 * full-text, semantic, or private-content search: handles use a document-ID prefix query and
 * posts use exact public tags, both with explicit query limits and deployable indexes.
 */
class SearchRepository(private val gate: FirebaseGate) {
    private val database get() = FirebaseFirestore.getInstance()

    suspend fun searchMembers(rawQuery: String): RepositoryResult<List<UserProfile>> = try {
        gate.requireConfigured()
        val prefix = normalizeHandlePrefix(rawQuery)
        val handles = database.collection("handles")
            .orderBy(FieldPath.documentId())
            .startAt(prefix)
            .endAt("$prefix\uf8ff")
            .limit(MAX_MEMBER_RESULTS)
            .get()
            .await()
        val ids = handles.documents.mapNotNull { it.getString("uid") }.distinct().take(MAX_MEMBER_RESULTS.toInt())
        val profiles = ids.mapNotNull { uid ->
            database.collection("profiles").document(uid).get().await().toObject(UserProfile::class.java)
        }
        RepositoryResult.Success(profiles)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not search BSDC members.", t)
    }

    suspend fun searchPublicPostsByTag(rawQuery: String): RepositoryResult<List<CommunityPost>> = try {
        gate.requireConfigured()
        val tag = normalizeTag(rawQuery)
        val posts = database.collection("posts")
            .whereArrayContains("tags", tag)
            .whereEqualTo("visibility", "PUBLIC")
            .whereEqualTo("status", "published")
            .orderBy("publishedAt", Query.Direction.DESCENDING)
            .limit(MAX_POST_RESULTS)
            .get()
            .await()
            .documents
            .mapNotNull { it.toObject(CommunityPost::class.java) }
        RepositoryResult.Success(posts)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not search public post topics.", t)
    }

    private fun normalizeHandlePrefix(raw: String): String {
        val value = raw.trim().removePrefix("@").lowercase()
        require(HANDLE_PREFIX.matches(value)) { "Use at least 2 lowercase handle characters: letters, numbers, or underscores." }
        return value
    }

    private fun normalizeTag(raw: String): String {
        val value = raw.trim().removePrefix("#").lowercase()
        require(TAG.matches(value)) { "Use a 2–32 character tag with lowercase letters, numbers, hyphens, or underscores." }
        return value
    }

    private companion object {
        const val MAX_MEMBER_RESULTS = 20L
        const val MAX_POST_RESULTS = 30L
        val HANDLE_PREFIX = Regex("^[a-z0-9_]{2,30}$")
        val TAG = Regex("^[a-z0-9][a-z0-9_-]{1,31}$")
    }
}
