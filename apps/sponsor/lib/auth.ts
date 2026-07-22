import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { prisma, verifyPassword, canAccessApp } from '@conference/db'

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
    async signIn({ user, account }) {
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
