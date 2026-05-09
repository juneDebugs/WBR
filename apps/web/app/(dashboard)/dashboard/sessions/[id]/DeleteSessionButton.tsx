'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'

export function DeleteSessionButton({ action }: { action: () => Promise<void> }) {
  const queryClient = useQueryClient()
  const router = useRouter()

  return (
    <button
      type="button"
      className="btn-danger text-sm"
      onClick={async () => {
        if (!confirm('Delete this session?')) return
        await action()
        queryClient.invalidateQueries({ queryKey: ['sessions'] })
        router.push('/dashboard/sessions')
      }}
    >
      Delete
    </button>
  )
}
