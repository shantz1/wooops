import { AddressLabel } from "@/components/address-label";

/** Printable shipping label. Rendered without the app shell so only the label prints. */
export default async function AddressLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AddressLabel key={id} id={id} />;
}
