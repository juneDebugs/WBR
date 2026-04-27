import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { SponsorReadinessWidget } from '@/components/SponsorReadinessWidget'
import { ConferenceBanner } from '@/components/ConferenceBanner'
export default async function DashboardPage() {
  const [sessionCount, speakerCount, pendingMeetings, attendeeCount, conference] = await Promise.all([
    prisma.confSession.count(),
    prisma.speaker.count(),
    prisma.meeting.count({ where: { status: 'PENDING' } }),
    prisma.user.count({ where: { role: 'ATTENDEE' } }),
    prisma.conference.findFirst({ where: { active: true } }),
  ])

  const stats = [
    { label: 'Sessions', value: sessionCount, color: 'text-blue-600', bg: 'bg-blue-50', href: '/dashboard/sessions' },
    { label: 'Speakers', value: speakerCount, color: 'text-purple-600', bg: 'bg-purple-50', href: '/dashboard/speakers' },
    { label: 'Pending Meetings', value: pendingMeetings, color: 'text-yellow-600', bg: 'bg-yellow-50', href: '/dashboard/meetings' },
    { label: 'Attendees', value: attendeeCount, color: 'text-green-600', bg: 'bg-green-50', href: '/dashboard/attendees' },
  ]

  return (
    <>
      <AdminHeader title="Overview" />
      <main className="flex-1 p-6">
        {conference && (
          <ConferenceBanner
            id={conference.id}
            name={conference.name}
            venue={conference.venue}
            startDate={conference.startDate.toISOString()}
            endDate={conference.endDate.toISOString()}
          />
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((stat) => (
            <a key={stat.label} href={stat.href}
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-primary/40 transition-colors">
              <div className={`w-10 h-10 ${stat.bg} rounded-lg flex items-center justify-center mb-3`}>
                <span className={`text-lg font-bold ${stat.color}`}>{stat.value}</span>
              </div>
              <p className="text-sm text-gray-600">{stat.label}</p>
            </a>
          ))}
        </div>

<div className="mt-6">
          <SponsorReadinessWidget />
        </div>
      </main>
    </>
  )
}
