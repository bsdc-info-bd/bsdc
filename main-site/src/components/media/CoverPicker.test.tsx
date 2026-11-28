import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CoverPicker, type CoverPickerLabels } from './CoverPicker';
import type { GalleryPickerDialogProps } from './GalleryPickerDialog';
import type { PickedMedia } from '@/lib/media/gallery';
import type * as I18nModule from 'react-i18next';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

/**
 * The library dialog, seen from the field that opens it.
 *
 * The cover control owns the picker's two settings that matter to a member — what a
 * reused picture is filed as, and which address the field already holds — and both are
 * invisible from the outside except through what the dialog is given.
 */
const dialogProps: { current: GalleryPickerDialogProps | null } = { current: null };

vi.mock('./GalleryPickerDialog', () => ({
  GalleryPickerDialog: (props: GalleryPickerDialogProps) => {
    dialogProps.current = props;
    return (
      <div role="dialog" aria-label="library stub">
        <button
          type="button"
          onClick={() =>
            props.onPick([
              {
                mediaId: 'asset-old',
                url: 'https://i.ibb.co/old/old.webp',
                thumbUrl: 'https://i.ibb.co/old/old-thumb.webp',
                width: 1200,
                height: 800,
                altText: 'The old cover',
                purpose: 'cover',
              } satisfies PickedMedia,
            ])
          }
        >
          pick it
        </button>
      </div>
    );
  },
}));

const labels: CoverPickerLabels = {
  title: 'Cover image',
  hint: 'JPEG, PNG, WebP, GIF or AVIF, up to 10 MB.',
  choose: 'Choose a cover image',
  replace: 'Choose a different image',
  remove: 'Remove image',
  existing: 'Current cover',
  uploading: 'Uploading cover image',
  previewAlt: 'Preview of the cover image',
};

function picture(name = 'meghna.png'): File {
  return new File([new Uint8Array(2048)], name, { type: 'image/png' });
}

function open(props: Partial<Parameters<typeof CoverPicker>[0]> = {}) {
  return render(
    <CoverPicker
      file={null}
      previewUrl=""
      progress={null}
      onFileChange={() => undefined}
      labels={labels}
      {...props}
    />,
  );
}

