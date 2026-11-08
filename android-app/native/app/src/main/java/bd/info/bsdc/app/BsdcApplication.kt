package bd.info.bsdc.app

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

/** Initialize Firebase before an OS-started FCM service runs, not only from Activity UI. */
class BsdcApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (FirebaseApp.getApps(this).isEmpty() && BuildConfig.FIREBASE_API_KEY.isNotBlank() && BuildConfig.FIREBASE_APP_ID.isNotBlank() && BuildConfig.FIREBASE_PROJECT_ID.isNotBlank()) {
            val options = FirebaseOptions.Builder().setApiKey(BuildConfig.FIREBASE_API_KEY)
                .setApplicationId(BuildConfig.FIREBASE_APP_ID).setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID).build()
            runCatching { FirebaseApp.initializeApp(this, options) }
        }
    }
}
