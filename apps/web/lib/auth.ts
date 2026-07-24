import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { prisma, verifyPassword, canAccessApp, isCanonicalTestEmail, ensureCanonicalTestAccount } from '@conference/db'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
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

          // Self-heal the canonical demo accounts: a stray maintenance script
          // or account reset may have clobbered/deleted the row. Repairs it in
          // place (only for the correct demo password) so demo logins can't be
          // permanently broken. See packages/db/src/test-accounts.ts.
          if (isCanonicalTestEmail(email)) {
            await ensureCanonicalTestAccount(email, credentials.password)
          }

          const existing = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, name: true, password: true, role: true },
          })

          if (!existing) {
            console.error('[auth] User not found:', email)
            return null
          }
          if (!existing.password) {
            console.error('[auth] User has no password:', email)
            return null
          }

          const valid = await verifyPassword(credentials.password, existing.password)
          if (!valid) {
            console.error('[auth] Password mismatch for:', email)
            return null
          }

          if (!canAccessApp('web', existing.role)) {
            console.error('[auth] Role not allowed:', email, existing.role)
            return null
          }

          return { id: existing.id, email: existing.email!, name: existing.name, role: existing.role }
        } catch (e: any) {
          console.error('[auth] authorize() error:', e?.message, e?.stack)
          return null
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        const email = user.email?.toLowerCase()
        if (!email) return false
        // Single query: find + update in one round-trip
        const existing = await prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true },
        })
        if (!existing || !canAccessApp('web', existing.role)) return false
        if (user.name || user.image) {
          prisma.user.update({
            where: { email },
            data: { ...(user.name && { name: user.name }), ...(user.image && { image: user.image }) },
          }).catch(() => {}) // fire-and-forget: don't block sign-in for profile update
        }
        ;(user as any).id = existing.id
        ;(user as any).role = existing.role
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id ?? user.id
        token.role = (user as any).role
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        ;(session.user as any).role = token.role
      }
      return session
    },
  },
}