describe('the cover control a project and an event share', () => {
  it('offers a picture to choose and nowhere to paste an address', () => {
    open();

    // The point of the change: an event's cover used to be a URL field, which on
    // a phone means hosting the picture somewhere else first and trusting
    // whatever address comes back. There is no such field here.
    expect(screen.getByLabelText(labels.choose)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    // The button's accessible name is its call to action and the sentence under
    // it, so it is matched rather than named exactly.
    expect(screen.getByRole('button', { name: /Choose a cover image/ })).toBeInTheDocument();
  });

  it('locks file selection while the owning form is committing', () => {
    open({ disabled: true });
    expect(screen.getByLabelText(labels.choose)).toBeDisabled();
    expect(screen.getByRole('button', { name: /Choose a cover image/ })).toBeDisabled();
  });

  it('accepts only the image types the contract routes, and says so', () => {
    open();
    const input = screen.getByLabelText(labels.choose);
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,image/gif,image/avif');
    // Said twice before a picture is chosen: once as the field's own hint and
    // once inside the button, because a member who taps the button should not
    // have to look back up to learn what it accepts.
    expect(screen.getAllByText(labels.hint)).toHaveLength(2);
  });

  it('hands the chosen file to whoever owns the state', async () => {
    const onFileChange = vi.fn();
    open({ onFileChange });

    await userEvent.upload(screen.getByLabelText(labels.choose), picture());

    expect(onFileChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'meghna.png' }));
  });

  it('shows the chosen picture, its name, and one tap to remove it', async () => {
    const onFileChange = vi.fn();
    open({ file: picture(), previewUrl: 'blob:mock/1', onFileChange });

    expect(screen.getByAltText(labels.previewAlt)).toBeInTheDocument();
    expect(screen.getByText('meghna.png')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: labels.remove }));
    expect(onFileChange).toHaveBeenCalledWith(null);
  });

  it('offers a different picture without making the member find the field again', async () => {
    const onFileChange = vi.fn();
    open({ file: picture(), previewUrl: 'blob:mock/1', onFileChange });

    await userEvent.click(screen.getByRole('button', { name: labels.replace }));

    // Clicking it opens the same hidden input; the assertion that matters is
    // that the control survived showing a preview and still offers a way in.
    expect(screen.getByLabelText(labels.choose)).toBeInTheDocument();
  });

  it('offers a way to change a cover that is already published', () => {
    // The bug this exists for: an author correcting a project saw their own
    // cover on screen and had no button that did anything, because the ones
    // rendered asked for a file that had not been chosen yet.
    open({
      previewUrl: 'https://i.ibb.co/cover/published.webp',
      onRemoveExisting: () => undefined,
    });

    expect(screen.getByText(labels.existing)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.replace })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.remove })).toBeInTheDocument();
  });

  it('drops a published cover, and a chosen file instead of it while one is chosen', async () => {
    const onFileChange = vi.fn();
    const onRemoveExisting = vi.fn();
    const { rerender } = open({
      previewUrl: 'https://i.ibb.co/cover/published.webp',
      onRemoveExisting,
      onFileChange,
    });

    await userEvent.click(screen.getByRole('button', { name: labels.remove }));
    expect(onRemoveExisting).toHaveBeenCalledTimes(1);
    expect(onFileChange).not.toHaveBeenCalled();

    rerender(
      <CoverPicker
        file={picture('replacement.png')}
        previewUrl="blob:mock/1"
        progress={null}
        onFileChange={onFileChange}
        onRemoveExisting={onRemoveExisting}
        labels={labels}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: labels.remove }));
    // Removing the replacement must put the published cover back, not delete it.
    expect(onFileChange).toHaveBeenCalledWith(null);
    expect(onRemoveExisting).toHaveBeenCalledTimes(1);
  });

  it('does not invent a way to remove a cover where nothing is published', () => {
    open({ previewUrl: 'blob:mock/1' });
    expect(screen.queryByRole('button', { name: labels.remove })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.replace })).toBeInTheDocument();
  });

  it('says how far the upload has got while it is going, and nothing else', () => {
    const { rerender } = open({ file: picture(), previewUrl: 'blob:mock/1', progress: 37 });
    expect(screen.getByRole('progressbar', { name: labels.uploading })).toHaveAttribute(
      'aria-valuenow',
      '37',
    );

    rerender(
      <CoverPicker
        file={picture()}
        previewUrl="blob:mock/1"
        progress={null}
        onFileChange={() => undefined}
        labels={labels}
      />,
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('is the step heading when it is a step, and a field label when it is not', () => {
    const { rerender } = open({ asHeading: true, headingId: 'project-step-cover' });
    expect(screen.getByRole('heading', { level: 2, name: labels.title })).toBeInTheDocument();

    rerender(
      <CoverPicker
        file={null}
        previewUrl=""
        progress={null}
        onFileChange={() => undefined}
        labels={labels}
      />,
    );
    // A field inside a form of eleven other fields must not announce itself as a
    // heading, or a member swiping through a phone's heading list lands in the
    // middle of the form.
    expect(screen.queryByRole('heading', { name: labels.title })).not.toBeInTheDocument();
    expect(screen.getByText(labels.title)).toBeInTheDocument();
  });
});

describe('the other door on a cover field', () => {
  it('offers the library only to a surface that can hold what it returns', () => {
    open();
    // No `onPickFromLibrary`, no button: a cover field that was never given a way to
    // store a pick must not offer one, and must not lose a picture on the floor.
    expect(screen.queryByRole('button', { name: 'media.gallery.open' })).not.toBeInTheDocument();

    open({ onPickFromLibrary: () => undefined });
    expect(screen.getByRole('button', { name: 'media.gallery.open' })).toBeInTheDocument();
  });

  it('files a reused cover where a new one would have been filed', async () => {
    // A project's cover and an event's cover are different shelves of the same
    // library, and the field is the only thing that knows which one it is. The dialog
    // gets the purpose the surface would have uploaded under — so "covers" in the
    // library finds both, and neither is filed as somebody else's picture.
    open({ onPickFromLibrary: () => undefined, libraryPurpose: 'project-cover' });
    fireEvent.click(screen.getByRole('button', { name: 'media.gallery.open' }));
    await waitFor(() => expect(dialogProps.current).not.toBeNull());

    expect(dialogProps.current).toMatchObject({
      purpose: 'project-cover',
      max: 1,
      onDevice: undefined,
    });
  });

  it('hands the picked picture to the field, whole', async () => {
    const onPickFromLibrary = vi.fn<(picked: PickedMedia) => void>();
    open({ onPickFromLibrary });
    fireEvent.click(screen.getByRole('button', { name: 'media.gallery.open' }));
    await waitFor(() => expect(dialogProps.current).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'pick it' }));
    expect(onPickFromLibrary).toHaveBeenCalledTimes(1);
    expect(onPickFromLibrary.mock.calls[0]?.[0]).toMatchObject({
      mediaId: 'asset-old',
      url: 'https://i.ibb.co/old/old.webp',
      altText: 'The old cover',
    });
  });

  it('tells the library which cover is already hanging there', async () => {
    open({
      previewUrl: 'https://i.ibb.co/now/now.webp',
      onPickFromLibrary: () => undefined,
    });
    fireEvent.click(screen.getByRole('button', { name: 'media.gallery.open' }));
    await waitFor(() => expect(dialogProps.current).not.toBeNull());

    // Marked, not hidden: a member who came here to replace a cover still needs to
    // see which of their pictures is the one being replaced.
    expect(dialogProps.current?.attached).toEqual(['https://i.ibb.co/now/now.webp']);
  });
});
