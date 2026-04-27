import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { prisma } from '@conference/db'
import { verifyPassword } from './password'

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
        const existing = await prisma.user.findUnique({ where: { email } })

        if (!existing) return null
        if (!existing.password) return null

        const valid = await verifyPassword(credentials.password, existing.password)
        if (!valid) return null

        if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(existing.role)) return null

        return { id: existing.id, email: existing.email!, name: existing.name, role: existing.role }
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
        const existing = await prisma.user.findUnique({ where: { email } })
        if (!existing || !['STAFF', 'ORGANIZER', 'ADMIN'].includes(existing.role)) return false
        // Update name/image from Google if available
        await prisma.user.update({
          where: { email },
          data: {
            ...(user.name && { name: user.name }),
            ...(user.image && { image: user.image }),
          },
        })
      }
      return true
    },
    async jwt({ token, user, account }) {
      if (account?.provider === 'google' && user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email.toLowerCase() } })
        if (dbUser) {
          token.id = dbUser.id
          token.role = dbUser.role
        }
      } else if (user) {
        token.id = user.id
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
