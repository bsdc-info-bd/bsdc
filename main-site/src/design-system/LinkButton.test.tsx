import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LinkButton } from './LinkButton';

/**
 * `to` accepts react-router's whole target type, not just a string.
 *
 * A link that can only take a string is a link that forces its callers to build
 * query strings by hand — and a hand-built `?a=1` against `/compose` is exactly
 * the place where a missing `?` or an unencoded value turns into
 * `/composechannel=…`. The channel page addresses the composer as
 * `{ pathname, search }`, so the prop has to be the type react-router accepts.
 */
describe('LinkButton', () => {
  it('renders an anchor with the button classes', () => {
    render(
      <MemoryRouter>
        <LinkButton to="/compose">Write</LinkButton>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Write' });
    expect(link).toHaveAttribute('href', '/compose');
    expect(link.className).toContain('bg-primary');
  });

  it('carries a structured target, query included', () => {
    render(
      <MemoryRouter>
        <LinkButton to={{ pathname: '/compose', search: '?channel=ch-1' }}>Write</LinkButton>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Write' })).toHaveAttribute(
      'href',
      '/compose?channel=ch-1',
    );
  });
});
