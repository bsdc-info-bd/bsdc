package bd.info.bsdc.app.feature.messenger

import bd.info.bsdc.app.core.network.BsdcHttpClientFactory
import bd.info.bsdc.app.core.network.SupabaseRestClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * Native Phoenix Channels WebSocket transport for Supabase Realtime (`realtime/v1/websocket`).
 * Streams Postgres change notifications (`messages`, `message_reactions`, `message_receipts`,
 * `message_pins`, `conversation_members`) and ephemeral `typing` broadcasts with automatic
 * heartbeat and backoff reconnection. Falls back cleanly to polling when offline.
 */
class SupabaseRealtimeTransport(
    private val okHttpClient: OkHttpClient,
    private val supabase: SupabaseRestClient,
) {
    private val json = BsdcHttpClientFactory.sharedJson
    private val refSeq = AtomicLong(1L)

    interface ThreadListener {
        fun onMessageChange()
        fun onMetaChange()
        fun onMembersChange()
        fun onTypingUsers(uids: List<String>)
        fun onStatusChanged(status: LiveChannelStatus)
    }

    interface InboxListener {
        fun onInboxActivity()
        fun onStatusChanged(status: LiveChannelStatus)
    }

    interface ChannelHandle {
        fun signalTyping(typing: Boolean)
        fun close()
    }

    fun joinThread(
        conversationId: String,
        viewerUid: String,
        listener: ThreadListener,
    ): ChannelHandle {
        val config = supabase.backendConfig
        if (!config.isSupabaseConfigured) {
            listener.onStatusChanged(LiveChannelStatus.OFFLINE)
            return object : ChannelHandle {
                override fun signalTyping(typing: Boolean) {}
                override fun close() {}
            }
        }

        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val topic = "realtime:conversation:$conversationId"
        val typingSignals = ConcurrentHashMap<String, Long>()
        var socket: WebSocket? = null
        var heartbeatJob: Job? = null
        var sweepJob: Job? = null
        var reconnectAttempt = 0
        var closed = false

        fun emitTypers() {
            val now = System.currentTimeMillis()
            val active = typingSignals.entries
                .filter { (uid, at) -> uid != viewerUid && now - at < 6_000L }
                .map { it.key }
                .sorted()
            listener.onTypingUsers(active)
        }

        fun sendJson(ws: WebSocket?, obj: JsonObject) {
            ws?.send(obj.toString())
        }

        fun connect() {
            if (closed) return
            listener.onStatusChanged(
                if (reconnectAttempt == 0) LiveChannelStatus.CONNECTING else LiveChannelStatus.RECONNECTING
            )
            scope.launch {
                val token = runCatching { supabase.currentToken() }.getOrNull().orEmpty()
                val wsBase = config.supabaseUrl.trim().trimEnd('/')
                    .replaceFirst("https://", "wss://")
                    .replaceFirst("http://", "ws://")
                val wsUrl = "$wsBase/realtime/v1/websocket?apikey=${config.supabasePublishableKey}&vsn=1.0.0"

                val req = Request.Builder().url(wsUrl).build()
                socket = okHttpClient.newWebSocket(
                    req,
                    object : WebSocketListener() {
                        override fun onOpen(webSocket: WebSocket, response: Response) {
                            if (closed) {
                                webSocket.close(1000, "closed")
                                return
                            }
                            reconnectAttempt = 0
                            val joinPayload = buildJsonObject {
                                put("topic", topic)
                                put("event", "phx_join")
                                put("ref", refSeq.getAndIncrement().toString())
                                putJsonObject("payload") {
                                    if (token.isNotBlank()) put("access_token", token)
                                    putJsonObject("config") {
                                        putJsonObject("broadcast") { put("self", false) }
                                        putJsonObject("presence") { put("key", viewerUid) }
                                        putJsonArray("postgres_changes") {
                                            add(buildJsonObject {
                                                put("event", "*")
                                                put("schema", "public")
                                                put("table", "messages")
                                                put("filter", "conversation_id=eq.$conversationId")
                                            })
                                            add(buildJsonObject {
                                                put("event", "*")
                                                put("schema", "public")
                                                put("table", "message_reactions")
                                            })
                                            add(buildJsonObject {
                                                put("event", "*")
                                                put("schema", "public")
                                                put("table", "message_receipts")
                                            })
                                            add(buildJsonObject {
                                                put("event", "*")
                                                put("schema", "public")
                                                put("table", "message_pins")
                                            })
                                            add(buildJsonObject {
                                                put("event", "*")
                                                put("schema", "public")
                                                put("table", "conversation_members")
                                                put("filter", "conversation_id=eq.$conversationId")
                                            })
                                        }
                                    }
                                }
                            }
                            sendJson(webSocket, joinPayload)

                            heartbeatJob?.cancel()
                            heartbeatJob = scope.launch {
                                while (isActive && !closed) {
                                    delay(25_000L)
                                    val hb = buildJsonObject {
                                        put("topic", "phoenix")
                                        put("event", "heartbeat")
                                        put("ref", refSeq.getAndIncrement().toString())
                                        putJsonObject("payload") {}
                                    }
                                    sendJson(webSocket, hb)
                                }
                            }
                        }

                        override fun onMessage(webSocket: WebSocket, text: String) {
                            val root = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull()
                                ?: return
                            val event = root["event"]?.jsonPrimitive?.contentOrNull.orEmpty()
                            val payload = root["payload"] as? JsonObject

                            when (event) {
                                "phx_reply" -> {
                                    val status = payload?.get("status")?.jsonPrimitive?.contentOrNull
                                    if (status == "ok") {
                                        listener.onStatusChanged(LiveChannelStatus.LIVE)
                                    }
                                }
                                "postgres_changes" -> {
                                    val dataObj = payload?.get("data") as? JsonObject
                                    val table = dataObj?.get("table")?.jsonPrimitive?.contentOrNull.orEmpty()
                                    when (table) {
                                        "messages" -> listener.onMessageChange()
                                        "conversation_members" -> listener.onMembersChange()
                                        else -> listener.onMetaChange()
                                    }
                                }
                                "broadcast" -> {
                                    val bEvent = payload?.get("event")?.jsonPrimitive?.contentOrNull
                                    if (bEvent == "typing") {
                                        val inner = payload["payload"] as? JsonObject
                                        val who = inner?.get("uid")?.jsonPrimitive?.contentOrNull
                                        val at = inner?.get("at")?.jsonPrimitive?.longOrNull ?: System.currentTimeMillis()
                                        if (!who.isNullOrBlank() && who != viewerUid) {
                                            if (at <= 0L) typingSignals.remove(who) else typingSignals[who] = at
                                            emitTypers()
                                        }
                                    }
                                }
                            }
                        }

                        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                            heartbeatJob?.cancel()
                            if (closed) return
                            listener.onStatusChanged(LiveChannelStatus.OFFLINE)
                            reconnectAttempt++
                            val backoff = (2_000L * reconnectAttempt).coerceAtMost(30_000L)
                            scope.launch {
                                delay(backoff)
                                if (!closed) connect()
                            }
                        }

                        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                            heartbeatJob?.cancel()
                            if (!closed) {
                                listener.onStatusChanged(LiveChannelStatus.RECONNECTING)
                            }
                        }
                    },
                )
            }
        }

        sweepJob = scope.launch {
            while (isActive && !closed) {
                delay(1_500L)
                emitTypers()
            }
        }
        connect()

        return object : ChannelHandle {
            override fun signalTyping(typing: Boolean) {
                if (closed) return
                val msg = buildJsonObject {
                    put("topic", topic)
                    put("event", "broadcast")
                    put("ref", refSeq.getAndIncrement().toString())
                    putJsonObject("payload") {
                        put("type", "broadcast")
                        put("event", "typing")
                        putJsonObject("payload") {
                            put("uid", viewerUid)
                            put("at", if (typing) System.currentTimeMillis() else 0L)
                        }
                    }
                }
                sendJson(socket, msg)
            }

            override fun close() {
                closed = true
                heartbeatJob?.cancel()
                sweepJob?.cancel()
                socket?.close(1000, "screen closed")
                socket = null
            }
        }
    }

    fun joinInbox(viewerUid: String, listener: InboxListener): () -> Unit {
        val config = supabase.backendConfig
        if (!config.isSupabaseConfigured) {
            listener.onStatusChanged(LiveChannelStatus.OFFLINE)
            return {}
        }

        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val topic = "realtime:inbox:$viewerUid"
        var socket: WebSocket? = null
        var heartbeatJob: Job? = null
        var reconnectAttempt = 0
        var closed = false

        fun connect() {
            if (closed) return
            listener.onStatusChanged(
                if (reconnectAttempt == 0) LiveChannelStatus.CONNECTING else LiveChannelStatus.RECONNECTING
            )
            scope.launch {
                val token = runCatching { supabase.currentToken() }.getOrNull().orEmpty()
                val wsBase = config.supabaseUrl.trim().trimEnd('/')
                    .replaceFirst("https://", "wss://")
                    .replaceFirst("http://", "ws://")
                val wsUrl = "$wsBase/realtime/v1/websocket?apikey=${config.supabasePublishableKey}&vsn=1.0.0"

                socket = okHttpClient.newWebSocket(
                    Request.Builder().url(wsUrl).build(),
                    object : WebSocketListener() {
                        override fun onOpen(webSocket: WebSocket, response: Response) {
                            if (closed) {
                                webSocket.close(1000, "closed")
                                return
                            }
                            reconnectAttempt = 0
                            val join = buildJsonObject {
                                put("topic", topic)
                                put("event", "phx_join")
                                put("ref", refSeq.getAndIncrement().toString())
                                putJsonObject("payload") {
                                    if (token.isNotBlank()) put("access_token", token)
                                    putJsonObject("config") {
                                        putJsonArray("postgres_changes") {
                                            add(buildJsonObject {
                                                put("event", "INSERT")
                                                put("schema", "public")
                                                put("table", "messages")
                                            })
                                            add(buildJsonObject {
                                                put("event", "*")
                                                put("schema", "public")
                                                put("table", "conversations")
                                            })
                                            add(buildJsonObject {
                                                put("event", "*")
                                                put("schema", "public")
                                                put("table", "conversation_members")
                                                put("filter", "uid=eq.$viewerUid")
                                            })
                                        }
                                    }
                                }
                            }
                            webSocket.send(join.toString())

                            heartbeatJob?.cancel()
                            heartbeatJob = scope.launch {
                                while (isActive && !closed) {
                                    delay(25_000L)
                                    val hb = buildJsonObject {
                                        put("topic", "phoenix")
                                        put("event", "heartbeat")
                                        put("ref", refSeq.getAndIncrement().toString())
                                        putJsonObject("payload") {}
                                    }
                                    webSocket.send(hb.toString())
                                }
                            }
                        }

                        override fun onMessage(webSocket: WebSocket, text: String) {
                            val root = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull()
                                ?: return
                            val event = root["event"]?.jsonPrimitive?.contentOrNull.orEmpty()
                            if (event == "phx_reply") {
                                val st = (root["payload"] as? JsonObject)?.get("status")?.jsonPrimitive?.contentOrNull
                                if (st == "ok") listener.onStatusChanged(LiveChannelStatus.LIVE)
                            } else if (event == "postgres_changes") {
                                listener.onInboxActivity()
                            }
                        }

                        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                            heartbeatJob?.cancel()
                            if (closed) return
                            listener.onStatusChanged(LiveChannelStatus.OFFLINE)
                            reconnectAttempt++
                            val backoff = (2_000L * reconnectAttempt).coerceAtMost(30_000L)
                            scope.launch {
                                delay(backoff)
                                if (!closed) connect()
                            }
                        }
                    },
                )
            }
        }

        connect()
        return {
            closed = true
            heartbeatJob?.cancel()
            socket?.close(1000, "closed")
            socket = null
        }
    }
}
