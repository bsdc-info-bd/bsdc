import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// google-services is intentionally optional so an unsigned, configuration-free CI build still
// validates the native client. At runtime Firebase is enabled only after google-services.json
// has been supplied from a protected CI secret or a developer's local configuration.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

val localProperties = Properties().apply {
    val local = rootProject.file("local.properties")
    if (local.exists()) local.inputStream().use(::load)
}
fun configValue(name: String, fallback: String = ""): String =
    (providers.gradleProperty(name).orNull ?: localProperties.getProperty(name) ?: fallback)
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")

android {
    namespace = "bd.info.bsdc.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "bd.info.bsdc.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }

        buildConfigField("String", "CLOUDINARY_CLOUD_NAME", "\"${configValue("CLOUDINARY_CLOUD_NAME")}\"")
        buildConfigField("String", "CLOUDINARY_UPLOAD_PRESET", "\"${configValue("CLOUDINARY_UPLOAD_PRESET")}\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"${configValue("GOOGLE_WEB_CLIENT_ID")}\"")
    }

    signingConfigs {
        create("release") {
            val storeFilePath = configValue("RELEASE_STORE_FILE")
            if (storeFilePath.isNotBlank()) {
                storeFile = rootProject.file(storeFilePath)
                storePassword = configValue("RELEASE_STORE_PASSWORD")
                keyAlias = configValue("RELEASE_KEY_ALIAS")
                keyPassword = configValue("RELEASE_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            // Keep the registered Firebase package ID for CI-installed test APKs. A separate
            // Firebase Android app is required before introducing any applicationId suffix.
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Unsigned builds remain valid for CI checks. A signed release is produced only
            // when all four signing properties are present.
            if (configValue("RELEASE_STORE_FILE").isNotBlank() &&
                configValue("RELEASE_STORE_PASSWORD").isNotBlank() &&
                configValue("RELEASE_KEY_ALIAS").isNotBlank() &&
                configValue("RELEASE_KEY_PASSWORD").isNotBlank()
            ) signingConfig = signingConfigs.getByName("release")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)

    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.work.runtime)
    implementation(libs.androidx.browser)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.firebase.database)
    implementation(libs.firebase.messaging)
    implementation(libs.firebase.appcheck.playintegrity)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.googleid)
    implementation(libs.kotlinx.coroutines.play.services)

    implementation(libs.coil.compose)
    implementation(libs.cloudinary.android)
    implementation(libs.zxing.core)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
