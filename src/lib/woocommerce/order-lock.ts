/**
 * Runs `work` for an order one at a time inside this server process. Used so two refund requests for the same order
 * (for example a double click) cannot both pass the "already refunded?" check. A deployment with several server
 * processes would need a shared lock instead.
 *
 * When `work` fails in a way where the store may still be finishing it (a timeout, say), `holdAfter` says how long the
 * lock stays held after the error, so a retry waits and then re-reads the store instead of racing the first request.
 * The caller still gets the error immediately.
 */
const locks = new Map<string, Promise<unknown>>();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function withOrderLock<T>(key: string, work: () => Promise<T>, holdAfter: (error: unknown) => number = () => 0): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(work);
  const tail = run.then(() => undefined, error => sleep(holdAfter(error)));
  locks.set(key, tail);
  tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return run;
}
