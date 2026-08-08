'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { clearPersistedQueryCache } from '@/lib/query-client'

const slides = [
  {
    src: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80',
    headline: 'Maximize Your\nSponsor Impact',
    subtitle: 'Manage your brand presence, meetings, and attendee discovery at WBR 2027',
  },
  {
    src: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1200&q=80',
    headline: 'Discover New\nOpportunities',
    subtitle: 'Connect with high-intent attendees actively seeking your solutions',
  },
  {
    src: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=1200&q=80',
    headline: 'Build Lasting\nPartnerships',
    subtitle: 'Turn conference conversations into long-term business relationships',
  },
]

/**
 * What a failed LinkedIn sign-in says on this screen.
 *
 * The keys are spelled the same as the markers in
 * packages/db/src/linkedin-identity.ts. Kept as literals rather than imported,
 * matching the other two login screens: this is a browser component, and
 * importing through lib/auth.ts would pull the database client into the browser
 * bundle.
 */
const SIGN_IN_ERRORS: Record<string, string> = {
  LinkedInNoEmail:
    "LinkedIn didn't share an email address, so we couldn't sign you in. Use your email and password, or Google.",
  // Deliberately does not say whether an account exists for that address.
  LinkedInUnverifiedEmail:
    "LinkedIn hasn't confirmed that email address, so we couldn't use it to sign you in. Use your email and password, or Google.",
  /**
   * UF-53, and the reason this portal names its refusal rather than falling back
   * to the library's generic screen.
   *
   * This portal is not open to the public: an account here belongs to a company
   * exhibiting at the event, and the organizer creates it. Someone who presses
   * the button without one has done nothing wrong and cannot fix it themselves,
   * so the message says who can. A generic refusal reads as a broken button and
   * sends them to support for the wrong reason.
   *
   * It does not say whether the address is known here, for the same reason the
   * unverified message does not.
   */
  LinkedInNoAccount:
    'The sponsor portal is open to exhibiting companies only, and there is no account here for that LinkedIn profile yet. Ask the event organizer to set one up, then sign in.',
}

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  /**
   * Erase this browser's stored copy of a company's portal data.
   *
   * Phase 13, added after adversarial review round 1. The Sign out button already
   * does this, and the review's point was that the button is not the only way a
   * session ends: it expires, it is invalidated, the cookie is deleted by hand, or
   * a future sign-out path is added that nobody remembers to wire up. Every one of
   * those routes arrives HERE, at the sign-in screen, so erasing on arrival covers
   * all of them at once and does not depend on anyone remembering.
   *
   * Safe to run unconditionally. Reaching this screen means no usable session:
   * middleware.ts sends a signed-in visitor straight to /dashboard, with the single
   * exception of the `?session=invalid` marker, which is exactly the case where a
   * token decodes but its account is gone — a case that should certainly clear.
   *
   * This page renders OUTSIDE the query provider, which is why it calls the plain
   * function rather than touching a query client. There is no in-memory cache here
   * to empty; the stored copy is all that is left.
   *
   * Failures are swallowed for the same reason as at the button: a browser that
   * refuses storage must not stop somebody signing in. The residual is stated
   * rather than hidden — in that case the data stays on the machine, which is the
   * situation this phase started from.
   */
  const erasePersisted = useRef<Promise<void> | null>(null)

  /**
   * Start the erase if it has not started, and return the promise either way.
   *
   * ONE INITIALISER, TWO CALLERS, and that is the point. Round 2's fix had the
   * effect start the erase and the submit handler `await` the ref. Round 3 caught
   * that a submit arriving before passive effects have flushed — fast autofill,
   * or an already-hydrated page — awaits `null`, which resolves instantly and
   * navigates with the erase never started. Awaiting a variable that might not be
   * set yet is not sequencing.
   *
   * Calling this twice is harmless: the second call returns the first promise.
   */
  const ensureErased = useCallback(() => {
    if (!erasePersisted.current) {
      erasePersisted.current = clearPersistedQueryCache().catch(() => {
        // Deliberately ignored — signing in must not depend on storage working.
      })
    }
    return erasePersisted.current
  }, [])

  useEffect(() => {
    void ensureErased()
  }, [ensureErased])
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [currentSlide, setCurrentSlide] = useState(0)

  /**
   * Whether to draw the LinkedIn button.
   *
   * Read at the browser from the sign-in library's own list of registered
   * providers, so it always reflects what the running portal has configured.
   * Starts false: the wrong direction to fail in is showing a button that
   * cannot work.
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
   * A sign-in refused inside the library comes back here with a marker in the
   * address rather than a message, so it is turned into a sentence here.
   *
   * Read from window.location rather than through useSearchParams(), which in
   * this version of Next requires a Suspense boundary around the component.
   */
  useEffect(() => {
    const marker = new URLSearchParams(window.location.search).get('error')
    if (marker && SIGN_IN_ERRORS[marker]) setError(SIGN_IN_ERRORS[marker])
  }, [])

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slides.length)
  }, [])

  useEffect(() => {
    const timer = setInterval(nextSlide, 5000)
    return () => clearInterval(timer)
  }, [nextSlide])

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
            ? "This account doesn't have access to the sponsor portal."
            : 'Invalid email or password.'
        )
        setLoading(false)
        return
      }
      // WAIT FOR THE ERASE BEFORE LEAVING THIS PAGE. Added after adversarial
      // review round 2.
      //
      // The effect above starts the erase and does not block, so a fast sign-in —
      // a password manager filling and submitting immediately — could reach
      // /dashboard before the delete finished. The portal's provider restores the
      // stored copy when it mounts there, and it accepts a copy up to 30 minutes
      // old, so the previous company's data could be pulled straight back into
      // memory by the very sign-in that was supposed to have replaced it.
      //
      // The promise never rejects — the initialiser already swallowed any storage
      // failure — so this can only delay the navigation, never block it.
      //
      // ensureErased() rather than the ref: round 3 caught that a submit arriving
      // before the effect has run would await `null` and navigate immediately.
      await ensureErased()
      router.push('/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[#1a1a2e]">
      {/* Left panel — slideshow */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Phase 4: imagery rendering disabled to stop serving 428KB of hot-linked Unsplash
            assets on first load. Block preserved (commented) for quick re-enablement.
            Before re-enabling, see PRD §6 Phase 4 follow-up: prefer optimized local copies
            (WebP, responsive sizes, lazy loading) over the original Unsplash hot-links. */}
        {/*
        {slides.map((slide, i) => (
          <img
            key={i}
            src={slide.src}
            alt={`Slide ${i + 1}`}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
              i === currentSlide ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ))}
        */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/60 via-primary/30 to-[#1a1a2e]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a2e] via-transparent to-transparent" />
        <div className="absolute bottom-16 left-10 right-10">
          {slides.map((slide, i) => (
            <div
              key={i}
              className={`transition-all duration-700 ${
                i === currentSlide ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 absolute bottom-0 left-0 right-0'
              }`}
            >
              <h2 className="text-4xl font-bold text-white leading-tight whitespace-pre-line">
                {slide.headline}
              </h2>
              <p className="text-white/75 mt-3 text-sm">{slide.subtitle}</p>
            </div>
          ))}
        </div>
        {/* Carousel dots */}
        <div className="absolute bottom-8 left-10 flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              aria-label={`Go to slide ${i + 1}`}
              className="group py-3 -my-3"
            >
              <span className={`block h-1.5 rounded-full transition-all duration-300 ${
                i === currentSlide ? 'w-8 bg-white' : 'w-6 bg-white/40 group-hover:bg-white/60'
              }`} />
            </button>
          ))}
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile header (hidden on desktop) */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-2xl font-bold text-white">WBR 2027 Sponsor Portal</h1>
            <p className="text-white/70 text-sm mt-1">Manage your presence, meetings & brand discovery</p>
          </div>

          <h1 className="text-3xl font-bold text-white mb-2">Sign in</h1>
          <p className="text-white/70 text-sm mb-8">
            Enter your credentials to access the sponsor portal
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3 mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <input
                name="email"
                type="email"
                required
                placeholder="Email"
                className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
            <div className="relative">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Enter your password"
                className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
            <div className="relative flex justify-center"><span className="bg-[#1a1a2e] px-4 text-xs text-white/60">Or sign in with</span></div>
          </div>

          <button
            onClick={async () => {
              const { signIn } = await import('next-auth/react')
              signIn('google', { callbackUrl: '/dashboard' })
            }}
            className="w-full flex items-center justify-center gap-3 py-3.5 border border-white/10 rounded-xl text-sm font-medium text-white/90 hover:bg-white/5 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>

          {/*
            Drawn only when the provider list names LinkedIn. Sends people to the
            dashboard like Google does; a representative whose company profile is
            incomplete is moved on to the checklist by this portal's gate, so this
            button needs no knowledge of onboarding.
          */}
          {linkedInAvailable && (
            <button
              data-testid="signin-linkedin"
              onClick={async () => {
                // WAIT FOR THE ERASE BEFORE LEAVING THIS PAGE, for the same
                // reason the password form does. Found in adversarial review
                // round 1.
                //
                // This portal keeps a stored copy of a company's data in the
                // browser, and reaching this screen starts deleting it. Pressing
                // this button navigates away to LinkedIn, so without this wait a
                // fast press can leave that copy behind — and the portal accepts
                // a stored copy up to 30 minutes old when it next loads, so the
                // previous company's data could be read back in by the very
                // sign-in meant to replace it.
                //
                // The promise never rejects, so this can only delay the
                // navigation, never block it.
                await ensureErased()
                const { signIn } = await import('next-auth/react')
                signIn('linkedin', { callbackUrl: '/dashboard' })
              }}
              className="w-full flex items-center justify-center gap-3 py-3.5 mt-3 border border-white/10 rounded-xl text-sm font-medium text-white/90 hover:bg-white/5 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true">
                <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 110-4.13 2.06 2.06 0 010 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
              </svg>
              LinkedIn
            </button>
          )}

          {/* Demo accounts */}
          <div className="mt-8 border border-white/10 rounded-xl p-4">
            <p className="text-xs font-semibold text-white/70 mb-3">Demo accounts</p>
            <div className="space-y-2.5 text-xs">
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
        </div>
      </div>
    </div>
  )
}
