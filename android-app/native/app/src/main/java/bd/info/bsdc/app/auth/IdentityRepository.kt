package bd.info.bsdc.app.auth

import android.content.Context
import bd.info.bsdc.app.BuildConfig
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.messaging.FirebaseMessaging
import bd.info.bsdc.app.push.FcmDeviceRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class IdentityRepository(context: Context) {
    private val appContext = context.applicationContext
    private val firebaseApp: FirebaseApp? by lazy {
        val existing = FirebaseApp.getApps(appContext).firstOrNull()
        if (existing != null) existing
        else if (BuildConfig.FIREBASE_API_KEY.isNotBlank() && BuildConfig.FIREBASE_APP_ID.isNotBlank() && BuildConfig.FIREBASE_PROJECT_ID.isNotBlank()) {
            val options = FirebaseOptions.Builder().setApiKey(BuildConfig.FIREBASE_API_KEY)
                .setApplicationId(BuildConfig.FIREBASE_APP_ID).setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID).build()
            FirebaseApp.initializeApp(appContext, options)
        } else null
    }
    private val auth: FirebaseAuth? by lazy { firebaseApp?.let { FirebaseAuth.getInstance(it) } }
    private val fcmDevices by lazy { FcmDeviceRepository(appContext, BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_PUBLISHABLE_KEY) }

    fun configured(): Boolean = auth != null
    suspend fun currentIdToken(): String? = auth?.currentUser?.getIdToken(false)?.await()?.token
    fun currentMember(): Member? = auth?.currentUser?.let { Member(it.uid, it.email.orEmpty(), it.isEmailVerified) }

    suspend fun signIn(email: String, password: String): Member = withContext(Dispatchers.IO) {
        val firebase = auth ?: error("Account sign-in is not configured for this build.")
        val user = firebase.signInWithEmailAndPassword(email.trim(), password).await().user
            ?: error("Sign-in did not return an account.")
        require(firebase.currentUser?.uid == user.uid) { "Account changed during sign-in." }
        bootstrapDatabaseAccess(user.uid, user.getIdToken(false).await().token ?: error("Could not obtain a session token."))
        user.getIdToken(true).await()
        require(user.getIdTokenResult(true).await().claims["role"] == "authenticated") { "Account database access could not be initialized." }
        Member(user.uid, user.email.orEmpty(), user.isEmailVerified)
    }

    suspend fun register(email: String, password: String): Member = withContext(Dispatchers.IO) {
        require(password.length >= 8) { "Use a password with at least 8 characters." }
        val firebase = auth ?: error("Account registration is not configured for this build.")
        val user = firebase.createUserWithEmailAndPassword(email.trim(), password).await().user
            ?: error("Registration did not return an account.")
        user.sendEmailVerification().await()
        require(firebase.currentUser?.uid == user.uid) { "Account changed during registration." }
        bootstrapDatabaseAccess(user.uid, user.getIdToken(false).await().token ?: error("Could not obtain a session token."))
        user.getIdToken(true).await()
        require(user.getIdTokenResult(true).await().claims["role"] == "authenticated") { "Account database access could not be initialized." }
        Member(user.uid, user.email.orEmpty(), user.isEmailVerified)
    }

    suspend fun registerCurrentFcmDevice() {
        val user = auth?.currentUser ?: return
        val app = firebaseApp ?: return
        val token = FirebaseMessaging.getInstance(app).token.await()
        if (token.isNotBlank() && auth?.currentUser?.uid == user.uid) fcmDevices.register(user, token)
    }

    suspend fun signOut() {
        val firebase = auth ?: return
        val user = firebase.currentUser ?: return
        // Prefer immediate server unlink; invalidate the installation token as a
        // privacy fallback, but never trap the member in a signed-in state offline.
        if (fcmDevices.configured()) runCatching { fcmDevices.unregister(user) }
        firebaseApp?.let { runCatching { FirebaseMessaging.getInstance(it).deleteToken().await() } }
        firebase.signOut()
    }

    /** Bootstrap only the caller's ordinary member access; server derives privileges from trusted data. */
    private suspend fun bootstrapDatabaseAccess(uid: String, idToken: String) = withContext(Dispatchers.IO) {
        val connection = (URL("https://www.bsdc.info.bd/api/auth/claims").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 10_000
            readTimeout = 15_000
            doOutput = true
            setRequestProperty("Authorization", "Bearer $idToken")
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
        }
        try {
            val body = JSONObject().put("uid", uid).put("role", "member").put("vendor", false).put("staff", false)
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = connection.responseCode
            if (code !in 200..299) error("Account is signed in, but BSDC data access could not be initialized. Try again later.")
        } finally { connection.disconnect() }
    }
}

data class Member(val uid: String, val email: String, val emailVerified: Boolean)
