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
    val runNum = (providers.environmentVariable("GITHUB_RUN_NUMBER").orNull?.toIntOrNull() ?: 1).coerceAtLeast(1)
    val rawTag = (providers.environmentVariable("RELEASE_TAG").orNull
        ?: providers.environmentVariable("GITHUB_REF_NAME").orNull
        ?: "")
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

        val supabaseUrl = providers.environmentVariable("ANDROID_SUPABASE_URL").orNull.orEmpty().replace("\"", "")
        val supabaseKey = providers.environmentVariable("ANDROID_SUPABASE_PUBLISHABLE_KEY").orNull.orEmpty().replace("\"", "")
        val googleWebClientId = providers.environmentVariable("ANDROID_GOOGLE_WEB_CLIENT_ID").orNull.orEmpty().replace("\"", "")
        buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"$supabaseKey\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$googleWebClientId\"")
    }

    val releaseKeystorePath = providers.environmentVariable("BSDC_KEYSTORE_PATH").orNull

    signingConfigs {
        create("release") {
            if (!releaseKeystorePath.isNullOrBlank()) {
                val storePass = providers.environmentVariable("BSDC_KEYSTORE_PASSWORD").orNull.orEmpty()
                val alias = providers.environmentVariable("BSDC_KEY_ALIAS").orNull.orEmpty()
                val keyPass = providers.environmentVariable("BSDC_KEY_PASSWORD").orNull.orEmpty()
                    .ifEmpty { storePass }
                storeFile = file(releaseKeystorePath)
                storePassword = storePass
                keyAlias = alias
                keyPassword = keyPass
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
            if (!releaseKeystorePath.isNullOrBlank()) {
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
            excludes += setOf(
                "/META-INF/{AL2.0,LGPL2.1}",
                "/META-INF/INDEX.LIST",
                "/META-INF/io.netty.versions.properties",
                "/META-INF/DEPENDENCIES",
            )
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
