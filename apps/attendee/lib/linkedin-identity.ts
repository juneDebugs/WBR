/**
 * What LinkedIn tells us about a person, and what we are allowed to do with it.
 *
 * Phase 12. Three separate rules live here, and all three are plain functions of
 * their arguments so their branches can be checked without a browser and without
 * a real sign-in — the same shape as apps/web/lib/pin-input.ts and
 * packages/db/src/onboarding-policy.ts.
 *
 * The rules:
 *   1. Whether the provider is configured at all, which decides whether the
 *      button exists (FP 11, FP 31).
 *   2. How LinkedIn's reply becomes the four fields this app stores (FP 10).
 *   3. Which of those fields may be written over an existing person, which is
 *      "only the blank ones" and is the whole meaning of the word pre-fill.
 *
 * WHY THE PROVIDER IS ASSEMBLED HERE RATHER THAN IMPORTED FROM THE LIBRARY.
 * next-auth@4.24.13 ships next-auth/providers/linkedin. It asks LinkedIn for the
 * OpenID Connect scopes and then reads the member from api.linkedin.com/v2/me and
 * api.linkedin.com/v2/emailAddress — the two addresses the OpenID Connect product
 * replaced. Every value below was read from the live discovery document on
 * 2026-08-04 rather than from documentation, because the two disagree; see
 * LINKEDIN_ISSUER.
 */
import type { OAuthConfig } from 'next-auth/providers/oauth'

/**
 * The name LinkedIn's authorization server gives itself.
 *
 * Two values are in circulation and they disagree:
 *
 *   https://www.linkedin.com/oauth   <- returned by the live discovery document
 *   https://www.linkedin.com         <- printed on LinkedIn's own documentation page
 *
 * The live one is used. Verified 2026-08-04:
 *   curl -s https://www.linkedin.com/oauth/.well-known/openid-configuration
 * returned "issuer" : "https://www.linkedin.com/oauth".
 *
 * WHAT THIS VALUE DOES, STATED PRECISELY, BECAUSE THE FIRST VERSION OF THIS FILE
 * OVERSTATED IT AND A NEGATIVE CONTROL CAUGHT IT.
 *
 * It is metadata. It is NOT an active check in this configuration, and
 * substituting the wrong value changes nothing observable. Measured 2026-08-04:
 * with the shorter value in place, the sign-in still built a correct redirect to
 * LinkedIn. The reason is two lines of the library:
 *
 *   - core/lib/oauth/client.js — when `wellKnown` is set, the whole issuer is
 *     built from the fetched document and `provider.issuer` is never read.
 *   - core/lib/oauth/callback.js lines 93-96 — with `idToken` unset, the return
 *     leg runs `oauthCallback`, which does not validate an identity token, so
 *     nothing ever compares an `iss` claim to anything.
 *
 * It is kept because openid-client requires an issuer name to construct with, and
 * because it becomes a real check the moment anyone sets `idToken: true`. A wrong
 * value sitting here would then start refusing sign-ins for a reason nobody
 * changed.
 */
export const LINKEDIN_ISSUER = 'https://www.linkedin.com/oauth'

/**
 * Where the member's details are read from — the one value the library's own
 * LinkedIn provider gets wrong.
 */
export const LINKEDIN_USERINFO = 'https://api.linkedin.com/v2/userinfo'

export const LINKEDIN_AUTHORIZATION = 'https://www.linkedin.com/oauth/v2/authorization'
export const LINKEDIN_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken'
export const LINKEDIN_JWKS = 'https://www.linkedin.com/oauth/openid/jwks'

/**
 * `openid` asks for OpenID Connect at all, `profile` buys the name and picture,
 * `email` buys the email address. All three are Open Permissions — self-serve,
 * no review (F-24). There is no scope for a job title or an employer, which is
 * why FP 12 exists and why the checklist still asks for both by hand.
 */
export const LINKEDIN_SCOPES = 'openid profile email'

/** The shape LinkedIn's userinfo reply arrives in. Every field is treated as
 *  untrusted: this is a network response, not a database row. */
export interface LinkedInClaims {
  sub?: unknown
  name?: unknown
  given_name?: unknown
  family_name?: unknown
  picture?: unknown
  email?: unknown
  email_verified?: unknown
  locale?: unknown
}

/** What this app keeps out of that reply. Four fields, no more. */
export interface LinkedInIdentity {
  /** LinkedIn's own identifier for the member. Stable per application. */
  id: string
  name: string | null
  /** Lowercased. Null when LinkedIn sent none — see F-25. */
  email: string | null
  image: string | null
}

