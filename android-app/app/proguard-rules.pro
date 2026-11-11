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
-keep,includedescriptorclasses class bd.info.bsdc.app.core.model.**$$serializer { *; }
-keepclassmembers class bd.info.bsdc.app.core.model.** {
    *** Companion;
}

# Preserve core Java check-digit & router signatures used across JNI/reflection
-keep class bd.info.bsdc.app.core.common.** { *; }

# Strip verbose debug logs in release APK/AAB
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
}
