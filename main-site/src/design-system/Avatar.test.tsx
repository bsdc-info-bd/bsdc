import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type * as I18nModule from 'react-i18next';

import { Avatar } from './Avatar';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

/**
 * An avatar is the most-repeated picture on the platform, which makes it the
 * first place a member notices that pictures have stopped loading — and the one
 * place a single failure used to be permanent. The old component latched `failed`
 * on the first `onError` and never tried again, so a picture that failed once on
 * a train stayed initials for the rest of the session, and a row that was
 * recycled for a different member never showed the new member's face.
 */

describe('a member with a picture', () => {
  it('renders it with the name as alternative text', () => {
    render(<Avatar name="BSDC" src="https://res.cloudinary.com/dpemuwrpz/image/upload/x.png" />);
    const image = screen.getByRole('img', { name: 'BSDC' });
    expect(image.tagName).toBe('IMG');
  });

  it('tries a new address after the first one is replaced', () => {
    const { rerender } = render(<Avatar name="Rizwan" src="https://cdn.example/old.png" />);
    rerender(<Avatar name="Rizwan" src="https://cdn.example/new.png" />);
    expect(screen.getByRole('img', { name: 'Rizwan' })).toHaveAttribute(
      'src',
      'https://cdn.example/new.png',
    );
  });
});

describe('a member without one', () => {
  it('draws initials, and says who it is for a screen reader', () => {
    render(<Avatar name="Rizwan Rahim" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('RR')).toBeInTheDocument();
    expect(screen.getByText('Rizwan Rahim')).toBeInTheDocument();
  });

  it('falls back to initials only after the ladder has run out', async () => {
    render(<Avatar name="Rizwan Rahim" src="https://cdn.example/gone.png" />);
    expect(screen.getByRole('img', { name: 'Rizwan Rahim' })).toBeInTheDocument();

    // Every rung fails. `MediaImage` retries a transient failure with a delay, so
    // this is not an instant transition, and it must not be treated as one.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const image = screen.queryByRole('img', { name: 'Rizwan Rahim' });
      if (image === null) break;
      fireEvent.error(image);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }

    await waitFor(() => {
      expect(screen.getByText('RR')).toBeInTheDocument();
    });
  });
});
