import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { format } from 'date-fns'
import Image from 'next/image'
import { revalidatePath } from 'next/cache'

async function updateRole(userId: string, formData: FormData) {
  'use server'
  const role = formData.get('role') as string
  await prisma.user.update({ where: { id: userId }, data: { role } })
  revalidatePath('/dashboard/attendees')
}

export default async function AttendeesPage() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })

  return (
    <>
      <AdminHeader title="Attendees" />
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">{users.length} registered users</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Joined</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => {
                const setRole = updateRole.bind(null, user.id)
                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {user.image ? (
                          <Image src={user.image} alt={user.name ?? ''} width={32} height={32}
                            className="rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-gray-500 text-xs font-semibold">{(user.name ?? '?')[0]}</span>
                          </div>
                        )}
                        <span className="font-medium text-gray-900">{user.name ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.email ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {format(user.createdAt, 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3">
                      <form action={setRole} className="flex items-center gap-2">
                        <select name="role" defaultValue={user.role}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary/50">
                          <option value="ATTENDEE">Attendee</option>
                          <option value="SPEAKER">Speaker</option>
                          <option value="ORGANIZER">Organizer</option>
                        </select>
                        <button type="submit" className="text-xs text-primary hover:underline font-medium">Save</button>
                      </form>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="text-center text-gray-400 py-12">No users registered yet.</p>
          )}
        </div>
      </main>
    </>
  )
}
