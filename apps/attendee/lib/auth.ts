import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@conference/db'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        name: { label: 'Name', type: 'text' },
        email: { label: 'Email', type: 'email' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null
        const email = credentials.email.trim().toLowerCase()
        const name = credentials.name?.trim() || email.split('@')[0]

        // Upsert user by email
        const user = await prisma.user.upsert({
          where: { email },
          update: { name },
          create: { email, name, role: 'ATTENDEE' },
        })

        // Auto-join general channel
        const general = await prisma.chatRoom.findFirst({ where: { type: 'CHANNEL', name: 'General' } })
        if (general) {
          await prisma.chatMember.upsert({
            where: { roomId_userId: { roomId: general.id, userId: user.id } },
            update: {},
            create: { roomId: general.id, userId: user.id },
          })
        }

        return { id: user.id, email: user.email!, name: user.name, role: user.role }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
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
