plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

fun buildStringValue(name: String): String {
    val value = providers.environmentVariable(name).orElse("").get()
    val escaped = value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "")
    return "\"$escaped\""
}

android {
    namespace = "bd.info.bsdc.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "bd.info.bsdc.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Release signing is intentionally supplied by protected CI secrets, never committed.
        }
        debug { versionNameSuffix = "-debug" }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    defaultConfig {
        buildConfigField("String", "FIREBASE_API_KEY", buildStringValue("BSDC_FIREBASE_API_KEY"))
        buildConfigField("String", "FIREBASE_APP_ID", buildStringValue("BSDC_FIREBASE_APP_ID"))
        buildConfigField("String", "FIREBASE_PROJECT_ID", buildStringValue("BSDC_FIREBASE_PROJECT_ID"))
        buildConfigField("String", "FIREBASE_SENDER_ID", buildStringValue("BSDC_FIREBASE_SENDER_ID"))
        buildConfigField("String", "SUPABASE_URL", buildStringValue("BSDC_SUPABASE_URL"))
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", buildStringValue("BSDC_SUPABASE_PUBLISHABLE_KEY"))
    }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.navigation:navigation-compose:2.8.5")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.camera:camera-camera2:1.4.1")
    implementation("androidx.camera:camera-lifecycle:1.4.1")
    implementation("androidx.camera:camera-view:1.4.1")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-messaging")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
}