/** A string with something in it after trimming, or null. Used for every field,
 *  because "  " arriving from a network response is the same as nothing arriving
 *  and the two must not be allowed to behave differently. */
function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Is a stored value blank?
 *
 * Blank means null, undefined, or whitespace only. The empty string matters
 * specifically: F-22 in this same sprint was caused by two readers of one field
 * disagreeing about whether '' counts as absent, so this file states the answer
 * once and both callers use it.
 */
export function isBlank(value: string | null | undefined): boolean {
  return text(value) === null
}

/**
 * Turn LinkedIn's reply into the four fields this app stores.
 *
 * The name is taken from `name` when LinkedIn sends one, and assembled from
 * `given_name` and `family_name` when it does not. Either part alone is accepted:
 * a member with only a first name recorded still has a usable name, and refusing
 * one would send them to a checklist that asks for the thing we were just given.
 *
 * `email_verified` is NOT read here. It is read by `linkedInEmailVerified` and
 * acted on by `linkedInBindingDecision`, because what it governs is which account
 * this sign-in may have rather than what the reply means. An earlier version of
 * this file ignored it entirely, on the reasoning that the other sign-in paths do
 * not verify either; that reasoning was wrong and the review caught it. See F-27.
 */
export function linkedInIdentity(claims: LinkedInClaims): LinkedInIdentity | null {
  const id = text(claims.sub)
  if (id === null) return null

  const full = text(claims.name)
  const given = text(claims.given_name)
  const family = text(claims.family_name)
  const assembled = [given, family].filter(part => part !== null).join(' ')

  const email = text(claims.email)

  return {
    id,
    name: full ?? (assembled.length > 0 ? assembled : null),
    email: email === null ? null : email.toLowerCase(),
    image: text(claims.picture),
  }
}

/**
 * Which fields a LinkedIn sign-in may write onto a person who already exists.
 *
 * Only the blank ones. Someone who signs in with LinkedIn, corrects the spelling
 * of their name on the checklist, then signs in with LinkedIn again next morning
 * keeps their correction. That is what FP 10 asks for — filling in what is not
 * there — as distinct from treating LinkedIn as the authority on every sign-in.
 *
 * Returns only the keys that should be written, so the caller hands the result
 * straight to an update and an empty object means no write at all.
 *
 * The Google branch beside this one overwrites both fields on every sign-in. That
 * is out of scope for this phase and left alone on purpose; the two branches
 * differ, and the difference is recorded here rather than being a surprise to
 * whoever reads them next.
 */
export function prefillFields(
  stored: { name?: string | null; image?: string | null },
  incoming: { name: string | null; image: string | null }
): { name?: string; image?: string } {
  const update: { name?: string; image?: string } = {}
  if (isBlank(stored.name) && incoming.name !== null) update.name = incoming.name
  if (isBlank(stored.image) && incoming.image !== null) update.image = incoming.image
  return update
}

/**
 * The marker put in the address when a LinkedIn sign-in is refused for having no
 * email. The login screen turns it into a sentence. Spelled once here so the two
 * files cannot drift into a screen that says nothing.
 */
export const LINKEDIN_NO_EMAIL_MARKER = 'LinkedInNoEmail'

export type SignInDecision =
  | { allowed: true; email: string }
  | { allowed: false; redirectTo: string }

/**
 * Whether a LinkedIn arrival may proceed, and under which email address.
 *
 * A decision rather than a side effect, so it can be checked without a real
 * sign-in — the only part of the LinkedIn journey a browser script cannot drive,
 * because LinkedIn asks for an account password.
 *
 * The only way to be refused is having no email address (F-25). This app has no
 * other key: it finds and creates people by email, so an arrival without one
 * cannot be looked up, cannot be created, and would otherwise fail below the
 * surface with nothing readable on screen.
 *
 * Rejected: manufacturing an address from the `sub` identifier. That creates a
 * permanent account nobody can reach and that no later real sign-in can merge
 * with.
 */
export function linkedInSignInDecision(
  identity: Pick<LinkedInIdentity, 'email'> | null
): SignInDecision {
  const email = identity === null ? null : text(identity.email)
  if (email === null) return { allowed: false, redirectTo: `/login?error=${LINKEDIN_NO_EMAIL_MARKER}` }
  return { allowed: true, email: email.toLowerCase() }
}

