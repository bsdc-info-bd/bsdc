import type * as ReactI18Next from 'react-i18next';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventShareActions } from './EventShareActions';
import type { CalendarFileEvent } from '@/lib/communities/event-calendar-file';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('sonner', () => ({ toast }));
vi.mock('react-i18next', async (original) => ({
  ...(await original<typeof ReactI18Next>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

const event: CalendarFileEvent = {
  id: '11111111-2222-4333-8444-555555555555',
  slug: 'friday-meetup',
  title: 'Friday meetup',
  description: 'Bring a laptop.',
  startsAt: '2026-11-13T04:00:00.000Z',
  endsAt: '2026-11-13T06:00:00.000Z',
  venue: 'Sylhet Hub',
  city: 'Sylhet',
  mode: 'in_person',
  url: 'https://bsdc.info.bd/events/friday-meetup',
  isCancelled: false,
};

const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setNavigator(key: 'share' | 'clipboard', value: unknown): void {
  Object.defineProperty(navigator, key, { configurable: true, value });
}

describe('EventShareActions', () => {
  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
  });

  afterEach(() => {
    if (originalShare) Object.defineProperty(navigator, 'share', originalShare);
    else Reflect.deleteProperty(navigator, 'share');
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else Reflect.deleteProperty(navigator, 'clipboard');
    vi.restoreAllMocks();
  });

  it('uses the device share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator('share', share);
    render(<EventShareActions event={event} />);

    fireEvent.click(screen.getByRole('button', { name: 'events.share' }));

    await waitFor(() => {
      expect(share).toHaveBeenCalledWith({
        title: 'Friday meetup',
        text: 'Friday meetup',
        url: event.url,
      });
    });
  });

  it('copies the link when there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Reflect.deleteProperty(navigator, 'share');
    setNavigator('clipboard', { writeText });
    render(<EventShareActions event={event} />);

    fireEvent.click(screen.getByRole('button', { name: 'events.share' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(event.url);
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('events.linkCopied');
    });
  });

  it('reports a failed copy instead of failing silently', async () => {
    Reflect.deleteProperty(navigator, 'share');
    setNavigator('clipboard', { writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    render(<EventShareActions event={event} />);

    fireEvent.click(screen.getByRole('button', { name: 'events.share' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('events.shareFailed');
    });
  });

  it('downloads a calendar file named after the event', () => {
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:calendar');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<EventShareActions event={event} />);

    fireEvent.click(screen.getByRole('button', { name: 'events.addToCalendar' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob?.type).toBe('text/calendar;charset=utf-8');
    expect(click).toHaveBeenCalledTimes(1);
  });
});
