import { describe, expect, it } from 'vitest';
import { TOAST_TTL, pushToast, shouldReplace, type Toast } from './toast';

const toast = (id: number, tone: Toast['tone'], message = `t${id}`): Toast => ({
  id,
  tone,
  message,
  ttl: TOAST_TTL[tone],
});

describe('TOAST_TTL', () => {
  it('lets an operator read a failure', () => {
    // The one policy decision here: an error that vanishes before it is read
    // becomes a support ticket, so it waits to be dismissed.
    expect(TOAST_TTL.bad).toBe(0);
  });

  it('dismisses a success on its own', () => {
    expect(TOAST_TTL.ok).toBeGreaterThan(0);
    expect(TOAST_TTL.ok).toBeLessThanOrEqual(5_000);
  });
});

describe('pushToast', () => {
  it('adds the first toast with a starting id', () => {
    const list = pushToast([], { message: 'Shop suspended' });
    expect(list).toHaveLength(1);
    expect(list[0]?.message).toBe('Shop suspended');
    expect(list[0]?.tone).toBe('ok');
  });

  it('ignores an empty message rather than rendering a blank toast', () => {
    expect(pushToast([], { message: '   ' })).toHaveLength(0);
  });

  it('replaces a previous success instead of stacking three of them', () => {
    let list = pushToast([], { message: 'Saved' });
    list = pushToast(list, { message: 'Saved' });
    list = pushToast(list, { message: 'Saved' });
    expect(list).toHaveLength(1);
    // It is the same toast, updated: a new id would leave the caller's dismiss
    // timer pointing at a toast that no longer exists.
    expect(list[0]?.id).toBe(1);
  });

  it('stacks errors, because two refusals are two problems', () => {
    let list = pushToast([], { message: 'Not allowed', tone: 'bad' });
    list = pushToast(list, { message: 'Also not allowed', tone: 'bad' });
    expect(list).toHaveLength(2);
    expect(list.map((t) => t.message)).toEqual(['Not allowed', 'Also not allowed']);
  });

  it('never lets a success evict an unread error', () => {
    let list = pushToast([], { message: 'Permission denied', tone: 'bad' });
    list = pushToast(list, { message: 'Saved' });
    expect(list).toHaveLength(2);
    expect(list[0]?.message).toBe('Permission denied');
  });

  it('replaces a success that is followed by another success, keeping errors', () => {
    let list = pushToast([], { message: 'Denied', tone: 'bad' });
    list = pushToast(list, { message: 'Saved' });
    list = pushToast(list, { message: 'Saved again' });
    expect(list.map((t) => t.message)).toEqual(['Denied', 'Saved again']);
  });

  it('caps the stack so the fourth error is not pushed off screen', () => {
    let list: readonly Toast[] = [];
    for (let i = 0; i < 6; i += 1) list = pushToast(list, { message: `e${i}`, tone: 'bad' });
    expect(list).toHaveLength(4);
    // The newest survive: the operator is looking at the most recent failure.
    expect(list.at(-1)?.message).toBe('e5');
  });

  it('keeps a detail line when one is given', () => {
    const list = pushToast([], { message: 'Suspended', detail: 'Until 2026-12-01' });
    expect(list[0]?.detail).toBe('Until 2026-12-01');
  });

  it('applies the tone default lifetime unless overridden', () => {
    expect(pushToast([], { message: 'x', tone: 'bad' })[0]?.ttl).toBe(0);
    expect(pushToast([], { message: 'x', tone: 'warn', ttl: 1_500 })[0]?.ttl).toBe(1_500);
  });
});

describe('shouldReplace', () => {
  it('replaces only the low-stakes tones', () => {
    expect(shouldReplace(toast(1, 'ok'), { message: 'x' })).toBe(true);
    expect(shouldReplace(toast(1, 'info'), { message: 'x' })).toBe(true);
    expect(shouldReplace(toast(1, 'bad'), { message: 'x' })).toBe(false);
    expect(shouldReplace(toast(1, 'warn'), { message: 'x' })).toBe(false);
  });

  it('never replaces anything with an error', () => {
    expect(shouldReplace(toast(1, 'ok'), { message: 'x', tone: 'bad' })).toBe(false);
  });
});
