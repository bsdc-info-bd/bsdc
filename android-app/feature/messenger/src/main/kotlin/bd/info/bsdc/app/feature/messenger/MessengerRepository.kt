package bd.info.bsdc.app.feature.messenger

import androidx.room.withTransaction
import bd.info.bsdc.app.core.database.BsdcDatabase
import bd.info.bsdc.app.core.database.CachedMessageEntity
import bd.info.bsdc.app.core.database.CachedThreadEntity
import bd.info.bsdc.app.core.database.PendingOutboxMessageEntity
import bd.info.bsdc.app.core.media.ImgbbUrlAllowlist
import bd.info.bsdc.app.core.network.BsdcHttpClientFactory
import bd.info.bsdc.app.core.network.SupabaseRestClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import java.util.UUID

@Serializable
private data class ConversationInboxRowDto(
    val id: String = "",
    val kind: String = "direct",
    val title: String = "",
    @SerialName("avatar_url") val avatarUrl: String = "",
    @SerialName("last_message_at") val lastMessageAt: String? = null,
    @SerialName("last_message_preview") val lastMessagePreview: String = "",
    @SerialName("unread_count") val unreadCount: Int = 0,
    val muted: Boolean = false,
    @SerialName("other_uid") val otherUid: String? = null,
    @SerialName("other_username") val otherUsername: String? = null,
    @SerialName("other_name") val otherName: String? = null,
    @SerialName("other_avatar") val otherAvatar: String? = null,
)

@Serializable
private data class MemberSettingsRowDto(
    @SerialName("conversation_id") val conversationId: String = "",
    @SerialName("is_pinned") val isPinned: Boolean = false,
    @SerialName("is_archived") val isArchived: Boolean = false,
    @SerialName("muted_until") val mutedUntil: String? = null,
)

@Serializable
private data class ConversationStateRowDto(
    @SerialName("is_member") val isMember: Boolean = true,
    val muted: Boolean = false,
    @SerialName("is_pinned") val isPinned: Boolean = false,
    @SerialName("is_archived") val isArchived: Boolean = false,
    @SerialName("draft_body") val draftBody: String = "",
    @SerialName("last_read_at") val lastReadAt: String = "",
)

@Serializable
private data class ConversationPinRowDto(
    @SerialName("message_id") val messageId: String = "",
    val body: String = "",
    @SerialName("sender_uid") val senderUid: String? = null,
    @SerialName("media_name") val mediaName: String = "",
    val kind: String = "text",
    @SerialName("pinned_at") val pinnedAt: String = "",
    @SerialName("pinned_by") val pinnedBy: String = "",
)

@Serializable
private data class SavedMessageRowDto(
    @SerialName("message_id") val messageId: String = "",
    @SerialName("conversation_id") val conversationId: String = "",
    val body: String = "",
    @SerialName("media_name") val mediaName: String = "",
    val kind: String = "text",
    @SerialName("created_at") val createdAt: String = "",
)

@Serializable
private data class MessageSearchRowDto(
    @SerialName("message_id") val messageId: String = "",
    @SerialName("conversation_id") val conversationId: String = "",
    @SerialName("sender_uid") val senderUid: String? = null,
    val body: String = "",
    @SerialName("created_at") val createdAt: String = "",
)

@Serializable
private data class ConversationMessageRowDto(
    val id: String = "",
    @SerialName("conversation_id") val conversationId: String = "",
    @SerialName("sender_uid") val senderUid: String? = null,
    val kind: String = "text",
    val body: String = "",
    @SerialName("media_url") val mediaUrl: String = "",
    @SerialName("media_name") val mediaName: String = "",
    @SerialName("code_language") val codeLanguage: String = "",
    @SerialName("reply_to") val replyTo: String? = null,
    @SerialName("reply_body") val replyBody: String? = null,
    @SerialName("reply_sender") val replySender: String? = null,
    @SerialName("edited_at") val editedAt: String? = null,
    @SerialName("deleted_at") val deletedAt: String? = null,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("client_id") val clientId: String? = null,
    val reactions: Map<String, Int> = emptyMap(),
    @SerialName("my_reactions") val myReactions: List<String> = emptyList(),
    @SerialName("read_by") val readBy: List<String> = emptyList(),
    val starred: Boolean = false,
    val pinned: Boolean = false,
)

