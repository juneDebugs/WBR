/**
 * Simple in-memory sliding-window rate limiter.
 * Works well for single-server deployments; use Redis for multi-instance.
 */

interface Window {
  count: number
  resetAt: number
}

const store = new Map<string, Window>()

// Prune expired entries every 5 minutes to avoid memory leaks
setInterval(() => {
  const now = Date.now()
  Array.from(store.entries()).forEach(([key, win]) => {
    if (now > win.resetAt) store.delete(key)
  })
}, 5 * 60 * 1000)

/**
 * @param key      Unique key (e.g. `login:${ip}`)
 * @param limit    Max requests per window
 * @param windowMs Window size in milliseconds
 * @returns true if the request should be allowed, false if rate-limited
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const existing = store.get(key)

  if (!existing || now > existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (existing.count >= limit) return false
  existing.count++
  return true
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown'
}
