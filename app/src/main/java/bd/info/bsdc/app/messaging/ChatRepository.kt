package bd.info.bsdc.app.messaging

import bd.info.bsdc.app.core.FirebaseGate
import bd.info.bsdc.app.core.RepositoryResult
import bd.info.bsdc.app.model.ChatMessage
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseReference
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ServerValue
import com.google.firebase.database.ValueEventListener
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/** Realtime Database transport for low-latency direct and group chat metadata/messages. */
class ChatRepository(private val gate: FirebaseGate) {
    private val root: DatabaseReference get() = FirebaseDatabase.getInstance().reference

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
                "createdAt" to ServerValue.TIMESTAMP,
                "lastMessage" to "",
                "lastMessageAt" to ServerValue.TIMESTAMP
            )).await()
        }
        RepositoryResult.Success(id)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not open conversation.", t)
    }

    fun observeConversations(): Flow<List<bd.info.bsdc.app.model.DirectConversation>> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(emptyList()); close(); return@callbackFlow
        }
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (uid == null) {
            trySend(emptyList()); close(); return@callbackFlow
        }
        // A nested participant index keeps this query scoped to conversations the signed-in user
        // may read. Realtime Database rules enforce the same membership check server-side.
        val ref = root.child("conversations").orderByChild("participants/$uid").equalTo(true)
        val listener = object : ValueEventListener {
            override fun onDataChange(snapshot: DataSnapshot) {
                val conversations = snapshot.children.map { child ->
                    bd.info.bsdc.app.model.DirectConversation(
                        id = child.key.orEmpty(),
                        participantIds = child.child("participants").children.mapNotNull { it.key },
                        lastMessage = child.child("lastMessage").getValue(String::class.java).orEmpty(),
                        lastMessageAt = child.child("lastMessageAt").getValue(Long::class.java) ?: 0L,
                        unreadBy = child.child("unreadBy").children.associate { entry ->
                            entry.key.orEmpty() to (entry.getValue(Long::class.java) ?: 0L)
                        }
                    )
                }.sortedByDescending { it.lastMessageAt }
                trySend(conversations)
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
        val ref = root.child("messages").child(conversationId).limitToLast(100)
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
                val active = snapshot.children.filter { it.getValue(Boolean::class.java) == true }.mapNotNull { it.key }.toSet()
                trySend(active)
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
        val preview = if (kind == "text") body.take(120) else if (kind == "image") "Sent an image" else "Sent a voice note"
        root.updateChildren(mapOf(
            "/messages/$conversationId/${messageRef.key}" to payload,
            "/conversations/$conversationId/lastMessage" to preview,
            "/conversations/$conversationId/lastMessageAt" to ServerValue.TIMESTAMP,
            "/conversations/$conversationId/unreadBy/$uid" to 0
        )).await()
        RepositoryResult.Success(messageRef.key ?: error("Message ID was not created."))
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not send message.", t)
    }

    suspend fun setTyping(conversationId: String, typing: Boolean): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return RepositoryResult.Success(Unit)
        root.child("typing").child(conversationId).child(uid).setValue(typing).await()
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not update typing state.", t)
    }

    suspend fun markSeen(conversationId: String): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return RepositoryResult.Success(Unit)
        root.child("conversations").child(conversationId).child("unreadBy").child(uid)
            .setValue(0).await()
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not update read receipt.", t)
    }
}
