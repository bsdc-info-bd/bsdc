import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentForm } from '@/components/interactions/CommentForm';
import { CommentThread } from '@/components/interactions/CommentThread';
import type { CommentImage, CommentNode } from '@/lib/interactions/interaction-types';
import type { GalleryPickerDialogProps } from '@/components/media/GalleryPickerDialog';
import type { PickedMedia } from '@/lib/media/gallery';

/**
 * A comment can carry a picture (0120). The two halves that can silently break
 * are the upload and the render.
 *
 * The upload half is a purpose, not a URL: `comment-image` is what tells the edge
 * how hard to compress and what lifetime to promise the host, and a form that
 * posted to `post-image` would work perfectly while storing the wrong promise.
 * It is also the one place a comment can be empty — so the submit rule has to
 * allow "picture, no words" and still refuse "no words, no picture".
 *
 * The render half is the description. A thread is read on a phone, out loud, and
 * with a screen reader; an image element with no alternative text is a picture
 * half the readers cannot use, so a comment with a picture and no description
 * still has to produce a name.
 */

const toastError = vi.fn<(key: string) => void>();
vi.mock('sonner', () => ({
  toast: { error: (key: string) => toastError(key), success: vi.fn() },
}));

const uploadMedia = vi.fn<(file: File, options: unknown) => Promise<unknown>>();
vi.mock('@/lib/storage/upload', () => ({
  uploadMedia: (file: File, options: unknown) => uploadMedia(file, options),
  MediaError: class MediaError extends Error {
    readonly messageKey: string;
    constructor(messageKey: string) {
      super(messageKey);
      this.messageKey = messageKey;
    }
  },
}));

/**
 * The half that used to be missing.
 *
 * `prepare_comment` (0120) accepts a picture only when `media_assets` records it
 * against the author. The comment box uploaded without recording, so every
 * comment with a picture was refused with `42501` and the member read "your role
 * does not allow this action". These tests fail if the record call is dropped.
 */
const recordMediaAsset = vi.fn<(uid: string, result: unknown) => Promise<unknown>>();
vi.mock('@/lib/data/media-repository', () => ({
  recordMediaAsset: (uid: string, result: unknown) => recordMediaAsset(uid, result),
}));

const dialogProps: { current: GalleryPickerDialogProps | null } = { current: null };

/**
 * The library the comment box opens, seen from outside it.
 *
 * A comment takes one picture, so the whole of what a pick has to get right fits in
 * two props: what the dialog is asked to show, and what comes back out of it.
 */
vi.mock('@/components/media/GalleryPickerDialog', () => ({
  GalleryPickerDialog: (props: GalleryPickerDialogProps) => {
    dialogProps.current = props;
    return (
      <div role="dialog" aria-label="library stub">
        <button type="button" onClick={() => props.onPick([PICKED])}>
          pick it
        </button>
      </div>
    );
  },
}));

const PICKED: PickedMedia = {
  mediaId: 'asset-old',
  url: 'https://i.ibb.co/old/crack.webp',
  thumbUrl: 'https://i.ibb.co/old/crack-medium.webp',
  width: 900,
  height: 1200,
  altText: 'The crack runs down the left side of the screen',
  purpose: 'comment-image',
};

const threadState = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/hooks/use-comments', () => ({
  useComments: () => threadState.current,
}));

vi.mock('@/store/auth-store', () => {
  const state = { user: { uid: 'viewer' }, isSignedIn: true };
  const useAuthStore = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => state },
  );
  return { useAuthStore, selectIsSignedIn: (value: typeof state) => value.isSignedIn };
});

const IMAGE: CommentImage = {
  url: 'https://i.ibb.co/ada111/crack.jpg',
  thumbUrl: 'https://i.ibb.co/ada111/crack-medium.jpg',
  alt: 'The crack runs down the left side of the screen',
  width: 1200,
  height: 900,
};

const result = (overrides: Record<string, unknown> = {}) => ({
  provider: 'imgbb',
  kind: 'image',
  url: IMAGE.url,
  thumbUrl: IMAGE.thumbUrl,
  deleteToken: '',
  width: 1200,
  height: 900,
  bytes: 48000,
  mimeType: 'image/webp',
  expiresAt: null,
  ...overrides,
});

