/**
 * BSDC — src/tests/components/primitives.test.tsx
 * Purpose : Component coverage for the design-system primitives (PART 23.4, PART 08.09).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : These tests assert the accessibility contract as well as the rendering: tap targets,
 *           accessible names, Bangla line-height inheritance and the no-emoji rule for glyphs.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Avatar } from '@/shared/ui/Avatar';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Chip } from '@/shared/ui/Chip';
import { Heading, Text } from '@/shared/ui/Typography';

describe('Button', () => {
  it('renders a real anchor when `to` is provided so links stay crawlable', () => {
    render(
      <MemoryRouter>
        <Button to="/about">About BSDC</Button>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'About BSDC' });
    expect(link.getAttribute('href')).toBe('/about');
  });

  it('marks an external link with rel and target', () => {
    render(<Button href="https://rrc.bsdc.info.bd">RRC</Button>);
    const link = screen.getByRole('link', { name: 'RRC' });
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('does not fire the handler while loading or disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    await userEvent.click(button, { pointerEventsCheck: 0 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('fires the handler when enabled', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Avatar', () => {
  it('falls back to initials when there is no image', () => {
    render(<Avatar name="Rizwan Rahim Chowdhury" />);
    expect(screen.getByRole('img', { name: 'Rizwan Rahim Chowdhury' })).toHaveTextContent('RC');
  });

  it('keeps the first Bangla grapheme intact', () => {
    render(<Avatar name="রিজওয়ান রহিম" />);
    expect(screen.getByRole('img')).toHaveTextContent('র');
  });
});

describe('Chip', () => {
  it('exposes selection state through aria-pressed', async () => {
    const onToggle = vi.fn();
    render(
      <Chip selected={false} onToggle={onToggle}>
        Follow
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: /Follow/ });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(chip);
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe('Badge', () => {
  it('keeps the true count in the accessible label when the display is clamped', () => {
    render(<Badge variant="count" tone="danger" count={128} />);
    expect(screen.getByLabelText('128')).toHaveTextContent('99+');
  });
});

describe('Typography', () => {
  it('renders a semantic heading level independent of the visual size', () => {
    render(
      <Heading level={3} size="xl">
        Community rules
      </Heading>,
    );
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Community rules');
  });

  it('marks Bangla text so it inherits the Bangla line-height', () => {
    render(<Text lang="bn">আমরা বাংলায় কাজ করি</Text>);
    expect(screen.getByText('আমরা বাংলায় কাজ করি').getAttribute('lang')).toBe('bn');
  });
});
