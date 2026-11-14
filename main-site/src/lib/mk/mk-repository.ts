import { getSupabase } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/types';
import type { OrderStatus } from './mk-logic';
import type {
  MkAdminApplication,
  MkAdminPurchase,
  MkListedShop,
  MkMyApplication,
  MkPaymentInstructions,
  MkVendorCatalog,
  MkVendorDashboard,
  MkVendorOrder,
  MkAddress,
  MkCartLine,
  MkCustomerOrder,
  MkPlacedOrder,
  MkProductDetail,
  MkVendorPageData,
} from './mk-types';

/**
 * Thin, typed calls to the mk_* RPCs. The database re-checks every rule; the
 * screens only pre-validate so the member gets an answer before a round trip.
 */

function asJson<T>(data: Json | null): T {
  return data as unknown as T;
}

export async function fetchPaymentInstructions(): Promise<MkPaymentInstructions> {
  const { data, error } = await getSupabase().rpc('mk_payment_instructions');
  if (error) throw error;
  return asJson<MkPaymentInstructions>(data);
}

export async function fetchMyApplication(): Promise<MkMyApplication | null> {
  const { data, error } = await getSupabase().rpc('mk_my_application');
  if (error) throw error;
  return asJson<MkMyApplication | null>(data);
}

export interface ApplicationSubmission {
  full_name: string;
  shop_name: string;
  nid_number: string;
  mobile: string;
  vendor_type: string;
  address_line: string;
  lat: number;
  lng: number;
  place_label: string;
  trade_license_no: string;
  package_code: string;
  agreements: Record<string, boolean>;
  payment_sender: string;
  payment_holder: string;
  payment_txn_id: string;
}

export async function submitVendorApplication(
  payload: ApplicationSubmission,
): Promise<{ application_id: string; status: string }> {
  const { data, error } = await getSupabase().rpc('mk_submit_vendor_application', {
    p: payload as unknown as Json,
  });
  if (error) throw error;
  return asJson<{ application_id: string; status: string }>(data);
}

export async function fetchVendorDashboard(): Promise<MkVendorDashboard> {
  const { data, error } = await getSupabase().rpc('mk_vendor_dashboard');
  if (error) throw error;
  return asJson<MkVendorDashboard>(data);
}

export async function fetchVendorOrders(
  status: OrderStatus | null = null,
): Promise<MkVendorOrder[]> {
  const { data, error } = await getSupabase().rpc('mk_vendor_orders', {
    p_status: status ?? '',
    p_limit: 100,
  });
  if (error) throw error;
  return asJson<MkVendorOrder[]>(data);
}

export async function setVendorOrderStatus(
  orderId: string,
  next: OrderStatus,
  reason = '',
): Promise<{ status: OrderStatus; credits_left: number }> {
  const { data, error } = await getSupabase().rpc('mk_vendor_set_order_status', {
    p_order_id: orderId,
    p_next: next,
    p_reason: reason,
  });
  if (error) throw error;
  return asJson<{ status: OrderStatus; credits_left: number }>(data);
}

export async function fetchVendorCatalog(): Promise<MkVendorCatalog> {
  const { data, error } = await getSupabase().rpc('mk_vendor_catalog');
  if (error) throw error;
  return asJson<MkVendorCatalog>(data);
}

export async function saveVendorCategory(
  id: string | null,
  name: string,
  sort: number,
): Promise<string> {
  const { data, error } = await getSupabase().rpc('mk_vendor_save_category', {
    p_id: id ?? null,
    p_name: name,
    p_sort: sort,
  });
  if (error) throw error;
  return data;
}

export interface ProductPayload {
  name: string;
  description: string;
  price_poisha: number;
  stock: number;
  status: 'draft' | 'active' | 'archived';
  category_id: string | null;
  images: string[];
}

export async function saveVendorProduct(
  id: string | null,
  payload: ProductPayload,
): Promise<string> {
  const { data, error } = await getSupabase().rpc('mk_vendor_save_product', {
    p_id: id ?? null,
    p: payload as unknown as Json,
  });
  if (error) throw error;
  return data;
}

export async function updateVendorProfile(payload: {
  description?: string;
  logo_url?: string;
  cover_url?: string;
  mobile?: string;
}): Promise<void> {
  const { error } = await getSupabase().rpc('mk_vendor_update_profile', {
    p: payload as unknown as Json,
  });
  if (error) throw error;
}

export async function buyCredits(
  packageCode: '10' | '50' | '100',
  sender: string,
  holder: string,
  txnId: string,
): Promise<{ purchase_id: string; status: string }> {
  const { data, error } = await getSupabase().rpc('mk_vendor_buy_credits', {
    p_package_code: packageCode,
    p_sender: sender,
    p_holder: holder,
    p_txn_id: txnId,
  });
  if (error) throw error;
  return asJson<{ purchase_id: string; status: string }>(data);
}

