import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaTray } from './MediaTray';
import {
  useAttachments,
  type Attachment,
  type AttachmentsController,
  type SeededAttachment,
} from './use-attachments';
import { DEFAULT_EDIT, type EditState } from '@/lib/media/edit';
import { MediaError, type UploadOptions, type UploadResult } from '@/lib/storage/upload';
import type * as EditModule from '@/lib/media/edit';
import type * as EnvModule from '@/lib/env';
import type * as I18nModule from 'react-i18next';
import type * as MediaRepositoryModule from '@/lib/data/media-repository';
import type * as UploadModule from '@/lib/storage/upload';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    // Keys come back as keys: the assertion reads the same as the locale file,
    // and no test has to know which language the suite happens to run in.
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'en' },
    }),
  };
});

// Typed rather than `vi.fn()`: an untyped mock returns `any`, and the point of
// the suite is that the queue hands a real UploadResult to a real record call.
const uploadMedia = vi.fn<(file: File, options: UploadOptions) => Promise<UploadResult>>();
vi.mock('@/lib/storage/upload', async (importOriginal) => {
  const actual = await importOriginal<typeof UploadModule>();
  return {
    ...actual,
    uploadMedia: (...args: Parameters<typeof uploadMedia>) => uploadMedia(...args),
  };
});

const recordMediaAsset =
  vi.fn<(ownerUid: string, result: UploadResult) => Promise<{ id: string } | null>>();
vi.mock('@/lib/data/media-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof MediaRepositoryModule>();
  return {
    ...actual,
    recordMediaAsset: (...args: Parameters<typeof recordMediaAsset>) => recordMediaAsset(...args),
  };
});

vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return { ...actual, isConfigured: { ...actual.isConfigured, supabase: true } };
});

// jsdom has no decoder and no object URLs; both are stood in for so the queue
// can be watched doing what it does in a browser.
vi.mock('@/lib/media/edit', async (importOriginal) => {
  const actual = await importOriginal<typeof EditModule>();
  return {
    ...actual,
    decodeImage: vi.fn(() =>
      Promise.resolve({
        source: {} as CanvasImageSource,
        width: 1600,
        height: 900,
        type: 'image/png',
      }),
    ),
  };
});

const objectUrls: string[] = [];
const revokedUrls: string[] = [];
// Assigned onto the class rather than swapped for a plain object: plenty of
// code under test still needs `new URL(...)` to work.
URL.createObjectURL = vi.fn(() => {
  const url = `blob:mock/${objectUrls.length + 1}`;
  objectUrls.push(url);
  return url;
});
URL.revokeObjectURL = vi.fn((url: string) => {
  revokedUrls.push(url);
});

function picture(name = 'sunset.png', type = 'image/png', size = 4096): File {
  return new File([new Uint8Array(size)], name, { type });
}

function result(url: string): UploadResult {
  return {
    url,
    thumbUrl: `${url}?thumb`,
    provider: 'supabase',
    kind: 'image',
    bytes: 4096,
    mimeType: 'image/png',
    width: 1600,
    height: 900,
    deleteToken: '',
  };
}

interface HarnessProps {
  files?: File[];
  seeded?: SeededAttachment[];
  max?: number;
  uid?: string | null;
  onChange?: (ready: Attachment[]) => void;
  onEdit?: (attachment: Attachment) => void;
}

/**
 * The controller the harness is holding, so a test can do what the editor
 * dialog does instead of pretending to be it.
 */
const latest: { current: AttachmentsController | null } = { current: null };

function controller(): AttachmentsController {
  if (latest.current === null) throw new Error('the harness has not rendered');
  return latest.current;
}

