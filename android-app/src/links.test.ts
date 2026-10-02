import { describe, expect, it } from 'vitest';
import {
  TRUSTED_HOSTS,
  backBehaviour,
  inAppUrl,
  notificationText,
  pushDestination,
  resolveLink,
} from './links';

describe('which links the app renders itself', () => {
  it('opens its own site inside the app', () => {
    expect(resolveLink('https://www.bsdc.info.bd/p/why-rust')).toEqual({
      kind: 'in-app',
      path: '/p/why-rust',
    });
    expect(resolveLink('https://vf.main.bsdc.info.bd/apply')).toEqual({
      kind: 'in-app',
      path: '/apply',
    });
  });

  it('sends every other site to the system browser, where the address is visible', () => {
    expect(resolveLink('https://example.com/offer')).toEqual({
      kind: 'browser',
      url: 'https://example.com/offer',
    });
    expect(resolveLink('https://bsdc.info.bd.attacker.test/login').kind).toBe('browser');
    expect(resolveLink('https://wwwbsdc.info.bd/login').kind).toBe('browser');
  });

  it('refuses anything that is not https and not its own scheme', () => {
    expect(resolveLink('http://www.bsdc.info.bd/').kind).toBe('ignore');
    expect(resolveLink('javascript:alert(1)').kind).toBe('ignore');
    expect(resolveLink('file:///etc/passwd').kind).toBe('ignore');
    expect(resolveLink('').kind).toBe('ignore');
    expect(resolveLink('not a url').kind).toBe('ignore');
  });

  it('understands its own scheme in both the forms Android produces', () => {
    expect(resolveLink('bsdc://post/why-rust')).toEqual({ kind: 'in-app', path: '/p/why-rust' });
    expect(resolveLink('bsdc:///jobs')).toEqual({ kind: 'in-app', path: '/jobs' });
  });

  it('keeps the query and the fragment, and drops a trailing slash', () => {
    expect(resolveLink('https://www.bsdc.info.bd/search/?q=rust#top')).toEqual({
      kind: 'in-app',
      path: '/search?q=rust#top',
    });
    expect(resolveLink('https://www.bsdc.info.bd/')).toEqual({ kind: 'in-app', path: '/' });
  });

  it('builds the address the web view loads', () => {
    expect(inAppUrl('/jobs')).toBe('https://www.bsdc.info.bd/jobs');
    expect(inAppUrl('jobs', 'https://staging.test/')).toBe('https://staging.test/jobs');
  });

  it('trusts exactly three hosts, so the list cannot grow unnoticed', () => {
    expect([...TRUSTED_HOSTS]).toEqual([
      'www.bsdc.info.bd',
      'bsdc.info.bd',
      'vf.main.bsdc.info.bd',
    ]);
  });
});

describe('where a notification takes you', () => {
  it('prefers an explicit path from the payload', () => {
    expect(pushDestination({ data: { path: '/messages/42' } })).toEqual({
      kind: 'in-app',
      path: '/messages/42',
    });
  });

  it('routes the kinds the server sends', () => {
    expect(pushDestination({ data: { kind: 'message', id: 'abc' } }).kind).toBe('in-app');
    expect(pushDestination({ data: { kind: 'post', id: 'why-rust' } })).toEqual({
      kind: 'in-app',
      path: '/p/why-rust',
    });
    expect(pushDestination({ data: { kind: 'follow', id: 'ayesha' } })).toEqual({
      kind: 'in-app',
      path: '/@ayesha',
    });
  });

  it('will not open a foreign site from a notification without the browser', () => {
    expect(pushDestination({ data: { url: 'https://example.com/win' } })).toEqual({
      kind: 'browser',
      url: 'https://example.com/win',
    });
  });

  it('says so when a payload has no destination rather than opening the home page', () => {
    expect(pushDestination({}).kind).toBe('ignore');
    expect(pushDestination({ data: { kind: 'mystery', id: 'x' } }).kind).toBe('ignore');
  });

  it('never shows an empty notification', () => {
    expect(notificationText({ title: '', body: '' })).toEqual({
      title: 'BSDC',
      body: 'You have a new notification.',
    });
    expect(notificationText({ title: 'New reply', body: 'Ayesha replied.' })).toEqual({
      title: 'New reply',
      body: 'Ayesha replied.',
    });
  });
});

describe('the back button', () => {
  it('goes back while there is somewhere to go back to', () => {
    expect(backBehaviour(true, '/p/why-rust')).toBe('back');
  });

  it('leaves the app from the home page, which is what Android users expect', () => {
    expect(backBehaviour(true, '/')).toBe('exit');
    expect(backBehaviour(false, '/jobs')).toBe('exit');
  });
});
