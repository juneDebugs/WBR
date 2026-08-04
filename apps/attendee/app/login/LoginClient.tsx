'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  loginTitle: string
  loginSubtitle: string
  loginButtonText: string
}

/**
 * What a failed LinkedIn sign-in says on screen.
 *
 * Spelled the same as LINKEDIN_NO_EMAIL_ERROR in lib/auth.ts. Kept as a literal
 * rather than imported: this is a browser component and lib/auth.ts pulls in the
 * database client, which must not reach the browser bundle. Same reasoning as the
 * deep import in components/onboarding/OnboardingChecklist.tsx.
 */
const SIGN_IN_ERRORS: Record<string, string> = {
  LinkedInNoEmail:
    "LinkedIn didn't share an email address, so we couldn't sign you in. Use your email and password, or Google.",
  // F-27. Deliberately does not say whether an account exists for that address:
  // the message is shown to whoever pressed the button, and confirming that a
  // given address has an account here would tell them something they did not
  // already know. What it does say is what to do next.
  LinkedInUnverifiedEmail:
    "LinkedIn hasn't confirmed that email address, so we couldn't use it to sign you in. Use your email and password, or Google.",
}

export function LoginClient({ loginTitle, loginSubtitle, loginButtonText }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Whether to draw the LinkedIn button.
   *
   * Read at the browser, from the sign-in library's own list of registered
   * providers, and NOT decided while this page is rendered on the server. The
   * page above declares `revalidate = 3600`, so a decision taken during that
   * render is reused for up to an hour — long enough that turning the
   * credentials off would leave the button on screen, and long enough that a
   * test flipping them would assert nothing. The provider list is served per
   * request, so it always reflects what the running app has configured.
   *
   * Starts false, so the button is absent until the list says otherwise. The
   * wrong direction to fail in is showing a button that cannot work.
   *
   * Google is not treated this way. Its button is drawn unconditionally and
   * always has been; changing that is not this phase's work.
   */
  const [linkedInAvailable, setLinkedInAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    import('next-auth/react')
      .then(({ getProviders }) => getProviders())
      .then(providers => {
        if (!cancelled) setLinkedInAvailable(Boolean(providers?.linkedin))
      })
      .catch(() => {
        // Leave the button hidden. An unreachable provider list is not a reason
        // to offer a sign-in method that may not be registered.
      })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * A sign-in that failed inside the library redirects back here with a marker in
   * the address rather than a message, so it is turned into a sentence here.
   *
   * Read from window.location rather than through useSearchParams(), which in
   * this version of Next requires the component to sit inside a Suspense
   * boundary and would opt the whole login screen out of its caching.
   */
  useEffect(() => {
    const marker = new URLSearchParams(window.location.search).get('error')
    if (marker && SIGN_IN_ERRORS[marker]) setError(SIGN_IN_ERRORS[marker])
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const form = e.currentTarget
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(
          data?.error === 'Unauthorized role'
            ? "This account doesn't have access to the mobile app."
            : 'Invalid email or password.'
        )
        setLoading(false)
        return
      }
      router.push('/home')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #312e81 0%, #4338ca 35%, #6366f1 70%, #818cf8 100%)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <img src="/icons/icon-192.png" alt="WBR" className="w-20 h-20 object-contain mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white">{loginTitle}</h1>
          <p className="text-white/70 mt-2 text-sm">{loginSubtitle}</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-elevated">
          {error && (
            <div className="bg-danger-soft border border-danger/20 text-danger-ink text-sm rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="input"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                name="password"
                type="password"
                required
                placeholder="••••••••"
                className="input"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Signing in...' : loginButtonText}
            </button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-hairline" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-ink-3">or</span></div>
          </div>

          <button
            data-testid="signin-google"
            onClick={async () => {
              const { signIn } = await import('next-auth/react')
              signIn('google', { callbackUrl: '/home' })
            }}
            className="btn-secondary w-full"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>

          {/*
            Drawn only when the provider list names LinkedIn (FP 11, FP 31).
            Sends people to /home like Google does; anyone whose required set is
            incomplete is moved on to the checklist by the gate, so this button
            needs no knowledge of onboarding.
          */}
          {linkedInAvailable && (
            <button
              data-testid="signin-linkedin"
              onClick={async () => {
                const { signIn } = await import('next-auth/react')
                signIn('linkedin', { callbackUrl: '/home' })
              }}
              className="btn-secondary w-full mt-3"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true">
                <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 110-4.13 2.06 2.06 0 010 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
              </svg>
              Sign in with LinkedIn
            </button>
          )}
        </div>

        <div className="mt-6 bg-white/10 rounded-2xl p-4 text-xs">
          <p className="font-semibold text-white/90 mb-3">Demo accounts</p>
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-white/85">Brand</span>
              <span className="text-white/60">stephcurry@test.com / password123</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-white/85">Sponsor</span>
              <span className="text-white/60">sponsor@test.com / password123</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-white/85">WBR</span>
              <span className="text-white/60">wbr@test.com / password123</span>
            </div>
          </div>
        </div>

        <p className="text-white/40 text-xs text-center mt-4">
          By signing in you agree to the conference terms of use.
        </p>
      </div>
    </div>
  )
}
