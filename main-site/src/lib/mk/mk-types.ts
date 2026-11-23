import type { OrderStatus, ShopType } from './mk-logic';

/** Shapes returned by the mk_* RPCs (migrations 0094 and 0095). Money is poisha. */

export interface MkPackage {
  code: '10' | '50' | '100';
  orders: number;
  price_poisha: number;
}

export interface MkPaymentInstructions {
  bikash_number: string;
  packages: MkPackage[];
  delivery_fee_poisha: number;
  order_credit_price_poisha: number;
}

export interface MkMyApplication {
  id: string;
  status: 'submitted' | 'approved' | 'rejected';
  shop_name: string;
  vendor_type: ShopType;
  package_code: string;
  review_note: string;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface MkVendorShop {
  slug: string;
  name: string;
  status: 'active' | 'suspended';
  vendor_type: ShopType;
  logo_url: string;
  cover_url: string;
  description: string;
  mobile: string;
  place_label: string;
}

export interface MkPurchase {
  id: string;
  package_code: string;
  orders: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface MkVendorDashboard {
  has_shop: boolean;
  vendor?: MkVendorShop;
  credits?: number;
  listed?: boolean;
  orders_pending?: number;
  orders_today?: number;
  delivered_poisha?: number;
  rating?: number;
  purchases?: MkPurchase[];
}

export interface MkOrderItem {
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
  image_url: string;
}

export interface MkVendorOrder {
  id: string;
  code: string;
  status: OrderStatus;
  subtotal_poisha: number;
  delivery_fee_poisha: number;
  total_poisha: number;
  payment_method: 'cash_on_delivery';
  customer_name: string;
  customer_phone: string;
  address_line: string;
  landmark: string;
  lat: number;
  lng: number;
  place_label: string;
  note: string;
  cancel_reason: string;
  cancelled_by: 'customer' | 'vendor' | null;
  placed_at: string;
  accepted_at: string | null;
  delivered_at: string | null;
  distance_km: number | null;
  items: MkOrderItem[];
}

export interface MkCatalogCategory {
  id: string;
  name: string;
  sort: number;
}

export interface MkCatalogProduct {
  id: string;
  name: string;
  description: string;
  price_poisha: number;
  stock: number;
  status: 'draft' | 'active' | 'archived';
  category_id: string | null;
  images: string[];
  /**
   * Original image URL -> ImgBB's ~640px variant of the same picture.
   *
   * Optional because a row written before migration 0116 has no map, and because a
   * picture ImgBB could not shrink has no entry. A caller that ignores it still
   * renders correctly, just with the full-size file.
   */
  image_variants?: Record<string, string>;
}

export interface MkVendorCatalog {
  categories: MkCatalogCategory[];
  products: MkCatalogProduct[];
}

export interface MkAdminApplication {
  id: string;
  owner_uid: string;
  full_name: string;
  shop_name: string;
  nid_number: string;
  mobile: string;
  vendor_type: ShopType;
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
  status: 'submitted' | 'approved' | 'rejected';
  review_note: string;
  submitted_at: string;
}

export interface MkAdminPurchase {
  id: string;
  owner_uid: string;
  vendor_id: string | null;
  package_code: string;
  orders: number;
  price_poisha: number;
  sender_number: string;
  account_holder: string;
  txn_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export type MkFeeMode = 'default' | 'fixed' | 'per_km';

export interface MkDayHours {
  open: boolean;
  start: string;
  end: string;
}

export interface MkShopSchedule {
  enabled: boolean;
  timezone: string;
  is_open: boolean;
  today_day: number;
  today_open: boolean;
  today_start: string;
  today_end: string;
  closes_at: string | null;
  next_open: { day: number; start: string } | null;
  days: Record<string, MkDayHours>;
}

/** A shop as a customer sees it on the marketplace (mk_list_vendors). */
export interface MkListedShop {
  slug: string;
  name: string;
  vendor_type: ShopType;
  logo_url: string;
  cover_url: string;
  place_label: string;
  lat: number;
  lng: number;
  distance_km: number | null;
  product_count: number;
  rating: number;
  review_count: number;
  delivery?: MkShopDelivery;
  schedule?: MkShopSchedule;
}

// Customer side ---------------------------------------------------------------

/** A shop's delivery area and charge, as shown to customers. */
export interface MkShopDelivery {
  scope: 'radius' | 'all_bd';
  radius_km: number;
  fee_mode?: MkFeeMode;
  fee_poisha: number;
  fixed_fee_poisha?: number;
  per_km_rate_poisha?: number;
  default_fee_poisha?: number;
  center_lat: number;
  center_lng: number;
  /**
   * The shop's minimum order, in poisha. It rides in the delivery block rather than beside it
   * because that is where `bsdc.mk_delivery_json` builds it: one function feeds the shop page, the
   * product page and the vendor console, and a fourth surface cannot forget to ask.
   */
  min_order_poisha?: number;
}

export interface MkVendorPageData {
  vendor: {
    slug: string;
    name: string;
    vendor_type: ShopType;
    description: string;
    logo_url: string;
    cover_url: string;
    place_label: string;
    lat: number;
    lng: number;
    delivery: MkShopDelivery;
    schedule?: MkShopSchedule;
  };
  categories: { id: string; name: string }[];
  products: MkStorefrontProduct[];
  rating: number;
  review_count: number;
}

export interface MkStorefrontProduct {
  id: string;
  slug: string;
  name: string;
  price_poisha: number;
  in_stock: boolean;
  category_id: string | null;
  image_url: string;
  /**
   * The ~640px variant of `image_url`, or `''` when the shop recorded none.
   *
   * A catalogue grid is the place this matters most: thirty cards on one screen,
   * each rendered from a slot a hundred and fifty pixels wide, was thirty
   * full-size downloads before this existed.
   */
  image_variant?: string;
}

export interface MkProductDetail {
  id: string;
  name: string;
  description: string;
  price_poisha: number;
  in_stock: boolean;
  stock: number;
  images: string[];
  /** See `MkCatalogProduct.image_variants`. */
  image_variants?: Record<string, string>;
  vendor: {
    slug: string;
    name: string;
    delivery?: MkShopDelivery;
    schedule?: MkShopSchedule;
  };
  rating: number;
}

/**
 * A doorstep the member saved once instead of typing again (0131). The field names are the order's
 * own — `customer_name`, `customer_phone`, `address_line` — because the row is read straight into a
 * checkout, and a rename in the middle would be one more place for the two to disagree.
 */
export interface MkSavedAddress {
  id: string;
  label: 'home' | 'work' | 'other';
  nickname: string;
  customer_name: string;
  customer_phone: string;
  address_line: string;
  landmark: string;
  place_label: string;
  lat: number;
  lng: number;
  note: string;
  is_default: boolean;
  times_used: number;
  last_used_at: string | null;
  created_at: string;
}

/** What `mk_save_address` takes. `id` null inserts; anything else updates that row. */
export interface MkAddressInput {
  id: string | null;
  label: 'home' | 'work' | 'other';
  nickname: string;
  customer_name: string;
  customer_phone: string;
  address_line: string;
  landmark: string;
  place_label: string;
  lat: number;
  lng: number;
  note: string;
  is_default: boolean;
}

export interface MkCartLine {
  product_id: string;
  qty: number;
  product_name: string;
  price_poisha: number;
  stock: number;
  product_status: string;
  orderable: boolean;
  vendor_open?: boolean;
  vendor_id: string;
  vendor_slug: string;
  vendor_name: string;
  line_total: number;
  image_url: string;
  /** What a basket at this shop must reach before the shop accepts the order. 0 = no minimum. */
  min_order_poisha?: number;
}

export interface MkPlacedOrder {
  order_id: string;
  code: string;
  status: 'placed';
  subtotal_poisha: number;
  delivery_fee_poisha: number;
  total_poisha: number;
  line_count: number;
}

export interface MkCustomerOrder {
  id: string;
  code: string;
  status: OrderStatus;
  total_poisha: number;
  delivery_fee_poisha: number;
  placed_at: string;
  delivered_at: string | null;
  vendor: { slug: string; name: string; logo_url: string };
  reviewed: boolean;
  items: { name: string; qty: number; line_total: number; image_url: string }[];
}

export interface MkAddress {
  customer_name: string;
  customer_phone: string;
  address_line: string;
  landmark: string;
  lat: number | null;
  lng: number | null;
  place_label: string;
  note: string;
}

export interface MkVendorReview {
  id: string;
  rating: number;
  body: string;
  created_at: string;
  order_id?: string;
  customer: {
    uid: string;
    display_name: string;
    username: string;
    avatar_url: string;
  };
}

export interface MkVendorReviewsResponse {
  vendor_id: string;
  vendor_slug: string;
  rating: number;
  review_count: number;
  reviews: MkVendorReview[];
}

export interface MkVendorDetails {
  vendor: {
    id: string;
    slug: string;
    name: string;
    vendor_type: ShopType;
    description: string;
    logo_url: string;
    cover_url: string;
    place_label: string;
    lat: number;
    lng: number;
    status: string;
    created_at: string;
    delivery: MkShopDelivery;
    schedule: MkShopSchedule | null;
  };
  rating: number;
  review_count: number;
  histogram: Record<string, number>;
  recent_reviews: MkVendorReview[];
}
