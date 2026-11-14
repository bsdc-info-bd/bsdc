package bd.info.bsdc.app.feature.verify

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class VerifiedReport(
    @SerialName("receipt_id") val receiptId: String,
    val app: String = "",
    val days: Int = 7,
    val title: String = "",
    val sections: List<String> = emptyList(),
    @SerialName("generated_at") val generatedAt: String = "",
    val sha256: String = "",
)

@Serializable
data class PublicNoticeRow(
    val id: String,
    val code: String,
    val title: String,
    val summary: String = "",
    val body: String = "",
    val category: String = "general",
    val audience: String = "public",
    val priority: String = "routine",
    val pinned: Boolean = false,
    @SerialName("requires_ack") val requiresAck: Boolean = false,
    @SerialName("publish_at") val publishAt: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
    val acknowledged: Boolean = false,
)

enum class PdfCheckStatus {
    IDLE,
    CHECKING,
    MATCH,
    MISMATCH,
    ERROR,
}

enum class VerifySection {
    DOCUMENT,
    QR_SCAN,
    REPORT_PDF,
    NOTICES,
    HISTORY,
}
