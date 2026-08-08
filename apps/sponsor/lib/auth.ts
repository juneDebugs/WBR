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
            select: {
              id: true, email: true, name: true, password: true, role: true, sponsorId: true,
              sponsor: { select: { name: true, logoUrl: true } },
            },
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

          if (!canAccessApp('sponsor', user.role)) {
            console.error('[auth] Role not allowed for sponsor:', email, user.role)
            return null
          }

          await recordLogin(user.id)

          return {
            id: user.id,
            email: user.email!,
            name: user.name ?? email.split('@')[0],
            role: user.role,
            sponsorId: user.sponsorId ?? null,
            sponsorName: user.sponsor?.name ?? null,
            sponsorLogoUrl: user.sponsor?.logoUrl ?? null,
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
       * LinkedIn (UF-52). The same decision module the other two applications
       * use, given this portal's own role test — which is the strictest of the
       * three: sponsor representatives and WBR-side roles, nobody else.
       *
       * THIS IS THE PORTAL UF-53 WAS FIXED FOR. Until that fix the decision
       * returned "create" for anyone with no account here, before the role was
       * consulted at all. On this portal that would mean a row written for every
       * stranger who pressed the button, and then a refusal — a write on a path
       * whose only purpose is to refuse. The refusal now happens before the
       * write, and names its cause on the sign-in screen so the person knows to
       * ask the organizer for an account rather than assuming a broken button.
       */
      if (account?.provider === 'linkedin') {
        const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : null
        // The sponsor relation is read in the same query rather than in a second
        // one, because this portal's session carries the company's name and logo
        // and the credentials path already reads them this way.
        const existing = email
          ? await prisma.user.findUnique({
              where: { email },
              select: {
                id: true, role: true, sponsorId: true, name: true, image: true,
                sponsor: { select: { name: true, logoUrl: true } },
              },
            })
          : null

        const action = linkedInAction({
          email: user.email ?? null,
          emailVerified: linkedInEmailVerified((profile ?? {}) as LinkedInClaims),
          existing,
          incoming: { name: user.name ?? null, image: user.image ?? null },
          roleAdmitted: role => canAccessApp('sponsor', role),
          // The role a new account would be given. This portal does not admit
          // it, which is exactly why every create is refused here (UF-53). It is
          // stated rather than omitted so the refusal is a decision this portal
          // makes on purpose, not an accident of a missing argument.
          createRole: 'ATTENDEE',
        })

        if (action.kind === 'refuse') return action.redirectTo ?? false

        // Unreachable while this portal admits no role a create would be given:
        // the decision above refuses first. Kept as a wall rather than as a
        // comment, because it costs one line and what it stops is a row written
        // for someone this portal is about to turn away. If the admitted roles
        // ever widen, this becomes reachable and must be built properly then —
        // a sponsor representative needs a company link, which a sign-in button
        // has no way to supply.
        if (action.kind === 'create') return false

        if (!existing) return false
        if (Object.keys(action.update).length > 0) {
          await prisma.user.update({ where: { id: existing.id }, data: action.update })
        }

        await recordLogin(existing.id)

        ;(user as any).id = existing.id
        ;(user as any).role = existing.role
        ;(user as any).sponsorId = existing.sponsorId ?? null
        ;(user as any).sponsorName = existing.sponsor?.name ?? null
        ;(user as any).sponsorLogoUrl = existing.sponsor?.logoUrl ?? null
        return true
      }

      if (account?.provider === 'google' && user.email) {
        const email = user.email.toLowerCase()
        // Single query with nested sponsor include — no second round-trip
        const dbUser = await prisma.user.upsert({
          where: { email },
          update: {
            ...(user.name && { name: user.name }),
            ...(user.image && { image: user.image }),
          },
          create: { email, name: user.name ?? email.split('@')[0], role: 'ATTENDEE', image: user.image },
          include: { sponsor: { select: { name: true, logoUrl: true } } },
        })
        if (!canAccessApp('sponsor', dbUser.role)) return false
        await recordLogin(dbUser.id)
        ;(user as any).id = dbUser.id
        ;(user as any).role = dbUser.role
        ;(user as any).sponsorId = dbUser.sponsorId ?? null
        ;(user as any).sponsorName = dbUser.sponsor?.name ?? null
        ;(user as any).sponsorLogoUrl = dbUser.sponsor?.logoUrl ?? null
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id ?? user.id
        token.role = (user as any).role
        token.sponsorId = (user as any).sponsorId ?? null
        token.sponsorName = (user as any).sponsorName ?? null
        token.sponsorLogoUrl = (user as any).sponsorLogoUrl ?? null
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id
        ;(session.user as any).role = token.role
        ;(session.user as any).sponsorId = token.sponsorId ?? null
        ;(session.user as any).sponsorName = token.sponsorName ?? null
        ;(session.user as any).sponsorLogoUrl = token.sponsorLogoUrl ?? null
      }
      return session
    },
  },
}