function Harness({ files = [], seeded, max = 10, uid = 'me', onChange, onEdit }: HarnessProps) {
  const attachments = useAttachments({
    purpose: 'post-image',
    uid,
    max,
    ...(onChange === undefined ? {} : { onChange }),
  });
  latest.current = attachments;
  // Seeding is what the composer does when a saved post opens: once, on mount.
  useEffect(() => {
    if (seeded !== undefined) attachments.seed(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div>
      <button type="button" onClick={() => attachments.add(files)}>
        add
      </button>
      <MediaTray controller={attachments} onEdit={onEdit ?? (() => undefined)} />
      <output data-testid="status">
        {attachments.attachments.map((item) => item.status).join(',')}
      </output>
      <output data-testid="ready">
        {attachments.ready.map((item) => `${item.mediaId}:${item.altText}`).join('|')}
      </output>
      <output data-testid="notice">{attachments.notice ?? ''}</output>
    </div>
  );
}

function status(): string {
  return screen.getByTestId('status').textContent ?? '';
}
function ready(): string {
  return screen.getByTestId('ready').textContent ?? '';
}

beforeEach(() => {
  latest.current = null;
  uploadMedia.mockReset();
  recordMediaAsset.mockReset();
  objectUrls.length = 0;
  revokedUrls.length = 0;
  recordMediaAsset.mockResolvedValue({ id: 'asset-1' });
});

describe('attaching a picture', () => {
  it('shows the picture before a single byte has been sent', async () => {
    let release: (value: UploadResult) => void = () => undefined;
    uploadMedia.mockImplementation((_file: File, options: { onProgress?: (n: number) => void }) => {
      options.onProgress?.(42);
      return new Promise<UploadResult>((resolve) => {
        release = resolve;
      });
    });

    render(<Harness files={[picture()]} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));

    // The preview is made from the local bytes and the percentage is on screen:
    // between choosing a picture and it arriving, the member can see both.
    await waitFor(() => expect(screen.getByText('42%')).toBeInTheDocument());
    expect(status()).toBe('uploading');
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:mock/1');

    act(() => {
      release(result('https://cdn.example/one.png'));
    });
    await waitFor(() => expect(status()).toBe('attached'));
    expect(ready()).toBe('asset-1:');
  });

  it('records the asset, because an unrecorded upload cannot be attached', async () => {
    uploadMedia.mockResolvedValue(result('https://cdn.example/one.png'));
    render(<Harness files={[picture()]} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    await waitFor(() => expect(status()).toBe('attached'));

    expect(recordMediaAsset).toHaveBeenCalledTimes(1);
    expect(recordMediaAsset.mock.calls[0]?.[0]).toBe('me');
    expect(uploadMedia.mock.calls[0]?.[1]).toMatchObject({ purpose: 'post-image', uid: 'me' });
  });

  it('says so when the upload went through but the record did not', async () => {
    uploadMedia.mockResolvedValue(result('https://cdn.example/one.png'));
    recordMediaAsset.mockResolvedValue(null);
    render(<Harness files={[picture()]} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    await waitFor(() => expect(status()).toBe('failed'));
    expect(screen.getByText('media.errors.recordFailed')).toBeInTheDocument();
  });

  it('uploads one at a time, and every one of them arrives', async () => {
    let inFlight = 0;
    let peak = 0;
    uploadMedia.mockImplementation(async (_file: File) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return result('https://cdn.example/one.png');
    });
    render(<Harness files={[picture('a.png'), picture('b.png'), picture('c.png')]} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    await waitFor(() => expect(status()).toBe('attached,attached,attached'));
    // They share one radio: five parallel uploads are slower than five in turn.
    expect(peak).toBe(1);
    expect(uploadMedia).toHaveBeenCalledTimes(3);
  });

  it('refuses a file it cannot carry, and says why', async () => {
    render(<Harness files={[picture('virus.exe', 'application/x-msdownload')]} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    expect(screen.getByTestId('notice')).toHaveTextContent('media.errors.unsupported');
    expect(status()).toBe('');
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it('stops at the limit and tells the member it stopped', async () => {
    uploadMedia.mockResolvedValue(result('https://cdn.example/one.png'));
    render(<Harness files={[picture('a.png'), picture('b.png')]} max={1} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    await waitFor(() => expect(status()).toBe('attached'));
    expect(screen.getByTestId('notice')).toHaveTextContent('media.errors.tooMany');
    expect(uploadMedia).toHaveBeenCalledTimes(1);
  });

  it('cannot upload for a member who is not signed in', async () => {
    render(<Harness files={[picture()]} uid={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    await waitFor(() => expect(status()).toBe('failed'));
    expect(screen.getByText('media.errors.signInRequired')).toBeInTheDocument();
    expect(uploadMedia).not.toHaveBeenCalled();
  });
});

describe('when an upload fails', () => {
  it('keeps the picture and offers the member the same one back', async () => {
    uploadMedia.mockRejectedValueOnce(new MediaError('media.errors.tooLarge'));
    uploadMedia.mockResolvedValueOnce(result('https://cdn.example/two.png'));
    render(<Harness files={[picture()]} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));

    await waitFor(() => expect(status()).toBe('failed'));
    expect(screen.getByText('media.errors.tooLarge')).toBeInTheDocument();
    // The preview survives the failure. Losing the picture is the worst
    // outcome available, and the one a member cannot recover from on a phone.
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:mock/1');

    await userEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    await waitFor(() => expect(status()).toBe('attached'));
    expect(uploadMedia).toHaveBeenCalledTimes(2);
    expect(ready()).toBe('asset-1:');
  });

  it('names an unexpected failure rather than showing a stack', async () => {
    uploadMedia.mockRejectedValue(new TypeError('network went away'));
    render(<Harness files={[picture()]} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    await waitFor(() => expect(screen.getByText('media.errors.failed')).toBeInTheDocument());
  });
});

describe('the order the member puts them in', () => {
  async function twoAttached() {
    recordMediaAsset
      .mockResolvedValueOnce({ id: 'asset-1' })
      .mockResolvedValueOnce({ id: 'asset-2' });
    uploadMedia.mockResolvedValue(result('https://cdn.example/one.png'));
    const onChange = vi.fn();
    render(<Harness files={[picture('a.png'), picture('b.png')]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    await waitFor(() => expect(status()).toBe('attached,attached'));
    return onChange;
  }

  it('moves a picture later, and the post follows', async () => {
    const onChange = await twoAttached();
    expect(ready()).toBe('asset-1:|asset-2:');

    await userEvent.click(screen.getAllByLabelText('media.tray.moveLater')[0] as HTMLElement);
    await waitFor(() => expect(ready()).toBe('asset-2:|asset-1:'));
    expect(onChange).toHaveBeenCalled();
  });

  it('will not move the first picture earlier or the last one later', async () => {
    await twoAttached();
    expect(screen.getAllByLabelText('media.tray.moveEarlier')[0]).toBeDisabled();
    expect(screen.getAllByLabelText('media.tray.moveLater')[1]).toBeDisabled();
  });
});

describe('what the picture is of', () => {
  it('stores the description with the attachment', async () => {
    uploadMedia.mockResolvedValue(result('https://cdn.example/one.png'));
    render(<Harness files={[picture()]} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    await waitFor(() => expect(status()).toBe('attached'));

    await userEvent.click(screen.getByLabelText('media.tray.describe'));
    await userEvent.type(screen.getByLabelText('media.alt.label'), 'Sunset over the Padma');
    await waitFor(() => expect(ready()).toBe('asset-1:Sunset over the Padma'));
  });
});

describe('removing and editing', () => {
  it('takes a picture out and releases what it was holding', async () => {
    uploadMedia.mockResolvedValue(result('https://cdn.example/one.png'));
    render(<Harness files={[picture()]} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    await waitFor(() => expect(status()).toBe('attached'));

    await userEvent.click(screen.getByLabelText('media.tray.remove'));
    await waitFor(() => expect(status()).toBe(''));
    expect(revokedUrls).toContain('blob:mock/1');
  });

  it('opens the editor with the picture it was asked about', async () => {
    uploadMedia.mockResolvedValue(result('https://cdn.example/one.png'));
    const onEdit = vi.fn();
    render(<Harness files={[picture()]} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    await waitFor(() => expect(status()).toBe('attached'));

    await userEvent.click(screen.getByLabelText('media.tray.edit'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect((onEdit.mock.calls[0]?.[0] as Attachment).url).toBe('https://cdn.example/one.png');
  });

  it('sends the edited bytes instead of the original, and previews them at once', async () => {
    recordMediaAsset
      .mockResolvedValueOnce({ id: 'asset-1' })
      .mockResolvedValueOnce({ id: 'asset-2' });
    uploadMedia.mockResolvedValue(result('https://cdn.example/one.png'));
    render(<Harness files={[picture()]} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    await waitFor(() => expect(status()).toBe('attached'));

    const edited = picture('sunset-edited.jpg', 'image/jpeg', 2048);
    act(() => {
      controller().applyEdit(controller().attachments[0]?.id ?? '', edited, {
        ...DEFAULT_EDIT,
        rotate: 90,
      });
    });

    await waitFor(() => expect(status()).toBe('attached'));
    expect(uploadMedia).toHaveBeenCalledTimes(2);
    expect((uploadMedia.mock.calls[1]?.[0] as File).name).toBe('sunset-edited.jpg');
    expect(ready()).toBe('asset-2:');
    // The tile shows the edited picture before the new upload has finished.
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:mock/2');
  });

  it('changes nothing when the member looked and left it alone', async () => {
    uploadMedia.mockResolvedValue(result('https://cdn.example/one.png'));
    render(<Harness files={[picture()]} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    await waitFor(() => expect(status()).toBe('attached'));

    act(() => {
      controller().applyEdit(controller().attachments[0]?.id ?? '', null, DEFAULT_EDIT);
    });
    expect(status()).toBe('attached');
    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(ready()).toBe('asset-1:');
  });

  it('remembers the edit, so reopening does not start over', async () => {
    uploadMedia.mockResolvedValue(result('https://cdn.example/one.png'));
    const onEdit = vi.fn();
    const edit: EditState = { ...DEFAULT_EDIT, rotate: 90, brightness: 1.2 };
    render(<Harness files={[picture()]} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole('button', { name: 'add' }));
    await waitFor(() => expect(status()).toBe('attached'));

    act(() => {
      controller().applyEdit(controller().attachments[0]?.id ?? '', null, edit);
    });
    await userEvent.click(screen.getByLabelText('media.tray.edit'));
    expect((onEdit.mock.calls.at(-1)?.[0] as Attachment).edit).toEqual(edit);
    expect(uploadMedia).toHaveBeenCalledTimes(1);
  });
});

describe('a post that already has pictures', () => {
  it('shows them as attached and sends nothing again', async () => {
    render(
      <Harness
        seeded={[
          {
            mediaId: 'asset-9',
            url: 'https://cdn.example/nine.png',
            thumbUrl: '',
            altText: 'The old one',
            position: 1,
          },
          {
            mediaId: 'asset-8',
            url: 'https://cdn.example/eight.png',
            thumbUrl: 'https://cdn.example/eight-thumb.png',
            altText: '',
            position: 0,
            width: 1200,
            height: 1600,
          },
        ]}
      />,
    );

    await waitFor(() => expect(status()).toBe('attached,attached'));
    // Position decides the order, not the order they were handed over in.
    expect(ready()).toBe('asset-8:|asset-9:The old one');
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(screen.getByAltText('The old one')).toHaveAttribute(
      'src',
      'https://cdn.example/nine.png',
    );
  });
});
