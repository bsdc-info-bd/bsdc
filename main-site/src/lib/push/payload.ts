/** A payload, when one was sent. Supports RFC 8291 JSON and FCM shapes. */
interface RawPushPayload {
  title?: unknown;
  body?: unknown;
  url?: unknown;
  icon?: unknown;
  tag?: unknown;
  notification?: {
    title?: unknown;
    body?: unknown;
    icon?: unknown;
    tag?: unknown;
    click_action?: unknown;
  };
  data?: {
    title?: unknown;
    body?: unknown;
    url?: unknown;
    path?: unknown;
    link?: unknown;
    icon?: unknown;
    tag?: unknown;
    sent_at?: unknown;
  };
  fcmOptions?: {
    link?: unknown;
  };
}

interface NormalizedPushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  icon: string;
}

function normalizeTargetPath(raw: string, origin: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '/notifications';
  try {
    const parsed = new URL(trimmed, origin);
    if (parsed.origin === origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`.slice(0, 300);
    }
  } catch {
    // Invalid URL; fall back safely.
  }
  return '/notifications';
}

/** FCM web messages have a notification block plus string-valued custom data. */
export function isFirebasePushPayload(data: { json(): unknown } | null): boolean {
  if (data === null) return false;
  try {
    const raw = data.json();
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const payload = raw as RawPushPayload;
    return (
      payload.notification !== undefined &&
      payload.data !== undefined &&
      typeof payload.data.sent_at === 'string' &&
      typeof payload.data.url === 'string'
    );
  } catch {
    return false;
  }
}

export function readPushPayload(
  data: { json(): unknown } | null,
  origin: string,
): NormalizedPushPayload | null {
  if (data === null || typeof data === 'undefined') return null;
  try {
    const parsed = data.json();
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const raw = parsed as RawPushPayload;
    const title =
      payloadText(raw.title, 120) ||
      payloadText(raw.notification?.title, 120) ||
      payloadText(raw.data?.title, 120);
    if (title.length === 0) return null;

    const body =
      payloadText(raw.body, 240) ||
      payloadText(raw.notification?.body, 240) ||
      payloadText(raw.data?.body, 240);
    const rawUrl =
      payloadText(raw.url, 500) ||
      payloadText(raw.data?.url, 500) ||
      payloadText(raw.data?.path, 500) ||
      payloadText(raw.data?.link, 500) ||
      payloadText(raw.fcmOptions?.link, 500) ||
      payloadText(raw.notification?.click_action, 500);
    const tag =
      payloadText(raw.tag, 80) ||
      payloadText(raw.data?.tag, 80) ||
      payloadText(raw.notification?.tag, 80);
    const icon =
      payloadText(raw.icon, 500) ||
      payloadText(raw.data?.icon, 500) ||
      payloadText(raw.notification?.icon, 500);

    return {
      title,
      body,
      url: normalizeTargetPath(rawUrl, origin),
      tag,
      icon,
    };
  } catch {
    return null;
  }
}

function payloadText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max).trim() : '';
}
