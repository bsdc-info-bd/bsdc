import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Button,
  Card,
  Divider,
  PageSkeleton,
  SectionHeading,
  SelectField,
  Switch,
  TextField,
  TextareaField,
} from '@/design-system';
import { useCart, useCheckout } from '@/hooks/use-market';
import {
  formatMoney,
  isBangladeshiPhone,
  isPostcode,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '@/lib/market/market-types';
import { formatNumber } from '@/lib/format';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

const EMPTY_ADDRESS = {
  recipient: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  district: '',
  postcode: '',
  isDefault: true,
};

/**
 * Checkout. The only things this page sends are an address, a payment method
 * and a note — every amount is computed by place_order() in Postgres.
 */
export default function CheckoutPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const navigate = useNavigate();
  const isSignedIn = useAuthStore(selectIsSignedIn);

  const cart = useCart();
  const checkout = useCheckout();
  const currency = cart.lines[0]?.currency ?? 'BDT';

  const [addressId, setAddressId] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash_on_delivery');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState(EMPTY_ADDRESS);

  const chosen = addressId.length > 0 ? addressId : (checkout.addresses[0]?.id ?? '');
  const draftValid =
    draft.recipient.trim().length >= 2 &&
    isBangladeshiPhone(draft.phone) &&
    draft.line1.trim().length >= 3 &&
    draft.city.trim().length >= 2 &&
    isPostcode(draft.postcode);

  async function saveAddress() {
    try {
      const saved = await checkout.addAddress({
        ...draft,
        recipient: draft.recipient.trim(),
        phone: draft.phone.trim(),
        line1: draft.line1.trim(),
        city: draft.city.trim(),
      });
      setAddressId(saved.id);
      setDraft(EMPTY_ADDRESS);
      toast.success(t('checkout.addressSaved'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function confirm() {
    if (chosen.length === 0) return;
    try {
      const placed = await checkout.place(chosen, method, note.trim());
      const first = placed[0];
      toast.success(t('checkout.placed', { code: first?.code ?? '' }));
      void navigate(ROUTES.orders);
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  if (!isSignedIn) {
    return (
      <div className="fab-container max-w-2xl py-10">
        <Alert tone="info" title={t('checkout.signInTitle')}>
          <p>{t('checkout.signInBody')}</p>
        </Alert>
      </div>
    );
  }

  return (
    <>
      <Seo
        title={t('checkout.metaTitle')}
        description={t('checkout.metaDescription')}
        path={ROUTES.checkout}
        noindex
      />

      <div className="fab-container max-w-3xl py-6 sm:py-10">
        <SectionHeading title={t('checkout.title')} description={t('checkout.description')} />

        {cart.isLoading || checkout.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}

        {!cart.isLoading && cart.lines.length === 0 ? (
          <Alert tone="info" title={t('checkout.emptyTitle')} className="mt-4">
            <Link to={ROUTES.shop} className="fab-link">
              {t('shop.backToShop')}
            </Link>
          </Alert>
        ) : null}

        {!cart.canCheckout && cart.lines.length > 0 ? (
          <Alert tone="warning" title={t('cart.unavailableTitle')} className="mt-4">
            <p>{t('cart.unavailableBody')}</p>
          </Alert>
        ) : null}

        {checkout.addresses.length > 0 ? (
          <Card className="mt-4">
            <SelectField
              label={t('checkout.address')}
              value={chosen}
              onChange={(event) => {
                setAddressId(event.target.value);
              }}
              options={checkout.addresses.map((address) => ({
                value: address.id,
                label: `${address.recipient} · ${address.line1}, ${address.city}`,
              }))}
            />
          </Card>
        ) : null}

        <Card className="mt-4">
          <h2 className="text-sm font-semibold">{t('checkout.newAddress')}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TextField
              label={t('checkout.recipient')}
              value={draft.recipient}
              maxLength={100}
              onChange={(event) => {
                setDraft({ ...draft, recipient: event.target.value });
              }}
            />
            <TextField
              label={t('checkout.phone')}
              hint={t('checkout.phoneHint')}
              inputMode="tel"
              value={draft.phone}
              maxLength={14}
              onChange={(event) => {
                setDraft({ ...draft, phone: event.target.value });
              }}
            />
            <TextField
              label={t('checkout.line1')}
              value={draft.line1}
              maxLength={200}
              onChange={(event) => {
                setDraft({ ...draft, line1: event.target.value });
              }}
            />
            <TextField
              label={t('checkout.line2')}
              value={draft.line2}
              maxLength={200}
              onChange={(event) => {
                setDraft({ ...draft, line2: event.target.value });
              }}
            />
            <TextField
              label={t('checkout.city')}
              value={draft.city}
              maxLength={80}
              onChange={(event) => {
                setDraft({ ...draft, city: event.target.value });
              }}
            />
            <TextField
              label={t('checkout.postcode')}
              inputMode="numeric"
              value={draft.postcode}
              maxLength={4}
              onChange={(event) => {
                setDraft({ ...draft, postcode: event.target.value });
              }}
            />
          </div>
          <div className="mt-3">
            <Switch
              checked={draft.isDefault}
              onCheckedChange={(checked) => {
                setDraft({ ...draft, isDefault: checked });
              }}
              label={t('checkout.makeDefault')}
            />
          </div>
          <Button
            className="mt-3"
            variant="secondary"
            disabled={!draftValid}
            onClick={() => {
              void saveAddress();
            }}
          >
            {t('checkout.saveAddress')}
          </Button>
        </Card>

        <Card className="mt-4">
          <SelectField
            label={t('checkout.payment')}
            value={method}
            onChange={(event) => {
              setMethod(event.target.value as PaymentMethod);
            }}
            options={PAYMENT_METHODS.map((item) => ({
              value: item,
              label: t(`checkout.methods.${item}`),
            }))}
          />
          <p className="mt-2 text-xs text-muted">{t('checkout.paymentHint')}</p>

          <div className="mt-3">
            <TextareaField
              label={t('checkout.note')}
              rows={3}
              value={note}
              maxLength={500}
              counterMax={500}
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
          </div>
        </Card>

        <Card className="mt-4">
          <dl className="grid gap-1 text-sm">
            <div className="flex justify-between">
              <dt>{t('cart.subtotal')}</dt>
              <dd>{formatMoney(cart.totals.subtotal, currency, language)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('cart.shipping')}</dt>
              <dd>
                {cart.totals.shipping === 0
                  ? t('cart.freeShipping')
                  : formatMoney(cart.totals.shipping, currency, language)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('checkout.items')}</dt>
              <dd>{formatNumber(cart.totals.itemCount, language)}</dd>
            </div>
          </dl>
          <Divider />
          <div className="flex justify-between text-base font-semibold">
            <span>{t('cart.total')}</span>
            <span>{formatMoney(cart.totals.total, currency, language)}</span>
          </div>
          <p className="mt-1 text-2xs text-muted">{t('checkout.totalHint')}</p>

          <Button
            className="mt-4 w-full"
            disabled={!cart.canCheckout || chosen.length === 0 || checkout.isPlacing}
            onClick={() => {
              void confirm();
            }}
          >
            {t('checkout.placeOrder')}
          </Button>
        </Card>
      </div>
    </>
  );
}
