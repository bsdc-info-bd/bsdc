import type { OrderStatus } from '@/lib/market/market-types';
import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type {
  LedgerEntryRow,
  MyShopRow,
  PayoutAccountRow,
  ShopOrderRow,
  ShopPayoutRow,
  ShopProductRow,
} from '@/lib/supabase/types';
import type {
  LedgerEntry,
  PayoutRequest,
  ProductDraft,
  ShopDashboard,
  ShopOrder,
  ShopProduct,
} from './vendor-types';

function toDashboard(row: MyShopRow): ShopDashboard {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    logoUrl: row.logo_url,
    commissionBps: row.commission_bps,
    shippingFlat: row.shipping_flat,
    freeShippingOver: row.free_shipping_over,
    ratingSum: row.rating_sum,
    ratingCount: row.rating_count,
    ordersCount: row.orders_count,
    productCount: row.product_count,
    openOrders: row.open_orders,
    balance: row.balance,
    lifetimeSales: row.lifetime_sales,
    suspensionReason: row.suspension_reason,
  };
}

function toOrder(row: ShopOrderRow): ShopOrder {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    total: row.total,
    currency: row.currency,
    itemCount: row.item_count,
    recipient: row.recipient,
    phone: row.phone,
    addressLine: row.address_line,
    city: row.city,
    placedAt: row.placed_at,
    nextStatuses: row.next_statuses,
  };
}

function toProduct(row: ShopProductRow): ShopProduct {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    price: row.price,
    currency: row.currency,
    stock: row.stock,
    isDigital: row.is_digital,
    soldCount: row.sold_count,
    ratingSum: row.rating_sum,
    ratingCount: row.rating_count,
    updatedAt: row.updated_at,
  };
}

function toEntry(row: LedgerEntryRow): LedgerEntry {
  return {
    id: row.id,
    kind: row.kind,
    amount: row.amount,
    memo: row.memo,
    createdAt: row.created_at,
  };
}

function toPayout(row: ShopPayoutRow): PayoutRequest {
  return {
    id: row.id,
    amount: row.amount,
    status: row.status,
    reference: row.reference,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    method: row.method,
    accountTail: row.account_tail,
  };
}

/** The signed-in person's shop, or null when they do not run one yet. */
export async function fetchMyShop(): Promise<ShopDashboard | null> {
  const { data, error } = await getSupabase().rpc('my_shop').returns<MyShopRow[]>();
  if (error) throw toDataError(error);
  const row = (data ?? [])[0];
  return row ? toDashboard(row) : null;
}

export async function fetchShopOrders(limit = 50): Promise<ShopOrder[]> {
  const { data, error } = await getSupabase()
    .rpc('shop_orders', { p_limit: limit })
    .returns<ShopOrderRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toOrder);
}

export async function fetchShopProducts(limit = 100): Promise<ShopProduct[]> {
  const { data, error } = await getSupabase()
    .rpc('shop_products', { p_limit: limit })
    .returns<ShopProductRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toProduct);
}

export async function fetchLedger(limit = 60): Promise<LedgerEntry[]> {
  const { data, error } = await getSupabase()
    .rpc('shop_ledger_entries', { p_limit: limit })
    .returns<LedgerEntryRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toEntry);
}

export async function fetchPayouts(limit = 30): Promise<PayoutRequest[]> {
  const { data, error } = await getSupabase()
    .rpc('shop_payouts', { p_limit: limit })
    .returns<ShopPayoutRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toPayout);
}

export async function fetchPayoutAccounts(shopId: string): Promise<PayoutAccountRow[]> {
  const { data, error } = await getSupabase()
    .from('payout_accounts')
    .select('*')
    .eq('shop_id', shopId)
    .order('is_default', { ascending: false })
    .returns<PayoutAccountRow[]>();
  if (error) throw toDataError(error);
  return data ?? [];
}

export interface OpenShopInput {
  slug: string;
  name: string;
  tagline: string;
  city: string;
}

export async function openShop(input: OpenShopInput): Promise<string> {
  const { data, error } = await getSupabase().rpc('open_shop', {
    p_slug: input.slug,
    p_name: input.name,
    p_tagline: input.tagline,
    p_city: input.city,
  });
  if (error) throw toDataError(error);
  return data;
}

/** The only way a vendor moves an order; the database re-checks the move. */
export async function advanceOrder(
  orderId: string,
  status: OrderStatus,
  note = '',
): Promise<OrderStatus> {
  const { data, error } = await getSupabase().rpc('advance_order', {
    p_order_id: orderId,
    p_status: status,
    p_note: note,
  });
  if (error) throw toDataError(error);
  return data;
}

export async function markOrderPaid(orderId: string, reference = ''): Promise<void> {
  const { error } = await getSupabase().rpc('mark_order_paid', {
    p_order_id: orderId,
    p_reference: reference,
  });
  if (error) throw toDataError(error);
}

export async function createProduct(shopId: string, draft: ProductDraft): Promise<string> {
  const { data, error } = await getSupabase()
    .from('products')
    .insert({
      shop_id: shopId,
      slug: draft.slug,
      title: draft.title,
      summary: draft.summary,
      description: draft.description,
      price: draft.price,
      stock: draft.isDigital ? 0 : draft.stock,
      category: draft.category,
      is_digital: draft.isDigital,
      images: draft.images,
    })
    .select('id')
    .single();
  if (error) throw toDataError(error);
  return data.id;
}

export async function publishProduct(productId: string, publish: boolean): Promise<string> {
  const { data, error } = await getSupabase().rpc('publish_product', {
    p_product_id: productId,
    p_publish: publish,
  });
  if (error) throw toDataError(error);
  return data;
}

/** Additive: a delta, never a replacement, so two tabs cannot lose a count. */
export async function restockProduct(productId: string, delta: number): Promise<number> {
  const { data, error } = await getSupabase().rpc('restock_product', {
    p_product_id: productId,
    p_delta: delta,
  });
  if (error) throw toDataError(error);
  return data;
}

export async function requestPayout(accountId: string, amount: number): Promise<string> {
  const { data, error } = await getSupabase().rpc('request_payout', {
    p_account_id: accountId,
    p_amount: amount,
  });
  if (error) throw toDataError(error);
  return data;
}

export interface PayoutAccountInput {
  shopId: string;
  method: PayoutAccountRow['method'];
  accountName: string;
  accountRef: string;
  bankName: string;
  branch: string;
}

export async function savePayoutAccount(input: PayoutAccountInput): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('payout_accounts').insert({
    shop_id: input.shopId,
    method: input.method,
    account_name: input.accountName,
    account_ref: input.accountRef,
    bank_name: input.bankName,
    branch: input.branch,
    is_default: true,
  });
  if (error) throw toDataError(error);
}
