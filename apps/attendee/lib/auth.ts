import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { prisma, verifyPassword, dbConnectionMode, canAccessApp, isCanonicalTestEmail, ensureCanonicalTestAccount } from '@conference/db'

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

          return { id: user.id, email: user.email!, name: user.name, role: user.role, sponsorId: user.sponsorId }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    async signIn({ user, account }) {
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
