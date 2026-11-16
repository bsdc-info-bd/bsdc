import { describe, expect, it, vi } from 'vitest';
import { shareLink } from './share-link';

const target = { title: 'Rust meetup', url: 'https://bsdc.info.bd/events/rust' };

describe('shareLink', () => {
  it('uses the native sheet when the device has one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    expect(await shareLink(target, { share, writeText })).toBe('shared');
    expect(share).toHaveBeenCalledWith({
      title: 'Rust meetup',
      text: 'Rust meetup',
      url: target.url,
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('treats a closed share sheet as a choice, not a failure, and copies nothing', async () => {
    const abort = new DOMException('closed', 'AbortError');
    const writeText = vi.fn();
    expect(await shareLink(target, { share: vi.fn().mockRejectedValue(abort), writeText })).toBe(
      'cancelled',
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to copying when the native share fails for another reason', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn().mockRejectedValue(new Error('not allowed'));
    expect(await shareLink(target, { share, writeText })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(target.url);
  });

  it('copies when there is no share sheet at all', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareLink(target, { writeText })).toBe('copied');
  });

  it('reports failure when nothing works', async () => {
    expect(await shareLink(target, {})).toBe('failed');
    expect(await shareLink(target, { writeText: vi.fn().mockRejectedValue(new Error('x')) })).toBe(
      'failed',
    );
  });
});
