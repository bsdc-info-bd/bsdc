# Firestore and Realtime Database reflectively deserialize these model classes.
-keep class bd.info.bsdc.app.model.** { *; }
-keepattributes Signature,InnerClasses,EnclosingMethod

# Keep Firebase Messaging service declared in the manifest.
-keep class bd.info.bsdc.app.notifications.BsdcMessagingService { *; }
