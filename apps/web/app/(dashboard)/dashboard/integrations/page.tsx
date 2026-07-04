export const revalidate = 60
import { prisma } from '@conference/db'
import { unstable_cache } from 'next/cache'
import { AdminHeader } from '@/components/AdminHeader'
import { IntegrationsClient } from '@/components/IntegrationsClient'
import { permissionDenied } from '@/lib/require-permission'

const getCachedIntegrations = unstable_cache(
  async () => prisma.integration.findMany(),
  ['web-integrations'],
  { revalidate: 60, tags: ['integrations'] },
)

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const denied = await permissionDenied('integrations', 'Integrations')
  if (denied) return denied
  const [saved, params] = await Promise.all([
    getCachedIntegrations(),
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
