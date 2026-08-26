/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * Capacitor configuration for the BSDC Android app (APK/AAB).
 *
 * Setup:  npm i -D @capacitor/cli && npm i @capacitor/core @capacitor/camera @capacitor/filesystem @capacitor/push-notifications @capacitor/splash-screen @capacitor/status-bar
 *         npm run build && npx cap add android && npx cap sync android
 * Build:  cd android && ./gradlew assembleRelease
 */
const config = {
  appId: 'bd.info.bsdc.app',
  appName: 'BSDC',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1600,
      backgroundColor: '#0A8F3F',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A8F3F',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
