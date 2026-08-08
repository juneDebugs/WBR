import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { prisma, verifyPassword, dbConnectionMode, canAccessApp, isCanonicalTestEmail, ensureCanonicalTestAccount, recordLogin } from '@conference/db'
import {
  isLinkedInConfigured,
  linkedInAction,
  linkedInEmailVerified,
  linkedInProvider,
  type LinkedInClaims,
} from '@conference/db/src/linkedin-identity'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
    /**
     * LinkedIn is registered only when both of its credentials are set.
     *
     * This is the mechanism behind FP 11 and FP 31: an unregistered provider is
     * absent from the list the login screen reads, so the button is not drawn.
     * Google above is registered unconditionally and its button is always drawn;
     * that is existing behaviour, out of scope for this phase, and left alone.
     *
     * Spread rather than a ternary yielding null, because the providers array is
     * typed as providers and a null entry would have to be filtered back out.
     */
    ...(isLinkedInConfigured()
      ? [linkedInProvider(process.env.LINKEDIN_CLIENT_ID!, process.env.LINKEDIN_CLIENT_SECRET!)]
      : []),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
          if (!credentials?.email || !credentials?.password) return null
          const email = credentials.email.trim().toLowerCase()

          // Self-heal the canonical demo accounts if a stray maintenance
          // script or reset clobbered/deleted the row (correct demo password
          // only). See packages/db/src/test-accounts.ts.
          if (isCanonicalTestEmail(email)) {
            await ensureCanonicalTestAccount(email, credentials.password)
          }

          const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, name: true, password: true, role: true, sponsorId: true },
          })
          if (!user) return null
          if (!user.password) return null

          const valid = await verifyPassword(credentials.password, user.password)
          if (!valid) return null

          if (!canAccessApp('attendee', user.role)) return null

          await recordLogin(user.id)

          return { id: user.id, email: user.email!, name: user.name, role: user.role, sponsorId: user.sponsorId }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    async signIn({ user, account, profile }) {
      /**
       * LinkedIn (Phase 12). Deliberately not folded into the Google branch
       * below, because the two differ in three ways and a shared branch would
       * have to carry a flag for each of them:
       *
       *   - Google overwrites name and photo on every sign-in. LinkedIn writes
       *     only into a blank field, so an edit made on the checklist survives
       *     the next LinkedIn sign-in. That is what pre-fill means in FP 10.
       *   - Google falls back to the local part of the email address when no
       *     name is supplied. LinkedIn does not: a person left with no name goes
       *     to the checklist and is asked for one, which is the gate working. A
       *     manufactured name like "a.person" is not blank, so it would satisfy
       *     the required set while being nobody's name.
       *   - LinkedIn may send no email address at all, and this app has no other
       *     key to find or create a person by (F-25).
       */
      if (account?.provider === 'linkedin') {
        // EVERY CHECK THAT CAN REFUSE RUNS BEFORE ANY WRITE. F-28: an earlier
        // version filled blank fields and only then consulted the role, so a
        // sign-in this app refuses had already overwritten that person's name and
        // photo on its way out. A write on a path whose purpose is to refuse is
        // the shape that reads as harmless, because the refusal is visible and the
        // write is not.
        //
        // The order below is the whole of it: no address, then unverified-joining,
        // then role, then write.

        // The row is READ before the decision and written only after it. Reading
        // is not a write, and the decision needs to know whether a row exists
        // (F-27) and what role it holds (F-28).
        const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : null
        const existing = email
          ? await prisma.user.findUnique({
              where: { email },
              select: { id: true, role: true, sponsorId: true, name: true, image: true },
            })
          : null

        // ONE decision, taken before anything is written. `email_verified` is read
        // from the raw reply rather than from `user`, because it is LinkedIn's own
        // claim and is not one of the four fields this app stores.
        const action = linkedInAction({
          email: user.email ?? null,
          emailVerified: linkedInEmailVerified((profile ?? {}) as LinkedInClaims),
          existing,
          incoming: { name: user.name ?? null, image: user.image ?? null },
          roleAdmitted: role => canAccessApp('attendee', role),
          // The role a new account is given here. Stated rather than defaulted
          // (UF-53) so the same test that admits an existing person is applied
          // to one who does not exist yet. This application admits it, so the
          // behaviour of this branch is unchanged by the check.
          createRole: 'ATTENDEE',
        })

        // Every refusal leaves without writing. `false` produces next-auth's own
        // generic refusal; a path names the cause on the login screen.
        if (action.kind === 'refuse') return action.redirectTo ?? false

        let account_row: { id: string; role: string; sponsorId: string | null }

        if (action.kind === 'create') {
          account_row = await prisma.user.create({
            data: {
              email: action.email,
              name: action.name,
              image: action.image,
              // The role the decision tested, not a literal repeated here.
              // UF-53: a literal could be changed to one this application does
              // not admit while every check still passed.
              role: action.role,
            },
            select: { id: true, role: true, sponsorId: true },
          })
        } else {
          // `existing` is non-null whenever the decision is to join — the decision
          // returns 'create' otherwise — and the check keeps that true for the
          // type checker as well as the reader.
          if (!existing) return false
          if (Object.keys(action.update).length > 0) {
            await prisma.user.update({ where: { id: existing.id }, data: action.update })
          }
          account_row = { id: existing.id, role: existing.role, sponsorId: existing.sponsorId }
        }

        await recordLogin(account_row.id)

        // Attach DB fields so jwt() doesn't need a second query
        ;(user as any).id = account_row.id
        ;(user as any).role = account_row.role
        ;(user as any).sponsorId = account_row.sponsorId ?? null
        return true
      }

      if (account?.provider === 'google' && user.email) {
        const email = user.email.toLowerCase()
        const dbUser = await prisma.user.upsert({
          where: { email },
          update: {
            ...(user.name && { name: user.name }),
            ...(user.image && { image: user.image }),
          },
          create: { email, name: user.name ?? email.split('@')[0], role: 'ATTENDEE', image: user.image },
        })
        if (!canAccessApp('attendee', dbUser.role)) return false
        await recordLogin(dbUser.id)
        // Attach DB fields so jwt() doesn't need a second query
        ;(user as any).id = dbUser.id
        ;(user as any).role = dbUser.role
        ;(user as any).sponsorId = dbUser.sponsorId ?? null
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id ?? user.id
        token.role = (user as any).role
        token.sponsorId = (user as any).sponsorId ?? null
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        ;(session.user as any).role = token.role
        ;(session.user as any).sponsorId = token.sponsorId ?? null
      }
      return session
    },
  },
}