@Serializable
data class ChatMemberCandidate(
    val uid: String = "",
    val username: String = "",
    @SerialName("display_name") val displayName: String = "Member",
    @SerialName("avatar_url") val avatarUrl: String = "",
    val bio: String = "",
    val location: String = "",
    @SerialName("is_following") val isFollowing: Boolean = false,
    val verified: Boolean = false,
)

@Serializable
private data class ProfileBasicDto(
    val uid: String = "",
    val username: String = "",
    @SerialName("display_name") val displayName: String = "",
    @SerialName("avatar_url") val avatarUrl: String = "",
)

@Serializable
private data class JoinedMemberRowDto(
    val uid: String = "",
    val role: String = "member",
    @SerialName("last_read_at") val lastReadAt: String = "",
    @SerialName("left_at") val leftAt: String? = null,
    val profiles: ProfileBasicDto? = null,
)

/**
 * Unified BSDC Messenger repository:
 * - Room cache (`threads_cache`, `messages_cache`) + Room `pending_outbox_messages`
 * - `send_message_once` UUID-keyed idempotency
 * - Full inbox/thread/pins/stars/search/reactions/read receipts/direct & group creation
 */
class MessengerRepository(
    private val supabase: SupabaseRestClient,
    private val database: BsdcDatabase,
) {
    private val json = BsdcHttpClientFactory.sharedJson

    fun observeCachedThreads(): Flow<List<ConversationSummaryItem>> =
        database.messengerCacheDao().observeThreads().map { rows ->
            rows.map { r ->
                ConversationSummaryItem(
                    id = r.conversationId,
                    kind = if (r.isGroup) "group" else "direct",
                    title = r.title,
                    avatarUrl = r.avatarUrl,
                    lastMessageAt = if (r.lastMessageAtEpochMs > 0L) Instant.ofEpochMilli(r.lastMessageAtEpochMs).toString() else "",
                    preview = r.lastMessagePreview,
                    unreadCount = r.unreadCount,
                    muted = r.muted,
                    pinned = r.isPinned,
                    archived = r.isArchived,
                    other = r.peerUid?.takeIf { it.isNotBlank() }?.let { puid ->
                        MessengerPeerProfile(
                            uid = puid,
                            username = "",
                            displayName = r.title,
                            avatarUrl = r.avatarUrl,
                        )
                    },
                )
            }
        }

    fun observeCachedMessages(conversationId: String): Flow<List<ChatMessageItem>> =
        database.messengerCacheDao().observeMessages(conversationId).map { rows ->
            rows.map { r ->
                val reactionsMap = runCatching {
                    json.decodeFromString<Map<String, Int>>(r.reactionsJson)
                }.getOrDefault(emptyMap())
                ChatMessageItem(
                    id = r.messageId,
                    conversationId = r.conversationId,
                    senderUid = r.senderUid.ifBlank { null },
                    kind = if (!r.imageUrl.isNullOrBlank()) "image" else "text",
                    body = r.body,
                    mediaUrl = r.imageUrl.orEmpty(),
                    mediaName = "",
                    codeLanguage = "",
                    replyTo = r.replyToId,
                    replyBody = null,
                    replySender = null,
                    editedAt = if (r.edited) "edited" else null,
                    deletedAt = null,
                    createdAt = Instant.ofEpochMilli(r.createdAtEpochMs).toString(),
                    clientId = r.clientMessageId,
                    author = r.senderUid.takeIf { it.isNotBlank() }?.let {
                        MessengerPeerProfile(it, "", r.senderName, r.senderAvatarUrl)
                    },
                    reactions = reactionsMap,
                    pinned = r.pinned,
                )
            }
        }

    fun observeOutbox(conversationId: String): Flow<List<ChatMessageItem>> =
        database.outboxMessageDao().observeForConversation(conversationId).map { rows ->
            rows.map { row ->
                ChatMessageItem(
                    id = "outbox-${row.clientMessageId}",
                    conversationId = row.conversationId,
                    senderUid = null,
                    kind = row.kind,
                    body = row.body,
                    mediaUrl = row.mediaUrl,
                    mediaName = row.mediaName,
                    codeLanguage = row.codeLanguage,
                    replyTo = row.replyToMessageId,
                    replyBody = null,
                    replySender = null,
                    editedAt = null,
                    deletedAt = null,
                    createdAt = Instant.ofEpochMilli(row.createdAtEpochMs).toString(),
                    clientId = row.clientMessageId,
                    deliveryState = when (row.status) {
                        "SENDING" -> OutboxDeliveryState.SENDING
                        "FAILED" -> OutboxDeliveryState.FAILED
                        else -> OutboxDeliveryState.PENDING
                    },
                )
            }
        }

    suspend fun fetchInbox(viewerUid: String, limit: Int = 40): List<ConversationSummaryItem> = withContext(Dispatchers.IO) {
        val rawInbox = supabase.rpcText(
            functionName = "conversation_inbox",
            params = buildJsonObject { put("p_limit", limit) },
            requireAuth = true,
        )
        val rows = json.decodeFromString<List<ConversationInboxRowDto>>(rawInbox)

        val settingsRaw = runCatching {
            supabase.getJsonText(
                table = "conversation_members",
                queryPairs = listOf(
                    "select" to "conversation_id,is_pinned,is_archived,muted_until",
                    "uid" to "eq.$viewerUid",
                ),
                requireAuth = true,
            )
        }.getOrNull()
        val settingsMap = settingsRaw?.let {
            runCatching { json.decodeFromString<List<MemberSettingsRowDto>>(it) }.getOrNull()
        }.orEmpty().associateBy { it.conversationId }

        val items = rows.map { r ->
            val st = settingsMap[r.id]
            val mutedByUntil = st?.mutedUntil?.let { ts ->
                val ms = MessengerEngine.parseEpochMillis(ts)
                ms != Long.MIN_VALUE && ms > System.currentTimeMillis()
            } ?: false
            ConversationSummaryItem(
                id = r.id,
                kind = r.kind,
                title = r.title,
                avatarUrl = r.avatarUrl,
                lastMessageAt = r.lastMessageAt.orEmpty(),
                preview = r.lastMessagePreview,
                unreadCount = r.unreadCount.coerceAtLeast(0),
                muted = r.muted || mutedByUntil,
                pinned = st?.isPinned == true,
                archived = st?.isArchived == true,
                other = r.otherUid?.takeIf { it.isNotBlank() }?.let { ouid ->
                    MessengerPeerProfile(
                        uid = ouid,
                        username = r.otherUsername.orEmpty(),
                        displayName = r.otherName.orEmpty(),
                        avatarUrl = r.otherAvatar.orEmpty(),
                    )
                },
            )
        }

        // Reconcile Room threads_cache atomically so cleared/deleted conversations never linger offline
        val cachedThreads = items.map { item ->
            val ms = MessengerEngine.parseEpochMillis(item.lastMessageAt)
            CachedThreadEntity(
                conversationId = item.id,
                title = item.displayTitle(false),
                isGroup = item.kind == "group",
                avatarUrl = item.other?.avatarUrl?.ifBlank { item.avatarUrl } ?: item.avatarUrl,
                peerUid = item.other?.uid,
                lastMessagePreview = item.preview,
                unreadCount = item.unreadCount,
                muted = item.muted,
                isPinned = item.pinned,
                isArchived = item.archived,
                lastMessageAtEpochMs = if (ms == Long.MIN_VALUE) 0L else ms,
            )
        }
        database.withTransaction {
            val cacheDao = database.messengerCacheDao()
            if (cachedThreads.isEmpty()) {
                cacheDao.deleteAllMessages()
                cacheDao.deleteAllThreads()
                database.outboxMessageDao().deleteAll()
            } else {
                if (cachedThreads.size < limit && cachedThreads.size <= 500) {
                    val activeIds = cachedThreads.map { it.conversationId }
                    cacheDao.deleteMessagesForThreadsNotIn(activeIds)
                    cacheDao.deleteThreadsNotIn(activeIds)
                    database.outboxMessageDao().deleteForThreadsNotIn(activeIds)
                }
                cacheDao.upsertThreads(cachedThreads)
            }
        }
        items
    }

    suspend fun fetchUnreadTotal(): Int = withContext(Dispatchers.IO) {
        val raw = runCatching {
            supabase.rpcText("unread_message_count", requireAuth = true)
        }.getOrNull() ?: return@withContext 0
        raw.trim().toIntOrNull() ?: 0
    }

    suspend fun fetchConversationMessages(
        conversationId: String,
        before: String? = null,
        beforeId: String? = null,
        limit: Int = 60,
    ): List<ChatMessageItem> = withContext(Dispatchers.IO) {
        val raw = supabase.rpcText(
            functionName = "conversation_messages_page",
            params = buildJsonObject {
                put("p_conversation_id", conversationId)
                put("p_before", before?.let { JsonPrimitive(it) } ?: JsonNull)
                put("p_before_id", beforeId?.let { JsonPrimitive(it) } ?: JsonNull)
                put("p_limit", limit)
            },
            requireAuth = true,
        )
        val rows = json.decodeFromString<List<ConversationMessageRowDto>>(raw)
        val authorUids = rows.mapNotNull { it.senderUid?.takeIf(String::isNotBlank) }.distinct()
        val authors = fetchProfilesMap(authorUids)

        val messages = rows.map { r ->
            val mediaOk = if (r.mediaUrl.isNotBlank() && ImgbbUrlAllowlist.isAllowedImageUrl(r.mediaUrl)) {
                r.mediaUrl
            } else ""
            ChatMessageItem(
                id = r.id,
                conversationId = r.conversationId,
                senderUid = r.senderUid,
                kind = if (MessengerEngine.isAllowedMessageKind(r.kind)) r.kind else "text",
                body = r.body,
                mediaUrl = mediaOk,
                mediaName = r.mediaName,
                codeLanguage = r.codeLanguage,
                replyTo = r.replyTo,
                replyBody = r.replyBody,
                replySender = r.replySender,
                editedAt = r.editedAt,
                deletedAt = r.deletedAt,
                createdAt = r.createdAt,
                clientId = r.clientId,
                author = r.senderUid?.let { authors[it] },
                reactions = r.reactions,
                myReactions = r.myReactions,
                readBy = r.readBy,
                starred = r.starred,
                pinned = r.pinned,
                deliveryState = OutboxDeliveryState.CONFIRMED,
            )
        }.reversed()

        // Reconcile outbox messages whose clientId now exists on the server
        val confirmedIds = messages.mapNotNull { it.clientId }
        if (confirmedIds.isNotEmpty()) {
            val outboxList = database.outboxMessageDao().listFlushable()
                .filter { it.conversationId == conversationId }
                .map { it.clientMessageId }
            val matched = MessengerEngine.findReconciledClientIds(confirmedIds, outboxList)
            for (cid in matched) {
                database.outboxMessageDao().remove(cid)
            }
        }

        // Persist latest page into Room cache for offline reading
        if (before == null && messages.isNotEmpty()) {
            database.messengerCacheDao().upsertMessages(
                messages.filter { !it.isDeleted }.map { msg ->
                    val ts = MessengerEngine.parseEpochMillis(msg.createdAt)
                    CachedMessageEntity(
                        messageId = msg.id,
                        clientMessageId = msg.clientId,
                        conversationId = msg.conversationId,
                        senderUid = msg.senderUid.orEmpty(),
                        senderName = msg.author?.displayName ?: "Member",
                        senderAvatarUrl = msg.author?.avatarUrl.orEmpty(),
                        replyToId = msg.replyTo,
                        body = msg.body,
                        imageUrl = msg.mediaUrl.takeIf { it.isNotBlank() },
                        thumbUrl = msg.mediaUrl.takeIf { it.isNotBlank() },
                        reactionsJson = json.encodeToString(msg.reactions),
                        pinned = msg.pinned,
                        edited = msg.isEdited,
                        createdAtEpochMs = if (ts == Long.MIN_VALUE) System.currentTimeMillis() else ts,
                    )
                },
            )
        }

        messages
    }

    private suspend fun fetchProfilesMap(uids: List<String>): Map<String, MessengerPeerProfile> {
        if (uids.isEmpty()) return emptyMap()
        val raw = runCatching {
            supabase.getJsonText(
                table = "profiles",
                queryPairs = listOf(
                    "select" to "uid,username,display_name,avatar_url",
                    "uid" to "in.(${uids.joinToString(",")})",
                ),
                requireAuth = true,
            )
        }.getOrNull() ?: return emptyMap()
        val list = runCatching { json.decodeFromString<List<ProfileBasicDto>>(raw) }.getOrDefault(emptyList())
        return list.associate { p ->
            p.uid to MessengerPeerProfile(
                uid = p.uid,
                username = p.username,
                displayName = p.displayName.ifBlank { "@${p.username}" },
                avatarUrl = p.avatarUrl,
            )
        }
    }

    suspend fun fetchConversationState(conversationId: String): ConversationStateModel? = withContext(Dispatchers.IO) {
        val raw = supabase.rpcText(
            functionName = "conversation_state",
            params = buildJsonObject { put("p_conversation_id", conversationId) },
            requireAuth = true,
        )
        val rows = json.decodeFromString<List<ConversationStateRowDto>>(raw)
        val row = rows.firstOrNull() ?: return@withContext null
        ConversationStateModel(
            isMember = row.isMember,
            muted = row.muted,
            isPinned = row.isPinned,
            isArchived = row.isArchived,
            draftBody = row.draftBody,
            lastReadAt = row.lastReadAt,
        )
    }

    suspend fun fetchPinnedMessages(conversationId: String): List<ConversationPinModel> = withContext(Dispatchers.IO) {
        val raw = supabase.rpcText(
            functionName = "conversation_pins",
            params = buildJsonObject { put("p_conversation_id", conversationId) },
            requireAuth = true,
        )
        json.decodeFromString<List<ConversationPinRowDto>>(raw).map { p ->
            ConversationPinModel(
                messageId = p.messageId,
                body = p.body,
                senderUid = p.senderUid,
                mediaName = p.mediaName,
                kind = p.kind,
                pinnedAt = p.pinnedAt,
                pinnedBy = p.pinnedBy,
            )
        }
    }

    suspend fun fetchMembers(conversationId: String): List<ConversationMemberItem> = withContext(Dispatchers.IO) {
        val raw = supabase.getJsonText(
            table = "conversation_members",
            queryPairs = listOf(
                "select" to "uid,role,last_read_at,left_at,profiles:uid(uid,username,display_name,avatar_url)",
                "conversation_id" to "eq.$conversationId",
            ),
            requireAuth = true,
        )
        json.decodeFromString<List<JoinedMemberRowDto>>(raw).map { row ->
            ConversationMemberItem(
                uid = row.uid,
                role = row.role,
                lastReadAt = row.lastReadAt,
                leftAt = row.leftAt,
                profile = row.profiles?.let {
                    MessengerPeerProfile(it.uid, it.username, it.displayName, it.avatarUrl)
                },
            )
        }
    }

    suspend fun fetchSavedMessages(limit: Int = 50): List<SavedMessageItem> = withContext(Dispatchers.IO) {
        val raw = supabase.rpcText(
            functionName = "saved_messages",
            params = buildJsonObject { put("p_limit", limit) },
            requireAuth = true,
        )
        json.decodeFromString<List<SavedMessageRowDto>>(raw).map { s ->
            SavedMessageItem(s.messageId, s.conversationId, s.body, s.mediaName, s.kind, s.createdAt)
        }
    }

    suspend fun searchMessages(
        query: String,
        conversationId: String? = null,
        limit: Int = 40,
    ): List<MessageSearchHitItem> = withContext(Dispatchers.IO) {
        if (query.isBlank()) return@withContext emptyList()
        val raw = supabase.rpcText(
            functionName = "search_messages",
            params = buildJsonObject {
                put("p_query", query.trim())
                put("p_conversation_id", conversationId?.let { JsonPrimitive(it) } ?: JsonNull)
                put("p_limit", limit)
            },
            requireAuth = true,
        )
        json.decodeFromString<List<MessageSearchRowDto>>(raw).map { h ->
            MessageSearchHitItem(h.messageId, h.conversationId, h.senderUid, h.body, h.createdAt)
        }
    }

    /**
     * Enqueues a message in Room `pending_outbox_messages` with a stable UUID `clientId`,
     * then immediately attempts `send_message_once`. Reuses the exact `clientId` on retries
     * and offline WorkManager flush so Postgres never duplicates a message.
     */
    suspend fun sendMessageWithOutbox(
        conversationId: String,
        body: String,
        kind: String = "text",
        mediaUrl: String = "",
        mediaName: String = "",
        codeLanguage: String = "",
        replyToId: String? = null,
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        require(MessengerEngine.isAllowedMessageKind(kind)) { "Unsupported message kind" }
        if (mediaUrl.isNotBlank()) {
            require(!MessengerEngine.isAudioAttachmentBlocked(mediaName) && ImgbbUrlAllowlist.isAllowedImageUrl(mediaUrl)) {
                "Only ImgBB image URLs are allowed"
            }
        }
        val clientId = UUID.randomUUID().toString()
        val nowMs = System.currentTimeMillis()
        val entity = PendingOutboxMessageEntity(
            clientMessageId = clientId,
            conversationId = conversationId,
            replyToMessageId = replyToId,
            body = body.trim().take(MessengerEngine.MAX_MESSAGE_BODY_CHARS),
            kind = kind,
            mediaUrl = mediaUrl,
            mediaName = mediaName.take(160),
            codeLanguage = codeLanguage,
            status = "SENDING",
            retryCount = 0,
            createdAtEpochMs = nowMs,
        )
        database.outboxMessageDao().upsert(entity)
        attemptSendOutboxEntity(entity)
    }

    suspend fun retryOutboxMessage(clientId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        val list = database.outboxMessageDao().listFlushable()
        val entity = list.firstOrNull { it.clientMessageId == clientId }
            ?: return@withContext Result.success(true)
        database.outboxMessageDao().updateStatus(clientId, "SENDING", entity.retryCount)
        attemptSendOutboxEntity(entity)
    }

    private suspend fun attemptSendOutboxEntity(entity: PendingOutboxMessageEntity): Result<Boolean> {
        val params = buildJsonObject {
            put("p_conversation_id", entity.conversationId)
            put("p_client_id", entity.clientMessageId)
            put("p_body", entity.body)
            put("p_kind", entity.kind)
            put("p_media_url", entity.mediaUrl)
            put("p_media_name", entity.mediaName)
            put("p_code_language", entity.codeLanguage)
            put("p_reply_to", entity.replyToMessageId?.let { JsonPrimitive(it) } ?: JsonNull)
        }
        return runCatching {
            supabase.rpcText("send_message_once", params, requireAuth = true)
            database.outboxMessageDao().remove(entity.clientMessageId)
            supabase.wakePushDelivery("message")
            true
        }.onFailure {
            database.outboxMessageDao().updateStatus(
                entity.clientMessageId,
                "FAILED",
                entity.retryCount + 1,
            )
        }
    }

    suspend fun editMessage(messageId: String, newBody: String): Unit = withContext(Dispatchers.IO) {
        supabase.patchJson(
            table = "messages",
            body = buildJsonObject {
                put("body", newBody.trim().take(MessengerEngine.MAX_MESSAGE_BODY_CHARS))
                put("edited_at", Instant.now().toString())
            },
            queryPairs = listOf("id" to "eq.$messageId"),
            prefer = "return=minimal",
        )
    }

    /** Soft-deletes by writing tombstone `{ body: "", deleted_at: now }`. */
    suspend fun deleteMessage(messageId: String): Unit = withContext(Dispatchers.IO) {
        supabase.patchJson(
            table = "messages",
            body = buildJsonObject {
                put("body", "")
                put("deleted_at", Instant.now().toString())
            },
            queryPairs = listOf("id" to "eq.$messageId"),
            prefer = "return=minimal",
        )
    }

    suspend fun toggleReaction(messageId: String, emoji: String): Unit = withContext(Dispatchers.IO) {
        supabase.rpcText(
            functionName = "toggle_message_reaction",
            params = buildJsonObject {
                put("p_message_id", messageId)
                put("p_reaction", emoji)
            },
            requireAuth = true,
        )
        supabase.wakePushDelivery("message-reaction")
    }

    suspend fun togglePin(messageId: String): Boolean = withContext(Dispatchers.IO) {
        val raw = supabase.rpcText(
            functionName = "toggle_message_pin",
            params = buildJsonObject { put("p_message_id", messageId) },
            requireAuth = true,
        )
        raw.trim() == "true"
    }

    suspend fun toggleStar(messageId: String): Boolean = withContext(Dispatchers.IO) {
        val raw = supabase.rpcText(
            functionName = "toggle_message_star",
            params = buildJsonObject { put("p_message_id", messageId) },
            requireAuth = true,
        )
        raw.trim() == "true"
    }

    suspend fun markMessageRead(messageId: String): Unit = withContext(Dispatchers.IO) {
        supabase.rpcText(
            functionName = "mark_message_read",
            params = buildJsonObject { put("p_message_id", messageId) },
            requireAuth = true,
        )
    }

    suspend fun markConversationRead(conversationId: String): Unit = withContext(Dispatchers.IO) {
        supabase.rpcText(
            functionName = "mark_conversation_read",
            params = buildJsonObject { put("p_conversation_id", conversationId) },
            requireAuth = true,
        )
    }

    suspend fun saveDraft(conversationId: String, viewerUid: String, draftBody: String) {
        withContext(Dispatchers.IO) {
            runCatching {
                supabase.patchJson(
                    table = "conversation_members",
                    body = buildJsonObject { put("draft_body", draftBody.take(8_000)) },
                    queryPairs = listOf(
                        "conversation_id" to "eq.$conversationId",
                        "uid" to "eq.$viewerUid",
                    ),
                    prefer = "return=minimal",
                )
            }
        }
    }

    suspend fun updateConversationFlags(
        conversationId: String,
        viewerUid: String,
        pinned: Boolean? = null,
        archived: Boolean? = null,
        muted: Boolean? = null,
    ): Unit = withContext(Dispatchers.IO) {
        val patch = buildJsonObject {
            if (pinned != null) put("is_pinned", pinned)
            if (archived != null) put("is_archived", archived)
            if (muted != null) {
                if (muted) {
                    put("muted_until", Instant.ofEpochMilli(System.currentTimeMillis() + 365L * 86_400_000L).toString())
                } else {
                    put("muted_until", JsonNull)
                }
            }
        }
        supabase.patchJson(
            table = "conversation_members",
            body = patch,
            queryPairs = listOf(
                "conversation_id" to "eq.$conversationId",
                "uid" to "eq.$viewerUid",
            ),
            prefer = "return=minimal",
        )
    }

    suspend fun searchMembersForChat(query: String = "", limit: Int = 12): List<ChatMemberCandidate> =
        withContext(Dispatchers.IO) {
            val clean = query.trim().removePrefix("@")
            val raw = supabase.rpcText(
                functionName = "search_members_for_chat",
                params = buildJsonObject {
                    put("p_query", clean)
                    put("p_limit", limit.coerceIn(1, 30))
                },
                requireAuth = true,
            )
            json.decodeFromString<List<ChatMemberCandidate>>(raw)
        }

    suspend fun resolveMemberUid(handleOrUid: String): String = withContext(Dispatchers.IO) {
        val clean = handleOrUid.trim().removePrefix("@")
        require(clean.isNotBlank()) { "Member username or UID required" }
        val normalized = clean.lowercase()
        val byHandle = supabase.getJsonText(
            table = "profiles",
            queryPairs = listOf(
                "select" to "uid",
                "username" to "eq.$normalized",
                "limit" to "1",
            ),
            requireAuth = true,
        )
        val handleMatch = json.decodeFromString<List<ProfileBasicDto>>(byHandle).firstOrNull()?.uid
        if (!handleMatch.isNullOrBlank()) return@withContext handleMatch

        val byUid = supabase.getJsonText(
            table = "profiles",
            queryPairs = listOf(
                "select" to "uid",
                "uid" to "eq.$clean",
                "limit" to "1",
            ),
            requireAuth = true,
        )
        json.decodeFromString<List<ProfileBasicDto>>(byUid)
            .firstOrNull()?.uid?.takeIf(String::isNotBlank)
            ?: error("Member @$clean not found")
    }

    suspend fun openDirectConversation(handleOrUid: String): String = withContext(Dispatchers.IO) {
        val targetUid = resolveMemberUid(handleOrUid)
        val raw = supabase.rpcText(
            functionName = "open_direct_conversation",
            params = buildJsonObject { put("p_other_uid", targetUid) },
            requireAuth = true,
        )
        raw.trim().trim('"')
    }

    suspend fun createGroupConversation(
        title: String,
        memberHandlesOrUids: List<String>,
    ): String = withContext(Dispatchers.IO) {
        val trimmedTitle = title.trim()
        require(trimmedTitle.isNotEmpty()) { "Group title is required" }
        val resolvedUids = mutableListOf<String>()
        val unresolved = mutableListOf<String>()
        for (entry in memberHandlesOrUids) {
            val clean = entry.trim()
            if (clean.isEmpty()) continue
            val uid = runCatching { resolveMemberUid(clean) }.getOrNull()
            if (uid.isNullOrBlank()) {
                unresolved.add(clean)
            } else if (uid !in resolvedUids) {
                resolvedUids.add(uid)
            }
        }
        if (unresolved.isNotEmpty()) {
            error("Could not find member(s): ${unresolved.joinToString(", ")}")
        }
        require(resolvedUids.isNotEmpty()) { "Select at least one member to create a group" }
        val raw = supabase.rpcText(
            functionName = "create_group_conversation",
            params = buildJsonObject {
                put("p_title", trimmedTitle.take(MessengerEngine.MAX_GROUP_TITLE_CHARS))
                put("p_members", buildJsonArray { resolvedUids.forEach { add(JsonPrimitive(it)) } })
            },
            requireAuth = true,
        )
        raw.trim().trim('"')
    }

    suspend fun leaveConversation(conversationId: String): Unit = withContext(Dispatchers.IO) {
        supabase.rpcText(
            functionName = "leave_conversation",
            params = buildJsonObject { put("p_conversation_id", conversationId) },
            requireAuth = true,
        )
    }
}
