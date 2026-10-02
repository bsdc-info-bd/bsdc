import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { backBehaviour, inAppUrl, notificationText, pushDestination, resolveLink } from './links';

/**
 * Native wiring.
 *
 * This file is the only place that touches a Capacitor plugin; every
 * decision it makes lives in `links.ts`, where it can be tested without an
 * emulator. The rule it enforces throughout: untrusted origins leave the
 * app's chrome.
 */

export interface ShellHost {
  readonly navigate: (url: string) => void;
  readonly currentPath: () => string;
  readonly canGoBack: () => boolean;
  readonly goBack: () => void;
  readonly exit: () => void;
  readonly onToken: (token: string) => Promise<void>;
}

export async function startShell(host: ShellHost): Promise<void> {
  await StatusBar.setStyle({ style: Style.Dark });

  // The splash stays until the page can actually be read, rather than
  // until a timer expires over an imagined connection.
  await SplashScreen.hide();

  await CapApp.addListener('appUrlOpen', (event) => {
    const opening = resolveLink(event.url);
    if (opening.kind === 'in-app') host.navigate(inAppUrl(opening.path));
    else if (opening.kind === 'browser') void Browser.open({ url: opening.url });
  });

  await CapApp.addListener('backButton', () => {
    if (backBehaviour(host.canGoBack(), host.currentPath()) === 'back') host.goBack();
    else host.exit();
  });

  const permission = await FirebaseMessaging.requestPermissions();
  if (permission.receive === 'granted') {
    const { token } = await FirebaseMessaging.getToken();
    await host.onToken(token);

    await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      const opening = pushDestination({
        title: event.notification.title ?? undefined,
        body: event.notification.body ?? undefined,
        data: event.notification.data as Record<string, unknown> | undefined,
      });
      if (opening.kind === 'in-app') host.navigate(inAppUrl(opening.path));
      else if (opening.kind === 'browser') void Browser.open({ url: opening.url });
    });
  }

  await FirebaseMessaging.addListener('tokenReceived', (event) => {
    void host.onToken(event.token);
  });
}

export { notificationText };
