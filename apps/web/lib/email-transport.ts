import 'server-only'
import * as nodemailer from 'nodemailer'
import { prisma } from '@conference/db'

// Shared SMTP transport resolver for the email send + sponsor reminder routes.
// Returns the connected transporter AND the from-address in one shot, so the
// caller never re-reads the Integration row it already resolved here (and can
// never pick a from-address that disagrees with the selected transport).
//
// Fetches both providers in a single query and iterates GMAIL-first to preserve
// the original ['GMAIL','OUTLOOK'] precedence.
export async function getTransporter(): Promise<
  { transporter: nodemailer.Transporter; fromEmail: string } | null
> {
  const integrations = await prisma.integration.findMany({
    where: { provider: { in: ['GMAIL', 'OUTLOOK'] } },
  })

  for (const provider of ['GMAIL', 'OUTLOOK'] as const) {
    const integration = integrations.find(i => i.provider === provider)
    if (!integration || integration.status !== 'CONNECTED' || !integration.metadata) continue

    let creds: Record<string, string> = {}
    try { creds = JSON.parse(integration.metadata) } catch { continue }
    if (!creds.email || !creds.appPassword) continue

    const isGmail = provider === 'GMAIL'
    const transporter = nodemailer.createTransport({
      host: isGmail ? 'smtp.gmail.com' : 'smtp-mail.outlook.com',
      port: isGmail ? 465 : 587,
      secure: isGmail,
      auth: { user: creds.email, pass: creds.appPassword },
    })
    // Keep the noreply literal fallback (do not substitute creds.email) so the
    // from-address is unchanged when accountLabel is null.
    return { transporter, fromEmail: integration.accountLabel ?? 'noreply@conference.app' }
  }

  return null
}
