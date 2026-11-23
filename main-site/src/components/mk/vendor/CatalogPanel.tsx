import { motion, useReducedMotion } from 'framer-motion';
import { MediaImage } from '@/components/media/MediaImage';
import { MediaSourcePicker } from '@/components/media/MediaSourcePicker';
import type { PickedMedia } from '@/lib/media/gallery';
import { ImagePlus, Pencil, Plus, Tag, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  SelectField,
  TextField,
  TextareaField,
} from '@/design-system';
import { useCatalogMutations, useVendorCatalog } from '@/hooks/use-mk';
import { formatTaka, isHttpsUrl, variantFor, type Language } from '@/lib/mk/mk-logic';
import type { MkCopy } from '@/lib/mk/mk-copy';
import type { ProductPayload } from '@/lib/mk/mk-repository';
import type { MkCatalogProduct } from '@/lib/mk/mk-types';
import { useAuthStore } from '@/store/auth-store';

interface Props {
  copy: MkCopy;
  language: Language;
  enabled: boolean;
}

const EMPTY_PRODUCT: ProductPayload = {
  name: '',
  description: '',
  price_poisha: 0,
  stock: 0,
  status: 'draft',
  category_id: null,
  images: [],
};

export function CatalogPanel({ copy, language, enabled }: Props) {
  const catalog = useVendorCatalog(enabled);
  const { saveCategory, saveProduct } = useCatalogMutations();
  const reduceMotion = useReducedMotion() ?? false;
  const [editing, setEditing] = useState<{
    id: string | null;
    draft: ProductPayload;
    priceText: string;
  } | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  const categories = catalog.data?.categories ?? [];
  const products = catalog.data?.products ?? [];

  function openNew(): void {
    setEditing({ id: null, draft: { ...EMPTY_PRODUCT }, priceText: '' });
  }

  function openEdit(product: MkCatalogProduct): void {
    setEditing({
      id: product.id,
      draft: {
        name: product.name,
        description: product.description,
        price_poisha: product.price_poisha,
        stock: product.stock,
        status: product.status,
        category_id: product.category_id,
        images: product.images,
        // Carried through the edit. Without this, saving any change to an existing
        // product would send an empty map and erase the lighter copies 0116 exists
        // to keep — the shop would get slower every time a name was corrected.
        image_variants: { ...(product.image_variants ?? {}) },
      },
      priceText: String(product.price_poisha / 100),
    });
  }

  async function addCategory(): Promise<void> {
    const name = newCategory.trim();
    if (name.length < 2) return;
    try {
      await saveCategory.mutateAsync({ id: null, name, sort: categories.length + 1 });
      setNewCategory('');
      toast.success(copy.saved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.errorGeneric);
    }
  }

  /**
   * Put pictures at the end of this product's images, with their thumbnails.
   *
   * Both doors a seller can bring a picture through end here, which is the point: one
   * rule for how many a product can carry, one rule for the ~640px copy the grid
   * should load, and neither door can leave a variant describing a picture the product
   * no longer has.
   */
  function addImages(added: readonly { url: string; thumbUrl: string }[]): void {
    setEditing((current) => {
      if (current === null) return current;
      const variants: Record<string, string> = { ...(current.draft.image_variants ?? {}) };
      for (const item of added) {
        if (item.thumbUrl.length > 0 && item.thumbUrl !== item.url) {
          variants[item.url] = item.thumbUrl;
        }
      }
      const images = [...new Set([...current.draft.images, ...added.map((item) => item.url)])];
      const kept = images.slice(0, 8);
      // Drop variants for pictures that the slice just removed, so the stored map
      // cannot grow past the images it describes.
      for (const url of Object.keys(variants)) {
        if (!kept.includes(url)) delete variants[url];
      }
      return { ...current, draft: { ...current.draft, images: kept, image_variants: variants } };
    });
  }

  /**
   * List a picture the seller has already uploaded, instead of uploading it again.
   *
   * `mk_products.images` holds addresses, and the address the library hands over is
   * the one this platform wrote when that photo first went up — the same string an
   * upload of the same file would have produced, minus the upload, the quota and the
   * second copy on the host. It is also why no description is asked for here: a
   * picture keeps whatever the seller already said about it.
   */
  function pickImages(picked: readonly PickedMedia[]): void {
    addImages(picked.map((item) => ({ url: item.url, thumbUrl: item.thumbUrl })));
  }

  async function uploadImages(files: readonly File[]): Promise<void> {
    if (files.length === 0 || editing === null) return;
    setUploading(true);
    try {
      // Uploading is only half of it: the row that says who uploaded the picture
      // is what makes it attributable and sweepable, and it is the half a client
      // forgets silently. See `upload-and-record`.
      const { uploadAndRecord } = await import('@/lib/storage/upload-and-record');
      const ownerUid = useAuthStore.getState().user?.uid ?? '';
      const added: { url: string; thumbUrl: string }[] = [];
      for (const file of files) {
        const result = await uploadAndRecord(file, { purpose: 'product-image' }, ownerUid);
        // The upload already produced a ~640px copy; discarding it here is what
        // made every catalogue thumbnail download the full-size original.
        added.push({ url: result.url, thumbUrl: result.thumbUrl });
      }
      addImages(added);
    } catch {
      toast.error(copy.errorGeneric);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function saveEditing(): Promise<void> {
    if (editing === null) return;
    const price = Math.round(Number(editing.priceText) * 100);
    const { draft } = editing;
    if (draft.name.trim().length < 2 || !Number.isFinite(price) || price <= 0) {
      toast.error(copy.fieldErrors.required);
      return;
    }
    if (draft.images.some((url) => !isHttpsUrl(url))) {
      toast.error(copy.fieldErrors.required);
      return;
    }
    try {
      await saveProduct.mutateAsync({
        id: editing.id,
        payload: { ...draft, name: draft.name.trim(), price_poisha: price },
      });
      setEditing(null);
      toast.success(copy.saved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.errorGeneric);
    }
  }

  return (
    <section aria-labelledby="catalog-h" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="catalog-h" className="text-lg font-semibold text-text">
          {copy.tabs.products}
        </h2>
        <Button type="button" iconStart={<Plus size={16} />} onClick={openNew}>
          {copy.addProduct}
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
          <Tag size={16} aria-hidden />
          {copy.category}
        </p>
        <div className="flex flex-wrap gap-2">
          {categories.length === 0 ? <p className="text-sm text-muted">{copy.noCategory}</p> : null}
          {categories.map((c) => (
            <Badge key={c.id} tone="neutral">
              {c.name}
            </Badge>
          ))}
        </div>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addCategory();
          }}
        >
          <div className="min-w-[12rem] flex-1">
            <TextField
              label={copy.newCategory}
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" loading={saveCategory.isPending}>
            {copy.addCategory}
          </Button>
        </form>
      </div>

      {catalog.isLoading ? <p className="text-sm text-muted">{copy.loading}</p> : null}
      {!catalog.isLoading && products.length === 0 ? (
        <EmptyState
          icon={<ImagePlus size={28} />}
          title={copy.tabs.products}
          description={copy.noProducts}
        />
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((product, i) => (
          <motion.li
            key={product.id}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.03 }}
            className="group overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
          >
            <div className="relative aspect-[4/3] bg-surface-2">
              {product.images[0] ? (
                <MediaImage
                  src={product.images[0]}
                  variantSrc={variantFor(product.images, product.image_variants, product.images[0])}
                  alt=""
                  slotWidth={400}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted">
                  <ImagePlus size={28} aria-hidden />
                </div>
              )}
              <span className="absolute left-2 top-2">
                <Badge tone={product.status === 'active' ? 'green' : 'neutral'}>
                  {copy.productStatusLabels[product.status]}
                </Badge>
              </span>
            </div>
            <div className="space-y-1 p-3">
              <p className="truncate font-semibold text-text">{product.name}</p>
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-green-700">
                  {formatTaka(product.price_poisha, language)}
                </span>
                <span className="text-muted">
                  {copy.stock}: {product.stock}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                iconStart={<Pencil size={14} />}
                onClick={() => openEdit(product)}
              >
                {copy.editProduct}
              </Button>
            </div>
          </motion.li>
        ))}
      </ul>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? copy.editProduct : copy.addProduct}
        closeLabel={copy.cancel}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(null)}
              iconStart={<X size={14} />}
            >
              {copy.cancel}
            </Button>
            <Button
              type="button"
              loading={saveProduct.isPending}
              onClick={() => void saveEditing()}
            >
              {copy.save}
            </Button>
          </div>
        }
      >
        {editing !== null ? (
          <div className="space-y-4">
            <TextField
              label={copy.productName}
              value={editing.draft.name}
              onChange={(e) =>
                setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })
              }
            />
            <TextareaField
              label={copy.description}
              value={editing.draft.description}
              onChange={(e) =>
                setEditing({ ...editing, draft: { ...editing.draft, description: e.target.value } })
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={copy.price}
                inputMode="decimal"
                value={editing.priceText}
                onChange={(e) => setEditing({ ...editing, priceText: e.target.value })}
              />
              <TextField
                label={copy.stock}
                inputMode="numeric"
                value={String(editing.draft.stock)}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    draft: {
                      ...editing.draft,
                      stock: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                    },
                  })
                }
              />
              <SelectField
                label={copy.category}
                value={editing.draft.category_id ?? ''}
                options={[
                  { value: '', label: copy.noCategory },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    draft: { ...editing.draft, category_id: e.target.value || null },
                  })
                }
              />
              <SelectField
                label={copy.productStatus}
                value={editing.draft.status}
                options={(['draft', 'active', 'archived'] as const).map((s) => ({
                  value: s,
                  label: copy.productStatusLabels[s],
                }))}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    draft: { ...editing.draft, status: e.target.value as ProductPayload['status'] },
                  })
                }
              />
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label
                  htmlFor={fileInputId}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-sm hover:bg-surface-2"
                >
                  <ImagePlus size={16} aria-hidden />
                  {uploading ? copy.loading : copy.addProduct}
                </label>
                <MediaSourcePicker
                  purpose="product-image"
                  showUpload={false}
                  compact
                  multiple
                  max={Math.max(0, 8 - editing.draft.images.length)}
                  attached={editing.draft.images}
                  disabled={uploading}
                  onFiles={(files) => void uploadImages(files)}
                  onPick={pickImages}
                />
              </div>
              <input
                ref={fileRef}
                id={fileInputId}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => void uploadImages(Array.from(e.target.files ?? []))}
              />
              <div className="flex flex-wrap gap-2">
                {editing.draft.images.map((url) => (
                  <div
                    key={url}
                    className="relative h-16 w-16 overflow-hidden rounded-lg border border-border"
                  >
                    <MediaImage
                      src={url}
                      alt=""
                      slotWidth={64}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label={copy.cancel}
                      className="absolute right-0 top-0 rounded-bl-lg bg-black/60 p-0.5 text-white"
                      onClick={() =>
                        setEditing({
                          ...editing,
                          draft: {
                            ...editing.draft,
                            images: editing.draft.images.filter((u) => u !== url),
                            image_variants: Object.fromEntries(
                              Object.entries(editing.draft.image_variants ?? {}).filter(
                                ([key]) => key !== url,
                              ),
                            ),
                          },
                        })
                      }
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