beforeEach(() => {
  uploadMedia.mockReset();
  recordMediaAsset.mockReset();
  recordMediaAsset.mockResolvedValue({ id: 'asset-1', url: IMAGE.url });
  toastError.mockReset();
});

describe('attaching a picture to a comment', () => {
  it('uploads with the comment purpose and submits the picture with no words', async () => {
    const user = userEvent.setup();
    uploadMedia.mockResolvedValue(result());
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    const { container } = render(
      <CommentForm
        allowImage
        placeholder="Add to the discussion"
        submitLabel="Post comment"
        onSubmit={onSubmit}
      />,
    );

    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, {
      target: { files: [new File(['x'], 'crack.png', { type: 'image/png' })] },
    });

    await waitFor(() => {
      expect(uploadMedia).toHaveBeenCalledTimes(1);
    });
    expect(uploadMedia.mock.calls[0]?.[1]).toMatchObject({ purpose: 'comment-image' });

    // The row that makes the picture the member's own is written before the
    // form offers to attach it.
    expect(recordMediaAsset).toHaveBeenCalledWith('viewer', result());

    // The description box only exists once there is a picture to describe.
    const description = await screen.findByLabelText('What is in the picture?');
    await user.type(description, 'The crack runs down the left side of the screen');

    // No words at all. This is the whole point of the migration.
    await user.click(screen.getByRole('button', { name: 'Post comment' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith('', {
      url: IMAGE.url,
      thumbUrl: IMAGE.thumbUrl,
      alt: 'The crack runs down the left side of the screen',
      width: 1200,
      height: 900,
    });
  });

  it('refuses the picture when its record cannot be written', async () => {
    // A picture at ImgBB that no row points at is one the database will not let
    // a comment reference, so the member is told now rather than after writing.
    recordMediaAsset.mockResolvedValue(null);
    uploadMedia.mockResolvedValue(result());

    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <CommentForm
        allowImage
        placeholder="Add to the discussion"
        submitLabel="Post comment"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['x'], 'crack.png', { type: 'image/png' })] },
    });

    // The toast is translated by the time it is shown, so the assertion is that
    // one failure was reported — the behaviour under test is that no picture was
    // attached, which the next three lines hold.
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledTimes(1);
    });
    // No picture was attached, so the form has nothing to submit.
    expect(screen.queryByLabelText('What is in the picture?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post comment' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('will not submit with neither words nor a picture', () => {
    render(
      <CommentForm
        allowImage
        placeholder="Add to the discussion"
        submitLabel="Post comment"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Post comment' })).toBeDisabled();
  });

  it('attaches a picture from the library without uploading or recording it', async () => {
    // Typed, so what the form hands back is checked as the shape the repository takes
    // rather than read off an `any`.
    const onSubmit = vi.fn<(body: string, image: CommentImage | null) => Promise<void>>();
    onSubmit.mockResolvedValue(undefined);
    render(
      <CommentForm
        allowImage
        placeholder="Add to the discussion"
        submitLabel="Post comment"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'From your gallery' }));
    await screen.findByRole('dialog', { name: 'library stub' });
    // One picture per comment, and the filing a fresh upload here would have used —
    // which is what puts this picture back in the "comments" shelf afterwards.
    expect(dialogProps.current).toMatchObject({ purpose: 'comment-image', max: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'pick it' }));

    // The description the member wrote for this picture once comes with it: a box that
    // asked again is a box that gets left empty.
    const description = await screen.findByLabelText('What is in the picture?');
    expect((description as HTMLTextAreaElement).value).toBe(PICKED.altText);
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(recordMediaAsset).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Post comment' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith('', {
      url: PICKED.url,
      thumbUrl: PICKED.thumbUrl,
      alt: PICKED.altText,
      width: 900,
      height: 1200,
    });
  });

  it('keeps a description the member changes after a pick', async () => {
    const onSubmit = vi.fn<(body: string, image: CommentImage | null) => Promise<void>>();
    onSubmit.mockResolvedValue(undefined);
    render(
      <CommentForm
        allowImage
        placeholder="Add to the discussion"
        submitLabel="Post comment"
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'From your gallery' }));
    await screen.findByRole('dialog', { name: 'library stub' });
    fireEvent.click(screen.getByRole('button', { name: 'pick it' }));

    const description = await screen.findByLabelText('What is in the picture?');
    fireEvent.change(description, { target: { value: 'Now with a second crack' } });
    await userEvent.click(screen.getByRole('button', { name: 'Post comment' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // Carried across, then overwritten by what the member says here: the old words are
    // a starting point and not a lock on what this comment means.
    expect(onSubmit.mock.calls[0]?.[1]?.alt).toBe('Now with a second crack');
  });

  it('does not offer a picture where editing words only', () => {
    render(
      <CommentForm
        placeholder="Edit your comment"
        submitLabel="Save"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Add a picture' })).toBeNull();
  });

  it('says what went wrong when the upload is refused', async () => {
    const user = userEvent.setup();
    uploadMedia.mockRejectedValue(
      Object.assign(new Error('nope'), { messageKey: 'media.errors.tooLarge' }),
    );

    const { container } = render(
      <CommentForm
        allowImage
        placeholder="Add to the discussion"
        submitLabel="Post comment"
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['x'], 'huge.png', { type: 'image/png' })] },
    });

    // The toast is the visible half; the invisible half that matters is that the
    // picture is not attached and the form stays usable.
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('That file is larger than the limit for its type.');
    });
    expect(screen.queryByLabelText('What is in the picture?')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Post comment' }));
    expect(screen.getByRole('button', { name: 'Post comment' })).toBeDisabled();
  });
});

