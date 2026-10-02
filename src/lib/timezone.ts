export function storeTimezone(name: unknown, offset: unknown): string {
  if (typeof name === "string" && name) {
    try { new Intl.DateTimeFormat("en", { timeZone: name }); return name; } catch { /* Try the configured offset. */ }
  }
  const hours = Number(offset);
  if (!Number.isFinite(hours) || Math.abs(hours) > 14) throw new Error("Invalid store timezone");
  const minutes = Math.round(Math.abs(hours) * 60);
  return minutes === 0 ? "UTC" : `${hours < 0 ? "-" : "+"}${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function storeDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Find midnight in the store, including daylight saving changes, then query GMT instants. */
export function storeDayStart(day: string, timeZone: string) {
  const center = Date.parse(`${day}T00:00:00Z`);
  let low = center - 2 * 86400000;
  let high = center + 2 * 86400000;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (storeDate(new Date(mid), timeZone) < day) low = mid + 1;
    else high = mid;
  }
  if (storeDate(new Date(low), timeZone) !== day) throw new Error("This date does not exist in the store timezone.");
  return new Date(low);
}

export function storeDateBounds(from: string, to: string, timeZone: string) {
  const next = new Date(`${to}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { after: storeDayStart(from, timeZone).toISOString().slice(0, 19),
    before: new Date(storeDayStart(next.toISOString().slice(0, 10), timeZone).getTime() - 1000).toISOString().slice(0, 19) };
}
