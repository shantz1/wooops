import { plainText } from "./format.ts";
import { storeLocalInstant } from "./timezone.ts";

export type TimelineKind = "placed" | "paid" | "completed" | "status" | "note-private" | "note-customer" | "shipment" | "refund";

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  /** ISO instant in UTC. */
  at: string;
  title: string;
  detail?: string;
  actor?: string;
  source: "order" | "note" | "shipment" | "refund";
  approximate?: boolean;
  dateOnly?: boolean;
}

export interface TimelineOrder {
  date_created?: string;
  date_created_gmt?: string;
  date_paid_gmt?: string | null;
  date_paid?: string | null;
  date_completed_gmt?: string | null;
  date_completed?: string | null;
  currency: string;
}

export interface TimelineNote {
  id: number;
  author: string;
  date_created_gmt?: string;
  date_created?: string;
  note: string;
  customer_note: boolean;
}

export interface TimelineShipment {
  id: string;
  carrier: string;
  tracking_number: string;
  tracking_url: string;
  shipped_at: string;
}

export interface TimelineRefund {
  id: number;
  date_created_gmt?: string;
  date_created?: string;
  reason: string;
  amount: string;
  refunded_by?: number | string;
  line_items?: Array<{ name: string; quantity: number }>;
}

export interface TimelineInput {
  order: TimelineOrder;
  notes: TimelineNote[];
  shipments: TimelineShipment[];
  refunds: TimelineRefund[];
  timeZone?: string;
}

const dedupeWindowMs = 120_000;
const detailLimit = 500;
const statusPattern = /^Order status changed from (.+?) to (.+?)\.?$/i;
const sourceRank: Record<TimelineEvent["source"], number> = { refund: 0, shipment: 1, note: 2, order: 3 };

/** Parses a WooCommerce or staff-entered timestamp, treating a value without a zone as UTC. */
function parseUtc(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  let text = value.trim().replace(" ", "T");
  if (!text || text.startsWith("0000-")) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text += "T00:00:00";
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) text += "Z";
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Picks GMT when valid; otherwise resolves the local value in the store timezone and marks it approximate.
 */
export function parseStoreInstant(gmt?: string, local?: string, timeZone = "UTC"): { iso: string; approximate: boolean } | null {
  const utc = parseUtc(gmt);
  if (utc !== null) return { iso: new Date(utc).toISOString(), approximate: false };
  const fallback = typeof local === "string" ? /(?:Z|[+-]\d{2}:?\d{2})$/i.test(local) ? parseUtc(local) : storeLocalInstant(local, timeZone)?.getTime() ?? null : null;
  return fallback === null ? null : { iso: new Date(fallback).toISOString(), approximate: true };
}

function noteDetail(text: string) {
  const plain = plainText(text ?? "");
  return plain.length > detailLimit ? `${plain.slice(0, detailLimit)}…` : plain;
}

function noteActor(author: string) {
  const name = (author ?? "").trim();
  return !name || /^(system|woocommerce)$/i.test(name) ? "Store system" : name;
}

function refundActor(by: unknown) {
  const id = typeof by === "number" ? by : typeof by === "string" && /^\d+$/.test(by.trim()) ? Number(by) : NaN;
  return Number.isInteger(id) && id > 0 ? `User #${id}` : undefined;
}

type Entry = { event: TimelineEvent; ms: number };

/**
 * Builds the order timeline from data the store already returns. Only events backed by a real date are created.
 * Exact system refund notes and completed status notes can be merged into richer records. A paid date is a
 * distinct event from a status change. Customer-facing and staff-authored private notes are never dropped.
 */
