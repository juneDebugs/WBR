'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const form = e.currentTarget
    const result = await signIn('credentials', {
      email: (form.elements.namedItem('email') as HTMLInputElement).value,
      password: (form.elements.namedItem('password') as HTMLInputElement).value,
      callbackUrl: '/home',
      redirect: false,
    })
    if (result?.error) {
      setError('Invalid email or password.')
      setLoading(false)
    } else if (result?.url) {
      window.location.href = result.url
    }
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: '#f2f2f7' }}>
      {/* Top gradient area with logo */}
      <div className="relative pt-16 pb-12 px-6 text-center">
        {/* Soft ambient blobs */}
        <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] rounded-full opacity-30 blur-[80px]" style={{ background: '#6366f1' }} />
        <div className="absolute top-[-10%] right-[-20%] w-[60%] h-[60%] rounded-full opacity-20 blur-[80px]" style={{ background: '#818cf8' }} />

        <div className="relative">
          <img
            src="/icons/icon-192.png"
            alt="WBR"
            className="w-[88px] h-[88px] object-contain mx-auto mb-5 drop-shadow-lg"
          />
          <h1 className="text-[28px] font-bold tracking-tight text-gray-900">WBR 2027</h1>
          <p className="text-[15px] text-gray-500 mt-1.5">Your conference companion</p>
        </div>
      </div>

      {/* Form area */}
      <div className="flex-1 px-5 pb-8">
        {/* Grouped input fields — iOS Settings style */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ background: 'white' }}>
          {error && (
            <div className="px-4 py-3 bg-red-50 flex items-center gap-2.5 border-b border-red-100">
              <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[13px] text-red-600">Invalid email or password.</p>
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="flex items-center px-4 py-0 border-b border-gray-100">
              <label className="text-[15px] font-normal text-gray-900 w-20 flex-shrink-0">Email</label>
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                autoCapitalize="none"
                autoCorrect="off"
                className="flex-1 py-3.5 text-[15px] text-gray-900 placeholder:text-gray-300 focus:outline-none bg-transparent"
              />
            </div>
            <div className="flex items-center px-4 py-0">
              <label className="text-[15px] font-normal text-gray-900 w-20 flex-shrink-0">Password</label>
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Required"
                className="flex-1 py-3.5 text-[15px] text-gray-900 placeholder:text-gray-300 focus:outline-none bg-transparent"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="p-1 text-gray-300">
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Sign In button */}
            <div className="px-4 pt-5 pb-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-[14px] rounded-[14px] text-[17px] font-semibold text-white transition-all active:scale-[0.97] disabled:opacity-50"
                style={{ background: 'linear-gradient(180deg, #6366f1 0%, #4f46e5 100%)' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4.5 h-4.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in...
                  </span>
                ) : 'Sign In'}
              </button>
            </div>
          </form>
        </div>

        {/* Google sign-in — separate grouped row */}
        <div className="mt-4 rounded-2xl overflow-hidden shadow-sm bg-white">
          <button
            onClick={() => signIn('google', { callbackUrl: '/home' })}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 text-[15px] font-medium text-gray-700 active:bg-gray-50 transition-colors"
          >
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        </div>

        {/* Demo accounts — iOS grouped list style */}
        <div className="mt-6">
          <p className="text-[13px] font-normal text-gray-400 uppercase tracking-wide px-4 mb-1.5">Demo Accounts</p>
          <div className="rounded-2xl overflow-hidden shadow-sm bg-white divide-y divide-gray-100">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[15px] text-gray-900">Attendee</p>
                  <p className="text-[12px] text-gray-400">steph@curry.com</p>
                </div>
              </div>
              <span className="text-[12px] text-gray-300 font-mono">stephcurry</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <p className="text-[15px] text-gray-900">Sponsor (Tailor)</p>
                  <p className="text-[12px] text-gray-400">june@tailor.tech</p>
                </div>
              </div>
              <span className="text-[12px] text-gray-300 font-mono">admin123</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[15px] text-gray-900">Staff</p>
                  <p className="text-[12px] text-gray-400">staff@wbr.com</p>
                </div>
              </div>
              <span className="text-[12px] text-gray-300 font-mono">staff123</span>
            </div>
          </div>
        </div>

        <p className="text-[12px] text-gray-400 text-center mt-6 px-8 leading-relaxed">
          By signing in you agree to the conference terms of use and privacy policy.
        </p>
      </div>
    </div>
  )
}
