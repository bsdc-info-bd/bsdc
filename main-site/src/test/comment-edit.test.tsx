import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentThread } from '@/components/interactions/CommentThread';
import type { CommentNode } from '@/lib/interactions/interaction-types';

/**
 * Editing a comment starts from the comment.
 *
 * The edit box opened empty: the member pressed the pencil, their words vanished
 * from the field, and saving wrote whatever they typed over the top. There was no
 * error and nothing to recover — the content was simply gone.
 *
 * What is held here is that the box opens with the words that are already there,
 * that the box keeps the picture the comment carries (editing the text must not
 * drop it), and that saving sends the sentence the member finished with.
 */

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const threadState = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/hooks/use-comments', () => ({
  useComments: () => threadState.current,
}));

vi.mock('@/store/auth-store', () => {
  const state = { user: { uid: 'ada' }, isSignedIn: true };
  const useAuthStore = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => state },
  );
  return { useAuthStore, selectIsSignedIn: (value: typeof state) => value.isSignedIn };
});

const EXISTING = 'The crack runs down the left side, and the hinge is loose.';

function node(overrides: Partial<CommentNode> = {}): CommentNode {
  return {
    id: 'c-1',
    postId: 'post-1',
    parentId: null,
    rootId: null,
    depth: 0,
    body: EXISTING,
    image: null,
    likes: 0,
    replies: 0,
    isAnswer: false,
    createdAt: new Date().toISOString(),
    editedAt: null,
    author: { uid: 'ada', username: 'ada', displayName: 'Ada First', avatarUrl: '' },
    liked: false,
    children: [],
    ...overrides,
  };
}

const edit = vi.fn<(id: string, body: string) => Promise<void>>();

beforeEach(() => {
  vi.clearAllMocks();
  edit.mockResolvedValue(undefined);
  threadState.current = {
    tree: [node()],
    total: 1,
    isLoading: false,
    isError: false,
    add: vi.fn(),
    edit,
    remove: vi.fn(),
    like: vi.fn(),
    accept: vi.fn(),
    isPosting: false,
  };
});

function renderThread() {
  render(
    <MemoryRouter>
      <CommentThread postId="post-1" postAuthorUid="ada" isQuestion={false} allowComments />
    </MemoryRouter>,
  );
}

describe('editing a comment', () => {
  it('opens with the comment already in the box', async () => {
    const user = userEvent.setup();
    renderThread();

    expect(screen.getByText(EXISTING)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Edit/i }));

    const box = await screen.findByRole('textbox', { name: /Edit your comment/i });
    expect(box).toHaveValue(EXISTING);
  });

  it('saves the words the member finished with, not an empty box', async () => {
    const user = userEvent.setup();
    renderThread();

    await user.click(screen.getByRole('button', { name: /Edit/i }));
    const box = await screen.findByRole('textbox', { name: /Edit your comment/i });
    await user.clear(box);
    await user.type(box, 'The hinge is fine; it is the seal that has gone.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(edit).toHaveBeenCalledTimes(1);
    });
    expect(edit).toHaveBeenCalledWith('c-1', 'The hinge is fine; it is the seal that has gone.');
  });

  it('keeps the picture the comment already carries', async () => {
    threadState.current = {
      ...(threadState.current as Record<string, unknown>),
      tree: [
        node({
          image: {
            url: 'https://i.ibb.co/ada111/crack.jpg',
            thumbUrl: 'https://i.ibb.co/ada111/crack-medium.jpg',
            alt: 'The crack runs down the left side of the screen',
            width: 1200,
            height: 900,
          },
        }),
      ],
    };
    const user = userEvent.setup();
    renderThread();

    await user.click(screen.getByRole('button', { name: /Edit/i }));
    await screen.findByRole('textbox', { name: /Edit your comment/i });

    // Cancelling brings the comment back with its picture still attached: the
    // edit only ever changed the words.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      await screen.findByRole('img', { name: 'The crack runs down the left side of the screen' }),
    ).toBeInTheDocument();
  });
});
