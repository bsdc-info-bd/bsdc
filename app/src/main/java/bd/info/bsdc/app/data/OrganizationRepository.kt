package bd.info.bsdc.app.data

import bd.info.bsdc.app.core.FirebaseGate
import bd.info.bsdc.app.core.RepositoryResult
import bd.info.bsdc.app.model.CommunityOrganization
import bd.info.bsdc.app.model.OrganizationMembership
import bd.info.bsdc.app.model.UserProfile
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Organization profiles are durable Firestore data, not a local posting label. The owner can
 * create an organization and add existing BSDC members as editors; only an editor may publish
 * with that organization attribution.
 */
class OrganizationRepository(private val gate: FirebaseGate) {
    private val database get() = FirebaseFirestore.getInstance()

    fun observeMine(): Flow<List<OrganizationMembership>> = callbackFlow {
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (!gate.isConfigured || uid == null) {
            trySend(emptyList()); close(); return@callbackFlow
        }
        val registration = database.collection("profiles").document(uid).collection("organizationMemberships")
            .orderBy("organizationName", Query.Direction.ASCENDING)
            .addSnapshotListener { snapshot, error ->
                if (error != null) close(error)
                else trySend(snapshot?.documents.orEmpty().mapNotNull { it.toObject(OrganizationMembership::class.java) })
            }
        awaitClose(registration::remove)
    }

    fun observeOrganization(id: String): Flow<CommunityOrganization?> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(null); close(); return@callbackFlow
        }
        val registration = database.collection("organizations").document(id).addSnapshotListener { snapshot, error ->
            if (error != null) close(error) else trySend(snapshot?.toObject(CommunityOrganization::class.java))
        }
        awaitClose(registration::remove)
    }

    fun observeMembers(id: String): Flow<List<OrganizationMembership>> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(emptyList()); close(); return@callbackFlow
        }
        val registration = database.collection("organizations").document(id).collection("members")
            .orderBy("organizationName", Query.Direction.ASCENDING)
            .addSnapshotListener { snapshot, error ->
                if (error != null) close(error)
                else trySend(snapshot?.documents.orEmpty().mapNotNull { it.toObject(OrganizationMembership::class.java) })
            }
        awaitClose(registration::remove)
    }

    suspend fun create(name: String, handle: String, description: String): RepositoryResult<String> = try {
        gate.requireConfigured()
        val user = FirebaseAuth.getInstance().currentUser ?: error("Sign in to create an organization.")
        val cleanName = name.trim()
        val cleanHandle = normalizeHandle(handle)
        require(cleanName.length in 3..90) { "Organization names must be 3–90 characters." }
        require(description.trim().length <= 280) { "Organization descriptions are limited to 280 characters." }
        require(cleanHandle != null) { "Use 3–30 lowercase letters, numbers, or underscores for the handle." }

        val profile = database.collection("profiles").document(user.uid).get().await().toObject(UserProfile::class.java)
            ?: error("Complete your BSDC profile before creating an organization.")
        val orgRef = database.collection("organizations").document()
        val handleRef = database.collection("organizationHandles").document(cleanHandle)
        val member = membership(orgRef.id, cleanName, cleanHandle, "owner", profile)
        database.runTransaction { transaction ->
            if (transaction.get(handleRef).exists()) error("That organization handle is already in use.")
            transaction.set(handleRef, mapOf("organizationId" to orgRef.id, "createdBy" to user.uid))
            transaction.set(orgRef, mapOf(
                "handle" to cleanHandle,
                "name" to cleanName,
                "description" to description.trim(),
                "photoUrl" to null,
                "ownerId" to user.uid,
                "memberCount" to 1L,
                "createdAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp()
            ))
            transaction.set(orgRef.collection("members").document(user.uid), member)
            transaction.set(database.collection("profiles").document(user.uid).collection("organizationMemberships").document(orgRef.id), member)
        }.await()
        RepositoryResult.Success(orgRef.id)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not create organization.", t)
    }

    suspend fun addEditor(organization: CommunityOrganization, handle: String): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        val current = FirebaseAuth.getInstance().currentUser ?: error("Sign in to manage organizations.")
        require(organization.ownerId == current.uid) { "Only the organization owner can add editors." }
        val normalized = normalizeHandle(handle) ?: error("Enter a valid BSDC member handle.")
        val targetUid = database.collection("handles").document(normalized).get().await().getString("uid")
            ?: error("@$normalized is not a BSDC member.")
        require(targetUid != current.uid) { "You already own this organization." }
        val target = database.collection("profiles").document(targetUid).get().await().toObject(UserProfile::class.java)
            ?: error("@$normalized does not have a BSDC profile.")
        val orgRef = database.collection("organizations").document(organization.id)
        val memberRef = orgRef.collection("members").document(targetUid)
        val membership = membership(organization.id, organization.name, organization.handle, "editor", target)
        database.runTransaction { transaction ->
            if (!transaction.get(memberRef).exists()) {
                transaction.set(memberRef, membership)
                transaction.set(database.collection("profiles").document(targetUid).collection("organizationMemberships").document(organization.id), membership)
                transaction.update(orgRef, mapOf("memberCount" to FieldValue.increment(1), "updatedAt" to FieldValue.serverTimestamp()))
            }
        }.await()
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not add organization editor.", t)
    }

    private fun membership(orgId: String, name: String, handle: String, role: String, member: UserProfile) = mapOf(
        "organizationId" to orgId,
        "organizationName" to name,
        "organizationHandle" to handle,
        "memberId" to member.id,
        "memberName" to member.displayName,
        "memberHandle" to member.username,
        "role" to role,
        "joinedAt" to FieldValue.serverTimestamp()
    )

    private fun normalizeHandle(value: String): String? {
        val clean = value.trim().removePrefix("@").lowercase()
        return clean.takeIf { it.matches(Regex("[a-z0-9_]{3,30}")) }
    }
}
