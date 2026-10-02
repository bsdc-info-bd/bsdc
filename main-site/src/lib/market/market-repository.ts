import { getSupabase } from '@/lib/supabase/client';
import { toDataError } from '@/lib/supabase/errors';
import type {
  AddressRow,
  CartLineRow,
  CatalogProductRow,
  MyOrderRow,
  OrderItemRow,
  OrderRow,
  PlacedOrderRow,
  ProductReviewRow,
  ProductRow,
  ShopRow,
} from '@/lib/supabase/types';
import type {
  CartLine,
  CatalogProduct,
  CatalogSort,
  OrderSummary,
  PaymentMethod,
  PlacedOrder,
} from './market-types';

function toProduct(row: CatalogProductRow): CatalogProduct {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    imageUrl: row.image_url,
    price: row.price,
    priceOriginal: row.price_original,
    currency: row.currency,
    stock: row.stock,
    isDigital: row.is_digital,
    category: row.category,
    ratingSum: row.rating_sum,
    ratingCount: row.rating_count,
    soldCount: row.sold_count,
    shopId: row.shop_id,
    shopName: row.shop_name,
    shopSlug: row.shop_slug,
    wishlisted: row.wishlisted,
  };
}

export async function fetchCatalog(
  category: string | null = null,
  search: string | null = null,
  sort: CatalogSort = 'recent',
  limit = 40,
): Promise<CatalogProduct[]> {
  const { data, error } = await getSupabase()
    .rpc('product_catalog', {
      p_limit: limit,
      p_category: category,
      p_search: search,
      p_sort: sort,
    })
    .returns<CatalogProductRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toProduct);
}

export interface ProductDetail {
  product: ProductRow;
  shop: ShopRow;
  reviews: ProductReviewRow[];
}

export async function fetchProduct(slug: string): Promise<ProductDetail | null> {
  const supabase = getSupabase();

  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('slug', slug)
    .maybeSingle<ProductRow>();
  if (error) throw toDataError(error);
  if (product === null) return null;

  const [{ data: shop, error: shopError }, { data: reviews, error: reviewError }] =
    await Promise.all([
      supabase.from('shops').select('*').eq('id', product.shop_id).maybeSingle<ShopRow>(),
      supabase
        .from('product_reviews')
        .select('*')
        .eq('product_id', product.id)
        .order('created_at', { ascending: false })
        .limit(20)
        .returns<ProductReviewRow[]>(),
    ]);
  if (shopError) throw toDataError(shopError);
  if (reviewError) throw toDataError(reviewError);
  if (shop === null) return null;

  return { product, shop, reviews: reviews ?? [] };
}

// ---------------------------------- cart ------------------------------------

function toLine(row: CartLineRow): CartLine {
  return {
    productId: row.product_id,
    slug: row.slug,
    title: row.title,
    imageUrl: row.image_url,
    unitPrice: row.unit_price,
    currency: row.currency,
    quantity: row.quantity,
    available: row.available,
    lineTotal: row.line_total,
    shopId: row.shop_id,
    shopName: row.shop_name,
    inStock: row.in_stock,
  };
}

/** Prices here are read live from the products table, never cached locally. */
export async function fetchCart(): Promise<CartLine[]> {
  const { data, error } = await getSupabase().rpc('my_cart').returns<CartLineRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map(toLine);
}

export async function addToCart(productId: string, quantity = 1): Promise<number> {
  const { data, error } = await getSupabase().rpc('add_to_cart', {
    p_product_id: productId,
    p_quantity: quantity,
  });
  if (error) throw toDataError(error);
  return typeof data === 'number' ? data : 0;
}

export async function setCartQuantity(productId: string, quantity: number): Promise<void> {
  const { error } = await getSupabase().rpc('set_cart_quantity', {
    p_product_id: productId,
    p_quantity: quantity,
  });
  if (error) throw toDataError(error);
}

export async function clearCart(): Promise<void> {
  const { error } = await getSupabase().rpc('clear_cart');
  if (error) throw toDataError(error);
}

