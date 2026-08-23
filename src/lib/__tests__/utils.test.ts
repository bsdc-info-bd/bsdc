/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { describe, expect, it } from 'vitest';
import {
  clamp, extractDescription, extractMentions, extractTagsFromBody, formatNumber, initialsOf,
  percent, readingMinutes, slugify, truncate, uniqueUsernameSeed,
} from '../utils';

describe('slugify', () => {
  it('creates URL-safe SEO slugs', () => {
    expect(slugify('How to Build a REST API with Node.js & Express!')).toBe('how-to-build-a-rest-api-with-nodejs-express');
  });
  it('handles Bangla text', () => {
    expect(slugify('বাংলাদেশ সফটওয়্যার')).toBe('বাংলাদেশ-সফটওয়্যার');
  });
  it('truncates to 80 chars', () => {
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
  it('collapses repeated dashes', () => {
    expect(slugify('a---b')).toBe('a-b');
  });
});

describe('readingMinutes', () => {
  it('returns at least 1 minute', () => {
    expect(readingMinutes('short')).toBe(1);
  });
  it('computes ~200 words per minute', () => {
    expect(readingMinutes('word '.repeat(600))).toBe(3);
  });
});

describe('extractors', () => {
  it('extracts hashtags', () => {
    expect(extractTagsFromBody('loving #react and #Firebase today #react')).toEqual(['react', 'firebase']);
  });
  it('extracts mentions', () => {
    expect(extractMentions('hey @rizwan and @dev_bd check this')).toEqual(['rizwan', 'dev_bd']);
  });
  it('extracts a clean description under 160 chars', () => {
    const desc = extractDescription('```js\nconst x=1;\n```\n# This is **markdown** with [links](https://x.dev) and plenty of text to trim down nicely for SEO purposes.');
    expect(desc.length).toBeLessThanOrEqual(160);
    expect(desc).toContain('markdown');
  });
});

describe('formatting', () => {
  it('formats compact numbers', () => {
    expect(formatNumber(1500)).toBe('1,500');
    expect(formatNumber(25000)).toBe('25K');
  });
  it('formats Bangla locale', () => {
    expect(formatNumber(1500, 'bn')).toBe('১,৫০০');
  });
  it('percent handles zero totals', () => {
    expect(percent(5, 0)).toBe(0);
    expect(percent(1, 4)).toBe(25);
  });
  it('clamp bounds values', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(-5, 0, 10)).toBe(0);
  });
  it('truncate adds ellipsis', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });
});

describe('initialsOf / uniqueUsernameSeed', () => {
  it('takes first letters of first two words', () => {
    expect(initialsOf('Rizwan Rahim Chowdhury')).toBe('RR');
    expect(initialsOf('')).toBe('');
  });
  it('creates a safe username seed', () => {
    const seed = uniqueUsernameSeed('rizwan.rahim+bsdc@gmail.com');
    expect(seed).toMatch(/^[a-z0-9_]{1,12}_[a-z0-9]{4}$/);
  });
});
