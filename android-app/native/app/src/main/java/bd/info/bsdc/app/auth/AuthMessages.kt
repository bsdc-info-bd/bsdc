package bd.info.bsdc.app.auth

import com.google.firebase.auth.FirebaseAuthException

/** Keep provider codes and raw server messages out of user-visible copy. */
fun safeAuthMessage(error: Throwable, creating: Boolean): String {
    val code = (error as? FirebaseAuthException)?.errorCode.orEmpty()
    return when (code) {
        "ERROR_INVALID_EMAIL" -> "Enter a valid email address."
        "ERROR_USER_NOT_FOUND", "ERROR_WRONG_PASSWORD", "ERROR_INVALID_CREDENTIAL" -> "Email or password wasn't recognized."
        "ERROR_EMAIL_ALREADY_IN_USE" -> "This email can't be used for a new account. Try signing in instead."
        "ERROR_WEAK_PASSWORD" -> "Choose a stronger password with at least 8 characters."
        "ERROR_TOO_MANY_REQUESTS" -> "Too many attempts. Wait a little and try again."
        "ERROR_NETWORK_REQUEST_FAILED" -> "Couldn't connect. Check your connection and try again."
        else -> if (creating) "Couldn't create your account right now. Please try again later."
            else "Couldn't sign you in right now. Check your details and try again."
    }
}
