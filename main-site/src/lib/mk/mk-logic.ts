import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Croissant,
  Home,
  Pencil,
  Pill,
  Plug,
  Scissors,
  Shirt,
  ShoppingBasket,
  Sparkles,
  Store,
  UtensilsCrossed,
} from 'lucide-react';

/**
 * Pure rules for the cash-on-delivery marketplace. Nothing here touches the
 * network or the DOM: the database is the authority, and this module exists so
 * the screens show the same rules the database enforces, before a round trip.
 *
 * Money is always integer poisha (100 poisha = 1 taka) and is shown as taka.
 */

export type Language = 'bn' | 'en';

export const SHOP_TYPES = [
  'grocery',
  'restaurant',
  'bakery',
  'pharmacy',
  'electronics',
  'fashion',
  'beauty',
  'stationery',
  'home_kitchen',
  'books',
  'handicraft',
  'other',
] as const;
export type ShopType = (typeof SHOP_TYPES)[number];

export const AGREEMENT_KEYS = [
  'terms',
  'privacy',
  'vendor_policy',
  'cod_policy',
  'self_delivery',
  'accuracy',
] as const;
export type AgreementKey = (typeof AGREEMENT_KEYS)[number];

export const ORDER_STATUSES = [
  'placed',
  'accepted',
  'packaged',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Bangladesh bounding box used by the database for every pinned location. */
export const BD_BOUNDS = { latMin: 20.5, latMax: 26.7, lngMin: 88.0, lngMax: 92.7 } as const;
export const BD_CENTER = { lat: 23.685, lng: 90.3563 } as const;
export const SYLHET_CENTER = { lat: 24.8949, lng: 91.8687 } as const;

export const DELIVERY_FEE_POISHA_DEFAULT = 15000;

/** Taka label with Bangla or English digits and grouping. Whole taka drop the decimals. */
export function formatTaka(poisha: number, language: Language): string {
  const negative = poisha < 0;
  const absolute = Math.abs(Math.round(poisha));
  const taka = Math.floor(absolute / 100);
  const paisa = absolute % 100;
  const locale = language === 'bn' ? 'bn-BD' : 'en-BD';
  const body = new Intl.NumberFormat(locale, {
    minimumFractionDigits: paisa === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paisa === 0 ? taka : taka + paisa / 100);
  return `${negative ? '-' : ''}৳${body}`;
}

/** Strips spaces, dashes and the +880 / 880 country prefix from a mobile number. */
export function normaliseBdMobile(input: string): string {
  const digits = input.replace(/[\s-]/g, '');
  if (digits.startsWith('+880')) return `0${digits.slice(4)}`;
  if (digits.startsWith('880') && digits.length === 13) return `0${digits.slice(3)}`;
  return digits;
}

export function isBdMobile(input: string): boolean {
  return /^01[3-9][0-9]{8}$/.test(normaliseBdMobile(input));
}

export function isNid(input: string): boolean {
  return /^(?:[0-9]{10}|[0-9]{13}|[0-9]{17})$/.test(input.trim());
}

export function isTxnId(input: string): boolean {
  const value = input.trim();
  return value.length >= 4 && value.length <= 40;
}

export function isBdPoint(lat: number | null, lng: number | null): boolean {
  if (lat === null || lng === null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= BD_BOUNDS.latMin &&
    lat <= BD_BOUNDS.latMax &&
    lng >= BD_BOUNDS.lngMin &&
    lng <= BD_BOUNDS.lngMax
  );
}

export function isHttpsUrl(input: string): boolean {
  if (input.trim() === '') return false;
  try {
    return new URL(input).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Great-circle distance in kilometres, unrounded (matches bsdc.mk_distance_km in SQL). */
export function rawDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Great-circle distance in kilometres, rounded to 2 dp (matches mk_km in SQL). */
export function distanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  return Math.round(rawDistanceKm(from, to) * 100) / 100;
}

/** Rounded-up whole kilometres (matches ceil(bsdc.mk_distance_km(...)) in SQL). */
export function roundedDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  return Math.max(0, Math.ceil(rawDistanceKm(from, to)));
}

/** The three chips an address can be given, in the order the editor shows them. */
export const ADDRESS_LABELS = ['home', 'work', 'other'] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

/** `mk_save_address` refuses a ninth row, so a form that knows this never offers one. */
export const ADDRESS_MAX = 8;
export const ADDRESS_LINE_MIN = 5;
export const ADDRESS_LINE_MAX = 240;
export const RECIPIENT_NAME_MIN = 2;
export const RECIPIENT_NAME_MAX = 80;
export const ADDRESS_NICKNAME_MAX = 40;

export function isAddressLabel(input: string): input is AddressLabel {
  return (ADDRESS_LABELS as readonly string[]).includes(input);
}

/**
 * What a basket must be worth at this shop, and what is missing.
 *
 * Compared against the goods subtotal and never against the total, exactly as `mk_place_order`
 * does: the delivery charge is not something the customer bought, so a 150 taka ride must not be
 * able to carry a 200 taka basket past a 300 taka minimum. A screen that got this wrong would let
 * an order through to a routine that refuses it, which is the one arrangement worse than no gate.
 */
export function evaluateMinimumOrder(
  subtotalPoisha: number,
  minOrderPoisha: number | undefined,
): { required: boolean; met: boolean; shortfallPoisha: number } {
  const min = Math.max(0, minOrderPoisha ?? 0);
  if (min === 0) return { required: false, met: true, shortfallPoisha: 0 };
  if (subtotalPoisha >= min) return { required: true, met: true, shortfallPoisha: 0 };
  return { required: true, met: false, shortfallPoisha: min - subtotalPoisha };
}

/**
 * The checks `mk_save_address` makes, in the order it makes them, so an editor refuses what the
 * database refuses and never lets a member submit a form the routine will send back. The phone is
 * judged after `normaliseBdMobile`, because the routine strips the separators too — a member who
 * types 01712-345678 has given a valid number, and telling them otherwise is the bug.
 */
export function addressDraftErrors(draft: {
  name: string;
  phone: string;
  address: string;
  nickname?: string;
  label?: string;
  pin: { lat: number; lng: number } | null;
}): {
  name: boolean;
  phone: boolean;
  address: boolean;
  nickname: boolean;
  pin: boolean;
  label: boolean;
} {
  const name = draft.name.trim();
  const line = draft.address.trim();
  return {
    name: name.length < RECIPIENT_NAME_MIN || name.length > RECIPIENT_NAME_MAX,
    phone: !isBdMobile(normaliseBdMobile(draft.phone)),
    address: line.length < ADDRESS_LINE_MIN || line.length > ADDRESS_LINE_MAX,
    nickname: (draft.nickname ?? '').trim().length > ADDRESS_NICKNAME_MAX,
    pin: draft.pin === null || !isBdPoint(draft.pin.lat, draft.pin.lng),
    // Its own key, not folded into the pin: a label the table will not accept is a different
    // mistake from a missing location, and an editor that reports it under the map is an editor
    // whose red text points at the wrong half of the form.
    label: draft.label !== undefined && !isAddressLabel(draft.label),
  };
}

export function addressDraftValid(draft: Parameters<typeof addressDraftErrors>[0]): boolean {
  return !Object.values(addressDraftErrors(draft)).some(Boolean);
}

/**
 * A saved row read back into the checkout's form, so picking a door fills every field the shop
 * needs and the member changes only what changed. The pin keeps the address's own `place_label`
 * rather than the search text that happened to be on screen: the label is printed on the order.
 */
export function savedAddressToDraft(address: {
  customer_name: string;
  customer_phone: string;
  address_line: string;
  landmark: string;
  place_label: string;
  lat: number;
  lng: number;
  note: string;
}): {
  name: string;
  phone: string;
  address: string;
  landmark: string;
  note: string;
  pin: { lat: number; lng: number; label: string };
} {
  return {
    name: address.customer_name,
    phone: address.customer_phone,
    address: address.address_line,
    landmark: address.landmark,
    note: address.note,
    pin: { lat: address.lat, lng: address.lng, label: address.place_label },
  };
}

/**
 * Evaluates a shop's 3-mode delivery charge and radius eligibility for an optional
 * customer pin, matching `bsdc.mk_compute_delivery_fee` and `mk_place_order` in SQL.
 */
export function evaluateShopDelivery(
  delivery:
    | {
        scope: 'radius' | 'all_bd';
        radius_km: number;
        fee_mode?: 'default' | 'fixed' | 'per_km';
        fee_poisha: number;
        fixed_fee_poisha?: number;
        per_km_rate_poisha?: number;
        default_fee_poisha?: number;
        center_lat: number;
        center_lng: number;
      }
    | undefined,
  pin: { lat: number; lng: number } | null,
): {
  feePoisha: number;
  roundedKm: number | null;
  withinArea: boolean;
  needsPinForFee: boolean;
} {
  if (!delivery) {
    return {
      feePoisha: DELIVERY_FEE_POISHA_DEFAULT,
      roundedKm: null,
      withinArea: true,
      needsPinForFee: false,
    };
  }
  const mode = delivery.fee_mode ?? 'fixed';
  const center = { lat: delivery.center_lat, lng: delivery.center_lng };
  const roundedKm = pin ? roundedDistanceKm(center, pin) : null;
  const withinArea =
    delivery.scope === 'all_bd' || roundedKm === null || roundedKm <= delivery.radius_km;

  if (mode === 'per_km') {
    const rate = Math.max(0, delivery.per_km_rate_poisha ?? 0);
    if (roundedKm === null) {
      return { feePoisha: 0, roundedKm: null, withinArea, needsPinForFee: true };
    }
    return {
      feePoisha: roundedKm * rate,
      roundedKm,
      withinArea,
      needsPinForFee: false,
    };
  }

  if (mode === 'fixed') {
    return {
      feePoisha: Math.max(0, delivery.fixed_fee_poisha ?? delivery.fee_poisha),
      roundedKm,
      withinArea,
      needsPinForFee: false,
    };
  }

  return {
    feePoisha: Math.max(
      0,
      delivery.default_fee_poisha ?? delivery.fee_poisha ?? DELIVERY_FEE_POISHA_DEFAULT,
    ),
    roundedKm,
    withinArea,
    needsPinForFee: false,
  };
}

export const DAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export function defaultDayHoursMap(): Record<
  DayKey,
  { open: boolean; start: string; end: string }
> {
  return {
    '0': { open: true, start: '09:00', end: '22:00' },
    '1': { open: true, start: '09:00', end: '22:00' },
    '2': { open: true, start: '09:00', end: '22:00' },
    '3': { open: true, start: '09:00', end: '22:00' },
    '4': { open: true, start: '09:00', end: '22:00' },
    '5': { open: true, start: '09:00', end: '22:00' },
    '6': { open: true, start: '09:00', end: '22:00' },
  };
}

export function isValidHhMm(value: string, allow24 = false): boolean {
  if (allow24 && value === '24:00') return true;
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
}

/** Formats 24-hour "HH:MM" into friendly 12-hour EN/BN clock text. */
export function formatHhMm(hhmm: string, language: Language): string {
  const [hStr = '0', mStr = '00'] = hhmm.split(':');
  const rawHour = Number(hStr);
  const minute = Number(mStr);
  if (!Number.isFinite(rawHour) || !Number.isFinite(minute)) return hhmm;
  const normalized = rawHour % 24;
  const isPm = normalized >= 12 && rawHour !== 24;
  const hour12 = normalized % 12 === 0 ? 12 : normalized % 12;
  const locale = language === 'bn' ? 'bn-BD' : 'en-BD';
  const hFmt = new Intl.NumberFormat(locale).format(hour12);
  const mFmt = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(minute);
  if (language === 'bn') {
    return `${hFmt}:${mFmt} ${isPm ? 'অপরাহ্ণ' : 'পূর্বাহ্ণ'}`;
  }
  return `${hFmt}:${mFmt} ${isPm ? 'PM' : 'AM'}`;
}

/** Field-level error codes. The screens turn codes into bilingual copy. */
export type FieldError =
  | 'required'
  | 'name_short'
  | 'nid_invalid'
  | 'mobile_invalid'
  | 'address_short'
  | 'location_outside_bd'
  | 'type_missing'
  | 'agreement_missing'
  | 'package_missing'
  | 'txn_invalid'
  | 'holder_short'
  | 'sender_invalid'
  | 'licence_long';

export interface ApplicationDraft {
  fullName: string;
  nid: string;
  mobile: string;
  shopName: string;
  shopType: ShopType | '';
  addressLine: string;
  lat: number | null;
  lng: number | null;
  placeLabel: string;
  tradeLicenceNo: string;
  agreements: Record<AgreementKey, boolean>;
  packageCode: '10' | '50' | '100' | '';
  paymentSender: string;
  paymentHolder: string;
  paymentTxnId: string;
}

export const EMPTY_APPLICATION: ApplicationDraft = {
  fullName: '',
  nid: '',
  mobile: '',
  shopName: '',
  shopType: '',
  addressLine: '',
  lat: null,
  lng: null,
  placeLabel: '',
  tradeLicenceNo: '',
  agreements: {
    terms: false,
    privacy: false,
    vendor_policy: false,
    cod_policy: false,
    self_delivery: false,
    accuracy: false,
  },
  packageCode: '',
  paymentSender: '',
  paymentHolder: '',
  paymentTxnId: '',
};

export const WIZARD_STEPS = [
  'identity',
  'shop',
  'location',
  'agreements',
  'package',
  'payment',
  'review',
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Errors for the fields a step owns. An empty object means the step may advance. */
export function stepErrors(
  step: WizardStep,
  draft: ApplicationDraft,
): Partial<Record<string, FieldError>> {
  const errors: Partial<Record<string, FieldError>> = {};
  switch (step) {
    case 'identity':
      if (draft.fullName.trim().length < 2) errors.fullName = 'name_short';
      if (!isNid(draft.nid)) errors.nid = 'nid_invalid';
      if (!isBdMobile(draft.mobile)) errors.mobile = 'mobile_invalid';
      break;
    case 'shop':
      if (draft.shopName.trim().length < 2) errors.shopName = 'name_short';
      if (draft.shopType === '') errors.shopType = 'type_missing';
      if (draft.tradeLicenceNo.trim().length > 60) errors.tradeLicenceNo = 'licence_long';
      break;
    case 'location':
      if (!isBdPoint(draft.lat, draft.lng)) errors.location = 'location_outside_bd';
      if (draft.addressLine.trim().length < 5) errors.addressLine = 'address_short';
      break;
    case 'agreements':
      for (const key of AGREEMENT_KEYS) {
        if (!draft.agreements[key]) {
          errors[key] = 'agreement_missing';
        }
      }
      break;
    case 'package':
      if (draft.packageCode === '') errors.packageCode = 'package_missing';
      break;
    case 'payment':
      if (!isBdMobile(draft.paymentSender)) errors.paymentSender = 'sender_invalid';
      if (draft.paymentHolder.trim().length < 2) errors.paymentHolder = 'holder_short';
      if (!isTxnId(draft.paymentTxnId)) errors.paymentTxnId = 'txn_invalid';
      break;
    case 'review':
      for (const s of WIZARD_STEPS.slice(0, -1)) {
        Object.assign(errors, stepErrors(s, draft));
      }
      break;
  }
  return errors;
}

export function canAdvance(step: WizardStep, draft: ApplicationDraft): boolean {
  return Object.keys(stepErrors(step, draft)).length === 0;
}

/** What a vendor can do next to an order, given where it is now. */
export function vendorActionsFor(status: OrderStatus): readonly OrderStatus[] {
  switch (status) {
    case 'placed':
      return ['accepted', 'cancelled'];
    case 'accepted':
      return ['packaged', 'cancelled'];
    case 'packaged':
      return ['out_for_delivery', 'cancelled'];
    case 'out_for_delivery':
      return ['delivered', 'cancelled'];
    default:
      return [];
  }
}

/** Position of a status on the customer's tracking timeline (0 to 4). Cancelled is off the line. */
export function timelineIndex(status: OrderStatus): number {
  switch (status) {
    case 'placed':
      return 0;
    case 'accepted':
      return 1;
    case 'packaged':
      return 2;
    case 'out_for_delivery':
      return 3;
    case 'delivered':
      return 4;
    case 'cancelled':
      return -1;
  }
}

export type CreditState = 'healthy' | 'low' | 'empty';

export function creditState(credits: number): CreditState {
  if (credits <= 0) return 'empty';
  if (credits < 5) return 'low';
  return 'healthy';
}

/** A customer may cancel only while the shop has not accepted the order. */
export function customerCanCancel(status: OrderStatus): boolean {
  return status === 'placed';
}

/** A review is allowed only after delivery. */
export function customerCanReview(status: OrderStatus, alreadyReviewed: boolean): boolean {
  return status === 'delivered' && !alreadyReviewed;
}

/**
 * The icon for a shop type.
 *
 * These were emoji, which render as one of three different pictures depending on
 * the member's device, sit on a baseline chosen by the font rather than the layout,
 * announce themselves as words to a screen reader, and cannot inherit the theme
 * colour. `pencil` was the worst of them: it is a text-presentation glyph that some
 * Android builds draw as a bare monochrome outline and others as a colour image.
 *
 * A Lucide component is a vector that inherits `currentColor`, lines up with the
 * text beside it, and is `aria-hidden` by default. Kept as a map of components
 * rather than a switch so a new shop type is a compile error here, not a blank
 * square at runtime.
 */
export const SHOP_TYPE_ICONS: Record<ShopType, LucideIcon> = {
  grocery: ShoppingBasket,
  restaurant: UtensilsCrossed,
  bakery: Croissant,
  pharmacy: Pill,
  electronics: Plug,
  fashion: Shirt,
  beauty: Sparkles,
  stationery: Pencil, // was an emoji with a text-presentation variant
  home_kitchen: Home,
  books: BookOpen,
  handicraft: Scissors,
  other: Store,
};

/**
 * The ~640px variant of a picture, if the shop recorded one.
 *
 * `image_variants` is keyed by the original URL rather than by array position, so
 * a catalogue whose pictures were reordered still resolves the right variant.
 * Anything unusable — a missing map, a key that is not in `images`, a value that
 * is not an https link — resolves to `''`, which `MediaImage` reads as "no lighter
 * copy, use the original". Returning the original here would defeat the point of
 * the lookup by making two different-looking answers identical.
 */
export function variantFor(
  images: readonly string[],
  variants: Record<string, string> | null | undefined,
  url: string,
): string {
  if (variants === null || variants === undefined) return '';
  if (!images.includes(url)) return '';
  const variant = variants[url];
  if (typeof variant !== 'string') return '';
  const trimmed = variant.trim();
  if (!trimmed.startsWith('https://') || trimmed === url) return '';
  return trimmed;
}
