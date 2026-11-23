import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageComposer } from '@/components/messaging/MessageComposer';
import type { Message } from '@/lib/messaging/message-types';
import { changeLanguage } from '@/i18n';
import type { GalleryPickerDialogProps } from '@/components/media/GalleryPickerDialog';
import type { PickedMedia } from '@/lib/media/gallery';
import type * as UploadModule from '@/lib/storage/upload';

/**
 * The gallery door inside a conversation.
 *
 * A chat picture is the one attachment on the site whose row the sender cannot write
 * afterwards: `send_message_once` inserts the message and its media reference in one
 * transaction, and the retry hash covers the arguments. So what this suite is really
 * about is what leaves the composer — an id for the database to resolve, and an address
 * only for the bubble that is painted before the answer comes.
 */

const uploadMedia = vi.fn<(file: File, options: unknown) => Promise<unknown>>();
vi.mock('@/lib/storage/upload', async (importOriginal) => {
  const actual = await importOriginal<typeof UploadModule>();
  return {
    ...actual,
    uploadMedia: (...args: Parameters<typeof uploadMedia>) => uploadMedia(...args),
  };
});

/** The picker, seen from the outside: what the composer hands it, and what it says back. */
const dialogProps: { current: GalleryPickerDialogProps | null } = { current: null };

vi.mock('@/components/media/GalleryPickerDialog', () => ({
  GalleryPickerDialog: (props: GalleryPickerDialogProps) => {
    dialogProps.current = props;
    return (
      <div role="dialog" aria-label="library stub">
        <button type="button" onClick={() => props.onPick([PICKED])}>
          pick it
        </button>
        <button
          type="button"
          onClick={() =>
            props.onDevice?.([new File([new Uint8Array(8)], 'shot.png', { type: 'image/png' })])
          }
        >
          upload one
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
  altText: 'The nine picture',
  purpose: 'chat-image',
};

/** A message with the two fields a composer reads from one, and nothing else. */
const EDITED = { id: 'm-1', body: 'the sent words' } as unknown as Message;

const onSendAttachment = vi.fn<(input: Record<string, unknown>) => Promise<void>>();

function Harness({
  disabled = false,
  editing = null,
}: {
  disabled?: boolean;
  editing?: Message | null;
}) {
  const [draft, setDraft] = useState('');
  return (
    <MessageComposer
      draft={draft}
      onDraftChange={setDraft}
      onSend={() => Promise.resolve()}
      onSendAttachment={(input) => onSendAttachment(input as unknown as Record<string, unknown>)}
      onTyping={vi.fn()}
      replyTo={null}
      onCancelReply={vi.fn()}
      editing={editing}
      onCancelEdit={vi.fn()}
      onSaveEdit={() => Promise.resolve()}
      memberName={() => 'Member'}
      disabled={disabled}
    />
  );
}

const GALLERY_TRIGGER = 'Send a picture from your gallery';

/**
 * Opens the library and waits for it.
 *
 * The dialog is a chunk of its own, imported the first time a member asks for it —
 * which is the point of the split, and why a test that clicks and asserts in the same
 * breath would be racing a dynamic import.
 */
async function openLibrary(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: GALLERY_TRIGGER }));
  await screen.findByRole('dialog', { name: 'library stub' });
}

beforeEach(async () => {
  await changeLanguage('en');
  vi.clearAllMocks();
  dialogProps.current = null;
  onSendAttachment.mockResolvedValue(undefined);
});

describe('a conversation’s own pictures', () => {
  it('offers the library beside the picture button, on both sides of the thread', () => {
    render(<Harness />);
    // Real English from the bundle, not a key: this is the one sentence on the whole
    // surface that tells a member their old uploads are reachable from here.
    expect(screen.getByRole('button', { name: GALLERY_TRIGGER })).toBeInTheDocument();
    expect(screen.getByLabelText('Write a message')).toBeInTheDocument();
  });

  it('reads the library only once the member asks for it', async () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog', { name: 'library stub' })).not.toBeInTheDocument();

    await openLibrary();
    expect(screen.getByRole('dialog', { name: 'library stub' })).toBeInTheDocument();
  });

  it('asks for chat pictures, one at a time', async () => {
    render(<Harness />);
    await openLibrary();

    // `chat-image` is the filter the library reads and the filing a new upload gets;
    // `max` is one because a message carries one picture, and a picker that offered
    // more would be offering to lose the extras.
    expect(dialogProps.current).toMatchObject({ purpose: 'chat-image', max: 1 });
  });

  it('sends a reused picture by its id, with nothing uploaded and no row written', async () => {
    render(<Harness />);
    await openLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'pick it' }));

    await waitFor(() => expect(onSendAttachment).toHaveBeenCalledTimes(1));
    expect(onSendAttachment.mock.calls[0]?.[0]).toMatchObject({
      kind: 'image',
      mediaUrl: 'https://i.ibb.co/nine/nine.webp',
      mediaAsset: 'asset-9',
    });
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it('keeps the words that were typed with the picture', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Write a message'), {
      target: { value: 'This is the one' },
    });
    await openLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'pick it' }));

    await waitFor(() => expect(onSendAttachment).toHaveBeenCalledTimes(1));
    expect(onSendAttachment.mock.calls[0]?.[0]?.body).toBe('This is the one');
  });

  it('shuts the library the moment a picture is chosen', async () => {
    render(<Harness />);
    await openLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'pick it' }));

    expect(screen.queryByRole('dialog', { name: 'library stub' })).not.toBeInTheDocument();
  });

  it('uploads a new picture through its own door, filed as a chat picture', async () => {
    uploadMedia.mockResolvedValue({
      url: 'https://i.ibb.co/new/new.webp',
      thumbUrl: '',
      provider: 'imgbb',
      kind: 'image',
      bytes: 8,
      mimeType: 'image/png',
      expiresAt: null,
      width: null,
      height: null,
      deleteToken: '',
    });
    render(<Harness />);
    await openLibrary();
    await waitFor(() => expect(dialogProps.current?.onDevice).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'upload one' }));

    await waitFor(() => expect(uploadMedia).toHaveBeenCalledTimes(1));
    expect(uploadMedia.mock.calls[0]?.[1]).toMatchObject({ purpose: 'chat-image' });
    // The upload path carries an address and no id: it is the pick that resolves one.
    await waitFor(() => expect(onSendAttachment).toHaveBeenCalledTimes(1));
    expect(onSendAttachment.mock.calls[0]?.[0]?.mediaAsset).toBeUndefined();
  });

  it('offers no picture of any kind to a message that is being edited', () => {
    // An edit changes the words of a message that is already sent. A picture cannot
    // join it — there is no column on the edit path for one — so both doors are shut
    // here, and the member finds out before they open a library.
    render(<Harness editing={EDITED} />);

    expect(screen.getByRole('button', { name: GALLERY_TRIGGER })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Attach an image' })).toBeDisabled();
    expect(screen.queryByRole('dialog', { name: 'library stub' })).not.toBeInTheDocument();
  });

  it('offers nothing while the account is not allowed to send', () => {
    render(<Harness disabled />);
    expect(screen.getByRole('button', { name: GALLERY_TRIGGER })).toBeDisabled();
  });
});
