/** Share only concurrent reads. Responses are discarded on settlement, never cached on disk. */
export function createReadPool() {
  type Entry = { controller: AbortController; promise: Promise<unknown>; users: number };
  const pending = new Map<string, Entry>();
  return {
    clear() { pending.clear(); },
    read<T>(key: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal | null): Promise<T> {
      if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
      let entry = pending.get(key);
      if (!entry) {
        const controller = new AbortController();
        entry = { controller, promise: Promise.resolve().then(() => load(controller.signal)), users: 0 };
        if (pending.size < 64) pending.set(key, entry);
        const current = entry;
        const cleanup = () => { if (pending.get(key) === current) pending.delete(key); };
        entry.promise.then(cleanup, cleanup);
      }
      const current = entry;
      current.users++;
      return new Promise<T>((resolve, reject) => {
        let done = false;
        const finish = (error: unknown, value?: unknown) => {
          if (done) return;
          done = true;
          signal?.removeEventListener("abort", abort);
          current.users--;
          if (current.users === 0) {
            current.controller.abort();
            if (pending.get(key) === current) pending.delete(key);
          }
          if (error) reject(error); else resolve(value as T);
        };
        const abort = () => finish(new DOMException("Aborted", "AbortError"));
        signal?.addEventListener("abort", abort, { once: true });
        current.promise.then(value => finish(null, value), error => finish(error));
      });
    },
  };
}
