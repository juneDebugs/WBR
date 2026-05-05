'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'

export function PushNotificationSetup() {
  const { data: session } = useSession()
  const didRun = useRef(false)

  useEffect(() => {
    if (!session?.user?.id || !('Notification' in window)) return
    if (didRun.current) return
    didRun.current = true

    // Defer push setup so it never blocks page rendering or interactivity
    const schedule = typeof requestIdleCallback === 'function'
      ? requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 3000)

    schedule(() => {
      async function setup() {
        // Only proceed if permission was already granted — never prompt during navigation
        if (Notification.permission !== 'granted') return

        if (!('serviceWorker' in navigator)) return
        const registration = await navigator.serviceWorker.ready
        if (!registration.pushManager) return

        const subscription = await registration.pushManager.getSubscription()
        if (!subscription) return

        await fetch('/api/push-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: JSON.stringify(subscription) }),
        })
      }

      setup().catch(() => {})
    })
  }, [session?.user?.id])

  return null
}
