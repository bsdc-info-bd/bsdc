import { describe, expect, it } from 'vitest';

import { PUSH_DEVICE_STATE_KEYS, describeDeviceState, staleDevicesNote } from '@/lib/push/support';
import { countLiveDevices, type PushDevice } from '@/lib/push/push-repository';

function device(state: PushDevice['state'], extra: Partial<PushDevice> = {}): PushDevice {
  return {
    endpoint: `https://push.example/${state}`,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/128.0',
    language: 'bn',
    createdAt: '2026-10-01T09:00:00.000Z',
    lastUsedAt: null,
    state,
    ...extra,
  };
}

describe('a device that cannot be woken', () => {
  it('is labelled, and a live one is not', () => {
    expect(describeDeviceState('live', 'en').label).toBe('');
    expect(describeDeviceState('live', 'en').tone).toBe('quiet');
    expect(describeDeviceState('dead', 'en')).toMatchObject({ tone: 'warn' });
    expect(describeDeviceState('invalid', 'en')).toMatchObject({ tone: 'warn' });
  });

  it('says the same thing in Bangla without leaking the English label', () => {
    const both = (['dead', 'invalid'] as const).map((state) => ({
      en: describeDeviceState(state, 'en').label,
      bn: describeDeviceState(state, 'bn').label,
    }));
    for (const pair of both) {
      expect(pair.bn.length).toBeGreaterThan(0);
      expect(pair.bn).not.toBe(pair.en);
      // Bangla, not romanised Bangla.
      expect(pair.bn).toMatch(/[\u0980-\u09FF]/);
    }
  });

  it('names an i18n key that exists for every state', () => {
    for (const state of ['live', 'invalid', 'dead'] as const) {
      expect(PUSH_DEVICE_STATE_KEYS[state]).toBe(`push.state.${state}`);
      expect(describeDeviceState(state, 'en').key).toBe(`push.state.${state}`);
    }
  });
});

describe('the sentence about stale devices', () => {
  it('costs nothing when every device is reachable', () => {
    expect(staleDevicesNote([], 'en')).toBeNull();
    expect(staleDevicesNote(['live', 'live'], 'en')).toBeNull();
  });

  it('counts the two kinds separately, because they need different words', () => {
    const note = staleDevicesNote(['live', 'dead', 'invalid'], 'en');
    expect(note).not.toBeNull();
    expect(note).toContain('1 device stopped answering');
    expect(note).toContain('1 device needs to be opened once');
    // The instruction, not just the diagnosis.
    expect(note).toContain('Open the browser once');
  });

  it('pluralises without an off-by-one', () => {
    expect(staleDevicesNote(['dead'], 'en')).toContain('1 device stopped answering');
    expect(staleDevicesNote(['dead', 'dead'], 'en')).toContain('2 devices stopped answering');
  });

  it('writes the count in Bangla digits', () => {
    const note = staleDevicesNote(['dead', 'dead', 'live'], 'bn');
    expect(note).not.toBeNull();
    expect(note).toContain('২');
    expect(note).not.toContain('2');
    expect(note).toMatch(/[\u0980-\u09FF]/);
  });
});

describe('counting what a notification can reach', () => {
  it('counts live devices only', () => {
    expect(countLiveDevices([])).toBe(0);
    expect(countLiveDevices([device('dead'), device('invalid')])).toBe(0);
    expect(countLiveDevices([device('live'), device('dead'), device('live')])).toBe(2);
  });
});
