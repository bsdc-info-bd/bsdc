import { Boxes, Upload, X } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MediaImage } from '@/components/media/MediaImage';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageSkeleton,
  ProgressBar,
  SectionHeading,
  Switch,
  TagInput,
  TextField,
  TextareaField,
} from '@/design-system';
import { useVendorProducts, useVendorShop } from '@/hooks/use-vendor';
import { isConfigured } from '@/lib/env';
import { formatNumber } from '@/lib/format';
import { formatMoney } from '@/lib/market/market-types';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { slugify, validateDraft, type ProductDraft } from '@/lib/vendor/vendor-types';
import { useAuthStore } from '@/store/auth-store';

const EMPTY: ProductDraft = {
  slug: '',
  title: '',
  summary: '',
  description: '',
  price: 0,
  stock: 0,
  category: '',
  isDigital: false,
  images: [],
};

/** The shop's shelf: what exists, what is live, and how much is left. */
export default function VendorProductsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const { shop } = useVendorShop();
  const { products, isLoading, create, publish, restock, isSaving } = useVendorProducts();
  const [draft, setDraft] = useState<ProductDraft>(EMPTY);
  const [taka, setTaka] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const uploadInputId = useId();
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const problems = useMemo(() => validateDraft(draft), [draft]);
  const problemFor = (field: keyof ProductDraft): string | undefined => {
    const problem = problems.find((item) => item.field === field);
    return problem ? t(problem.key) : undefined;
  };

  function patch(next: Partial<ProductDraft>): void {
    setDraft((current) => ({ ...current, ...next }));
  }

  function onTitle(value: string): void {
    patch(
      draft.slug === slugify(draft.title)
        ? { title: value, slug: slugify(value) }
        : { title: value },
    );
  }

  function onPrice(value: string): void {
    setTaka(value);
    const parsed = Number.parseFloat(value);
    patch({ price: Number.isFinite(parsed) ? Math.round(parsed * 100) : -1 });
  }

  async function onUploadImages(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    if (!uid) {
      toast.error(t('media.errors.signInRequired'));
      return;
    }
    setUploadProgress(0);
    try {
      const { uploadMedia, MediaError } = await import('@/lib/storage/upload');
      const { recordMediaAsset } = await import('@/lib/data/media-repository');
      const added: string[] = [];
      for (const file of Array.from(files)) {
        const result = await uploadMedia(file, {
          purpose: 'product-image',
          onProgress: setUploadProgress,
        }).catch((error: unknown) => {
          throw error instanceof MediaError ? error : new Error('media.errors.failed');
        });
        if (isConfigured.supabase) {
          const row = await recordMediaAsset(uid, result);
          if (row === null) throw new Error('media.errors.recordFailed');
        }
        added.push(result.url);
      }
      if (added.length > 0) {
        setDraft((current) => ({
          ...current,
          images: [...new Set([...current.images, ...added])].slice(0, 8),
        }));
        toast.success(t('media.uploaded'));
      }
    } catch (error) {
      const key =
        error instanceof Error && error.message.startsWith('media.')
          ? error.message
          : 'media.errors.failed';
      toast.error(t(key));
    } finally {
      setUploadProgress(null);
    }
  }

  async function submit(): Promise<void> {
    if (shop === null) return;
    try {
      await create(shop.id, draft);
      toast.success(t('vendor.productCreated'));
      setDraft(EMPTY);
      setTaka('');
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function onPublish(productId: string, next: boolean): Promise<void> {
    try {
      await publish(productId, next);
      toast.success(next ? t('vendor.published') : t('vendor.unpublished'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function onRestock(productId: string, delta: number): Promise<void> {
    try {
      await restock(productId, delta);
      toast.success(t('vendor.restocked'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('vendor.products.metaTitle')}
        description={t('vendor.products.metaDescription')}
        path={ROUTES.vendorProducts}
        noindex
      />

      <div className="fab-container max-w-4xl py-6 sm:py-10">
        <SectionHeading
          title={t('vendor.products.title')}
          description={t('vendor.products.description')}
        />

        {shop === null ? (
          <Alert tone="info" title={t('vendor.noShop')} className="mt-4" />
        ) : (
          <Card className="mt-4">
            <h2 className="text-lg font-semibold">{t('vendor.products.newTitle')}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TextField
                label={t('vendor.products.fieldTitle')}
                value={draft.title}
                error={draft.title.length > 0 ? problemFor('title') : undefined}
                onChange={(event) => {
                  onTitle(event.target.value);
                }}
              />
              <TextField
                label={t('vendor.products.fieldSlug')}
                value={draft.slug}
                error={draft.slug.length > 0 ? problemFor('slug') : undefined}
                onChange={(event) => {
                  patch({ slug: event.target.value });
                }}
              />
              <TextField
                label={t('vendor.products.fieldPrice')}
                inputMode="decimal"
                value={taka}
                error={taka.length > 0 ? problemFor('price') : undefined}
                onChange={(event) => {
                  onPrice(event.target.value);
                }}
              />
              <TextField
                label={t('vendor.products.fieldStock')}
                inputMode="numeric"
                value={String(draft.stock)}
                disabled={draft.isDigital}
                error={problemFor('stock')}
                onChange={(event) => {
                  patch({ stock: Number.parseInt(event.target.value, 10) || 0 });
                }}
              />
              <TextField
                label={t('vendor.products.fieldCategory')}
                value={draft.category}
                onChange={(event) => {
                  patch({ category: event.target.value });
                }}
              />
              <Switch
                className="self-end"
                checked={draft.isDigital}
                label={t('vendor.products.fieldDigital')}
                onCheckedChange={(checked) => {
                  patch({ isDigital: checked, stock: checked ? 0 : draft.stock });
                }}
              />
            </div>

            <TextareaField
              className="mt-3"
              label={t('vendor.products.fieldSummary')}
              rows={2}
              counterMax={200}
              value={draft.summary}
              error={draft.summary.length > 0 ? problemFor('summary') : undefined}
              onChange={(event) => {
                patch({ summary: event.target.value });
              }}
            />
            <TextareaField
              className="mt-3"
              label={t('vendor.products.fieldDescription')}
              rows={5}
              value={draft.description}
              onChange={(event) => {
                patch({ description: event.target.value });
              }}
            />
            <div className="mt-3 grid gap-3">
              <div>
                <input
                  ref={uploadInputRef}
                  id={uploadInputId}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  className="sr-only"
                  onChange={(event) => {
                    void onUploadImages(event.target.files);
                    event.target.value = '';
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    iconStart={<Upload size={16} />}
                    disabled={uploadProgress !== null || draft.images.length >= 8}
                    onClick={() => uploadInputRef.current?.click()}
                  >
                    {uploadProgress === null ? t('media.upload') : t('media.uploading')}
                  </Button>
                  <span className="text-xs text-muted">{t('media.hint')}</span>
                </div>
                {uploadProgress !== null ? (
                  <ProgressBar
                    value={uploadProgress}
                    label={t('media.uploading')}
                    className="mt-2"
                  />
                ) : null}
                {draft.images.length > 0 ? (
                  <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {draft.images.map((url, index) => (
                      <li
                        key={url}
                        className="relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-2"
                      >
                        <MediaImage
                          src={url}
                          alt={draft.title || t('vendor.products.fieldImages')}
                          slotWidth={160}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          aria-label={t('media.remove')}
                          onClick={() => {
                            patch({
                              images: draft.images.filter((_, itemIndex) => itemIndex !== index),
                            });
                          }}
                          className="absolute end-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-950/75 text-white hover:bg-danger"
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <TagInput
                label={t('vendor.products.fieldImages')}
                value={draft.images}
                onChange={(images) => {
                  patch({ images });
                }}
              />
              {problemFor('images') !== undefined ? (
                <p className="text-xs text-danger">{problemFor('images')}</p>
              ) : null}
            </div>

            <Button
              className="mt-4"
              disabled={isSaving || problems.length > 0}
              onClick={() => {
                void submit();
              }}
            >
              {t('vendor.products.create')}
            </Button>
          </Card>
        )}

        {isLoading ? <PageSkeleton label={t('common.loading')} /> : null}

        {!isLoading && products.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Boxes size={22} />}
              title={t('vendor.products.emptyTitle')}
              description={t('vendor.products.emptyBody')}
            />
          </div>
        ) : null}

        <ul className="mt-4 grid gap-3">
          {products.map((product) => (
            <Card as="li" key={product.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{product.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {formatMoney(product.price, product.currency, language)} ·{' '}
                    {product.isDigital
                      ? t('vendor.products.digital')
                      : t('vendor.products.inStock', {
                          total: formatNumber(product.stock, language),
                        })}{' '}
                    ·{' '}
                    {t('vendor.products.sold', {
                      total: formatNumber(product.soldCount, language),
                    })}
                  </p>
                </div>
                <Badge tone={product.status === 'active' ? 'green' : 'neutral'}>
                  {t(`vendor.productStatuses.${product.status}`)}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={product.status === 'active' ? 'ghost' : 'primary'}
                  disabled={isSaving}
                  onClick={() => {
                    void onPublish(product.id, product.status !== 'active');
                  }}
                >
                  {product.status === 'active' ? t('vendor.unpublish') : t('vendor.publish')}
                </Button>
                {!product.isDigital ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isSaving}
                      onClick={() => {
                        void onRestock(product.id, 10);
                      }}
                    >
                      {t('vendor.addTen')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isSaving || product.stock === 0}
                      onClick={() => {
                        void onRestock(product.id, -1);
                      }}
                    >
                      {t('vendor.removeOne')}
                    </Button>
                  </>
                ) : null}
              </div>
            </Card>
          ))}
        </ul>
      </div>
    </>
  );
}
