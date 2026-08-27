import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@/App';

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}

describe('app shell + routing', () => {
  afterEach(() => {
    document.documentElement.className = '';
  });

  it('renders the landing page with header and brand at "/"', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /open home for software developers/i,
    );
    expect(screen.getByRole('link', { name: /BSDC home/i })).toBeInTheDocument();
  });

  it('renders the profile area as explicitly not-yet-implemented for /@username', () => {
    renderAt('/@rizwan');
    expect(screen.getByText(/Planned for Phase 1/i)).toBeInTheDocument();
    expect(screen.getByText(/not implemented yet/i)).toBeInTheDocument();
  });

  it('renders unknown paths as 404', () => {
    renderAt('/definitely-not-a-page');
    expect(screen.getByText(/page not found/i)).toBeInTheDocument();
  });

  it('rejects invalid post types but accepts the known route shape', () => {
    renderAt('/article/my-first-post');
    expect(screen.getByText(/Planned for Phase 2/i)).toBeInTheDocument();
    renderAt('/bogus-type/xyz');
    expect(screen.getByText(/page not found/i)).toBeInTheDocument();
  });

  it('switches theme to dark and persists the choice (§11)', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(screen.getByRole('button', { name: /theme/i }));
    await user.click(screen.getByRole('menuitemradio', { name: /dark/i }));
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
    expect(window.localStorage.getItem('bsdc.theme')).toContain('dark');
  });

  it('switches locale to Bangla: strings, <html lang>, and heading all change (§14.7)', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(screen.getByRole('button', { name: /language/i }));
    await user.click(screen.getByRole('menuitemradio', { name: 'বাংলা' }));
    await waitFor(() => expect(document.documentElement.lang).toBe('bn'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/উন্মুক্ত ঠিকানা/),
    );
  });
});
