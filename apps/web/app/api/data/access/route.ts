import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'

const getCachedAccessUsers = unstable_cache(
  async () => {
    const users = await prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        password: true,
        createdAt: true,
      },
      take: 500,
    })
    return users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image,
      role: u.role,
      hasPassword: !!u.password,
      createdAt: typeof u.createdAt === 'string' ? u.createdAt : u.createdAt.toISOString(),
    }))
  },
  ['web-access-users'],
  { revalidate: 60, tags: ['access'] },
)

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const users = await getCachedAccessUsers()
  return NextResponse.json(users)
}
