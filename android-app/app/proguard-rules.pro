# BSDC Native Android Release R8 Rules
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Kotlinx Serialization
-keepattributes *Annotation*,InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class bd.info.bsdc.app.**$$serializer { *; }
-keepclassmembers class bd.info.bsdc.app.** {
    *** Companion;
}

# Preserve Android Credential Manager & Play Services Auth providers under R8
-keep class androidx.credentials.** { *; }
-keep class com.google.android.libraries.identity.googleid.** { *; }
-dontwarn org.slf4j.**

# Preserve core Java check-digit & router signatures used across JNI/reflection
-keep class bd.info.bsdc.app.core.common.** { *; }

# Strip verbose debug logs in release APK/AAB
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
}

# Preserve CameraX, MLKit Barcode, ZXing, Location Services, and isolated WebView callbacks
-keep class androidx.camera.** { *; }
-keep class com.google.mlkit.vision.barcode.** { *; }
-keep class com.google.zxing.** { *; }
-keep class com.google.android.gms.location.** { *; }
-dontwarn com.google.mlkit.**
-dontwarn androidx.camera.**

