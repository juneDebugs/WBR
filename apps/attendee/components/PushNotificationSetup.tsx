'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'

export function PushNotificationSetup() {
  const { data: session } = useSession()

  useEffect(() => {
    if (!session?.user?.id || !('Notification' in window)) return

    async function setup() {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return

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
  }, [session?.user?.id])

  return null
}
