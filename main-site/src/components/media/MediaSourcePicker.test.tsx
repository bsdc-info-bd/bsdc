import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MediaSourcePicker, type MediaSourcePickerProps } from './MediaSourcePicker';
import type { GalleryPickerDialogProps } from './GalleryPickerDialog';
import type { PickedMedia } from '@/lib/media/gallery';
import type * as I18nModule from 'react-i18next';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    // Keys come back as keys, so an assertion reads the same as the locale file.
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

/**
 * The dialog stands in for itself.
 *
 * What this suite is about is the pair of doors and what comes out of them — which
 * button opens what, and whether the surface's own `purpose`, `max` and `attached`
 * reach the picker unchanged. The picker's reading of its library is tested where it
 * lives, and a real dialog here would only make a supabase client.
 */
const seen: { current: GalleryPickerDialogProps | null } = { current: null };

vi.mock('./GalleryPickerDialog', () => ({
  GalleryPickerDialog: (props: GalleryPickerDialogProps) => {
    seen.current = props;
    return (
      <div role="dialog" aria-label="stub">
        <output data-testid="dialog-purpose">{props.purpose}</output>
        <output data-testid="dialog-max">{props.max}</output>
        <output data-testid="dialog-attached">{(props.attached ?? []).join(',')}</output>
        <output data-testid="dialog-device">{props.onDevice ? 'yes' : 'no'}</output>
        <button type="button" onClick={() => props.onPick([{ ...PICKED }])}>
          choose one
        </button>
        <button type="button" onClick={() => props.onClose()}>
          close it
        </button>
      </div>
    );
  },
}));

const PICKED: PickedMedia = {
  mediaId: 'asset-9',
  url: 'https://i.ibb.co/nine/nine.webp',
  thumbUrl: 'https://i.ibb.co/nine/nine-thumb.webp',
  width: 1200,
  height: 800,
  altText: 'The library shot',
  purpose: 'cover' as const,
};

const onFiles = vi.fn<(files: File[]) => void>();
const onPick = vi.fn<(picked: PickedMedia[]) => void>();
const onUploaded = vi.fn<() => void>();

function renderPicker(patch: Partial<MediaSourcePickerProps> = {}) {
  return render(
    <MediaSourcePicker purpose="post-image" max={6} onFiles={onFiles} onPick={onPick} {...patch} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  seen.current = null;
});

describe('the two doors, side by side', () => {
  it('offers a device and a library, and does not ask which one first', () => {
    renderPicker();
    expect(screen.getByRole('button', { name: /media\.upload/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'media.gallery.open' })).toBeInTheDocument();
    // Nothing is open yet: a gallery nobody asked for is a request per composer.
    expect(screen.queryByRole('dialog', { name: 'stub' })).not.toBeInTheDocument();
  });

  it('hands the chosen files to the surface, and keeps none of them', () => {
    renderPicker();
    const input = screen.getByLabelText('media.gallery.uploadDevice');
    const file = new File([new Uint8Array(8)], 'a.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0]?.[0]?.[0]?.name).toBe('a.png');
    // The picker has no attachment of its own to show, so no dialog opened either.
    expect(screen.queryByRole('dialog', { name: 'stub' })).not.toBeInTheDocument();
  });

  it('clears the input after a choice, so the same file can be tried again', () => {
    renderPicker();
    const input = screen.getByLabelText<HTMLInputElement>('media.gallery.uploadDevice');
    const file = new File([new Uint8Array(8)], 'again.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    // A file input whose value still names a file fires no change event when the
    // member picks that same file again — which is what happens right after they
    // remove it from the post, and why the value is reset here.
    // `value`, not the file list: jsdom keeps the list a change event assigned to it,
    // while every real browser empties the input — which is the thing that lets the
    // member pick the same file a second time after removing it.
    expect(input.value).toBe('');
    expect(onFiles).toHaveBeenCalledTimes(1);
  });

  it('opens the library with what the surface said, and hands back what was picked', async () => {
    renderPicker({ purpose: 'cover', max: 1, attached: ['https://i.ibb.co/now/now.webp'] });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'media.gallery.open' }));
    });

    await waitFor(() => expect(screen.getByTestId('dialog-purpose')).toBeDefined());
    expect(screen.getByTestId('dialog-max').textContent).toBe('1');
    expect(screen.getByTestId('dialog-attached').textContent).toBe('https://i.ibb.co/now/now.webp');

    fireEvent.click(screen.getByRole('button', { name: 'choose one' }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]?.[0]?.mediaId).toBe('asset-9');
  });

  it('gives the dialog a way to upload only when the surface can take files', () => {
    renderPicker();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'media.gallery.open' }));
    });
    expect(screen.getByTestId('dialog-device').textContent).toBe('yes');

    // A cover field has its own file input already; the dialog must not offer a
    // second one that would upload past the surface's own validation.
    renderPicker({ showUpload: false });
    act(() => {
      fireEvent.click(screen.getAllByRole('button', { name: 'media.gallery.open' })[1]!);
    });
    expect(screen.getAllByTestId('dialog-device')[1]?.textContent).toBe('no');
  });

  it('shows only the library when the surface owns its upload button', () => {
    renderPicker({ showUpload: false });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByLabelText('media.gallery.uploadDevice')).not.toBeInTheDocument();
  });

  it('nudges the surface after an upload, so the new picture is in the list', () => {
    renderPicker({ onUploaded });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'media.gallery.open' }));
    });
    const input = screen.getByLabelText('media.gallery.uploadDevice');
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(4)], 'b.png')] } });

    expect(onFiles).toHaveBeenCalledTimes(1);
    // The nudge belongs to the dialog's own upload path, not to this input: the
    // surface has not finished uploading when `onFiles` returns.
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('refuses to open anything while the surface is busy', () => {
    renderPicker({ disabled: true });
    const button = screen.getByRole('button', { name: 'media.gallery.open' });
    expect(button).toBeDisabled();
    act(() => {
      fireEvent.click(button);
    });
    expect(screen.queryByRole('dialog', { name: 'stub' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /media\.upload/ })).toBeDisabled();
  });
});
