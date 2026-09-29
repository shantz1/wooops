export type WooOrderStatus =
  | "pending"
  | "processing"
  | "on-hold"
  | "completed"
  | "cancelled"
  | "refunded"
  | "failed"
  | "trash";

export interface WooOrder {
  id: number;
  number: string;
  status: WooOrderStatus;
  currency: string;
  total: string;
  date_created: string;
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
  line_items: Array<{ id: number; name: string; quantity: number; total: string }>;
}
