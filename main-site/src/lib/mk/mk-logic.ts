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

/** Great-circle distance in kilometres, rounded to 2 dp (matches mk_km in SQL). */
export function distanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(a)) * 100) / 100;
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

/** Maps a shop type to its emoji for cards. Keeps the list and the icons in one place. */
export const SHOP_TYPE_EMOJI: Record<ShopType, string> = {
  grocery: '🛒',
  restaurant: '🍽️',
  bakery: '🥐',
  pharmacy: '💊',
  electronics: '🔌',
  fashion: '👕',
  beauty: '💄',
  stationery: '✏️',
  home_kitchen: '🏠',
  books: '📚',
  handicraft: '🧵',
  other: '🏪',
};
