import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentForm } from '@/components/interactions/CommentForm';
import { CommentThread } from '@/components/interactions/CommentThread';
import type { CommentImage, CommentNode } from '@/lib/interactions/interaction-types';

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
}));

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
