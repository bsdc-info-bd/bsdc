import { describe, expect, it } from 'vitest';
import {
  chromeFor,
  FULL_CHROME,
  IMMERSIVE,
  isMessengerPath,
  isThreadPath,
  NO_FOOTER,
} from './chrome';

describe('which paths belong to the messenger', () => {
  it('knows the inbox', () => {
    expect(isMessengerPath('/messages')).toBe(true);
    expect(isMessengerPath('/messages/')).toBe(true);
    expect(isMessengerPath('/')).toBe(false);
    expect(isMessengerPath('/notifications')).toBe(false);
    // A username that starts with the word is not the messenger.
    expect(isMessengerPath('/messagesfromdhaka')).toBe(false);
  });

  it('knows a thread from the inbox', () => {
    expect(isThreadPath('/messages/9f1c2b7a')).toBe(true);
    expect(isThreadPath('/messages/9f1c2b7a/')).toBe(true);
    expect(isThreadPath('/messages')).toBe(false);
    expect(isThreadPath('/messages/')).toBe(false);
    expect(isThreadPath('/messages?conversation=1')).toBe(false);
    // Something deeper than a conversation id is not a thread this shell owns.
    expect(isThreadPath('/messages/9f1c2b7a/settings')).toBe(false);
  });
});

describe('the chrome a route gets', () => {
  it('gives the site everything it usually has', () => {
    expect(chromeFor('/')).toEqual(FULL_CHROME);
    expect(chromeFor('/p/a-post')).toEqual(FULL_CHROME);
    expect(chromeFor('/u/somebody')).toEqual(FULL_CHROME);
  });

  it('takes the footer out of the inbox, and keeps the way out', () => {
    expect(chromeFor('/messages')).toEqual(NO_FOOTER);
    expect(chromeFor('/messages').footer).toBe(false);
    expect(chromeFor('/messages').bottomNav).toBe(true);
    expect(chromeFor('/messages').appBar).toBe(true);
  });

  it('gives a thread the whole screen', () => {
    expect(chromeFor('/messages/9f1c2b7a')).toEqual(IMMERSIVE);
    expect(IMMERSIVE.appBar).toBe(false);
    expect(IMMERSIVE.footer).toBe(false);
    expect(IMMERSIVE.bottomNav).toBe(false);
    expect(IMMERSIVE.tabBarPadding).toBe(false);
  });

  it('answers the same for the same path however it is written', () => {
    expect(chromeFor('/messages/9f1c2b7a/')).toEqual(IMMERSIVE);
    expect(chromeFor('/messages/9f1c2b7a?reply=1')).toEqual(IMMERSIVE);
    expect(chromeFor('')).toEqual(FULL_CHROME);
  });
});
