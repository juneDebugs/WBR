import { NextResponse } from 'next/server'
import { prisma, getCompanyDirectory } from '@conference/db'
import { requireStaff, engineErrorResponse } from '@/lib/staff-api'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  try {
    const rows = await getCompanyDirectory(prisma)
    return NextResponse.json({ companies: rows })
  } catch (err) {
    return engineErrorResponse(err)
  }
}
