package bd.info.bsdc.app.core

/**
 * Prevents accidental calls to Firebase when a build intentionally omitted google-services.json.
 * This lets CI build an unsigned artifact while making runtime configuration failure explicit.
 */
class FirebaseGate(val isConfigured: Boolean) {
    fun requireConfigured() {
        check(isConfigured) {
            "Firebase is not configured. Add google-services.json through protected deployment configuration."
        }
    }
}

sealed interface RepositoryResult<out T> {
    data class Success<T>(val value: T) : RepositoryResult<T>
    data class Failure(val message: String, val cause: Throwable? = null) : RepositoryResult<Nothing>
}

inline fun <T> guarded(gate: FirebaseGate, block: () -> T): RepositoryResult<T> = try {
    gate.requireConfigured()
    RepositoryResult.Success(block())
} catch (t: Throwable) {
    RepositoryResult.Failure(t.message ?: "An unexpected error occurred.", t)
}
