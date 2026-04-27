export const dynamic = 'force-dynamic'
import { Suspense } from 'react'
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { IntegrationsClient } from '@/components/IntegrationsClient'

export default async function IntegrationsPage() {
  const saved = await prisma.integration.findMany()
  return (
    <>
      <AdminHeader title="Integrations" />
      <main className="flex-1 p-6">
        <Suspense>
          <IntegrationsClient
            saved={saved.map(i => ({
              provider: i.provider,
              status: i.status,
              accountLabel: i.accountLabel,
              connectedAt: i.connectedAt?.toISOString() ?? null,
            }))}
          />
        </Suspense>
      </main>
    </>
  )
}
