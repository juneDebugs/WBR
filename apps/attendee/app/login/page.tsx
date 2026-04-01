'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const form = e.currentTarget
    const result = await signIn('credentials', {
      name: (form.elements.namedItem('name') as HTMLInputElement).value,
      email: (form.elements.namedItem('email') as HTMLInputElement).value,
      callbackUrl: '/schedule',
      redirect: false,
    })
    if (result?.error) {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    } else if (result?.url) {
      window.location.href = result.url
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-primary to-primary-dark px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">Conference App</h1>
          <p className="text-white/70 mt-2 text-sm">Your all-in-one conference companion</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-xl">
          {error && (
            <p className="text-red-500 text-sm mb-4 text-center">{error}</p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                name="name"
                type="text"
                required
                placeholder="Your full name"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Enter Conference'}
            </button>
          </form>
        </div>

        <p className="text-white/40 text-xs text-center mt-6">
          By signing in you agree to the conference terms of use.
        </p>
      </div>
    </div>
  )
}
