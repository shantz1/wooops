export type ReportOrder = { id: number; number: string; status: string; currency: string; total: string; date_created: string;
  date_created_gmt?: string; refunds?: Array<{ total: string }> };
export type ReportProduct = { id: number; name: string; sku: string; stock_status: string; manage_stock: boolean; stock_quantity: number | null };
export type ReportResponse = { timezone: string; timezone_warning: string | null; configured: boolean; kind: "orders" | "inventory"; total: number; loaded: number; complete: boolean;
  limit: number; generated_at: string; filters: { from?: string; to?: string; status?: string; stock?: string }; orders: ReportOrder[]; products: ReportProduct[] };
