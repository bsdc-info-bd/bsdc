import { motion, useReducedMotion } from 'framer-motion';
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
import { formatTaka, isHttpsUrl, type Language } from '@/lib/mk/mk-logic';
import type { MkCopy } from '@/lib/mk/mk-copy';
import type { ProductPayload } from '@/lib/mk/mk-repository';
import type { MkCatalogProduct } from '@/lib/mk/mk-types';

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

  async function uploadImages(files: FileList | null): Promise<void> {
    if (!files || files.length === 0 || editing === null) return;
    setUploading(true);
    try {
      const { uploadMedia } = await import('@/lib/storage/upload');
      const added: string[] = [];
      for (const file of Array.from(files)) {
        const result = await uploadMedia(file, { purpose: 'product-image' });
        added.push(result.url);
      }
      setEditing({
        ...editing,
        draft: {
          ...editing.draft,
          images: [...new Set([...editing.draft.images, ...added])].slice(0, 8),
        },
      });
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
                <img
                  src={product.images[0]}
                  alt=""
                  loading="lazy"
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
              <label
                htmlFor={fileInputId}
                className="mb-2 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-sm hover:bg-surface-2"
              >
                <ImagePlus size={16} aria-hidden /> {uploading ? copy.loading : copy.addProduct}
              </label>
              <input
                ref={fileRef}
                id={fileInputId}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => void uploadImages(e.target.files)}
              />
              <div className="flex flex-wrap gap-2">
                {editing.draft.images.map((url) => (
                  <div
                    key={url}
                    className="relative h-16 w-16 overflow-hidden rounded-lg border border-border"
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
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
