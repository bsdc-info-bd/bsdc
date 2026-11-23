import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShopProfilePanel } from './ShopPanels';
import { mkCopy } from '@/lib/mk/mk-copy';
import type { MkVendorShop } from '@/lib/mk/mk-types';
import type { GalleryPickerDialogProps } from '@/components/media/GalleryPickerDialog';

const { toast, save, uploadAndRecord } = vi.hoisted(() => ({
  toast: { success: vi.fn<(message: string) => void>(), error: vi.fn<(message: string) => void>() },
  save: vi.fn<(patch: Record<string, unknown>) => Promise<void>>(),
  uploadAndRecord: vi.fn<(file: File, opts: unknown, uid: string) => Promise<unknown>>(),
}));

vi.mock('sonner', () => ({ toast }));

// The panel's write path, as a spy: a saved shop is what proves a picked address is
// the shop's picture and not a preview the seller has to re-pick after saving.
vi.mock('@/hooks/use-mk', () => ({
  useUpdateShopProfile: () => ({ mutateAsync: save, isPending: false }),
  useBuyCredits: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePaymentInstructions: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('@/lib/storage/upload-and-record', () => ({ uploadAndRecord }));

/**
 * The shelf, with a door a test can open.
 *
 * The picker `lazy()`-imports the dialog, so the grid itself is a chunk away; what the
 * panel has to get right is which shelf each door opens, what the shelf is told the
 * shop already carries, and what the panel does with an answer. All three are visible
 * through attributes on a stub.
 */
vi.mock('@/components/media/GalleryPickerDialog', () => ({
  GalleryPickerDialog: (props: GalleryPickerDialogProps) => (
    <div
      role="dialog"
      aria-label={`library ${props.purpose}`}
      data-purpose={props.purpose}
      data-slots={props.max ?? 1}
      data-attached={(props.attached ?? []).join('|')}
      data-device={props.onDevice === undefined ? 'hidden' : 'offered'}
    >
      <button
        type="button"
        onClick={() =>
          props.onPick([
            {
              mediaId: `asset-${props.purpose}`,
              url: `https://i.ibb.co/picked/${props.purpose}.png`,
              thumbUrl: `https://i.ibb.co/picked/${props.purpose}-medium.png`,
              width: 1200,
              height: 630,
              altText: 'The shop front, painted blue',
              purpose: props.purpose,
            },
          ])
        }
      >
        pick {props.purpose}
      </button>
    </div>
  ),
}));

const SHOP: MkVendorShop = {
  slug: 'sylhet-stationers',
  name: 'Sylhet Stationers',
  status: 'active',
  vendor_type: 'stationery',
  logo_url: '',
  cover_url: 'https://i.ibb.co/shop/old-banner.png',
  description: 'Notebooks, ink and exam forms since 2009.',
  mobile: '01712345678',
  place_label: 'Zindabazar',
};

/**
 * Opens one of the panel's two library doors.
 *
 * Which door is which is a question of DOM order — the banner's is above the logo's —
 * and the answer is checked from the dialog it opens, so a test never asserts that a
 * button at index 0 means what its label does not say.
 */
async function openDoor(index: number): Promise<HTMLElement> {
  const doors = screen.getAllByRole('button', { name: 'From your gallery' });
  const door = doors[index];
  if (!door) throw new Error('the shop panel offered no library door');
  fireEvent.click(door);
  return await screen.findByRole('dialog');
}

describe('the shop profile panel', () => {
  it('offers the library twice, once for each picture the shop wears', async () => {
    render(<ShopProfilePanel copy={mkCopy('en')} shop={SHOP} />);
    expect(screen.getAllByRole('button', { name: 'From your gallery' })).toHaveLength(2);

    const coverDoor = await openDoor(0);
    // The banner asks for the banner shelf, and marks the address the shop already
    // shows so the seller is not invited to hang the same cloth twice.
    expect(coverDoor).toHaveAttribute('data-purpose', 'cover');
    expect(coverDoor).toHaveAttribute('data-attached', 'https://i.ibb.co/shop/old-banner.png');
    // One picture per door: a shop has a logo and a banner, not eight of either.
    expect(coverDoor).toHaveAttribute('data-slots', '1');
    // And no upload button inside the dialog, because the banner and the badge already
    // have their own — two doors to the device on one panel is two ways to be confused.
    expect(coverDoor).toHaveAttribute('data-device', 'hidden');
  });

  it('hangs a picked picture on the shop without uploading anything', async () => {
    render(<ShopProfilePanel copy={mkCopy('en')} shop={SHOP} />);

    await openDoor(0);
    fireEvent.click(screen.getByRole('button', { name: 'pick cover' }));

    // The stored address is in the field the seller could have typed, so the pick is
    // the same kind of answer as a URL — and it went there without a byte moving.
    // `textbox` and not any element carrying the label: the overlay chip's own file
    // input is labelled `Cover link (https)` too, because the chip is a `<label>` —
    // the two doors on one picture have to be told apart by what they are.
    expect(screen.getByRole('textbox', { name: 'Cover link (https)' })).toHaveValue(
      'https://i.ibb.co/picked/cover.png',
    );
    expect(screen.getByRole('textbox', { name: 'Logo link (https)' })).toHaveValue('');
    expect(uploadAndRecord).not.toHaveBeenCalled();

    // The shelf now marks the picture the shop carries — including this one, so a
    // second look at the banner finds it already hung rather than free to take.
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-attached',
      'https://i.ibb.co/picked/cover.png',
    );
  });

  it('saves the logo a seller picked from their library', async () => {
    render(<ShopProfilePanel copy={mkCopy('en')} shop={SHOP} />);

    await openDoor(1);
    expect(screen.getByRole('dialog', { name: 'library avatar' })).toHaveAttribute(
      'data-purpose',
      'avatar',
    );
    fireEvent.click(screen.getByRole('button', { name: 'pick avatar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // `avatar` for a shop logo is the website's own long-standing choice, and the
    // address written is the one the platform stored when the photo first went up.
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        logo_url: 'https://i.ibb.co/picked/avatar.png',
        cover_url: 'https://i.ibb.co/shop/old-banner.png',
      }),
    );
    expect(uploadAndRecord).not.toHaveBeenCalled();
  });
});
