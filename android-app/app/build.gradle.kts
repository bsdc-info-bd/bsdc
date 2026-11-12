plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

fun resolveVersion(): Pair<Int, String> {
    val runNum = (System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1).coerceAtLeast(1)
    val rawTag = (System.getenv("RELEASE_TAG") ?: System.getenv("GITHUB_REF_NAME") ?: "")
        .trim()
        .removePrefix("refs/tags/")
        .removePrefix("android-v")
        .removePrefix("android-")
        .removePrefix("v")
    val isSemver = Regex("^\\d+\\.\\d+\\.\\d+$").matches(rawTag)
    val name = if (isSemver) rawTag else "0.0.0-build.$runNum"
    return runNum to name
}

val (computedVersionCode, computedVersionName) = resolveVersion()

android {
    namespace = "bd.info.bsdc.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "bd.info.bsdc.app"
        minSdk = 26
        targetSdk = 35
        versionCode = computedVersionCode
        versionName = computedVersionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "SITE_ORIGIN", "\"https://www.bsdc.info.bd\"")
        buildConfigField("String", "VF_ORIGIN", "\"https://vf.main.bsdc.info.bd\"")
        buildConfigField("String", "NEWS_ORIGIN", "\"https://news.bsdc.info.bd\"")
        buildConfigField("String", "PUSH_WORKER_ORIGIN", "\"https://push.api.bsdc.info.bd\"")

        val supabaseUrl = (System.getenv("ANDROID_SUPABASE_URL") ?: "").replace("\"", "")
        val supabaseKey = (System.getenv("ANDROID_SUPABASE_PUBLISHABLE_KEY") ?: "").replace("\"", "")
        val googleWebClientId = (System.getenv("ANDROID_GOOGLE_WEB_CLIENT_ID") ?: "").replace("\"", "")
        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"$supabaseKey\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$googleWebClientId\"")
    }

    signingConfigs {
        create("release") {
            val keystorePath = System.getenv("BSDC_KEYSTORE_PATH")
            if (!keystorePath.isNullOrBlank()) {
                storeFile = file(keystorePath)
                storePassword = System.getenv("BSDC_KEYSTORE_PASSWORD") ?: ""
                keyAlias = System.getenv("BSDC_KEY_ALIAS") ?: ""
                keyPassword = System.getenv("BSDC_KEY_PASSWORD") ?: ""
            }
        }
    }

    buildTypes {
        debug {
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            val keystorePath = System.getenv("BSDC_KEYSTORE_PATH")
            if (!keystorePath.isNullOrBlank()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    kotlinOptions {
        jvmTarget = "21"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    lint {
        abortOnError = true
        warningsAsErrors = false
        checkReleaseBuilds = true
    }
}

dependencies {
    implementation(project(":core:model"))
    implementation(project(":core:common"))
    implementation(project(":core:designsystem"))
    implementation(project(":core:permissions"))
    implementation(project(":core:network"))
    implementation(project(":core:auth"))
    implementation(project(":core:media"))
    implementation(project(":core:database"))
    implementation(project(":core:sync"))
    implementation(project(":core:push"))
    implementation(project(":feature:onboarding"))
    implementation(project(":feature:feed"))
    implementation(project(":feature:compose"))
    implementation(project(":feature:messenger"))
    implementation(project(":feature:notifications"))
    implementation(project(":feature:verify"))
    implementation(project(":feature:discover"))
    implementation(project(":feature:market"))
    implementation(project(":feature:news"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.browser)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.animation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material3.window.size)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.coil.compose)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.espresso.core)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
