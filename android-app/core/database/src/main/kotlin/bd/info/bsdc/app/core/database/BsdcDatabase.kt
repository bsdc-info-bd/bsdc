package bd.info.bsdc.app.core.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.withTransaction

@Database(
    entities = [
        CachedPostEntity::class,
        BookmarkEntity::class,
        PendingDraftEntity::class,
        PendingOutboxMessageEntity::class,
        CachedThreadEntity::class,
        CachedMessageEntity::class,
        VerificationHistoryEntity::class,
        SavedSearchEntity::class,
    ],
    version = 2,
    exportSchema = false,
)
abstract class BsdcDatabase : RoomDatabase() {
    abstract fun postDao(): PostDao
    abstract fun bookmarkDao(): BookmarkDao
    abstract fun pendingDraftDao(): PendingDraftDao
    abstract fun outboxMessageDao(): OutboxMessageDao
    abstract fun messengerCacheDao(): MessengerCacheDao
    abstract fun verificationHistoryDao(): VerificationHistoryDao
    abstract fun savedSearchDao(): SavedSearchDao

    /**
     * Wipes user-owned offline caches on atomic sign-out / account switch so
     * no private bookmarks, drafts, messages, or feeds bleed between members.
     */
    suspend fun wipeUserScopedTables() {
        withTransaction {
            bookmarkDao().deleteAll()
            pendingDraftDao().deleteAll()
            outboxMessageDao().deleteAll()
            messengerCacheDao().deleteAllMessages()
            messengerCacheDao().deleteAllThreads()
            postDao().deleteAll()
            savedSearchDao().deleteAll()
        }
    }

    companion object {
        @Volatile
        private var instance: BsdcDatabase? = null

        fun getInstance(context: Context): BsdcDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    BsdcDatabase::class.java,
                    "bsdc_offline.db",
                )
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { instance = it }
            }
    }
}
