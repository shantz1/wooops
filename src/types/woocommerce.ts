export type KnownOrderStatus = "pending" | "processing" | "on-hold" | "completed" | "cancelled" | "refunded" | "failed" | "trash";
/** Extensions can register custom statuses, so any string may arrive from WooCommerce. */
export type WooOrderStatus = KnownOrderStatus | (string & {});

export interface WooMeta { id: number; key: string; value: unknown; display_key?: string; display_value?: unknown; }
export interface WooAddress {
  first_name: string; last_name: string; company?: string; address_1?: string; address_2?: string;
  city?: string; state?: string; postcode?: string; country?: string; email?: string; phone?: string;
}
export interface WooLineItem {
  id: number; name: string; product_id?: number; variation_id?: number; quantity: number;
  subtotal: string; subtotal_tax?: string; total: string; total_tax?: string; sku?: string; price?: number | string;
  meta_data?: WooMeta[]; image?: { id: number; src: string };
}
export interface WooOrder {
  id: number; number: string; status: WooOrderStatus; currency: string; total: string; date_created: string;
  date_created_gmt?: string; date_modified?: string; date_paid?: string | null; date_paid_gmt?: string | null; date_completed?: string | null;
  prices_include_tax?: boolean; discount_total?: string; discount_tax?: string; shipping_total?: string; shipping_tax?: string;
  cart_tax?: string; total_tax?: string; payment_method?: string; payment_method_title?: string; transaction_id?: string;
  customer_id: number; customer_note?: string; created_via?: string;
  billing: WooAddress & { email: string; phone: string }; shipping: WooAddress;
  line_items: WooLineItem[];
  shipping_lines?: Array<{ id: number; method_title: string; method_id?: string; total: string; total_tax?: string }>;
  fee_lines?: Array<{ id: number; name: string; total: string; total_tax?: string }>;
  coupon_lines?: Array<{ id: number; code: string; discount: string; discount_tax?: string }>;
  tax_lines?: Array<{ id: number; label: string; rate_code?: string; tax_total: string; shipping_tax_total: string }>;
  refunds?: Array<{ id: number; reason: string; total: string }>;
}
export interface WooOrderNote { id: number; author: string; date_created: string; date_created_gmt?: string; note: string; customer_note: boolean; }
export interface WooProduct { id:number; name:string; status:string; sku:string; price:string; regular_price:string; sale_price:string; stock_quantity:number|null; stock_status:string; manage_stock:boolean; images:Array<{id:number;src:string;alt:string}>; }
export interface WooCustomer { id:number; first_name:string; last_name:string; email:string; role:string; username:string; date_created:string; orders_count?:number; total_spent?:string; billing?:{phone?:string;city?:string;state?:string;country?:string}; }
