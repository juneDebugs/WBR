import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { prisma, verifyPassword, canAccessApp, isCanonicalTestEmail, ensureCanonicalTestAccount, recordLogin } from '@conference/db'
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
     * LinkedIn is registered only when both of its credentials are set (UF-52).
     *
     * An unregistered provider is absent from the list the login screen reads,
     * so the button is not drawn. A deployment without the two values set is a
     * state this portal must survive, not one it must be protected from.
     *
     * Google above is registered unconditionally and its button is always drawn.
     * That is existing behaviour here, unchanged.
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
        try {
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
          if (!user) {
            console.error('[auth] User not found:', email)
            return null
          }
          if (!user.password) {
            console.error('[auth] User has no password:', email)
            return null
          }

          const valid = await verifyPassword(credentials.password, user.password)
          if (!valid) {
            console.error('[auth] Password mismatch for:', email)
            return null
          }

          if (!canAccessApp('meetings', user.role)) {
            console.error('[auth] Role not allowed for meetings:', email, user.role)
            return null
          }

          await recordLogin(user.id)

          return {
            id: user.id,
            email: user.email!,
            name: user.name,
            role: user.role,
            sponsorId: user.sponsorId ?? null,
          }
        } catch (e: any) {
          console.error('[auth] authorize() error:', e?.message)
          return null
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    async signIn({ user, account, profile }) {
      /**
       * LinkedIn (UF-52). The same decision module the participant application
       * uses, given this portal's own role test.
       *
       * Kept separate from the Google branch below for the reasons recorded in
       * that module and in the participant application: Google overwrites the
       * name and photo on every sign-in and manufactures a name from the email
       * address when none is sent, while LinkedIn writes only into fields that
       * are blank and leaves a person with no name to be asked for one by the
       * gate. Folding them together would need a flag per difference.
       *
       * A first-time person arriving here is created and admitted, and the gate
       * built for this portal then meets them with the checklist. That is the
       * new-participant journey this portal did not have before.
       */
      if (account?.provider === 'linkedin') {
        // EVERY CHECK THAT CAN REFUSE RUNS BEFORE ANY WRITE, on both paths — the
        // person who already exists and the person who does not (F-28, UF-53).
        // Reading the row is not a write; the decision needs to know whether one
        // exists and what role it holds.
        const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : null
        const existing = email
          ? await prisma.user.findUnique({
              where: { email },
              select: { id: true, role: true, sponsorId: true, name: true, image: true },
            })
          : null

        const action = linkedInAction({
          email: user.email ?? null,
          // Read from the raw reply rather than from `user`: it is LinkedIn's
          // own claim, and is not one of the four fields this portal stores.
          emailVerified: linkedInEmailVerified((profile ?? {}) as LinkedInClaims),
          existing,
          incoming: { name: user.name ?? null, image: user.image ?? null },
          roleAdmitted: role => canAccessApp('meetings', role),
          // This portal admits general attendees, so a first-time person is
          // created and admitted. Stated rather than assumed (UF-53).
          createRole: 'ATTENDEE',
        })

        if (action.kind === 'refuse') return action.redirectTo ?? false

        let account_row: { id: string; role: string; sponsorId: string | null }

        if (action.kind === 'create') {
          account_row = await prisma.user.create({
            data: {
              email: action.email,
              name: action.name,
              image: action.image,
              // The role the decision tested, not a literal repeated here.
              role: action.role,
            },
            select: { id: true, role: true, sponsorId: true },
          })
        } else {
          // Non-null whenever the decision is to join; the check keeps that true
          // for the type checker as well as for the reader.
          if (!existing) return false
          if (Object.keys(action.update).length > 0) {
            await prisma.user.update({ where: { id: existing.id }, data: action.update })
          }
          account_row = { id: existing.id, role: existing.role, sponsorId: existing.sponsorId }
        }

        await recordLogin(account_row.id)

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
        if (!canAccessApp('meetings', dbUser.role)) return false
        await recordLogin(dbUser.id)
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
        (session.user as any).id = token.id
        ;(session.user as any).role = token.role
        ;(session.user as any).sponsorId = token.sponsorId ?? null
      }
      return session
    },
  },
}
