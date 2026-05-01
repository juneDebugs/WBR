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
      callbackUrl: '/dashboard',
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
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#f0f0f5]">
      {/* macOS-style mesh gradient background */}
      <div className="absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[#c7b4f7] opacity-40 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-[#7eb8f7] opacity-40 blur-[120px]" />
        <div className="absolute top-[30%] right-[20%] w-[40%] h-[40%] rounded-full bg-[#f7b4d4] opacity-30 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-[380px] mx-4">
        {/* Frosted glass card */}
        <div className="backdrop-blur-2xl bg-white/70 rounded-2xl shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_8px_40px_rgba(0,0,0,0.12)] p-8">

          {/* Header */}
          <div className="text-center mb-7">
            <img src="/icons/icon-192.png" alt="WBR" className="w-16 h-16 object-contain mx-auto mb-4" />
            <h1 className="text-[20px] font-semibold text-gray-900 tracking-tight">Conference Admin</h1>
            <p className="text-[13px] text-gray-400 mt-1">Organizer access only</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50/80 backdrop-blur border border-red-200/60 text-red-600 text-[13px] rounded-xl px-3.5 py-2.5 mb-5">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[13px] font-medium text-gray-500 mb-1.5">Email</label>
              <input
                name="email"
                type="email"
                required
                placeholder="organizer@example.com"
                className="w-full px-3.5 py-2.5 bg-white/60 backdrop-blur border border-gray-200/80 rounded-xl text-[14px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#6366f1]/30 focus:border-[#6366f1]/40 transition-all"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-gray-500 mb-1.5">Password</label>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter your password"
                  className="w-full px-3.5 py-2.5 bg-white/60 backdrop-blur border border-gray-200/80 rounded-xl text-[14px] text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#6366f1]/30 focus:border-[#6366f1]/40 transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-b from-[#6e6ce8] to-[#5754d4] text-white font-medium text-[14px] py-2.5 rounded-xl hover:from-[#6260e0] hover:to-[#4f4cc8] active:from-[#5a58d8] active:to-[#4946c0] transition-all disabled:opacity-50 shadow-[0_1px_3px_rgba(99,102,241,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200/60" /></div>
            <div className="relative flex justify-center"><span className="bg-white/70 backdrop-blur px-3 text-[11px] text-gray-400 uppercase tracking-wider">or</span></div>
          </div>

          <button
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 bg-white/60 backdrop-blur border border-gray-200/80 rounded-xl text-[14px] font-medium text-gray-600 hover:bg-white/90 hover:border-gray-300/80 active:bg-gray-50/80 transition-all"
          >
            <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>

          {/* Demo accounts */}
          <div className="mt-5 bg-gray-100/50 backdrop-blur rounded-xl p-3.5 text-[12px] text-gray-400 space-y-1">
            <p className="font-medium text-gray-500 mb-1.5">Demo accounts</p>
            <p><span className="text-gray-400">Admin:</span> <span className="text-gray-500">june@tailor.tech / admin123</span></p>
            <p><span className="text-gray-400">Staff:</span> <span className="text-gray-500">staff@wbr.com / staff123</span></p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-gray-400 mt-5">WBR 2027 Conference</p>
      </div>
    </div>
  )
}
