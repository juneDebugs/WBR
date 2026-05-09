export const revalidate = 60
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { IntegrationsClient } from '@/components/IntegrationsClient'

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const [saved, params] = await Promise.all([
    prisma.integration.findMany(),
    searchParams,
  ])
  return (
    <>
      <AdminHeader title="Integrations" />
      <main className="flex-1 p-6">
        <IntegrationsClient
          saved={saved.map(i => ({
            provider: i.provider,
            status: i.status,
            accountLabel: i.accountLabel,
            connectedAt: i.connectedAt?.toISOString() ?? null,
          }))}
          connected={params.connected}
          error={params.error}
        />
      </main>
    </>
  )
}
