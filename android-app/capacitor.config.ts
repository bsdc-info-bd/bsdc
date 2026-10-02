import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The shell's configuration.
 *
 * `server.url` is deliberately absent: the app points at the deployed site
 * through app links and the web view, not by embedding a remote origin as
 * its own document base. A live-reload origin belongs in a developer's
 * local override file, never in the committed configuration, because
 * shipping one turns every release into a remote-code-execution surface.
 */
const config: CapacitorConfig = {
  appId: 'bd.info.bsdc.app',
  appName: 'BSDC',
  webDir: '../main-site/dist',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0b1020',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0b1020',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0b1020',
      overlaysWebView: false,
    },
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
