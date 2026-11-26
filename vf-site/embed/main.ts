/**
 * The embedded answer (§13.3).
 *
 * A separate entry point, not a route in the portal, because the difference is
 * the security property: this document runs none of the portal's features. It
 * takes one `?code=` from the frame's own URL, asks `verify_public` for that one
 * code, and renders nothing else. There is no input, so there is nothing to type
 * somebody else's code into; there is no history, so nothing survives the frame;
 * and there is no report receipt, which is the one feature that would make
 * framing a privacy problem.
 *
 * It is written with `createElement` rather than JSX so it compiles as a single
 * plain entry point with no build-time transform beyond what the app already
 * has, and so the file has no dependencies a viewer has to fetch twice.
 */
import { createRoot } from 'react-dom/client';
import { createElement, useEffect, useState, type ReactElement } from 'react';
import {
  callPublicRpc,
  docKindLabel,
  formatDocCode,
  normaliseDocCode,
  stateHeadline,
  stateTone,
  type VerificationState,
} from '@kit';
import { allowedOnly, type Answer } from '../src/model';

const STYLE = `
  :root { color-scheme: light dark; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  body { margin: 0; padding: 14px; background: transparent; }
  .card { border: 1px solid rgba(128,128,128,.35); border-radius: 12px; padding: 14px 16px; }
  .code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; letter-spacing: .02em; }
  .headline { font-weight: 650; font-size: 16px; margin: 0 0 6px; }
  .ok { color: #0a7a3d; } .bad { color: #b3261e; } .warn { color: #8a5a00; }
  @media (prefers-color-scheme: dark) {
    .ok { color: #6ede9a; } .bad { color: #ff8a80; } .warn { color: #ffcc66; }
  }
  .line { font-size: 13px; margin: 2px 0; }
  .muted { opacity: .72; }
  .stamp { font-size: 11px; opacity: .6; margin-top: 10px; }
`;

/** The one environment value this page needs, injected at build time. */
const env = {
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL ?? '',
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
  },
} as unknown as Parameters<typeof callPublicRpc>[0];

function readCode(): string {
  const params = new URLSearchParams(window.location.search);
  return normaliseDocCode(params.get('code') ?? '');
}

function toneClass(state: string): string {
  const value = stateTone(state as VerificationState);
  return value === 'ok' ? 'ok' : value === 'bad' ? 'bad' : 'warn';
}

function Card({ answer, failed }: { answer: Answer | null; failed: string }): ReactElement {
  if (failed !== '') {
    return createElement('div', { className: 'card' }, [
      createElement('p', { className: 'headline warn', key: 'h' }, 'The registry could not answer'),
      createElement('p', { className: 'line', key: 'b' }, failed),
      createElement(
        'p',
        { className: 'line muted', key: 'c' },
        'This says nothing about the document. Try again shortly.',
      ),
    ]);
  }
  if (answer === null) {
    return createElement('div', { className: 'card' }, [
      createElement('p', { className: 'headline', key: 'h' }, 'Checking this document'),
      createElement('p', { className: 'line muted', key: 'b' }, 'Asking the registry.'),
    ]);
  }
  if (!answer.found) {
    return createElement('div', { className: 'card' }, [
      createElement('p', { className: 'headline bad', key: 'h' }, 'Not in the registry'),
      createElement('p', { className: 'line', key: 'b' }, answer.reason),
      createElement(
        'p',
        { className: 'line muted', key: 'c' },
        'Check the code against the document. A mistyped character looks exactly like this.',
      ),
    ]);
  }

  const facts: ReactElement[] = [];
  if (answer.recipient_name !== null && answer.recipient_name !== '') {
    facts.push(createElement('p', { className: 'line', key: 'name' }, `Named: ${answer.recipient_name}`));
  }
  if (answer.subject !== null && answer.subject !== '') {
    facts.push(createElement('p', { className: 'line', key: 'subject' }, answer.subject));
  }
  if (answer.expires_on !== null) {
    facts.push(createElement('p', { className: 'line muted', key: 'exp' }, `In force until ${answer.expires_on}`));
  }
  if (answer.reason !== '') {
    facts.push(createElement('p', { className: 'line', key: 'why' }, answer.reason));
  }

  return createElement('div', { className: 'card' }, [
    createElement(
      'p',
      { className: `headline ${toneClass(answer.state)}`, key: 'h' },
      stateHeadline({ state: answer.state as VerificationState, kind: answer.kind }),
    ),
    createElement('p', { className: 'line code muted', key: 'c' }, formatDocCode(answer.code)),
    createElement('p', { className: 'line muted', key: 'k' }, docKindLabel(answer.kind)),
    ...facts,
    createElement(
      'p',
      { className: 'stamp', key: 's' },
      'Answered by the BSDC registry. Nothing beyond the printed document is shown.',
    ),
  ]);
}

function Embedded(): ReactElement {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [failed, setFailed] = useState('');

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.appendChild(style);

    const code = readCode();
    if (code === '') {
      setFailed('No document code was given in the link.');
      return;
    }
    // One code, through the same rate-limited entry point the desk uses, so a
    // framed page cannot be used to walk the registry any faster than the site
    // itself allows.
    callPublicRpc<{ results: Record<string, unknown>[] }>(env, 'verify_public', {
      p_codes: [code],
      p_address: '',
    })
      .then((payload) => {
        const first = (payload.results ?? [])[0];
        setAnswer(first === undefined ? null : allowedOnly(first));
      })
      .catch((cause: unknown) => {
        setFailed(cause instanceof Error ? cause.message : 'The request failed.');
      });
  }, []);

  return createElement(Card, { answer, failed });
}

const root = document.getElementById('root');
if (root !== null) {
  createRoot(root).render(createElement(Embedded));
}