/**
 * The marker for an address LinkedIn will not vouch for, arriving at an account
 * that already exists. See F-27.
 */
export const LINKEDIN_UNVERIFIED_MARKER = 'LinkedInUnverifiedEmail'

/**
 * Did LinkedIn assert that it has verified this address?
 *
 * ACCEPTED: the boolean `true`, and a string reading `true` after trimming and
 * lowercasing. REFUSED: everything else — the boolean `false`, the string
 * `"false"`, absent, null, numbers.
 *
 * WHY BOTH SHAPES, MEASURED RATHER THAN ASSUMED (F-29). LinkedIn's documentation
 * types this field as Boolean. LinkedIn sends the STRING `"true"`. Printed from
 * the sign-in callback on 2026-08-04:
 *
 *   email_verified typeof: string
 *   email_verified value: "true"
 *
 * The first version of this function accepted only the boolean, so a real
 * verification read as no verification, and the rule below then refused every
 * returning delegate — one sign-in created their account and no later sign-in
 * could reach it. Three review rounds and twelve negative controls missed it,
 * because all of them checked this code against the same wrong documentation. One
 * real sign-in found it.
 *
 * WHY NOT SIMPLY ANY TRUTHY VALUE, WHICH IS THE OBVIOUS FIX AND THE DANGEROUS
 * ONE. The string `"false"` is truthy. `!!claims.email_verified` would read
 * LinkedIn saying NOT verified as verified, which opens the exact path
 * linkedInBindingDecision exists to close. The shape is checked, not the
 * truthiness.
 */
export function linkedInEmailVerified(claims: LinkedInClaims): boolean {
  const raw = claims.email_verified
  if (raw === true) return true
  if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true'
  return false
}

export type BindingDecision =
  | { allowed: true; mode: 'create' | 'join' }
  | { allowed: false; redirectTo: string }

/**
 * May this sign-in have the account it is pointing at?
 *
 * F-27. An address LinkedIn does not vouch for may create a new account and may
 * never join one that already exists. The four cases:
 *
 *   verified,   row exists     -> joins it
 *   verified,   no row         -> creates a delegate
 *   unverified, no row         -> creates a delegate; the signer gains nothing
 *                                 but their own new row
 *   unverified, row exists     -> REFUSED, whatever role that row holds
 *
 * The reason the last case is not merely untidy: the branch takes the role and the
 * company link off whatever row it finds, so an address matching an organizer's
 * would have issued an organizer session. Email-and-password proves control with a
 * password and Google verifies its addresses; LinkedIn omitting `email_verified`
 * is LinkedIn declining to make that claim, which is not the same thing.
 *
 * Rejected: refusing every unverified sign-in, which stops a member whose LinkedIn
 * omits the field from using the button at all while email and Google both work.
 * Also rejected: refusing only for privileged roles, which leaves two people
 * sharing one delegate account and degrades the meeting matching.
 */
export function linkedInBindingDecision(args: {
  emailVerified: boolean
  personExists: boolean
}): BindingDecision {
  if (!args.personExists) return { allowed: true, mode: 'create' }
  if (!args.emailVerified) {
    return { allowed: false, redirectTo: `/login?error=${LINKEDIN_UNVERIFIED_MARKER}` }
  }
  return { allowed: true, mode: 'join' }
}

/**
 * What a LinkedIn sign-in should do — the whole sequence, as one value.
 *
 * F-28 is an ORDERING defect: the branch wrote to the row and only then consulted
 * the role, so a sign-in this app refuses had already overwritten that person's
 * name and photo. An ordering cannot be asserted by a browser script, because
 * completing a real LinkedIn sign-in needs an account password. Deciding the whole
 * action in one function makes it assertable: a refusing outcome carries no
 * update, and that is a property of the returned value rather than of the order
 * two statements happen to sit in.
 *
 * `roleAdmitted` is passed in rather than imported so this module keeps no
 * dependency on the database package, which is what lets a browser bundle and a
 * plain script both load it.
 *
 * The four refusals, in the order they are decided:
 *   1. no email address at all                        (F-25)
 *   2. an unverified address joining an existing row   (F-27)
 *   3. a role this app does not admit                  (F-28's original check)
 * and then, only then, one of two writes: create, or fill the blank fields.
 */
export type LinkedInAction =
  | { kind: 'refuse'; redirectTo: string | null }
  | { kind: 'create'; email: string; name: string | null; image: string | null }
  | { kind: 'join'; update: { name?: string; image?: string } }

