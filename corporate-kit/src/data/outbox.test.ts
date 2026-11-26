import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_OUTBOX_AGE_MS,
  enqueue,
  newIntentId,
  outboxSummary,
  planReplay,
  readOutbox,
  removeIntent,
  updateIntent,
} from './outbox';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

let storage: Storage;
beforeEach(() => {
  storage = memoryStorage();
});

const intent = (over: Partial<Parameters<typeof enqueue>[1]> = {}) => ({
  rpc: 'hide_listing',
  args: { p_id: 'abc' },
  actor: 'uid-1',
  label: 'Hide listing “Brass lamp”',
  ...over,
});

describe('enqueue', () => {
  it('records the write before it is attempted', () => {
    const created = enqueue('bsdc-mod', intent(), storage);
    expect(created.status).toBe('pending');
    expect(created.attempts).toBe(0);
    expect(readOutbox('bsdc-mod', storage)).toHaveLength(1);
  });

  it('keeps the label, so a later replay can say what it will do', () => {
    const created = enqueue('bsdc-mod', intent(), storage);
    expect(created.label).toBe('Hide listing “Brass lamp”');
  });

  it('survives a reload, which is the entire point', () => {
    enqueue('bsdc-mod', intent(), storage);
    // A new page load reads the same storage through a fresh call.
    const reloaded = readOutbox('bsdc-mod', storage);
    expect(reloaded[0]?.rpc).toBe('hide_listing');
    expect(reloaded[0]?.args).toEqual({ p_id: 'abc' });
  });

  it('keeps two intents in order', () => {
    enqueue('bsdc-mod', intent({ label: 'first' }), storage);
    enqueue('bsdc-mod', intent({ label: 'second' }), storage);
    expect(readOutbox('bsdc-mod', storage).map((i) => i.label)).toEqual(['first', 'second']);
  });

  it('does not leak between consoles', () => {
    enqueue('bsdc-mod', intent(), storage);
    expect(readOutbox('bsdc-admin', storage)).toHaveLength(0);
  });
});

describe('newIntentId', () => {
  it('is unique across calls in the same millisecond', () => {
    // Two writes queued together must not merge into one.
    const ids = new Set([
      newIntentId(1_000, () => 0.1),
      newIntentId(1_000, () => 0.9),
      newIntentId(1_000, () => 0.5),
    ]);
    expect(ids.size).toBe(3);
  });

  it('uses crypto.randomUUID when the browser has it', () => {
    const id = newIntentId(1_000, () => 0.5);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('falls back to a timestamped id where randomUUID is missing', () => {
    // Older mobile browsers, and any insecure context, have no randomUUID.
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      const id = newIntentId(1_000, () => 0.5);
      expect(id).toContain('intent-');
      expect(id).toContain((1_000).toString(36));
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });
});

describe('removeIntent / updateIntent', () => {
  it('forgets an intent only when the server has confirmed it', () => {
    const created = enqueue('bsdc-mod', intent(), storage);
    removeIntent('bsdc-mod', created.id, storage);
    expect(readOutbox('bsdc-mod', storage)).toHaveLength(0);
  });

  it('counts an attempt without losing the intent', () => {
    const created = enqueue('bsdc-mod', intent(), storage);
    updateIntent('bsdc-mod', created.id, { attempts: 1, status: 'sending' }, storage);
    const [row] = readOutbox('bsdc-mod', storage);
    expect(row?.attempts).toBe(1);
    expect(row?.status).toBe('sending');
  });

  it('keeps the refusal reason so the operator can see why', () => {
    const created = enqueue('bsdc-mod', intent(), storage);
    updateIntent('bsdc-mod', created.id, { lastError: 'That listing is already hidden.' }, storage);
    expect(readOutbox('bsdc-mod', storage)[0]?.lastError).toBe('That listing is already hidden.');
  });
});

describe('readOutbox', () => {
  it('discards a corrupted queue instead of throwing at boot', () => {
    storage.setItem('bsdc:outbox:bsdc-mod', 'torn');
    expect(readOutbox('bsdc-mod', storage)).toEqual([]);
  });

  it('discards individual rows that are not intents', () => {
    storage.setItem(
      'bsdc:outbox:bsdc-mod',
      JSON.stringify([
        {
          id: 'a',
          rpc: 'x',
          args: {},
          actor: 'u',
          label: 'l',
          queuedAt: 1,
          attempts: 0,
          status: 'pending',
        },
        { broken: true },
      ]),
    );
    expect(readOutbox('bsdc-mod', storage)).toHaveLength(1);
  });
});

describe('planReplay', () => {
  const at = (ms: number) => 1_700_000_000_000 + ms;

  it('sends what can be sent', () => {
    const created = enqueue('bsdc-mod', intent({ queuedAt: at(0) }), storage);
    const [plan] = planReplay([created], { actor: 'uid-1', now: at(1_000), online: true });
    expect(plan?.action).toBe('send');
  });

  it('waits rather than sending while offline', () => {
    const created = enqueue('bsdc-mod', intent({ queuedAt: at(0) }), storage);
    const [plan] = planReplay([created], { actor: 'uid-1', now: at(1_000), online: false });
    expect(plan?.action).toBe('drop');
    expect(plan && 'why' in plan ? plan.why : '').toContain('Waiting for a connection');
  });

  it('never replays another account\u2019s write', () => {
    // A permission change must not turn a queued action into somebody else's.
    const created = enqueue('bsdc-mod', intent({ queuedAt: at(0) }), storage);
    const [plan] = planReplay([created], { actor: 'uid-2', now: at(1_000), online: true });
    expect(plan?.action).toBe('drop');
    expect(plan && 'why' in plan ? plan.why : '').toContain('another account');
  });

  it('does not replay a day-old intent', () => {
    const created = enqueue('bsdc-mod', intent({ queuedAt: at(0) }), storage);
    const [plan] = planReplay([created], {
      actor: 'uid-1',
      now: at(MAX_OUTBOX_AGE_MS + 1),
      online: true,
    });
    expect(plan?.action).toBe('drop');
  });

  it('stops retrying an intent that keeps failing', () => {
    const created = enqueue('bsdc-mod', intent({ queuedAt: at(0) }), storage);
    const [plan] = planReplay([{ ...created, attempts: 5 }], {
      actor: 'uid-1',
      now: at(1_000),
      online: true,
    });
    expect(plan?.action).toBe('drop');
  });

  it('never resurrects an abandoned intent', () => {
    const created = enqueue('bsdc-mod', intent({ queuedAt: at(0) }), storage);
    const [plan] = planReplay([{ ...created, status: 'abandoned' }], {
      actor: 'uid-1',
      now: at(1_000),
      online: true,
    });
    expect(plan?.action).toBe('drop');
  });
});

describe('outboxSummary', () => {
  it('is silent when nothing is waiting', () => {
    expect(outboxSummary([])).toBe('');
  });

  it('names the single waiting change, because that is actionable', () => {
    const created = enqueue('bsdc-mod', intent(), storage);
    expect(outboxSummary([created])).toBe(
      '1 change is waiting to be sent: Hide listing “Brass lamp”',
    );
  });

  it('counts several without listing them', () => {
    enqueue('bsdc-mod', intent(), storage);
    enqueue('bsdc-mod', intent(), storage);
    expect(outboxSummary(readOutbox('bsdc-mod', storage))).toBe(
      '2 changes are waiting to be sent.',
    );
  });

  it('does not count a change that already went through', () => {
    const created = enqueue('bsdc-mod', intent(), storage);
    expect(outboxSummary([{ ...created, status: 'sending' }])).toBe('');
  });
});
