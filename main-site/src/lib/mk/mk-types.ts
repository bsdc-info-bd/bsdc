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
}

// Customer side ---------------------------------------------------------------

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
}

export interface MkProductDetail {
  id: string;
  name: string;
  description: string;
  price_poisha: number;
  in_stock: boolean;
  stock: number;
  images: string[];
  vendor: { slug: string; name: string };
  rating: number;
}

export interface MkCartLine {
  product_id: string;
  qty: number;
  product_name: string;
  price_poisha: number;
  stock: number;
  product_status: string;
  orderable: boolean;
  vendor_id: string;
  vendor_slug: string;
  vendor_name: string;
  line_total: number;
  image_url: string;
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
