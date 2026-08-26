/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
/**
 * Email notifications via formsubmit.co — pure client-side AJAX, no backend.
 *
 * formsubmit.co accepts JSON POSTs to https://formsubmit.co/ajax/{targetEmail}.
 * NOTE: the FIRST send to a brand-new address triggers a one-time activation
 * email from formsubmit to that address — click it once and every later send
 * is instant. Configure the sender identity below.
 */
import { APP_EMAIL } from '@/config/constants';

const FORMSUBMIT_ENDPOINT = (to: string) => `https://formsubmit.co/ajax/${encodeURIComponent(to)}`;

export interface EmailPayload {
  to: string;
  subject: string;
  message: string;
  fromName?: string;
}

export interface EmailResult {
  ok: boolean;
  error?: string;
}

const THROTTLE_KEY = 'bsdc-email-throttle';

/** At most one email per topic+recipient per 10 minutes (client-side guard). */
function throttled(topic: string, to: string): boolean {
  try {
    const raw = localStorage.getItem(THROTTLE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const key = `${topic}:${to}`;
    const last = map[key] || 0;
    if (Date.now() - last < 10 * 60 * 1000) return true;
    map[key] = Date.now();
    localStorage.setItem(THROTTLE_KEY, JSON.stringify(map));
    return false;
  } catch {
    return false;
  }
}

/** Fire-and-report AJAX send through formsubmit.co. */
export async function sendEmail(payload: EmailPayload, opts?: { skipThrottle?: boolean }): Promise<EmailResult> {
  const { to, subject, message, fromName } = payload;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return { ok: false, error: 'Invalid recipient' };
  if (!opts?.skipThrottle && throttled(subject.slice(0, 24), to)) return { ok: true };

  try {
    const res = await fetch(FORMSUBMIT_ENDPOINT(to), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        subject: `[BSDC] ${subject}`,
        message,
        from_name: fromName || 'BSDC — Bangladesh Software Development Community',
        _replyto: APP_EMAIL,
        _template: 'table',
        _captcha: 'false',
      }),
    });
    if (!res.ok) return { ok: false, error: `FormSubmit responded ${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Email network error' };
  }
}

/** Are email notifications enabled on this device? (default: on) */
export function emailNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem('bsdc-email-notify') !== 'off';
  } catch {
    return true;
  }
}

export function setEmailNotificationsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('bsdc-email-notify', enabled ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

/** New-message email (self-notification to the recipient's own inbox). */
export function sendNewMessageEmail(to: string, senderName: string, chatName: string): Promise<EmailResult> {
  return sendEmail({
    to,
    subject: `New message from ${senderName}`,
    message: `You have a new BSDC message from ${senderName} in "${chatName}".\n\nOpen BSDC to reply: https://www.bsdc.info.bd/messages`,
  });
}

/** Welcome email on registration. */
export function sendWelcomeEmail(to: string, displayName: string): Promise<EmailResult> {
  return sendEmail(
    {
      to,
      subject: 'Welcome to BSDC — The Pride of Bangladesh',
      message: `Assalamu alaikum ${displayName},\n\nWelcome to the Bangladesh Software Development Community — where developers unite.\n\nComplete your profile to earn 50 BSDC points: https://www.bsdc.info.bd/settings\n\n— RRC Development`,
    },
    { skipThrottle: true },
  );
}

/** Daily/weekly digest reminder email. */
export function sendDigestEmail(
  to: string,
  displayName: string,
  stats: { unread: number; followers: number; streak: number },
): Promise<EmailResult> {
  const lines = [
    `Hi ${displayName}, here is your BSDC digest:`,
    stats.unread > 0 ? `• ${stats.unread} unread message${stats.unread === 1 ? '' : 's'}` : '• No unread messages',
    `• ${stats.followers} followers`,
    `• ${stats.streak}-day activity streak`,
    '',
    'Open BSDC: https://www.bsdc.info.bd',
  ].join('\n');
  return sendEmail({ to, subject: 'Your BSDC digest', message: lines });
}
