package bd.info.bsdc.app

import android.app.Application
import android.os.StrictMode
import bd.info.bsdc.app.di.BsdcAppContainer

class BsdcApplication : Application() {

    lateinit var container: BsdcAppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = BsdcAppContainer(applicationContext)

        if (BuildConfig.DEBUG) {
            StrictMode.setThreadPolicy(
                StrictMode.ThreadPolicy.Builder()
                    .detectDiskReads()
                    .detectDiskWrites()
                    .detectNetwork()
                    .penaltyLog()
                    .build(),
            )
            StrictMode.setVmPolicy(
                StrictMode.VmPolicy.Builder()
                    .detectLeakedClosableObjects()
                    .detectActivityLeaks()
                    .penaltyLog()
                    .build(),
            )
        }
    }
}
