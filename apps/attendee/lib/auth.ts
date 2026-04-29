import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { prisma, verifyPassword } from '@conference/db'

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

          const user = await prisma.user.findUnique({ where: { email } })
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

          // Join General chat in background — don't block login
          prisma.chatRoom.findFirst({ where: { type: 'CHANNEL', name: 'General' } }).then(general => {
            if (general) {
              prisma.chatMember.upsert({
                where: { roomId_userId: { roomId: general.id, userId: user.id } },
                update: {},
                create: { roomId: general.id, userId: user.id },
              }).catch(() => {})
            }
          }).catch(() => {})

          return { id: user.id, email: user.email!, name: user.name, role: user.role, sponsorId: user.sponsorId }
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
        const dbUser = await prisma.user.upsert({
          where: { email },
          update: {
            ...(user.name && { name: user.name }),
            ...(user.image && { image: user.image }),
          },
          create: { email, name: user.name ?? email.split('@')[0], role: 'ATTENDEE', image: user.image },
        })
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
