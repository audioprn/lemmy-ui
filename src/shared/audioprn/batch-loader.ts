// audioprn: loads per-post data (credits, reactions) for every post on a page in one request.
import { isBrowser } from "@utils/browser";

export function batchLoader<T>(
  fetchMany: (ids: number[]) => Promise<Map<number, T>>,
  empty: T,
) {
  const cache = new Map<number, T>();
  const listeners = new Set<() => void>();
  let queued = new Set<number>();
  const notify = () => listeners.forEach(fn => fn());

  return {
    get: (id: number): T => cache.get(id) ?? empty,
    set(id: number, value: T) {
      cache.set(id, value);
      notify();
    },
    /** Queues a post; posts queued in the same tick share one request. */
    request(id: number) {
      if (!isBrowser() || cache.has(id) || queued.has(id)) return;
      queued.add(id);
      if (queued.size > 1) return;
      setTimeout(async () => {
        const ids = [...queued];
        queued = new Set();
        ids.forEach(i => cache.set(i, empty));
        try {
          (await fetchMany(ids)).forEach((value, i) => cache.set(i, value));
        } catch {
          // Nothing shown if the request fails.
        }
        notify();
      });
    },
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
