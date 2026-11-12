package bd.info.bsdc.app.core.push

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

data class PushArrivalEvent(
    val kind: String,
    val path: String,
    val channelId: String,
    val conversationId: String?,
    val notificationId: String?,
    val title: String,
    val body: String,
    val receivedAtMs: Long = System.currentTimeMillis(),
)

/**
 * Process-local event bus so foreground Compose screens and unread notification
 * badges update instantaneously when FCM delivers a high-priority data push.
 */
object PushEventBus {
    private val mutableEvents = MutableSharedFlow<PushArrivalEvent>(extraBufferCapacity = 32)
    val events: SharedFlow<PushArrivalEvent> = mutableEvents.asSharedFlow()

    fun emit(event: PushArrivalEvent) {
        mutableEvents.tryEmit(event)
    }
}
