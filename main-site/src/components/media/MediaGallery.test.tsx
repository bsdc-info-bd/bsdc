import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MediaGallery, type GalleryItem } from './MediaGallery';
import type { PostMediaItem } from '@/lib/content/post-repository';
import { toGalleryItems } from '@/lib/media/gallery-items';
import type * as I18nModule from 'react-i18next';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

function item(index: number, width: number | null, height: number | null): GalleryItem {
  return {
    id: `asset-${index}`,
    url: `https://cdn.example/${index}.jpg`,
    thumbUrl: `https://cdn.example/${index}-thumb.jpg`,
    altText: index === 0 ? 'The first picture' : '',
    width,
    height,
  };
}

const squares = [
  item(0, 1000, 1000),
  item(1, 1000, 1000),
  item(2, 1000, 1000),
  item(3, 1000, 1000),
];

describe('the arrangement a card shows', () => {
  it('gives one picture the whole width, in the shape it was taken', () => {
    render(<MediaGallery items={[item(0, 1600, 900)]} label="Pictures" />);
    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('src', 'https://cdn.example/0-thumb.jpg');
    expect(image).toHaveAttribute('alt', 'The first picture');
    expect(screen.getByRole('button', { name: 'The first picture' })).toHaveStyle({
      aspectRatio: '1.78 / 1',
    });
  });

  it('bleeds to the edges of the card when the picture is its header', () => {
    const { container } = render(
      <MediaGallery items={[item(0, 1600, 900)]} flush label="Pictures" />,
    );
    const surface = container.firstElementChild;
    expect(surface?.className).toContain('-mx-3');
    expect(surface?.className).toContain('rounded-t-card');
  });

  it('keeps a set of pictures inside the card, in two columns', () => {
    const { container } = render(
      <MediaGallery items={[item(0, 1600, 900), item(1, 900, 1600)]} label="Pictures" />,
    );
    const surface = container.firstElementChild;
    expect(surface?.className).not.toContain('-mx-3');
    expect(surface).toHaveStyle({ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' });
  });

  it('crops a tall picture from the top, where the subject usually is', () => {
    const { container } = render(
      <MediaGallery items={[item(0, 900, 1600), item(1, 1600, 900)]} label="Pictures" />,
    );
    const [tall, wide] = Array.from(container.querySelectorAll('img'));
    expect(tall).toHaveStyle({ objectPosition: 'center 22%' });
    expect(wide).toHaveStyle({ objectPosition: 'center' });
  });

  it('gives three pictures a tall one on the left and two stacked on the right', () => {
    render(
      <MediaGallery
        items={[item(0, 900, 1600), item(1, 1000, 1000), item(2, 1000, 1000)]}
        label="Pictures"
      />,
    );
    const cells = screen.getAllByRole('button');
    expect(cells).toHaveLength(3);
    expect(cells[0]).toHaveStyle({ gridRow: 'span 2' });
    expect(cells[1]).not.toHaveStyle({ gridRow: 'span 2' });
  });

  it('falls back to a shape it can defend when the size was never measured', () => {
    render(<MediaGallery items={[item(0, null, null)]} label="Pictures" />);
    expect(screen.getByRole('button', { name: 'The first picture' })).toHaveStyle({
      aspectRatio: '1.78 / 1',
    });
  });

  it('shows four of a longer set and counts the rest on the last one', () => {
    render(
      <MediaGallery
        items={[...squares, item(4, 1000, 1000), item(5, 1000, 1000), item(6, 1000, 1000)]}
        label="Pictures"
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it('names a picture its author said nothing about', () => {
    render(<MediaGallery items={[item(1, 1000, 1000)]} label="Pictures" />);
    // The button carries the name, so the picture inside it is decorative to a
    // screen reader rather than an unlabelled thing it has to guess at.
    expect(screen.getByRole('button', { name: 'Pictures 1' })).toBeInTheDocument();
  });

  it('renders nothing at all for a post with no pictures', () => {
    const { container } = render(<MediaGallery items={[]} label="Pictures" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the lightbox', () => {
  it('opens on the picture that was chosen, at full size', async () => {
    render(<MediaGallery items={squares} label="Pictures" />);
    await userEvent.click(screen.getAllByRole('button')[1] as HTMLElement);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText('2 / 4')).toBeInTheDocument();
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'https://cdn.example/1.jpg');
  });

  it('moves with the arrow keys, wraps, and closes with Escape', async () => {
    render(<MediaGallery items={squares} label="Pictures" />);
    await userEvent.click(screen.getAllByRole('button')[0] as HTMLElement);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('1 / 4')).toBeInTheDocument();

    await userEvent.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('2 / 4')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowLeft}');
    await userEvent.keyboard('{ArrowLeft}');
    expect(within(dialog).getByText('4 / 4')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says when a picture has no description rather than showing an empty line', async () => {
    render(<MediaGallery items={squares} label="Pictures" />);
    await userEvent.click(screen.getAllByRole('button')[1] as HTMLElement);
    expect(screen.getByText('media.lightbox.noDescription')).toBeInTheDocument();
  });

  it('offers the original file, and no arrows when there is only one', async () => {
    render(<MediaGallery items={[item(0, 1600, 900)]} label="Pictures" />);
    await userEvent.click(screen.getByRole('button', { name: 'The first picture' }));
    expect(screen.getByLabelText('media.lightbox.download')).toHaveAttribute(
      'href',
      'https://cdn.example/0.jpg',
    );
    expect(screen.queryByLabelText('media.lightbox.next')).not.toBeInTheDocument();
    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
  });
});

describe('a post row becomes a gallery item', () => {
  it('keys on the asset, and on the address when there is no asset yet', () => {
    const media: PostMediaItem[] = [
      {
        mediaId: 'asset-1',
        url: 'https://cdn.example/one.jpg',
        thumbUrl: '',
        altText: 'One',
        position: 0,
        width: 800,
        height: 600,
      },
      {
        mediaId: '',
        url: 'https://cdn.example/two.jpg',
        thumbUrl: 'https://cdn.example/two-thumb.jpg',
        altText: '',
        position: 1,
        width: null,
        height: null,
      },
    ];
    expect(toGalleryItems(media)).toEqual([
      {
        id: 'asset-1',
        url: 'https://cdn.example/one.jpg',
        thumbUrl: '',
        altText: 'One',
        width: 800,
        height: 600,
      },
      {
        id: 'https://cdn.example/two.jpg-1',
        url: 'https://cdn.example/two.jpg',
        thumbUrl: 'https://cdn.example/two-thumb.jpg',
        altText: '',
        width: null,
        height: null,
      },
    ]);
  });
});
