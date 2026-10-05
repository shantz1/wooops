"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { defaultPrefs, parsePrefs, serializePrefs, type CollectionPrefs } from "./collection-prefs.ts";

export interface UseCollectionPrefsReturn {
  prefs: CollectionPrefs;
  /** False until stored preferences have been read, so server and first client render match. */
  ready: boolean;
  update: (next: (current: CollectionPrefs) => CollectionPrefs) => void;
}

/**
 * List preferences (columns, density, saved views) kept in this browser's localStorage, separately for each signed-in user,
 * so saved searches never carry over to another account that uses the same browser. `userId` is null until it is known.
 * Column arrays may be passed inline; they are compared by content, so they never cause a reload loop.
 */
export function useCollectionPrefs(storageKey: string, allColumns: string[], defaultColumns: string[], userId: string | null): UseCollectionPrefsReturn {
  const [prefs, setPrefs] = useState<CollectionPrefs>(() => defaultPrefs(defaultColumns));
  const [ready, setReady] = useState(false);
  const current = useRef(prefs);
  const columnsKey = `${allColumns.join("|")}#${defaultColumns.join("|")}`;
  const key = `panel:collection:${userId ?? "unknown"}:${storageKey}`;

  useEffect(() => {
    if (userId === null) return;
    queueMicrotask(() => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(key);
        // Earlier versions stored one shared copy for everyone using this browser; it is never read again.
        localStorage.removeItem(`panel:collection:${storageKey}`);
      } catch { /* Storage can be unavailable; defaults still work. */ }
      // Column names never contain "|" or "#", so the key can be split back into the two lists.
      const [all, defaults] = columnsKey.split("#").map(part => (part ? part.split("|") : []));
      const parsed = parsePrefs(stored, all, defaults);
      current.current = parsed;
      setPrefs(parsed);
      setReady(true);
    });
  }, [key, columnsKey, userId, storageKey]);

  const update = useCallback((next: (value: CollectionPrefs) => CollectionPrefs) => {
    if (userId === null) return;
    const updated = next(current.current);
    current.current = updated;
    setPrefs(updated);
    try { localStorage.setItem(key, serializePrefs(updated)); } catch { /* Not saved, but the page still works. */ }
  }, [key, userId]);

  return { prefs, ready, update };
}
