'use client'

import { signOut, useSession } from 'next-auth/react'
import Image from 'next/image'

interface Props {
  title: string
}

export function AdminHeader({ title }: Props) {
  const { data: session } = useSession()

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-3">
        {session?.user?.name && (
          <span className="text-sm text-gray-500">{session.user.name}</span>
        )}
        {session?.user?.image ? (
          <Image
            src={session.user.image}
            alt={session.user.name ?? ''}
            width={32}
            height={32}
            className="rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-primary text-sm font-semibold">
              {session?.user?.name?.[0] ?? 'A'}
            </span>
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
