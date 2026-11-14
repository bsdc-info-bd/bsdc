package bd.info.bsdc.app.feature.verify

import android.content.Context
import android.net.Uri
import bd.info.bsdc.app.core.common.DocCodeChecksum
import bd.info.bsdc.app.core.common.PdfSha256Verifier
import bd.info.bsdc.app.core.database.BsdcDatabase
import bd.info.bsdc.app.core.database.VerificationHistoryEntity
import bd.info.bsdc.app.core.model.ParsedDocCode
import bd.info.bsdc.app.core.model.VerificationResult
import bd.info.bsdc.app.core.network.SupabaseRestClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import java.io.FilterInputStream
import java.io.IOException

class VerifyRepository(
    private val supabase: SupabaseRestClient,
    private val database: BsdcDatabase,
) {
    companion object {
        private const val MAX_PDF_BYTES = 25L * 1024L * 1024L
    }

    fun observeHistory(): Flow<List<VerificationHistoryEntity>> =
        database.verificationHistoryDao().observeHistory()

    suspend fun clearHistory() = withContext(Dispatchers.IO) {
        database.verificationHistoryDao().deleteAll()
    }

    suspend fun verifyDocumentCode(raw: String): Result<VerificationResult> = withContext(Dispatchers.IO) {
        val localRejected = DocCodeChecksum.localRejection(raw)
        if (localRejected != null) {
            return@withContext Result.success(localRejected)
        }
        val parsed = DocCodeChecksum.parseDocCode(raw) as ParsedDocCode.Valid
        runCatching {
            val rawJson = supabase.rpcText(
                functionName = "verify_code",
                params = JsonObject(mapOf("p_code" to JsonPrimitive(parsed.code))),
                requireAuth = false,
            )
            val rows = supabase.decode<List<VerificationResult>>(rawJson)
            val result = rows.firstOrNull()
                ?: throw IllegalStateException("Empty response from verification registry.")
            database.verificationHistoryDao().upsert(
                VerificationHistoryEntity(
                    code = result.code.ifBlank { parsed.code },
                    kind = result.kind,
                    state = result.state.name,
                    subject = result.subject,
                    issuer = result.issuer,
                    detail = result.detail,
                    pdfSha256 = null,
                    verifiedAtEpochMs = System.currentTimeMillis(),
                ),
            )
            result
        }
    }

    suspend fun verifyPerformanceReport(rawId: String): Result<VerifiedReport?> = withContext(Dispatchers.IO) {
        val cleanId = PdfSha256Verifier.normaliseReportReceiptId(rawId)
        if (cleanId.isEmpty()) {
            return@withContext Result.failure(IllegalArgumentException("Enter a valid report receipt UUID."))
        }
        runCatching {
            val rawJson = supabase.rpcText(
                functionName = "verify_performance_report",
                params = JsonObject(mapOf("p_id" to JsonPrimitive(cleanId))),
                requireAuth = false,
            )
            val rows = supabase.decode<List<VerifiedReport>>(rawJson)
            val report = rows.firstOrNull()
            if (report != null) {
                database.verificationHistoryDao().upsert(
                    VerificationHistoryEntity(
                        code = report.receiptId,
                        kind = "RP",
                        state = "VALID",
                        subject = report.title.ifBlank { report.app },
                        issuer = report.app,
                        detail = report.sections.joinToString(", "),
                        pdfSha256 = report.sha256,
                        verifiedAtEpochMs = System.currentTimeMillis(),
                    ),
                )
            }
            report
        }
    }

    suspend fun verifyPdfStream(
        context: Context,
        pdfUri: Uri,
        expectedSha256: String,
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            val input = context.contentResolver.openInputStream(pdfUri)
                ?: throw IOException("Could not open the selected PDF file.")
            input.use { rawStream ->
                val bounded = object : FilterInputStream(rawStream) {
                    var total = 0L
                    override fun read(): Int {
                        val b = super.read()
                        if (b >= 0 && ++total > MAX_PDF_BYTES) {
                            throw IOException("Choose a PDF smaller than 25 MB.")
                        }
                        return b
                    }

                    override fun read(b: ByteArray, off: Int, len: Int): Int {
                        val n = super.read(b, off, len)
                        if (n > 0) {
                            total += n
                            if (total > MAX_PDF_BYTES) {
                                throw IOException("Choose a PDF smaller than 25 MB.")
                            }
                        }
                        return n
                    }
                }
                PdfSha256Verifier.matchesExpectedSha256(bounded, expectedSha256)
            }
        }
    }

    suspend fun fetchNoticeFeed(limit: Int = 50): Result<List<PublicNoticeRow>> = withContext(Dispatchers.IO) {
        runCatching {
            val rawJson = supabase.rpcText(
                functionName = "notice_feed",
                params = JsonObject(mapOf("p_limit" to JsonPrimitive(limit.coerceIn(1, 200)))),
                requireAuth = false,
            )
            supabase.decode<List<PublicNoticeRow>>(rawJson)
        }
    }

    suspend fun acknowledgeNotice(noticeId: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            supabase.rpcText(
                functionName = "acknowledge_notice",
                params = buildJsonObject { put("p_id", JsonPrimitive(noticeId)) },
                requireAuth = true,
            )
            Unit
        }
    }
}
