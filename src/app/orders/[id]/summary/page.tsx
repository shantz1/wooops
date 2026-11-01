import { OrderSummaryPrint } from "@/components/order-summary-print";

/** Printable order summary. Rendered without the app shell so only the summary prints. */
export default async function OrderSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderSummaryPrint key={id} id={id} />;
}