/** Shipping rules per shop, so the cart can show the same total as checkout. */
export async function fetchShippingRules(
  shopIds: string[],
): Promise<Map<string, { flat: number; freeOver: number | null }>> {
  const rules = new Map<string, { flat: number; freeOver: number | null }>();
  if (shopIds.length === 0) return rules;

  const { data, error } = await getSupabase()
    .from('shops')
    .select('id, shipping_flat, free_shipping_over')
    .in('id', shopIds)
    .returns<Pick<ShopRow, 'id' | 'shipping_flat' | 'free_shipping_over'>[]>();
  if (error) throw toDataError(error);

  for (const row of data ?? []) {
    rules.set(row.id, { flat: row.shipping_flat, freeOver: row.free_shipping_over });
  }
  return rules;
}

// -------------------------------- addresses ----------------------------------

export async function fetchAddresses(uid: string): Promise<AddressRow[]> {
  const { data, error } = await getSupabase()
    .from('addresses')
    .select('*')
    .eq('uid', uid)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
    .returns<AddressRow[]>();
  if (error) throw toDataError(error);
  return data ?? [];
}

export interface NewAddress {
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  district: string;
  postcode: string;
  isDefault: boolean;
}

export async function saveAddress(uid: string, address: NewAddress): Promise<AddressRow> {
  const supabase = getSupabase();

  // One default at a time: the partial unique index would refuse a second.
  if (address.isDefault) {
    const { error: clearError } = await supabase
      .from('addresses')
      .update({ is_default: false })
      .eq('uid', uid)
      .eq('is_default', true);
    if (clearError) throw toDataError(clearError);
  }

  const { data, error } = await supabase
    .from('addresses')
    .insert({
      uid,
      recipient: address.recipient,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      district: address.district,
      postcode: address.postcode,
      is_default: address.isDefault,
    })
    .select('*')
    .single<AddressRow>();
  if (error) throw toDataError(error);
  return data;
}

// --------------------------------- orders ------------------------------------

/** One order per shop. Amounts come back from Postgres, never from here. */
export async function placeOrder(
  addressId: string,
  method: PaymentMethod,
  note = '',
): Promise<PlacedOrder[]> {
  const { data, error } = await getSupabase()
    .rpc('place_order', {
      p_address_id: addressId,
      p_payment_method: method,
      p_note: note,
    })
    .returns<PlacedOrderRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    orderId: row.order_id,
    code: row.code,
    total: row.total,
  }));
}

export async function fetchOrders(limit = 30): Promise<OrderSummary[]> {
  const { data, error } = await getSupabase()
    .rpc('my_orders', { p_limit: limit })
    .returns<MyOrderRow[]>();
  if (error) throw toDataError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    total: row.total,
    currency: row.currency,
    itemCount: row.item_count,
    shopName: row.shop_name,
    placedAt: row.placed_at,
    canCancel: row.can_cancel,
    canReview: row.can_review,
  }));
}

export interface OrderDetail {
  order: OrderRow;
  items: OrderItemRow[];
}

export async function fetchOrder(orderId: string): Promise<OrderDetail | null> {
  const supabase = getSupabase();

  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle<OrderRow>();
  if (error) throw toDataError(error);
  if (order === null) return null;

  const { data: items, error: itemError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .returns<OrderItemRow[]>();
  if (itemError) throw toDataError(itemError);

  return { order, items: items ?? [] };
}

export async function cancelOrder(orderId: string, reason = ''): Promise<void> {
  const { error } = await getSupabase().rpc('cancel_order', {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw toDataError(error);
}

export async function submitReview(productId: string, rating: number, body = ''): Promise<string> {
  const { data, error } = await getSupabase().rpc('submit_review', {
    p_product_id: productId,
    p_rating: rating,
    p_body: body,
  });
  if (error) throw toDataError(error);
  return typeof data === 'string' ? data : '';
}

export async function toggleWishlist(productId: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('toggle_wishlist', {
    p_product_id: productId,
  });
  if (error) throw toDataError(error);
  return data === true;
}
