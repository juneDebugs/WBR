/**
 * In-memory stale-while-revalidate cache.
 *
 * L1 cache that sits in the Node.js process — lookups are ~0ms.
 * After TTL expires, stale data is served instantly while a background
 * refresh runs, so every request after the first cold-start is sub-1ms.
 */

const store = new Map<string, { data: unknown; ts: number }>()

/**
 * Return cached data if fresh. If stale, return stale data immediately
 * and refresh in the background. Only blocks on a true cache miss.
 */
export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = store.get(key)
  const now = Date.now()

  if (entry) {
    if (now - entry.ts < ttlMs) {
      // Fresh — serve from memory
      return Promise.resolve(entry.data as T)
    }
    // Stale — serve old data, refresh in background
    fn()
      .then(d => store.set(key, { data: d, ts: Date.now() }))
      .catch(() => {}) // keep stale on failure
    return Promise.resolve(entry.data as T)
  }

  // Cold miss — must await
  return fn().then(d => {
    store.set(key, { data: d, ts: Date.now() })
    return d
  })
}

/** Invalidate all entries whose key contains the given substring. */
export function invalidate(pattern: string) {
  for (const k of store.keys()) {
    if (k.includes(pattern)) store.delete(k)
  }
}
