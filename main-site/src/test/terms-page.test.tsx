import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TermsPage from '@/routes/TermsPage';
import { en } from '@/i18n/locales/en';
import { bn } from '@/i18n/locales/bn';

// `Seo` needs a Helmet context that only the router shell provides; the rest of
// the suite mocks it for the same reason. The page's job here is its content.
vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));

/**
 * The terms of service sit beside the privacy policy in the Play Console listing,
 * so they fail in the same way the policy does: a page that renders a heading and
 * nothing under it, or a section that exists in English and not in Bangla. A
 * reviewer opens the URL, sees an empty document, and the release is rejected
 * without an explanation.
 *
 * These tests hold the page against both bundles rather than against hard-coded
 * strings, so adding a section to the locale files without touching the page — or
 * adding it to one language only — fails here instead of shipping.
 */

const SECTION_KEYS = [
  'theService',
  'yourAccount',
  'yourContent',
  'marketplace',
  'payments',
  'acceptableUse',
  'moderation',
  'suspension',
  'deletingYourAccount',
  'liability',
  'changes',
  'contact',
] as const;

describe('terms of service page', () => {
  it('renders the heading and every section heading', () => {
    render(<TermsPage />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    for (const key of SECTION_KEYS) {
      expect(
        screen.getByRole('heading', { level: 2, name: en.terms.sections[key].title }),
      ).toBeInTheDocument();
    }
  });

  it('renders the list items, not only the section bodies', () => {
    render(<TermsPage />);
    // The prohibited-conduct list is the part a member is actually bound by; a
    // section that renders "you may not do the following" and then stops is a
    // term nobody can be held to.
    for (const item of en.terms.sections.acceptableUse.items) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  it('has both languages for every section it renders', () => {
    for (const key of SECTION_KEYS) {
      expect(bn.terms.sections[key]?.title, `bn title for ${key}`).toBeTruthy();
      expect(bn.terms.sections[key]?.body, `bn body for ${key}`).toBeTruthy();
    }
  });

  it('keeps the lists in step across languages', () => {
    // A list that is three items long in English and two in Bangla means the
    // Bangla reader is held to a shorter document than the English one.
    expect(bn.terms.sections.acceptableUse.items).toHaveLength(
      en.terms.sections.acceptableUse.items.length,
    );
  });

  it('promises the things the product actually does', () => {
    // Each claim below corresponds to something observable in the repository.
    // If the product changes, the term has to change with it — that is the point
    // of asserting on them here rather than trusting the prose to stay honest.
    // Self-service deletion exists: `public.delete_my_account()` (migration 0119).
    expect(en.terms.sections.deletingYourAccount.body).toMatch(/Settings/);
    expect(bn.terms.sections.deletingYourAccount.body).toMatch(/সেটিংস/);
    // Deleted content has the 30-day recovery window the product implements.
    expect(en.terms.sections.yourContent.body).toMatch(/30-day/);
    // Payments are bKash, checked by staff — never a PIN.
    expect(en.terms.sections.payments.body).toMatch(/bKash/);
    expect(en.terms.sections.payments.body).toMatch(/PIN/);
    // The marketplace is cash-on-delivery.
    expect(en.terms.sections.marketplace.body).toMatch(/cash-on-delivery/i);
    // Moderators act through an audited console.
    expect(en.terms.sections.moderation.body).toMatch(/audit log/i);
    // The minimum age matches the privacy policy's claim.
    expect(en.terms.sections.yourAccount.body).toMatch(/13/);
  });
});
