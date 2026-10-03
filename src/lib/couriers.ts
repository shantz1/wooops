/**
 * Courier tracking-page templates. `{number}` is replaced with the URL-encoded tracking number.
 * Carriers change their sites, so every filled link stays editable and is shown to the user before saving.
 * Keep the list to public HTTPS tracking pages that accept the number in the URL.
 */
export interface Courier { name: string; aliases?: string[]; template: string }

export const couriers: Courier[] = [
  { name: "Aramex", template: "https://www.aramex.com/track/results?ShipmentNumber={number}" },
  { name: "Australia Post", aliases: ["auspost"], template: "https://auspost.com.au/mypost/track/details/{number}" },
  { name: "Blue Dart", aliases: ["bluedart"], template: "https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo={number}" },
  { name: "Canada Post", template: "https://www.canadapost-postescanada.ca/track-reperage/en#/details/{number}" },
  { name: "Delhivery", template: "https://www.delhivery.com/track-v2/package/{number}" },
  { name: "DHL Express", aliases: ["dhl"], template: "https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id={number}" },
  { name: "FedEx", template: "https://www.fedex.com/fedextrack/?trknbr={number}" },
  { name: "Royal Mail", template: "https://www.royalmail.com/track-your-item#/tracking-results/{number}" },
  { name: "Shiprocket", template: "https://shiprocket.co/tracking/{number}" },
  { name: "UPS", template: "https://www.ups.com/track?tracknum={number}" },
  { name: "USPS", template: "https://tools.usps.com/go/TrackConfirmAction?tLabels={number}" },
];

const normalise = (value: string) => value.trim().toLowerCase().replace(/[\s._-]+/g, "");

export function findCourier(name: string) {
  const key = normalise(name);
  if (!key) return null;
  return couriers.find(courier => normalise(courier.name) === key || courier.aliases?.some(alias => normalise(alias) === key)) || null;
}

/** The tracking link for a known courier, or "" when the courier is unknown or the number is empty. */
export function trackingLink(courierName: string, trackingNumber: string) {
  const courier = findCourier(courierName);
  const number = trackingNumber.trim();
  if (!courier || !number) return "";
  const link = courier.template.replace("{number}", encodeURIComponent(number));
  return link.startsWith("https://") && link.length <= 2048 ? link : "";
}