export async function listShops(
  type: string | null,
  query: string,
  origin: { lat: number; lng: number } | null,
): Promise<MkListedShop[]> {
  const { data, error } = await getSupabase().rpc('mk_list_vendors', {
    p_type: type ?? null,
    p_query: query,
    p_lat: origin?.lat ?? null,
    p_lng: origin?.lng ?? null,
    p_limit: 40,
  });
  if (error) throw error;
  return asJson<MkListedShop[]>(data);
}

// Staff -----------------------------------------------------------------------

export async function listAdminApplications(status: string): Promise<MkAdminApplication[]> {
  const { data, error } = await getSupabase().rpc('mk_admin_list_applications', {
    p_status: status,
    p_limit: 100,
  });
  if (error) throw error;
  return asJson<MkAdminApplication[]>(data);
}

export async function decideApplication(
  id: string,
  decision: 'approve' | 'reject',
  note: string,
): Promise<void> {
  const { error } = await getSupabase().rpc('mk_admin_decide_application', {
    p_application_id: id,
    p_decision: decision,
    p_note: note,
  });
  if (error) throw error;
}

export async function listAdminPurchases(status: string): Promise<MkAdminPurchase[]> {
  const { data, error } = await getSupabase().rpc('mk_admin_list_credit_purchases', {
    p_status: status,
    p_limit: 100,
  });
  if (error) throw error;
  return asJson<MkAdminPurchase[]>(data);
}

export async function decidePurchase(
  id: string,
  decision: 'approve' | 'reject',
  note: string,
): Promise<void> {
  const { error } = await getSupabase().rpc('mk_admin_decide_credit_purchase', {
    p_purchase_id: id,
    p_decision: decision,
    p_note: note,
  });
  if (error) throw error;
}

export async function setAdminSetting(
  key: 'bikash_number' | 'delivery_fee_poisha' | 'order_credit_price_poisha',
  value: string,
): Promise<void> {
  const { error } = await getSupabase().rpc('mk_admin_set_setting', { p_key: key, p_value: value });
  if (error) throw error;
}

export async function setAdminPackage(
  code: '10' | '50' | '100',
  orders: number,
  pricePoisha: number,
  isActive: boolean,
): Promise<void> {
  const { error } = await getSupabase().rpc('mk_admin_set_package', {
    p_code: code,
    p_orders: orders,
    p_price_poisha: pricePoisha,
    p_is_active: isActive,
  });
  if (error) throw error;
}

// Customer -------------------------------------------------------------------

export async function fetchVendorPage(slug: string): Promise<MkVendorPageData | null> {
  const { data, error } = await getSupabase().rpc('mk_vendor_page', { p_slug: slug });
  if (error) throw error;
  return asJson<MkVendorPageData | null>(data);
}

export async function fetchVendorRef(slug: string): Promise<string | null> {
  const { data, error } = await getSupabase().rpc('mk_vendor_ref', { p_slug: slug });
  if (error) throw error;
  return data ?? null;
}

export async function fetchProductDetail(productId: string): Promise<MkProductDetail | null> {
  const { data, error } = await getSupabase().rpc('mk_product_detail', { p_product_id: productId });
  if (error) throw error;
  return asJson<MkProductDetail | null>(data);
}

export async function setCartQty(productId: string, qty: number): Promise<number> {
  const { data, error } = await getSupabase().rpc('mk_cart_set', {
    p_product_id: productId,
    p_qty: qty,
  });
  if (error) throw error;
  return data;
}

export async function fetchMyCart(): Promise<MkCartLine[]> {
  const { data, error } = await getSupabase().rpc('mk_my_cart');
  if (error) throw error;
  return asJson<MkCartLine[]>(data);
}

export async function placeOrder(
  vendorId: string,
  address: MkAddress,
  directItems: { product_id: string; qty: number }[] | null,
): Promise<MkPlacedOrder> {
  const { data, error } = await getSupabase().rpc('mk_place_order', {
    p_vendor_id: vendorId,
    p_address: address as unknown as Json,
    p_items: directItems === null ? null : (directItems as unknown as Json),
  });
  if (error) throw error;
  return asJson<MkPlacedOrder>(data);
}

export async function fetchMyOrders(): Promise<MkCustomerOrder[]> {
  const { data, error } = await getSupabase().rpc('mk_my_orders', { p_limit: 40 });
  if (error) throw error;
  return asJson<MkCustomerOrder[]>(data);
}

export async function cancelMyOrder(orderId: string, reason: string): Promise<void> {
  const { error } = await getSupabase().rpc('mk_customer_cancel_order', {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function submitReview(orderId: string, rating: number, body: string): Promise<void> {
  const { error } = await getSupabase().rpc('mk_submit_review', {
    p_order_id: orderId,
    p_rating: rating,
    p_body: body,
  });
  if (error) throw error;
}