export function buildTimeline(input: TimelineInput): TimelineEvent[] {
  const { order, notes, shipments, refunds, timeZone = "UTC" } = input;
  const ids = new Set<string>();
  const entries: Entry[] = [];

  const add = (source: TimelineEvent["source"], sourceId: string | number, kind: TimelineKind, ms: number, at: { iso: string; approximate: boolean }, rest: { title: string; detail?: string; actor?: string }) => {
    const base = `${source}-${sourceId}-${kind}`;
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    const event: TimelineEvent = { id, kind, at: at.iso, title: rest.title, source };
    if (rest.detail) event.detail = rest.detail;
    if (rest.actor) event.actor = rest.actor;
    if (at.approximate) event.approximate = true;
    entries.push({ event, ms });
  };

  // Refunds, first so their ids and times are known for the note dedupe below.
  const refundTimes = new Map<number, number>();
  for (const refund of refunds) {
    const when = parseStoreInstant(refund.date_created_gmt, refund.date_created, timeZone);
    if (!when) continue;
    const ms = Date.parse(when.iso);
    refundTimes.set(refund.id, ms);
    const reason = (refund.reason ?? "").trim() || "No reason given";
    const items = (refund.line_items ?? []).map(item => `${item.name} × ${Math.abs(item.quantity)}`).join(", ");
    add("refund", refund.id, "refund", ms, when, {
      title: `Refund of ${refund.amount} ${order.currency}`,
      detail: items ? `${reason} · ${items}` : reason,
      actor: refundActor(refund.refunded_by),
    });
  }

  for (const shipment of shipments) {
    const when = parseStoreInstant(undefined, shipment.shipped_at, timeZone);
    if (!when) continue;
    const ms = Date.parse(when.iso);
    add("shipment", shipment.id, "shipment", ms, { iso: new Date(ms).toISOString(), approximate: true }, {
      title: `Shipped with ${shipment.carrier}`,
      detail: `Tracking ${shipment.tracking_number}`,
    });
    if (/^\d{4}-\d{2}-\d{2}$/.test(shipment.shipped_at)) entries[entries.length - 1].event.dateOnly = true;
  }

  // Note classification. Status notes are kept as the richer record for the paid and completed dates.
  const noteRecords = notes.flatMap(note => {
    const when = parseStoreInstant(note.date_created_gmt, note.date_created, timeZone);
    if (!when) return [];
    const ms = Date.parse(when.iso);
    const text = plainText(note.note ?? "");
    const match = note.customer_note ? null : statusPattern.exec(text.trim());
    const kind: TimelineKind = note.customer_note ? "note-customer" : match ? "status" : "note-private";
    return [{ note, text, when, ms, kind, target: match ? match[2].trim().toLowerCase() : "", from: match?.[1].trim() ?? "", to: match?.[2].trim() ?? "" }];
  });
  const statusNotes = noteRecords.filter(record => record.kind === "status");
  const statusNear = (targets: string[], ms: number) => statusNotes.some(record => targets.includes(record.target) && Math.abs(Date.parse(record.when.iso) - ms) <= dedupeWindowMs);

  for (const record of noteRecords) {
    const { note, kind } = record;
    // Refund notes duplicate the richer refund event. Customer-facing notes are never dropped.
    const refundId = /^Refunded\s+[^\n]+?\s+-\s+(?:ID|Refund ID):\s*(\d+)\b/i.exec(record.text.trim());
    const refundTime = refundId ? refundTimes.get(Number(refundId[1])) : undefined;
    if (kind !== "note-customer" && /^(system|woocommerce)$/i.test((note.author || "").trim()) && refundTime !== undefined && Math.abs(refundTime - record.ms) <= dedupeWindowMs) continue;
    const actor = noteActor(note.author);
    if (kind === "status") {
      add("note", note.id, "status", record.ms, record.when, { title: `Status changed: ${record.from} → ${record.to}`, actor });
    } else if (kind === "note-customer") {
      add("note", note.id, kind, record.ms, record.when, { title: "Note to customer", detail: noteDetail(note.note), actor });
    } else {
      add("note", note.id, kind, record.ms, record.when, { title: "Private note", detail: noteDetail(note.note), actor });
    }
  }

  const placed = parseStoreInstant(order.date_created_gmt, order.date_created, timeZone);
  if (placed) add("order", "order", "placed", Date.parse(placed.iso), placed, { title: "Order placed" });

  const paid = parseStoreInstant(order.date_paid_gmt ?? undefined, order.date_paid ?? undefined, timeZone);
  if (paid) {
    add("order", "order", "paid", Date.parse(paid.iso), paid, { title: "Payment recorded" });
  }

  const completed = parseStoreInstant(order.date_completed_gmt ?? undefined, order.date_completed ?? undefined, timeZone);
  if (completed && !statusNear(["completed"], Date.parse(completed.iso))) {
    add("order", "order", "completed", Date.parse(completed.iso), completed, { title: "Marked completed" });
  }

  entries.sort((a, b) => b.ms - a.ms || sourceRank[a.event.source] - sourceRank[b.event.source]);
  return entries.map(entry => entry.event);
}
