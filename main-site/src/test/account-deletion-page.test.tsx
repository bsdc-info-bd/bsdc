import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AccountDeletionPage from '@/routes/AccountDeletionPage';
import { en } from '@/i18n/locales/en';
import { bn } from '@/i18n/locales/bn';

vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));

/**
 * The public account-deletion page is the URL Google Play asks for in the
 * Data safety section, and it has to work for somebody who cannot open the app:
 * a reviewer, or a member whose phone is gone.
 *
 * What matters is not wording but that the page exists in both languages, names
 * all three routes to deletion, and tells the truth about what is kept — a
 * deletion page that promises everything is erased is inaccurate, because order
 * records survive in de-identified form.
 */

const SECTION_KEYS = ['inTheApp', 'onTheWeb', 'byEmail', 'whatHappens', 'whatStays'] as const;

describe('account deletion page', () => {
  it('renders every section heading', () => {
    render(
      <MemoryRouter>
        <AccountDeletionPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    for (const key of SECTION_KEYS) {
      expect(
        screen.getByRole('heading', { level: 2, name: en.accountDeletion.sections[key].title }),
      ).toBeInTheDocument();
    }
  });

  it('lists what is deleted, not only prose about it', () => {
    render(
      <MemoryRouter>
        <AccountDeletionPage />
      </MemoryRouter>,
    );
    for (const item of en.accountDeletion.sections.whatHappens.items) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  it('names all three ways to delete an account', () => {
    // In the app, on the web, and by email. A page that only describes the app
    // is useless to the person who no longer has it installed.
    const copy = `${en.accountDeletion.sections.inTheApp.body} ${en.accountDeletion.sections.onTheWeb.body} ${en.accountDeletion.sections.byEmail.body}`;
    expect(copy).toMatch(/Settings/);
    expect(copy).toMatch(/DELETE/);
    expect(copy).toMatch(/30 days/);
  });

  it('admits what is kept instead of claiming total erasure', () => {
    expect(en.accountDeletion.sections.whatStays.body).toMatch(/Orders and payments/);
    expect(en.accountDeletion.sections.whatStays.body).toMatch(
      /without your name, address or phone/i,
    );
  });

  it('has both languages for every section', () => {
    for (const key of SECTION_KEYS) {
      expect(bn.accountDeletion.sections[key]?.title, `bn title for ${key}`).toBeTruthy();
      expect(bn.accountDeletion.sections[key]?.body, `bn body for ${key}`).toBeTruthy();
    }
    expect(bn.accountDeletion.sections.whatHappens.items).toHaveLength(
      en.accountDeletion.sections.whatHappens.items.length,
    );
  });
});
