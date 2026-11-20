export type PackageCode = '10' | '50' | '100';

export interface CreditPackage {
  readonly code: PackageCode;
  readonly orders: number;
  readonly price_poisha: number;
  readonly is_active: boolean;
}

export interface SetPackageArgs {
  readonly p_code: PackageCode;
  readonly p_orders: number;
  readonly p_price_poisha: number;
  readonly p_is_active: boolean;
}

export interface PackageDraft {
  readonly code: PackageCode;
  readonly orders: string;
  readonly priceTaka: string;
  readonly isActive: boolean;
}

export interface PackageDraftErrors {
  readonly orders?: string;
  readonly priceTaka?: string;
}

export type PackageDraftResult =
  | { readonly ok: true; readonly args: SetPackageArgs }
  | { readonly ok: false; readonly errors: PackageDraftErrors };

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const TAKA_AMOUNT = /^(?:(\d+)(?:\.(\d{0,2}))?|\.(\d{1,2}))$/;
const POSITIVE_INTEGER = /^[0-9]+$/;

/** Convert a decimal Taka input to integer poisha without floating-point rounding. */
export function takaToPoisha(input: string): number | null {
  const match = TAKA_AMOUNT.exec(input.trim());
  if (!match) return null;

  const wholeTaka = BigInt(match[1] ?? '0');
  const paisa = match[2] ?? match[3] ?? '';
  const poisha = wholeTaka * 100n + BigInt(paisa.padEnd(2, '0') || '0');
  if (poisha <= 0n || poisha > MAX_SAFE_INTEGER_BIGINT) return null;
  return Number(poisha);
}

/** Convert a safe integer amount of poisha to the editable decimal Taka representation. */
export function poishaToTakaInput(poisha: number): string {
  if (!Number.isSafeInteger(poisha) || poisha <= 0) return '';
  const amount = BigInt(poisha);
  const taka = amount / 100n;
  const paisa = Number(amount % 100n);
  return paisa === 0 ? taka.toString() : `${taka.toString()}.${String(paisa).padStart(2, '0')}`;
}

/** A compact price label using the same poisha boundary as the edit field. */
export function packagePriceLabel(poisha: number): string {
  const value = poishaToTakaInput(poisha);
  if (value === '') return '—';
  const [whole = '', fraction] = value.split('.');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `৳${groupedWhole}${fraction ? `.${fraction}` : ''}`;
}

export function positiveInteger(input: string): number | null {
  const normalized = input.trim();
  if (!POSITIVE_INTEGER.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Validate a package row and produce the exact PostgREST RPC argument names. */
export function packageSaveArgs(draft: PackageDraft): PackageDraftResult {
  const orders = positiveInteger(draft.orders);
  const pricePoisha = takaToPoisha(draft.priceTaka);
  const errors: { orders?: string; priceTaka?: string } = {};

  if (orders === null) errors.orders = 'Enter a whole number of orders greater than zero.';
  if (pricePoisha === null) {
    errors.priceTaka = 'Enter a price greater than ৳0 with no more than two decimal places.';
  }
  if (orders === null || pricePoisha === null) return { ok: false, errors };

  return {
    ok: true,
    args: {
      p_code: draft.code,
      p_orders: orders,
      p_price_poisha: pricePoisha,
      p_is_active: draft.isActive,
    },
  };
}

export interface MarketplaceErrorPresentation {
  readonly accessDenied: boolean;
  readonly title: string;
  readonly message: string;
}

/** Human-readable state used by both the initial-load panel and save notifications. */
export function marketplaceErrorPresentation(message: string): MarketplaceErrorPresentation {
  const accessDenied = /marketplace\.settings/i.test(message);
  return accessDenied
    ? {
        accessDenied: true,
        title: 'Access denied: marketplace settings',
        message:
          'This account does not have the marketplace.settings permission. Ask an owner to grant marketplace settings access.',
      }
    : {
        accessDenied: false,
        title: 'Marketplace packages could not be loaded',
        message: message || 'The request failed. Check the connection and retry.',
      };
}
