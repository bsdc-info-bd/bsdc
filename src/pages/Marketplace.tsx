/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ShoppingBag, Plus, Search, Tag as TagIcon, MapPin } from 'lucide-react';
import { collection, addDoc, getDoc, getDocs, limit as fsLimit, query as fsQuery, updateDoc, doc } from 'firebase/firestore';
import { COL, fsDb } from '@/lib/firestore';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { Modal } from '@/components/ui/Modal';
import { SEOHead, Breadcrumbs } from '@/components/seo/SEOHead';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { MARKETPLACE_CATEGORIES } from '@/config/constants';
import { formatCurrency } from '@/lib/utils';
import type { MarketplaceListing } from '@/types/domain';

export default function Marketplace() {
  const { t } = useTranslation();
  const [listings, setListings] = useState<(MarketplaceListing & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  useEffect(() => {
    let cancelled = false;
    getDocs(fsQuery(collection(fsDb(), COL.marketplace), fsLimit(200)))
      .then((snap) => {
        if (cancelled) return;
        setListings(snap.docs.map((d) => ({ ...(d.data() as Omit<MarketplaceListing, 'id'>), id: d.id })));
      })
      .catch(() => !cancelled && setListings([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return listings
      .filter((l) => l.status === 'active' || l.status === 'sold')
      .filter((l) => (category === 'all' ? true : l.category === category))
      .filter((l) => (search ? `${l.title} ${l.description}`.toLowerCase().includes(search.toLowerCase()) : true))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [listings, category, search]);

  return (
    <>
      <SEOHead title="Marketplace — BSDC" description="Buy and sell software tools, templates, courses and services in Bangladesh's developer marketplace." path="/marketplace" />
      <div className="mx-auto max-w-5xl">
        <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: t('marketplace.title'), path: '/marketplace' }]} />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
            <ShoppingBag className="h-6 w-6 text-brand-600" aria-hidden />
            {t('marketplace.title')}
          </h1>
          <Button size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setCreateOpen(true)}>
            <span className="hidden min-[420px]:inline">{t('marketplace.create')}</span>
          </Button>
        </div>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`${t('common.search')} ${t('marketplace.title').toLowerCase()}`} aria-label={t('common.search')} className="bsdc-input pl-9" />
          </div>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} options={[{ value: 'all', label: t('common.all') }, ...MARKETPLACE_CATEGORIES.map((c) => ({ value: c, label: c }))]} className="sm:w-56" />
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title={t('marketplace.empty')} body={t('marketplace.emptyBody')} icon={<ShoppingBag className="h-16 w-16" aria-hidden />} action={<Button onClick={() => setCreateOpen(true)}>{t('marketplace.create')}</Button>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((listing) => (
              <Link key={listing.id} to={`/marketplace/${listing.id}`} className="bsdc-surface bsdc-fabric-card-hover overflow-hidden">
                <div className="relative aspect-[4/3] bg-neutral-100 dark:bg-surface-dark-raised">
                  {listing.images?.[0] ? (
                    <img src={listing.images[0]} alt={listing.title} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-neutral-300">
                      <ShoppingBag className="h-10 w-10" aria-hidden />
                    </div>
                  )}
                  {listing.status === 'sold' ? (
                    <span className="absolute left-2 top-2 rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] font-bold uppercase text-white">{t('marketplace.sold')}</span>
                  ) : null}
                </div>
                <div className="p-3.5">
                  <p className="line-clamp-1 font-bold">{listing.title}</p>
                  <p className="mt-0.5 text-lg font-extrabold text-brand-600 dark:text-brand-400">{formatCurrency(listing.price, listing.currency)}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
                    <TagIcon className="h-3 w-3" aria-hidden />
                    {listing.category} · {listing.condition}
                  </p>
                  <p className="mt-1.5 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <Avatar src={listing.sellerAvatar} name={listing.sellerName} size={20} />
                    @{listing.sellerUsername}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <CreateListingModal open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function CreateListingModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<'BDT' | 'USD'>('BDT');
  const [category, setCategory] = useState<string>(MARKETPLACE_CATEGORIES[0]);
  const [condition, setCondition] = useState<'new' | 'like_new' | 'used' | 'refurbished'>('new');
  const [location, setLocation] = useState('');
  const [contact, setContact] = useState('');
  const [images, setImages] = useState<{ url: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!profile) {
      navigate('/login');
      return;
    }
    if (!title.trim() || !price) {
      toast.error('Title and price are required');
      return;
    }
    setSaving(true);
    try {
      const now = Date.now();
      await addDoc(collection(fsDb(), COL.marketplace), {
        sellerId: profile.uid,
        sellerName: profile.displayName,
        sellerUsername: profile.username,
        sellerAvatar: profile.avatar,
        title: title.trim(),
        description,
        price: Number(price) || 0,
        currency,
        images: images.map((i) => i.url),
        category,
        condition,
        location,
        contact,
        status: 'pending',
        savedBy: [],
        savedCount: 0,
        soldAt: null,
        createdAt: now,
        updatedAt: now,
      });
      toast.success(`${t('marketplace.create')} — ${t('marketplace.pendingReview')}`);
      onOpenChange(false);
    } catch {
      toast.error('Could not create listing');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('marketplace.create')}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button loading={saving} onClick={() => void submit()}>{t('common.submit')}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label={t('common.title')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
        <Textarea label={t('common.description')} value={description} onChange={(e) => setDescription(e.target.value)} maxRows={4} />
        <div className="grid grid-cols-1 gap-3 min-[460px]:grid-cols-2">
          <Input label={t('marketplace.price')} type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
          <Select label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value as 'BDT' | 'USD')} options={[{ value: 'BDT', label: 'BDT' }, { value: 'USD', label: 'USD' }]} />
        </div>
        <div className="grid grid-cols-1 gap-3 min-[460px]:grid-cols-2">
          <Select label={t('marketplace.category')} value={category} onChange={(e) => setCategory(e.target.value)} options={MARKETPLACE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
          <Select
            label={t('marketplace.condition')}
            value={condition}
            onChange={(e) => setCondition(e.target.value as 'new' | 'like_new' | 'used' | 'refurbished')}
            options={[
              { value: 'new', label: t('marketplace.new') },
              { value: 'like_new', label: t('marketplace.like_new') },
              { value: 'used', label: t('marketplace.used') },
              { value: 'refurbished', label: t('marketplace.refurbished') },
            ]}
          />
        </div>
        <Input label={t('marketplace.location')} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Dhaka" />
        <Input label="Contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="email or phone" />
        <ImageUploader images={images} onChange={setImages} max={5} folder="bsdc/marketplace" />
        <p className="text-xs text-neutral-400">{t('marketplace.pendingReview')}</p>
      </div>
    </Modal>
  );
}

export function MarketplaceListingPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const [listing, setListing] = useState<(MarketplaceListing & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    getDoc(doc(fsDb(), COL.marketplace, listingId))
      .then((snap) => {
        if (!cancelled) setListing(snap.exists() ? ({ ...(snap.data() as Omit<MarketplaceListing, 'id'>), id: snap.id }) : null);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  async function contactSeller() {
    if (!profile || !listing) {
      navigate('/login');
      return;
    }
    const { ensureDirectChat } = await import('@/lib/realtime');
    const chatId = await ensureDirectChat(
      { uid: profile.uid, displayName: profile.displayName, username: profile.username, avatar: profile.avatar, role: 'member', joinedAt: Date.now() },
      { uid: listing.sellerId, displayName: listing.sellerName, username: listing.sellerUsername, avatar: listing.sellerAvatar, role: 'member', joinedAt: Date.now() },
    );
    navigate(`/messages/${chatId}`);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-80 w-full rounded-2xl" />
        <Skeleton className="h-8 w-2/3" />
      </div>
    );
  }
  if (!listing) {
    return <EmptyState title={t('common.notFound')} body={t('notFound.body')} />;
  }

  return (
    <>
      <SEOHead title={`${listing.title} — BSDC Marketplace`} description={listing.description.slice(0, 150)} path={`/marketplace/${listing.id}`} ogImage={listing.images?.[0]} />
      <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: t('marketplace.title'), path: '/marketplace' }, { name: listing.title, path: `/marketplace/${listing.id}` }]} />
      <div className="mx-auto max-w-4xl">
        <div className="grid gap-6 md:grid-cols-2">
          <button type="button" onClick={() => setLightbox(true)} className="overflow-hidden rounded-2xl">
            {listing.images?.[0] ? (
              <img src={listing.images[0]} alt={listing.title} className="w-full object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-2xl bg-neutral-100 dark:bg-surface-dark-raised">
                <ShoppingBag className="h-14 w-14 text-neutral-300" aria-hidden />
              </div>
            )}
          </button>
          <div>
            <h1 className="text-xl font-extrabold sm:text-2xl">{listing.title}</h1>
            <p className="mt-2 text-2xl font-extrabold text-brand-600 dark:text-brand-400">{formatCurrency(listing.price, listing.currency)}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400">
              <span>{listing.category}</span>
              <span>·</span>
              <span>{listing.condition}</span>
              {listing.location ? (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{listing.location}</span>
                </>
              ) : null}
            </p>
            <p className="mt-4 whitespace-pre-line text-sm">{listing.description}</p>
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-surface-light-border p-3 dark:border-surface-dark-border">
              <Avatar src={listing.sellerAvatar} name={listing.sellerName} size={44} />
              <div className="min-w-0 flex-1">
                <Link to={`/p/${listing.sellerUsername}`} className="block truncate font-bold hover:underline">{listing.sellerName}</Link>
                <p className="text-xs text-neutral-400">@{listing.sellerUsername}</p>
              </div>
              {profile?.uid !== listing.sellerId ? (
                <Button size="sm" onClick={() => void contactSeller()}>{t('marketplace.contactSeller')}</Button>
              ) : listing.status === 'active' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await updateDoc(doc(fsDb(), COL.marketplace, listing.id), { status: 'sold', soldAt: Date.now() });
                    setListing({ ...listing, status: 'sold' });
                    toast.success(t('marketplace.sold'));
                  }}
                >
                  {t('marketplace.markSold')}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        {lightbox && listing.images?.length ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setLightbox(false)} role="dialog" aria-modal="true">
            <img src={listing.images[0]} alt={listing.title} className="max-h-full max-w-full rounded-xl" />
          </div>
        ) : null}
      </div>
    </>
  );
}
