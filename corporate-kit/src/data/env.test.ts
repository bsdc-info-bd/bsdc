import { describe, expect, it } from 'vitest';
import { missingConfig, readEnv, type CorporateEnv } from './env';
import { DataError, messageOf, toDataError } from './rpc';

const blank: CorporateEnv = {
  appId: 'bsdc-config',
  appName: 'Configuration',
  siteUrl: 'https://www.bsdc.info.bd',
  firebase: { apiKey: '', authDomain: '', projectId: '', appId: '', databaseURL: '' },
  supabase: { url: '', publishableKey: '' },
};

const full: CorporateEnv = {
  ...blank,
  firebase: {
    apiKey: 'key',
    authDomain: 'bsdc-second.firebaseapp.com',
    projectId: 'bsdc-second',
    appId: '1:2:web:3',
    databaseURL: 'https://bsdc-second.firebaseio.com',
  },
  supabase: { url: 'https://db.supabase.co', publishableKey: 'anon' },
};

describe('corporate environment', () => {
  it('names every missing value so a broken deployment explains itself', () => {
    expect(missingConfig(blank)).toEqual([
      'VITE_FB2_API_KEY',
      'VITE_FB2_AUTH_DOMAIN',
      'VITE_FB2_PROJECT_ID',
      'VITE_FB2_APP_ID',
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
    ]);
  });

  it('reports nothing missing once the deployment is complete', () => {
    expect(missingConfig(full)).toEqual([]);
  });

  it('keeps the app identity it was given and falls back to the public site url', () => {
    const env = readEnv('bsdc-ip', 'IP intelligence');
    expect(env.appId).toBe('bsdc-ip');
    expect(env.appName).toBe('IP intelligence');
    expect(env.siteUrl.startsWith('https://')).toBe(true);
  });
});

type PgError = Parameters<typeof toDataError>[0];

const pgError = (code: string, message: string, details = ''): PgError =>
  ({ code, message, details, hint: '', name: 'PostgrestError' }) as unknown as PgError;

describe('data errors', () => {
  it('turns a permission failure into something a person can act on', () => {
    const error = toDataError(pgError('42501', 'permission denied'));
    expect(error).toBeInstanceOf(DataError);
    expect(error.message).toBe('Your role does not allow this action.');
    expect(error.code).toBe('42501');
  });

  it('keeps an unmapped database message rather than inventing one', () => {
    const error = toDataError(
      pgError('P0001', 'a staff record needs a staff role', 'upsert_staff_record'),
    );
    expect(error.message).toBe('a staff record needs a staff role');
    expect(error.detail).toBe('upsert_staff_record');
  });

  it('reads a message off anything that was thrown', () => {
    expect(messageOf(new Error('boom'))).toBe('boom');
    expect(messageOf('a string')).toBe('Something went wrong.');
  });
});
