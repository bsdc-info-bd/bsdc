package bd.info.bsdc.app.data

import bd.info.bsdc.app.core.FirebaseGate
import bd.info.bsdc.app.core.RepositoryResult
import bd.info.bsdc.app.privacy.LegalDocument
import bd.info.bsdc.app.privacy.LegalDocuments
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.delay
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

sealed interface LegalConsentState {
    data object Loading : LegalConsentState
    data object Required : LegalConsentState
    data object Accepted : LegalConsentState
    data class Unavailable(val message: String) : LegalConsentState
}

/**
 * Stores current document acceptance as immutable, per-account Firestore records, then waits for
 * the trusted Functions bridge to issue the matching Firebase custom claim. The claim is what
 * database rules use for Firestore and Realtime Database community writes; a local preference
 * can never unlock this gate.
 */
class LegalConsentRepository(private val gate: FirebaseGate) {
    private val database get() = FirebaseFirestore.getInstance()

    fun observeCurrentAcceptance(uid: String): Flow<LegalConsentState> = callbackFlow {
        if (!gate.isConfigured || uid.isBlank()) {
            trySend(LegalConsentState.Unavailable("BSDC legal acceptance cannot be checked in this build."))
            close()
            return@callbackFlow
        }

        var terms: Boolean? = null
        var privacy: Boolean? = null
        var authorization: Boolean? = null
        var checkingAuthorization = false

        fun publishState() {
            val termsAccepted = terms
            val privacyAccepted = privacy
            when {
                termsAccepted == null || privacyAccepted == null -> trySend(LegalConsentState.Loading)
                !termsAccepted || !privacyAccepted -> trySend(LegalConsentState.Required)
                authorization == true -> trySend(LegalConsentState.Accepted)
                authorization == false -> trySend(
                    LegalConsentState.Unavailable(
                        "BSDC recorded your acceptance but is still finalizing secure account access. Check your connection and retry."
                    )
                )
                else -> trySend(LegalConsentState.Loading)
            }
        }
        fun checkAuthorizationWhenReady() {
            if (terms == true && privacy == true && !checkingAuthorization) {
                checkingAuthorization = true
                launch {
                    authorization = awaitCurrentLegalClaim()
                    publishState()
                }
            }
        }
        fun documentChanged() {
            if (terms != true || privacy != true) {
                authorization = null
                checkingAuthorization = false
            }
            publishState()
            checkAuthorizationWhenReady()
        }

        val termsRegistration = acceptanceDocument(uid, LegalDocument.TERMS_OF_USE)
            .addSnapshotListener { snapshot, error ->
                if (error != null) close(error)
                else {
                    terms = snapshot.matches(LegalDocument.TERMS_OF_USE)
                    documentChanged()
                }
            }
        val privacyRegistration = acceptanceDocument(uid, LegalDocument.PRIVACY_NOTICE)
            .addSnapshotListener { snapshot, error ->
                if (error != null) close(error)
                else {
                    privacy = snapshot.matches(LegalDocument.PRIVACY_NOTICE)
                    documentChanged()
                }
            }
        awaitClose {
            termsRegistration.remove()
            privacyRegistration.remove()
        }
    }

    suspend fun acceptCurrent(locale: String): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: error("Sign in before accepting BSDC documents.")
        val language = LegalDocuments.normalizeLocale(locale)
        val documents = LegalDocument.entries.associateWith { acceptanceDocument(uid, it) }
        val snapshots = documents.mapValues { (_, reference) -> reference.get().await() }
        val alreadyAccepted = snapshots.all { (document, snapshot) -> snapshot.matches(document) }
        val malformed = snapshots.any { (document, snapshot) -> snapshot.exists() && !snapshot.matches(document) }
        check(!malformed) { "BSDC found an invalid legal record. Contact BSDC support before continuing." }

        if (!alreadyAccepted) {
            val batch = database.batch()
            snapshots.filter { (document, snapshot) -> !snapshot.matches(document) }
                .forEach { (document, _) ->
                    batch.set(documents.getValue(document), mapOf(
                        "documentId" to document.id,
                        "documentVersion" to document.version,
                        "acceptedAt" to FieldValue.serverTimestamp(),
                        "locale" to language,
                        "source" to LegalDocuments.ACCEPTANCE_SOURCE
                    ))
                }
            batch.commit().await()
        }
        check(awaitCurrentLegalClaim()) {
            "BSDC recorded your acceptance but secure access is still being finalized. Check your connection and retry."
        }
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not record your document acceptance.", t)
    }

    private suspend fun awaitCurrentLegalClaim(): Boolean {
        val user = FirebaseAuth.getInstance().currentUser ?: return false
        // The Functions trigger is asynchronous. Force a token refresh a bounded number of times
        // rather than treating a local document write as backend authorization.
        repeat(CLAIM_REFRESH_ATTEMPTS) { attempt ->
            val claim = runCatching { user.getIdToken(true).await().claims[CLAIM_NAME] as? String }.getOrNull()
            if (claim == LegalDocument.TERMS_OF_USE.version) return true
            if (attempt < CLAIM_REFRESH_ATTEMPTS - 1) delay(CLAIM_REFRESH_DELAY_MS)
        }
        return false
    }

    private fun acceptanceDocument(uid: String, document: LegalDocument) = database.collection("profiles")
        .document(uid)
        .collection("legalAcceptances")
        .document(document.id)

    private fun DocumentSnapshot?.matches(document: LegalDocument): Boolean {
        val snapshot = this ?: return false
        return snapshot.exists() &&
            snapshot.getString("documentId") == document.id &&
            snapshot.getString("documentVersion") == document.version &&
            snapshot.getTimestamp("acceptedAt") != null &&
            snapshot.getString("locale") in setOf(LegalDocuments.ENGLISH, LegalDocuments.BANGLA) &&
            snapshot.getString("source") == LegalDocuments.ACCEPTANCE_SOURCE
    }

    companion object {
        const val CLAIM_NAME = "legalAcceptanceVersion"
        private const val CLAIM_REFRESH_ATTEMPTS = 20
        private const val CLAIM_REFRESH_DELAY_MS = 750L
    }
}
