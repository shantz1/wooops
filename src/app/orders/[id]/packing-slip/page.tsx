import { PackingSlip } from "@/components/packing-slip";

/** Printable packing slip. Rendered without the app shell so only the slip prints. */
export default async function PackingSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PackingSlip key={id} id={id} />;
}
