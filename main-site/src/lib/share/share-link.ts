export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface ShareTarget {
  readonly title: string;
  readonly url: string;
}

/** The two browser capabilities sharing uses; injectable so the rules can be tested. */
export interface ShareEnvironment {
  readonly share?: (data: { title: string; text: string; url: string }) => Promise<void>;
  readonly writeText?: (text: string) => Promise<void>;
}

function browserEnvironment(): ShareEnvironment {
  if (typeof navigator === 'undefined') return {};
  return {
    ...(typeof navigator.share === 'function'
      ? { share: (data: { title: string; text: string; url: string }) => navigator.share(data) }
      : {}),
    ...(navigator.clipboard !== undefined
      ? { writeText: (text: string) => navigator.clipboard.writeText(text) }
      : {}),
  };
}

/**
 * Shares a link the way the device prefers. Uses the native share sheet where it
 * exists; otherwise copies the link. A reader who closes the sheet has cancelled,
 * which is not an error, and any other share failure falls back to copying.
 */
export async function shareLink(
  target: ShareTarget,
  environment: ShareEnvironment = browserEnvironment(),
): Promise<ShareOutcome> {
  if (environment.share !== undefined) {
    try {
      await environment.share({ title: target.title, text: target.title, url: target.url });
      return 'shared';
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') return 'cancelled';
    }
  }
  if (environment.writeText !== undefined) {
    try {
      await environment.writeText(target.url);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  return 'failed';
}
