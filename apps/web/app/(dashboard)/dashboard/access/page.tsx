import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { AccessPageClient } from '@/components/AccessPageClient'

const getCachedAccessUsers = unstable_cache(
  async () => {
    const users = await prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, email: true, image: true, role: true, password: true, createdAt: true },
      take: 500,
    })
    return users.map(u => ({
      id: u.id, name: u.name, email: u.email, image: u.image, role: u.role,
      hasPassword: !!u.password,
      createdAt: typeof u.createdAt === 'string' ? u.createdAt : u.createdAt.toISOString(),
    }))
  },
  ['web-access-users'],
  { revalidate: 60, tags: ['access'] },
)

export default async function AccessPage() {
  const users = await getCachedAccessUsers()
  return (
    <>
      <AdminHeader title="Access & Roles" />
      <main className="flex-1 p-6">
        <AccessPageClient initialData={users} />
      </main>
    </>
  )
}