export function linkedInAction(args: {
  email: string | null
  emailVerified: boolean
  existing: { role: string; name?: string | null; image?: string | null } | null
  incoming: { name: string | null; image: string | null }
  roleAdmitted: (role: string) => boolean
}): LinkedInAction {
  const signIn = linkedInSignInDecision({ email: args.email })
  if (!signIn.allowed) return { kind: 'refuse', redirectTo: signIn.redirectTo }

  const binding = linkedInBindingDecision({
    emailVerified: args.emailVerified,
    personExists: args.existing !== null,
  })
  if (!binding.allowed) return { kind: 'refuse', redirectTo: binding.redirectTo }

  if (args.existing === null) {
    return {
      kind: 'create',
      email: signIn.email,
      name: args.incoming.name,
      image: args.incoming.image,
    }
  }

  // A refusal with no address to send anyone to: next-auth turns `false` into its
  // own generic refusal screen. Distinct from the two above, which name a cause.
  if (!args.roleAdmitted(args.existing.role)) return { kind: 'refuse', redirectTo: null }

  return { kind: 'join', update: prefillFields(args.existing, args.incoming) }
}

/**
 * Are the credentials present?
 *
 * Both, and both non-blank. One alone cannot complete a sign-in, and a provider
 * registered with half its credentials produces a button that fails when pressed
 * — worse than the hidden button FP 11 asks for, because a button that is there
 * is a promise.
 *
 * The environment is passed in rather than read from the module so this can be
 * checked at both settings without restarting anything.
 */
export function isLinkedInConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return !isBlank(env.LINKEDIN_CLIENT_ID) && !isBlank(env.LINKEDIN_CLIENT_SECRET)
}

/**
 * The provider, assembled from the values above.
 *
 * `checks: ['state']` and no PKCE: LinkedIn's discovery document lists no
 * `code_challenge_methods_supported`, so PKCE is not on offer and asking for it
 * would send a challenge the authorization server ignores and then fail the
 * comparison on the way back. Stated rather than left to a default, because a
 * default that changes with a library version would break the sign-in silently.
 *
 * `token_endpoint_auth_method: 'client_secret_post'` because LinkedIn expects the
 * credentials in the request body rather than in an Authorization header.
 *
 * The member's details come from the userinfo address, not from the identity
 * token. LinkedIn's documented token payload lists only iss, sub, aud, iat and
 * exp — no name, no picture, no email — so reading the token instead would return
 * a person with nothing to pre-fill.
 */
export function linkedInProvider(
  clientId: string,
  clientSecret: string
): OAuthConfig<LinkedInClaims> {
  return {
    id: 'linkedin',
    name: 'LinkedIn',
    type: 'oauth',
    /**
     * Endpoints are stated rather than discovered.
     *
     * `wellKnown` would fetch them from LinkedIn on every sign-in initiation —
     * an extra network round trip standing between pressing the button and
     * arriving at LinkedIn, on whatever wireless network the event has. Every
     * value below was read from that same document on 2026-08-04, so stating
     * them costs nothing except noticing if LinkedIn ever moves one, which is a
     * change worth noticing rather than silently following.
     */
    issuer: LINKEDIN_ISSUER,
    authorization: { url: LINKEDIN_AUTHORIZATION, params: { scope: LINKEDIN_SCOPES } },
    token: LINKEDIN_TOKEN,
    userinfo: LINKEDIN_USERINFO,
    jwks_endpoint: LINKEDIN_JWKS,
    client: { token_endpoint_auth_method: 'client_secret_post' },
    checks: ['state'],
    clientId,
    clientSecret,
    /**
     * next-auth requires an id on whatever this returns. The email may be absent
     * (F-25); it is carried through as-is and refused in the sign-in callback,
     * where there is a screen to report it on. Refusing here would surface as an
     * unexplained failure.
     */
    profile(claims) {
      const identity = linkedInIdentity(claims)
      return {
        id: identity?.id ?? '',
        name: identity?.name ?? null,
        email: identity?.email ?? null,
        image: identity?.image ?? null,
        /**
         * A placeholder that is never stored and never read.
         *
         * types/next-auth.d.ts adds a required `role` to this app's user type,
         * so something has to be here. The value is replaced in the sign-in
         * callback with the role read from the database, before anything is
         * written into the session token. A person who already holds another
         * role keeps it; a new person is created as a delegate explicitly, in
         * the callback, not from this line.
         */
        role: 'ATTENDEE',
      }
    },
  }
}
