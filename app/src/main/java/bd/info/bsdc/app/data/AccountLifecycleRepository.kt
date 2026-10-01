package bd.info.bsdc.app.data

import bd.info.bsdc.app.core.FirebaseGate
import bd.info.bsdc.app.core.RepositoryResult
import bd.info.bsdc.app.model.AccountLifecycleRequest
import bd.info.bsdc.app.model.AccountLifecycleRequestType
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * A request is deliberately handled by trusted callable Functions instead of a writable client
 * collection. The backend checks a recent Firebase sign-in before recording a sensitive export or
 * erasure request; this app version does not misrepresent the request as completed deletion.
 */
class AccountLifecycleRepository(private val gate: FirebaseGate) {
    private val database get() = FirebaseFirestore.getInstance()
    private val functions get() = FirebaseFunctions.getInstance(FUNCTIONS_REGION)

    fun observeMine(): Flow<AccountLifecycleRequest?> = callbackFlow {
        if (!gate.isConfigured) {
            trySend(null); close(); return@callbackFlow
        }
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (uid == null) {
            trySend(null); close(); return@callbackFlow
        }
        val registration = database.collection("accountLifecycleRequests").document(uid)
            .addSnapshotListener { snapshot, error ->
                if (error != null) close(error)
                else trySend(snapshot?.toObject(AccountLifecycleRequest::class.java))
            }
        awaitClose(registration::remove)
    }

    suspend fun submit(type: AccountLifecycleRequestType): RepositoryResult<Unit> = invoke(
        "submitAccountLifecycleRequest",
        mapOf("type" to type.name)
    )

    suspend fun cancel(): RepositoryResult<Unit> = invoke("cancelAccountLifecycleRequest", emptyMap())

    private suspend fun invoke(function: String, payload: Map<String, String>): RepositoryResult<Unit> = try {
        gate.requireConfigured()
        check(FirebaseAuth.getInstance().currentUser != null) { "Sign in to manage this request." }
        functions.getHttpsCallable(function).call(payload).await()
        RepositoryResult.Success(Unit)
    } catch (t: Throwable) {
        RepositoryResult.Failure(t.message ?: "Could not update your account data request.", t)
    }

    private companion object {
        const val FUNCTIONS_REGION = "asia-southeast1"
    }
}
