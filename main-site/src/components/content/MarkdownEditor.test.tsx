import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownEditor } from './MarkdownEditor';
import type { GalleryPickerDialogProps } from '@/components/media/GalleryPickerDialog';

const dialog = vi.hoisted(() => ({ current: null as GalleryPickerDialogProps | null }));

/**
 * The shelf, as a door a test can open — the same stub the shop panel's test uses,
 * because the contract at this edge is identical: what the surface asks for, and what
 * it does with the answer.
 */
vi.mock('@/components/media/GalleryPickerDialog', () => ({
  GalleryPickerDialog: (props: GalleryPickerDialogProps) => {
    dialog.current = props;
    return (
      <div role="dialog" aria-label="library stub" data-attached={(props.attached ?? []).join('|')}>
        <button
          type="button"
          onClick={() =>
            props.onPick([
              {
                mediaId: 'asset-desk',
                url: 'https://i.ibb.co/picked/desk.png',
                thumbUrl: 'https://i.ibb.co/picked/desk-medium.png',
                width: 1200,
                height: 630,
                altText: 'A desk under a window',
                purpose: props.purpose,
              },
            ])
          }
        >
          pick it
        </button>
      </div>
    );
  },
}));

const LIBRARY_DOOR = 'From your gallery';

describe('the post editor', () => {
  it('offers the library only where the host named a shelf', () => {
    render(<MarkdownEditor label="Body" value="" onChange={() => undefined} />);
    // A field the page has not said what to file is a field with no shelf to open:
    // `purpose` is not something this component may invent on the member's behalf.
    expect(screen.queryByRole('button', { name: LIBRARY_DOOR })).not.toBeInTheDocument();
  });

  it('writes a picked picture into the text and uploads nothing', async () => {
    const uploadImage = vi.fn<(file: File) => Promise<string>>();
    const onChange = vi.fn<(value: string) => void>();
    render(
      <MarkdownEditor
        label="Body"
        value={'A paragraph.\n'}
        onChange={onChange}
        uploadImage={uploadImage}
        galleryPurpose="post-image"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: LIBRARY_DOOR }));
    await screen.findByRole('dialog', { name: 'library stub' });
    // The post's shelf, and only the post's shelf — the same list a comment box opens
    // would show pictures the member filed somewhere else.
    expect(dialog.current?.purpose).toBe('post-image');
    expect(dialog.current?.onDevice).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'pick it' }));

    const written = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    // The stored address, and the caption the member wrote when it was first posted:
    // the reference is markdown the editor could have typed, and the alt text is not
    // the file's name.
    expect(written).toBe(
      '![A desk under a window](https://i.ibb.co/picked/desk.png)\nA paragraph.\n',
    );
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it('marks the pictures the body already carries as taken', async () => {
    const onChange = vi.fn<(value: string) => void>();
    render(
      <MarkdownEditor
        label="Body"
        value={'![A desk](https://i.ibb.co/picked/desk.png)\n'}
        onChange={onChange}
        galleryPurpose="post-image"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: LIBRARY_DOOR }));
    const opened = await screen.findByRole('dialog', { name: 'library stub' });
    expect(opened).toHaveAttribute('data-attached', 'https://i.ibb.co/picked/desk.png');

    // A second pick of the same picture is refused rather than written again, and the
    // editor says so in the queue's own words instead of doing nothing.
    fireEvent.click(screen.getByRole('button', { name: 'pick it' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Already added')).toBeInTheDocument();
  });
});
