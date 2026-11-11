package bd.info.bsdc.app.core.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface PostDao {
    @Query("SELECT * FROM posts_cache WHERE algorithm = :algorithm ORDER BY feedOrder ASC")
    fun observeFeed(algorithm: String): Flow<List<CachedPostEntity>>

    @Query("SELECT * FROM posts_cache WHERE algorithm = :algorithm ORDER BY feedOrder ASC LIMIT :limit")
    suspend fun listFeed(algorithm: String, limit: Int): List<CachedPostEntity>

    @Query("SELECT * FROM posts_cache WHERE postId = :postId LIMIT 1")
    suspend fun findById(postId: String): CachedPostEntity?

    @Query("SELECT * FROM posts_cache WHERE title LIKE '%' || :query || '%' OR excerpt LIKE '%' || :query || '%' OR tagsJson LIKE '%' || :query || '%' ORDER BY feedOrder ASC LIMIT 40")
    suspend fun searchOffline(query: String): List<CachedPostEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(posts: List<CachedPostEntity>)

    @Query("DELETE FROM posts_cache WHERE algorithm = :algorithm")
    suspend fun clearAlgorithm(algorithm: String)

    @Query("DELETE FROM posts_cache WHERE cachedAtEpochMs < :olderThanEpochMs")
    suspend fun pruneOlderThan(olderThanEpochMs: Long)

    @Query("SELECT COUNT(*) FROM posts_cache")
    suspend fun countAll(): Int

    @Query("DELETE FROM posts_cache")
    suspend fun deleteAll()
}

@Dao
interface BookmarkDao {
    @Query("SELECT * FROM bookmarks_cache ORDER BY savedAtEpochMs DESC")
    fun observeAll(): Flow<List<BookmarkEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(bookmark: BookmarkEntity)

    @Query("DELETE FROM bookmarks_cache WHERE postId = :postId")
    suspend fun remove(postId: String)

    @Query("DELETE FROM bookmarks_cache")
    suspend fun deleteAll()
}

@Dao
interface PendingDraftDao {
    @Query("SELECT * FROM pending_drafts ORDER BY updatedAtEpochMs DESC")
    fun observeAll(): Flow<List<PendingDraftEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(draft: PendingDraftEntity)

    @Query("DELETE FROM pending_drafts WHERE localId = :localId")
    suspend fun remove(localId: String)

    @Query("DELETE FROM pending_drafts")
    suspend fun deleteAll()
}

@Dao
interface OutboxMessageDao {
    @Query("SELECT * FROM pending_outbox_messages WHERE conversationId = :conversationId ORDER BY createdAtEpochMs ASC")
    fun observeForConversation(conversationId: String): Flow<List<PendingOutboxMessageEntity>>

    @Query("SELECT * FROM pending_outbox_messages WHERE status IN ('PENDING', 'FAILED') AND retryCount < 6 ORDER BY createdAtEpochMs ASC")
    suspend fun listFlushable(): List<PendingOutboxMessageEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(message: PendingOutboxMessageEntity)

    @Query("UPDATE pending_outbox_messages SET status = :status, retryCount = :retryCount WHERE clientMessageId = :clientId")
    suspend fun updateStatus(clientId: String, status: String, retryCount: Int)

    @Query("DELETE FROM pending_outbox_messages WHERE clientMessageId = :clientId")
    suspend fun remove(clientId: String)

    @Query("DELETE FROM pending_outbox_messages")
    suspend fun deleteAll()
}

@Dao
interface MessengerCacheDao {
    @Query("SELECT * FROM threads_cache ORDER BY lastMessageAtEpochMs DESC")
    fun observeThreads(): Flow<List<CachedThreadEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertThreads(threads: List<CachedThreadEntity>)

    @Query("SELECT * FROM messages_cache WHERE conversationId = :conversationId ORDER BY createdAtEpochMs ASC LIMIT 500")
    fun observeMessages(conversationId: String): Flow<List<CachedMessageEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertMessages(messages: List<CachedMessageEntity>)

    @Query("DELETE FROM threads_cache")
    suspend fun deleteAllThreads()

    @Query("DELETE FROM messages_cache")
    suspend fun deleteAllMessages()
}

@Dao
interface VerificationHistoryDao {
    @Query("SELECT * FROM verification_history ORDER BY verifiedAtEpochMs DESC LIMIT 100")
    fun observeHistory(): Flow<List<VerificationHistoryEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: VerificationHistoryEntity)

    @Query("DELETE FROM verification_history")
    suspend fun deleteAll()
}

@Dao
interface SavedSearchDao {
    @Query("SELECT * FROM saved_searches ORDER BY searchedAtEpochMs DESC LIMIT 20")
    fun observeRecent(): Flow<List<SavedSearchEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(search: SavedSearchEntity)

    @Query("DELETE FROM saved_searches")
    suspend fun deleteAll()
}
