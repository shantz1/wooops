export type Density = "comfortable" | "compact";

export interface SavedView {
  id: string;
  name: string;
  filters: Record<string, string>;
}

export interface CollectionPrefs {
  columns: string[];
  density: Density;
  views: SavedView[];
}

export const limits = {
  views: 12,
  nameLength: 40,
  filters: 10,
  filterKeyLength: 30,
  filterValueLength: 200,
};

const blockedKeys = new Set(["__proto__", "constructor", "prototype"]);

/** A filter key is a short lowercase name. Names that could touch an object's prototype are never accepted. */
export function validFilterKey(key: string) {
  return /^[a-z_]{1,30}$/.test(key) && !blockedKeys.has(key);
}

export function defaultPrefs(defaultColumns: string[]): CollectionPrefs {
  return {
    columns: [...defaultColumns],
    density: "comfortable",
    views: [],
  };
}

export function sanitizePrefs(
  raw: unknown,
  allColumns: string[],
  defaultColumns: string[]
): CollectionPrefs {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return defaultPrefs(defaultColumns);
  }

  const obj = raw as Record<string, unknown>;

  // Sanitize columns
  let columns: string[] = [];
  if (Array.isArray(obj.columns)) {
    const seen = new Set<string>();
    for (const col of allColumns) {
      if (obj.columns.includes(col) && !seen.has(col)) {
        columns.push(col);
        seen.add(col);
      }
    }
  }
  if (columns.length === 0) {
    columns = [...defaultColumns];
  }

  // Sanitize density
  const density: Density =
    obj.density === "compact" ? "compact" : "comfortable";

  // Sanitize views
  const views: SavedView[] = [];
  const seenIds = new Set<string>();
  if (Array.isArray(obj.views)) {
    for (const view of obj.views) {
      if (typeof view !== "object" || view === null || Array.isArray(view)) {
        continue;
      }
      const v = view as Record<string, unknown>;

      // Validate id: must be string, 1-40 chars, /^[a-z0-9-]+$/
      if (typeof v.id !== "string") continue;
      if (!/^[a-z0-9-]+$/.test(v.id)) continue;
      if (v.id.length < 1 || v.id.length > 40) continue;
      if (seenIds.has(v.id)) continue;

      // Validate name: must be string, trimmed, 1-40 chars
      if (typeof v.name !== "string") continue;
      const trimmedName = v.name.trim();
      if (trimmedName.length < 1 || trimmedName.length > limits.nameLength)
        continue;

      // Validate filters: must be plain object
      const filters: Record<string, string> = {};
      let hadFilterEntries = false;
      if (typeof v.filters === "object" && v.filters !== null && !Array.isArray(v.filters)) {
        const f = v.filters as Record<string, unknown>;
        const entries = Object.entries(f);
        hadFilterEntries = entries.length > 0;
        let filterCount = 0;
        for (const [key, value] of entries) {
          // Validate key: /^[a-z_]{1,30}$/
          if (!validFilterKey(key)) continue;
          // Validate value: must be string, at most filterValueLength
          if (typeof value !== "string") continue;
          if (value.length > limits.filterValueLength) continue;
          filters[key] = value;
          filterCount++;
          if (filterCount >= limits.filters) break;
        }
      }

      // Drop views that had filter entries but none of them were valid
      if (hadFilterEntries && Object.keys(filters).length === 0) continue;

      seenIds.add(v.id);
      views.push({ id: v.id, name: trimmedName, filters });
      if (views.length >= limits.views) break;
    }
  }

  return { columns, density, views };
}

export function newViewId(existing: SavedView[]): string {
  const usedIds = new Set(existing.map((v) => v.id));
  let counter = 1;
  while (usedIds.has(`v${counter}`)) {
    counter++;
  }
  return `v${counter}`;
}

export function addView(
  prefs: CollectionPrefs,
  name: string,
  filters: Record<string, string>
): { prefs: CollectionPrefs; error?: string } {
  const trimmedName = name.trim();

  if (trimmedName.length === 0) {
    return { prefs, error: "Give the view a name." };
  }

  if (trimmedName.length > limits.nameLength) {
    return { prefs, error: "Use 40 characters or fewer." };
  }

  // Check for duplicate name (case-insensitive)
  if (
    prefs.views.some(
      (v) => v.name.toLowerCase() === trimmedName.toLowerCase()
    )
  ) {
    return { prefs, error: "A view with that name already exists." };
  }

  if (prefs.views.length >= limits.views) {
    return { prefs, error: "You can save up to 12 views." };
  }

  // Filter out empty string values and restrict filters
  const cleanFilters: Record<string, string> = {};
  let filterCount = 0;
  for (const [key, value] of Object.entries(filters)) {
    if (value === "") continue;
    if (!validFilterKey(key)) continue;
    if (typeof value !== "string") continue;
    if (value.length > limits.filterValueLength) continue;
    cleanFilters[key] = value;
    filterCount++;
    if (filterCount >= limits.filters) break;
  }

  const newView: SavedView = {
    id: newViewId(prefs.views),
    name: trimmedName,
    filters: cleanFilters,
  };

  return {
    prefs: {
      ...prefs,
      views: [...prefs.views, newView],
    },
  };
}

export function removeView(prefs: CollectionPrefs, id: string): CollectionPrefs {
  const filtered = prefs.views.filter((v) => v.id !== id);
  if (filtered.length === prefs.views.length) {
    return prefs;
  }
  return {
    ...prefs,
    views: filtered,
  };
}

export function setColumns(
  prefs: CollectionPrefs,
  columns: string[],
  allColumns: string[],
  defaultColumns: string[]
): CollectionPrefs {
  let sanitized: string[] = [];
  const seen = new Set<string>();
  for (const col of allColumns) {
    if (columns.includes(col) && !seen.has(col)) {
      sanitized.push(col);
      seen.add(col);
    }
  }
  if (sanitized.length === 0) {
    sanitized = [...defaultColumns];
  }

  return {
    ...prefs,
    columns: sanitized,
  };
}

export function setDensity(
  prefs: CollectionPrefs,
  density: Density
): CollectionPrefs {
  return {
    ...prefs,
    density,
  };
}

/** True when both filter sets are the same after dropping empty values; key order does not matter. */
export function viewMatches(view: SavedView, filters: Record<string, string>): boolean {
  const clean = (input: Record<string, string>) =>
    Object.entries(input).filter(([, value]) => value !== "").sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const left = clean(view.filters);
  const right = clean(filters);
  return left.length === right.length && left.every(([key, value], index) => key === right[index][0] && value === right[index][1]);
}

export function serializePrefs(prefs: CollectionPrefs): string {
  return JSON.stringify(prefs);
}

export function parsePrefs(
  text: string | null,
  allColumns: string[],
  defaultColumns: string[]
): CollectionPrefs {
  if (text === null) {
    return defaultPrefs(defaultColumns);
  }

  try {
    const parsed = JSON.parse(text);
    return sanitizePrefs(parsed, allColumns, defaultColumns);
  } catch {
    return defaultPrefs(defaultColumns);
  }
}
