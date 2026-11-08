import { describe, expect, it } from 'vitest';
import { fcmMessage, sendFcm } from './fcm';

describe('native FCM message contract', () => {
  it('restricts taps to app-internal paths and keeps routing data small', () => {
    const payload = fcmMessage({
      token: 'test-token',
      title: 'BSDC',
      body: 'New activity',
      path: '//attacker.test',
      eventId: 'n-1',
    });
    expect(payload.message.data).toEqual({ path: '/', eventId: 'n-1', kind: 'activity' });
    expect(payload.message.android.notification.channel_id).toBe('bsdc_activity');
    expect(payload.message.token).toBe('test-token');
  });

  it('never places a private message preview on the lock screen', () => {
    const payload = fcmMessage({
      token: 't',
      title: 'New message',
      body: 'sensitive message text',
      path: '/messages/abc',
      eventId: 'm-1',
      kind: 'message',
    });
    expect(payload.message.notification.body).toBe('You have a new message.');
  });

  it('refuses invalid account configuration without making requests', async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls += 1;
      return new Response('{}');
    };
    await expect(
      sendFcm(
        '{}',
        { token: 'token', title: 'BSDC', body: 'Activity', path: '/', eventId: '1' },
        fakeFetch,
      ),
    ).rejects.toThrow('configuration is incomplete');
    expect(calls).toBe(0);
  });
});
