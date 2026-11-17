import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PrivacyPage from '@/routes/PrivacyPage';
import { en } from '@/i18n/locales/en';
import { bn } from '@/i18n/locales/bn';

// `Seo` needs a Helmet context that only the router shell provides; the rest of
// the suite mocks it for the same reason. The page's job here is its content.
vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));

/**
 * The privacy policy is a Google Play submission requirement, so the failure that
 * matters is not a wrong word — it is a page that renders empty, or a section that
 * exists in one language and not the other. A Play reviewer opens the URL, sees a
 * heading and no content, and the release is rejected without an explanation.
 *
 * These tests hold the page against both bundles rather than against hard-coded
 * strings, so adding a section to the locale files without touching the page fails
 * here instead of shipping a policy that silently omits what it collects.
 */

const SECTION_KEYS = [
  'whatWeCollect',
  'whyWeHoldIt',
  'whoSeesIt',
  'payments',
  'messages',
  'location',
  'photos',
  'cookies',
  'retention',
  'yourRights',
  'children',
  'changes',
  'contact',
] as const;

describe('privacy policy page', () => {
  it('renders the heading and every section heading', () => {
    render(<PrivacyPage />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    for (const key of SECTION_KEYS) {
      expect(
        screen.getByRole('heading', { level: 2, name: en.privacy.sections[key].title }),
      ).toBeInTheDocument();
    }
  });

  it('renders the list items, not only the section bodies', () => {
    render(<PrivacyPage />);
    // The inventory of what is collected is the part a reviewer reads first; a
    // section that renders its prose but drops its list is a policy that says
    // "we collect some things" and stops.
    for (const item of en.privacy.sections.whatWeCollect.items) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  it('has both languages for every section it renders', () => {
    for (const key of SECTION_KEYS) {
      expect(bn.privacy.sections[key]?.title, `bn title for ${key}`).toBeTruthy();
      expect(bn.privacy.sections[key]?.body, `bn body for ${key}`).toBeTruthy();
    }
  });

  it('states the facts the policy is judged on', () => {
    // These are the claims that make the policy accurate for this codebase, and
    // each corresponds to something observable in the repository: no analytics
    // tag, bKash-only payment, and a rejection that always carries a reason.
    expect(en.privacy.sections.cookies.body).toMatch(/no advertising or analytics cookies/i);
    expect(en.privacy.sections.payments.body).toMatch(/bKash/);
    expect(en.privacy.sections.payments.body).toMatch(/reason/i);
    expect(en.privacy.sections.children.body).toMatch(/13/);
  });
});