describe('a comment that carries a picture', () => {
  function node(overrides: Partial<CommentNode> = {}): CommentNode {
    return {
      id: 'c-1',
      postId: 'post-1',
      parentId: null,
      rootId: null,
      depth: 0,
      body: '',
      image: IMAGE,
      likes: 0,
      replies: 0,
      isAnswer: false,
      createdAt: new Date().toISOString(),
      editedAt: null,
      author: {
        uid: 'ada',
        username: 'ada',
        displayName: 'Ada First',
        avatarUrl: '',
      },
      liked: false,
      children: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    threadState.current = {
      tree: [node()],
      total: 1,
      isLoading: false,
      isError: false,
      add: vi.fn(),
      edit: vi.fn(),
      remove: vi.fn(),
      like: vi.fn(),
      accept: vi.fn(),
      isPosting: false,
    };
  });

  it('renders the picture with the description the member wrote', () => {
    render(
      <MemoryRouter>
        <CommentThread postId="post-1" postAuthorUid="ada" isQuestion={false} allowComments />
      </MemoryRouter>,
    );
    const img = screen.getByRole('img', { name: IMAGE.alt });
    // The variant is offered as `srcset`; the browser picks the 640 px copy for a
    // comment-sized slot and the full one on a large screen. Both must be there.
    expect(img.getAttribute('srcset')).toContain(IMAGE.thumbUrl);
    expect(img.getAttribute('srcset')).toContain(IMAGE.url);
    // Intrinsic size, so the thread reserves the box before the bytes arrive.
    expect(img).toHaveAttribute('width', '1200');
    expect(img).toHaveAttribute('height', '900');
  });

  it('still gives the picture a name when the member did not describe it', () => {
    threadState.current = {
      ...(threadState.current as Record<string, unknown>),
      tree: [node({ image: { ...IMAGE, alt: '' } })],
    };
    render(
      <MemoryRouter>
        <CommentThread postId="post-1" postAuthorUid="ada" isQuestion={false} allowComments />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('img', { name: 'A picture attached to this comment' }),
    ).toBeInTheDocument();
  });

  it('offers the picture at full size', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CommentThread postId="post-1" postAuthorUid="ada" isQuestion={false} allowComments />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Open the picture/ }));
    // The lightbox renders its own copy of the picture, in a dialog.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
