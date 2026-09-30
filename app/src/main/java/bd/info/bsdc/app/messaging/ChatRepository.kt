package bd.info.bsdc.app.messaging

import bd.info.bsdc.app.auth.UsernamePolicy
import bd.info.bsdc.app.core.FirebaseGate
import bd.info.bsdc.app.core.RepositoryResult
import bd.info.bsdc.app.model.ChatMessage
import bd.info.bsdc.app.model.DirectConversation
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseReference
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ServerValue
import com.google.firebase.database.ValueEventListener
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Realtime Database transport for direct and group messaging. Durable profile identity lookups
 * remain in Firestore; latency-sensitive conversation state, messages, typing and unread state
 * live in Realtime Database under membership-protected paths.
 */
class ChatRepository(private val gate: FirebaseGate) {
    private val root: DatabaseReference get() = FirebaseDatabase.getInstance().reference
    private val firestore get() = FirebaseFirestore.getInstance()

    fun directConversationId(firstUid: String, secondUid: String): String =
        listOf(firstUid, secondUid).sorted().joinToString("_")

    suspend fun ensureDirectConversation(otherUid: String): RepositoryResult<String> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: error("Sign in to message members.")
        require(uid != otherUid) { "You cannot message yourself." }
        val id = directConversationId(uid, otherUid)
        val ref = root.child("conversations").child(id)
        val snapshot = ref.get().await()
        if (!snapshot.exists()) {
            ref.setValue(mapOf(
                "kind" to "direct",
                "participants" to mapOf(uid to true, otherUid to true),
                "memberCount" to 2,
                "createdBy" to uid,
                "createdAt" to ServerValue.TIMESTAMP,
                "lastMessage" to "",
                "lastMessageAt" to ServerValue.TIMESTAMP,
                "unreadBy" to mapOf(uid to 0, otherUid to 0)
            )).await()
        }
        RepositoryResult.Success(id)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not open conversation.", t)
    }

    /** Creates a real RTDB group after resolving public BSDC handles to Firebase UIDs. */
    suspend fun createGroup(title: String, description: String, rawHandles: String): RepositoryResult<String> = try {
        gate.requireConfigured()
        val ownerId = FirebaseAuth.getInstance().currentUser?.uid ?: error("Sign in to create a group.")
        val cleanTitle = title.trim()
        require(cleanTitle.length in 3..80) { "Group name must be 3–80 characters." }
        require(description.trim().length <= 500) { "Group description must be at most 500 characters." }
        val handles = rawHandles.split(',', ' ', '\n', ';')
            .map { UsernamePolicy.normalise(it.removePrefix("@")) }
            .filter(String::isNotBlank)
            .distinct()
            .take(49)
        require(handles.isNotEmpty()) { "Add at least one BSDC member handle." }
        val memberIds = handles.map { handle ->
            val document = firestore.collection("handles").document(handle).get().await()
            document.getString("uid") ?: error("@${handle} was not found on BSDC.")
        }.toMutableSet().apply { add(ownerId) }
        require(memberIds.size in 2..50) { "Groups must contain 2–50 members." }

        val ref = root.child("conversations").push()
        val groupId = ref.key ?: error("Could not allocate a group ID.")
        ref.setValue(mapOf(
            "kind" to "group",
            "title" to cleanTitle,
            "description" to description.trim(),
            "createdBy" to ownerId,
            "participants" to memberIds.associateWith { true },
            "memberCount" to memberIds.size,
            "createdAt" to ServerValue.TIMESTAMP,
            "lastMessage" to "Group created",
            "lastMessageAt" to ServerValue.TIMESTAMP,
            "unreadBy" to memberIds.associateWith { 0 }
        )).await()
        RepositoryResult.Success(groupId)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not create group.", t)
    }

    fun observeConversations(): Flow<List<DirectConversation>> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(emptyList()); close(); return@callbackFlow
        }
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (uid == null) {
            trySend(emptyList()); close(); return@callbackFlow
        }
        // A nested participant index scopes the query before it reaches the client. RTDB rules
        // repeat the same membership check for defense in depth.
        val ref = root.child("conversations").orderByChild("participants/$uid").equalTo(true)
        val listener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                trySend(snapshot.children.map(::conversationFrom).sortedByDescending { it.lastMessageAt })
            }
            override fun onCancelled(error: com.google.firebase.database.DatabaseError) { close(error.toException()) }
        }
        ref.addValueEventListener(listener)
        awaitClose { ref.removeEventListener(listener) }
    }

    fun observeConversation(conversationId: String): Flow<DirectConversation?> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(null); close(); return@callbackFlow
        }
        val ref = root.child("conversations").child(conversationId)
        val listener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                trySend(if (snapshot.exists()) conversationFrom(snapshot) else null)
            }
            override fun onCancelled(error: com.google.firebase.database.DatabaseError) { close(error.toException()) }
        }
        ref.addValueEventListener(listener)
        awaitClose { ref.removeEventListener(listener) }
    }

    fun observeMessages(conversationId: String): Flow<List<ChatMessage>> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(emptyList()); close(); return@callbackFlow
        }
        val ref = root.child("messages").child(conversationId).limitToLast(150)
        val listener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val messages = snapshot.children.mapNotNull { child ->
                    child.getValue(ChatMessage::class.java)?.copy(id = child.key.orEmpty())
                }.sortedBy(ChatMessage::sentAt)
                trySend(messages)
            }
            override fun onCancelled(error: com.google.firebase.database.DatabaseError) { close(error.toException()) }
        }
        ref.addValueEventListener(listener)
        awaitClose { ref.removeEventListener(listener) }
    }

    fun observeTyping(conversationId: String): Flow<Set<String>> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(emptySet()); close(); return@callbackFlow
        }
        val ref = root.child("typing").child(conversationId)
        val listener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                trySend(snapshot.children.filter { it.getValue(Boolean::class.java) == true }.mapNotNull { it.key }.toSet())
            }
            override fun onCancelled(error: com.google.firebase.database.DatabaseError) { close(error.toException()) }
        }
        ref.addValueEventListener(listener)
        awaitClose { ref.removeEventListener(listener) }
    }

    suspend fun sendText(conversationId: String, text: String, replyToId: String? = null): RepositoryResult<String> =
        sendMessage(conversationId, "text", text.trim(), null, replyToId)

    suspend fun sendAttachment(
        conversationId: String,
        kind: String,
        url: String,
        replyToId: String? = null
    ): RepositoryResult<String> {
        require(kind in setOf("image", "audio")) { "Only images and voice notes are supported." }
        return sendMessage(conversationId, kind, "", url, replyToId)
    }

    suspend fun editMessage(conversationId: String, messageId: String, updatedBody: String): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: error("Sign in to edit messages.")
        val text = updatedBody.trim()
        require(text.length in 1..4_000) { "Messages must be 1–4,000 characters." }
        val ref = root.child("messages").child(conversationId).child(messageId)
        check(ref.get().await().child("senderId").getValue(String::class.java) == uid) { "Only the sender can edit this message." }
        ref.updateChildren(mapOf("body" to text, "editedAt" to ServerValue.TIMESTAMP)).await()
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not edit message.", t)
    }

    suspend fun deleteMessage(conversationId: String, messageId: String): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: error("Sign in to remove messages.")
        val ref = root.child("messages").child(conversationId).child(messageId)
        check(ref.get().await().child("senderId").getValue(String::class.java) == uid) { "Only the sender can remove this message." }
        ref.updateChildren(mapOf(
            "body" to "Message removed",
            "attachmentUrl" to null,
            "deletedAt" to ServerValue.TIMESTAMP
        )).await()
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not remove message.", t)
    }

    private suspend fun sendMessage(
        conversationId: String,
        kind: String,
        body: String,
        attachmentUrl: String?,
        replyToId: String?
    ): RepositoryResult<String> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: error("Sign in to send messages.")
        require(body.isNotBlank() || attachmentUrl != null) { "Write a message or attach media." }
        require(body.length <= 4_000) { "Messages are limited to 4,000 characters." }
        val conversation = root.child("conversations").child(conversationId).get().await()
        check(conversation.child("participants").child(uid).getValue(Boolean::class.java) == true) { "You are not a member of this conversation." }
        val messageRef = root.child("messages").child(conversationId).push()
        val payload = mapOf(
            "id" to messageRef.key,
            "senderId" to uid,
            "kind" to kind,
            "body" to body,
            "attachmentUrl" to attachmentUrl,
            "sentAt" to ServerValue.TIMESTAMP,
            "replyToId" to replyToId
        )
        val preview = when (kind) {
            "text" -> body.take(120)
            "image" -> "Sent an image"
            else -> "Sent a voice note"
        }
        val updates = mutableMapOf<String, Any?>(
            "/messages/$conversationId/${messageRef.key}" to payload,
            "/conversations/$conversationId/lastMessage" to preview,
            "/conversations/$conversationId/lastMessageAt" to ServerValue.TIMESTAMP,
            "/conversations/$conversationId/unreadBy/$uid" to 0
        )
        conversation.child("participants").children.mapNotNull { it.key }.filterNot { it == uid }.forEach { memberId ->
            updates["/conversations/$conversationId/unreadBy/$memberId"] = ServerValue.increment(1)
        }
        root.updateChildren(updates).await()
        RepositoryResult.Success(messageRef.key ?: error("Message ID was not created."))
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not send message.", t)
    }

    suspend fun setTyping(conversationId: String, typing: Boolean): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return RepositoryResult.Success(Unit)
        val ref = root.child("typing").child(conversationId).child(uid)
        if (typing) ref.onDisconnect().removeValue()
        ref.setValue(typing).await()
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not update typing state.", t)
    }

    suspend fun markSeen(conversationId: String): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return RepositoryResult.Success(Unit)
        root.child("conversations").child(conversationId).child("unreadBy").child(uid).setValue(0).await()
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not update read receipt.", t)
    }

    private fun conversationFrom(snapshot: DataSnapshot): DirectConversation = DirectConversation(
        id = snapshot.key.orEmpty(),
        kind = snapshot.child("kind").getValue(String::class.java) ?: "direct",
        title = snapshot.child("title").getValue(String::class.java).orEmpty(),
        description = snapshot.child("description").getValue(String::class.java).orEmpty(),
        createdBy = snapshot.child("createdBy").getValue(String::class.java),
        participantIds = snapshot.child("participants").children.mapNotNull { it.key },
        lastMessage = snapshot.child("lastMessage").getValue(String::class.java).orEmpty(),
        lastMessageAt = snapshot.child("lastMessageAt").getValue(Long::class.java) ?: 0L,
        unreadBy = snapshot.child("unreadBy").children.associate { entry -> entry.key.orEmpty() to (entry.getValue(Long::class.java) ?: 0L) },
        memberCount = snapshot.child("memberCount").getValue(Long::class.java)
            ?: snapshot.child("participants").childrenCount
    )
}
