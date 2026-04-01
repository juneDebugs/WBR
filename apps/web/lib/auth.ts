import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@conference/db'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin'
        if (credentials.password !== adminPassword) return null

        const email = credentials.email.trim().toLowerCase()
        const user = await prisma.user.upsert({
          where: { email },
          update: { role: 'ORGANIZER' },
          create: { email, name: email.split('@')[0], role: 'ORGANIZER' },
        })

        return { id: user.id, email: user.email!, name: user.name, role: user.role }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', error: '/login' },
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
