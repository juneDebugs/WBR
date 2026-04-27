import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { prisma } from '@conference/db'

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
        name: { label: 'Name', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null
        const email = credentials.email.trim().toLowerCase()
        const name = credentials.name?.trim() || email.split('@')[0]

        let user = await prisma.user.findUnique({ where: { email } })

        if (user) {
          if (name) await prisma.user.update({ where: { email }, data: { name } }).catch(() => {})
        } else {
          user = await prisma.user.create({ data: { email, name, role: 'ATTENDEE' } })
        }

        const sponsor = user.sponsorId
          ? await prisma.sponsor.findUnique({ where: { id: user.sponsorId } }).catch(() => null)
          : null

        return {
          id: user.id,
          email: user.email!,
          name: user.name ?? name,
          role: user.role,
          sponsorId: user.sponsorId ?? null,
          sponsorName: sponsor?.name ?? null,
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
        await prisma.user.upsert({
          where: { email },
          update: {
            ...(user.name && { name: user.name }),
            ...(user.image && { image: user.image }),
          },
          create: { email, name: user.name ?? email.split('@')[0], role: 'ATTENDEE', image: user.image },
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
          token.sponsorId = dbUser.sponsorId ?? null
          if (dbUser.sponsorId) {
            const sponsor = await prisma.sponsor.findUnique({ where: { id: dbUser.sponsorId } })
            token.sponsorName = sponsor?.name ?? null
          }
        }
      } else if (user) {
        token.id = (user as any).id
        token.role = (user as any).role
        token.sponsorId = (user as any).sponsorId ?? null
        token.sponsorName = (user as any).sponsorName ?? null
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id
        ;(session.user as any).role = token.role
        ;(session.user as any).sponsorId = token.sponsorId ?? null
        ;(session.user as any).sponsorName = token.sponsorName ?? null
      }
      return session
    },
  },
}
