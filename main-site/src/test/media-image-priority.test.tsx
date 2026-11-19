import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MediaImage } from '@/components/media/MediaImage';

/**
 * Image loading is the complaint that outlives every redesign, so the two
 * behaviours that govern it are pinned down here.
 *
 * The first is priority. Every hero in the app was already `loading="eager"` and
 * still slow, because eager loading moves a request earlier in time but not
 * earlier in the browser's queue. `fetchpriority="high"` is what actually
 * promotes the image that a visitor sees first, and it was missing everywhere.
 * One prop now sets both, so a caller cannot set half of the pair.
 *
 * The second is that the default must stay lazy. Marking everything eager is the
 * easy way to make a hero look fast in a benchmark and make the page slower for
 * the below-fold images a reader scrolls to next.
 */

const SRC = 'https://i.ibb.co/abc123/photo.jpg';

describe('MediaImage priority', () => {
  it('sets eager loading and high fetch priority together', () => {
    render(<MediaImage src={SRC} alt="Product" priority />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
  });

  it('stays lazy and low priority by default', () => {
    render(<MediaImage src={SRC} alt="Thumbnail" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('loading', 'lazy');
    // Not "low": an absent attribute leaves the browser's own default alone,
    // which is the right answer for an image nobody has argued about.
    expect(img).not.toHaveAttribute('fetchpriority');
  });

  it('lets an explicit loading override the default but not priority', () => {
    render(<MediaImage src={SRC} alt="Above the fold" loading="eager" />);
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'eager');

    render(<MediaImage src={SRC} alt="Hero" priority loading="lazy" />);
    // `priority` is the stronger statement: a caller that says the image is the
    // LCP candidate did not mean for it to be lazy.
    const hero = screen.getByRole('img', { name: 'Hero' });
    expect(hero).toHaveAttribute('loading', 'eager');
    expect(hero).toHaveAttribute('fetchpriority', 'high');
  });

  it('still renders a usable element when the source is empty', () => {
    // An empty src is a record with no picture, not a broken layout: it must
    // resolve to the placeholder rather than an <img> pointing at the page URL.
    const { container } = render(<MediaImage src="" alt="No picture" />);
    // The placeholder is itself role="img" for a screen reader, so the assertion
    // has to be about the element, not the role: no <img> element at all.
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByLabelText('No picture')).toBeInTheDocument();
  });
});
