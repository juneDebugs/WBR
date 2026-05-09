'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'

export function DeleteSessionButton({ action, sessionId }: { action: () => Promise<void>; sessionId: string }) {
  const queryClient = useQueryClient()
  const router = useRouter()

  return (
    <button
      type="button"
      className="btn-danger text-sm"
      onClick={async () => {
        if (!confirm('Delete this session?')) return

        // Optimistic update: remove session from cache immediately
        queryClient.setQueryData(['sessions'], (old: any) => {
          if (!old) return old
          return {
            ...old,
            sessions: old.sessions.filter((s: any) => s.id !== sessionId),
            conflicts: old.conflicts.filter(
              (c: any) => c.sessionA.id !== sessionId && c.sessionB.id !== sessionId,
            ),
          }
        })

        // Navigate immediately
        router.push('/dashboard/sessions')

        // Fire server action in background (delete + conflict detection)
        action().then(() => {
          queryClient.invalidateQueries({ queryKey: ['sessions'] })
        })
      }}
    >
      Delete
    </button>
  )
}
