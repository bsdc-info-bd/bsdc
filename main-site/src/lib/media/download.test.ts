import { describe, expect, it } from 'vitest';
import { buildDownloadCandidates, suggestImageFilename } from './download';

describe('media download helpers', () => {
  it('prefers the same-origin proxy first for repairable ImgBB hosts', () => {
    expect(buildDownloadCandidates('https://i.ibb.co/demo/sample.png')).toEqual([
      '/media/i?u=https%3A%2F%2Fi.ibb.co%2Fdemo%2Fsample.png',
      'https://i.ibb.co/demo/sample.png',
    ]);
  });

  it('upgrades http ImgBB links to https before proxying', () => {
    expect(buildDownloadCandidates('http://i.ibb.co/demo/photo.jpg')).toEqual([
      '/media/i?u=https%3A%2F%2Fi.ibb.co%2Fdemo%2Fphoto.jpg',
      'https://i.ibb.co/demo/photo.jpg',
    ]);
  });

  it('passes non-ImgBB URLs directly without /media/i wrapping', () => {
    expect(buildDownloadCandidates('https://lh3.googleusercontent.com/a/avatar')).toEqual([
      'https://lh3.googleusercontent.com/a/avatar',
    ]);
  });

  it('derives clean filenames and extensions from MIME type or URL', () => {
    expect(suggestImageFilename('https://i.ibb.co/x/pic.webp', 'image/webp', 'Dhaka Meetup')).toBe(
      'dhaka-meetup.webp',
    );
    expect(suggestImageFilename('https://i.ibb.co/x/pic.jpeg')).toMatch(
      /^bsdc-image-[a-z0-9]+\.jpg$/,
    );
    expect(suggestImageFilename('https://example.com/raw', 'image/png', 'Banner')).toBe(
      'banner.png',
    );
  });
});
