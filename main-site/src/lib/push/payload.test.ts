import { expect, it } from 'vitest';
import { readPushPayload } from './payload';

const origin = 'https://www.bsdc.info.bd';
const read = (value: unknown) => readPushPayload({ json: () => value }, origin);

it('leaves empty wakes and unrenderable payloads to the inbox fallback', () => {
  expect(readPushPayload(null, origin)).toBeNull();
  expect(read({ title: ' ' })).toBeNull();
  expect(readPushPayload({ json: () => JSON.parse('bad') as unknown }, origin)).toBeNull();
});

it('reads inline, FCM notification and FCM data-only payloads', () => {
  const fields = { title: 'New order', body: 'Open order', url: '/marketplace?alarm=1' };
  for (const payload of [
    fields,
    { data: fields },
    { notification: fields, data: { url: fields.url } },
  ]) {
    expect(read(payload)).toMatchObject(fields);
  }
});

it('rejects cross-origin notification targets including slash-backslash URLs', () => {
  expect(read({ title: 'Push', url: '/\\other.test/orders' })?.url).toBe('/notifications');
  expect(read({ title: 'Push', url: 'https://other.test/orders' })?.url).toBe('/notifications');
});
