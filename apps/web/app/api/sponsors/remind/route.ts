import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  prisma,
  SPONSOR_READINESS_ITEMS,
  missingSponsorItems,
  type SponsorReadinessSubject,
} from '@conference/db'
import * as nodemailer from 'nodemailer'
import OpenAI from 'openai'

// The nine items this email chases now live in packages/db/src/onboarding-policy.ts
// alongside the six the sponsor onboarding gate blocks on, so a reminder and a
// refusal can never name different things. This route still chases all nine; it
// just no longer owns the definition.
//
// THE RULES ARE STRICTER THAN THEY WERE, and for some stored values that is a
// real change, so state it precisely rather than as "unchanged":
//
//   - a scalar that is only spaces used to count as present; it now counts as
//     absent;
//   - a description whose length exceeds 20 only because of surrounding spaces
//     used to satisfy the description item; it no longer does;
//   - a stored solutions list that parses to something other than a list of
//     text — [5], [" "], a bare number — used to satisfy the solutions item if
//     it had any length; it no longer does.
//
// Every one of those is the reminder becoming CORRECT: an exhibitor whose
// tagline is a single space has not written a tagline, and should be chased.
//
// What was measured, and on what: all 20 companies in the seeded local dataset,
// every one of the nine items, comparing the old inline rules against these.
// Zero rows disagreed, so no seeded exhibitor's chase list or completion
// percentage moved. That is a statement about the seeded data and nothing
// wider — a production row carrying one of the values above WILL be chased
// differently, deliberately. scripts/test-onboarding-policy.mjs re-runs that
// comparison over whatever data is present.

async function getTransporter() {
  const providers = ['GMAIL', 'OUTLOOK']
  for (const provider of providers) {
    const integration = await prisma.integration.findUnique({ where: { provider } })
    if (integration?.status !== 'CONNECTED' || !integration.metadata) continue
    let creds: Record<string, string> = {}
    try { creds = JSON.parse(integration.metadata) } catch { continue }
    if (!creds.email || !creds.appPassword) continue
    const isGmail = provider === 'GMAIL'
    return nodemailer.createTransport({
      host: isGmail ? 'smtp.gmail.com' : 'smtp-mail.outlook.com',
      port: isGmail ? 465 : 587,
      secure: isGmail,
      auth: { user: creds.email, pass: creds.appPassword },
    })
  }
  return null
}

async function generateAiDraft(
  sponsorName: string,
  contactName: string,
  missingLabels: string[],
  pct: number,
  portalUrl: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

  const openai = new OpenAI({ apiKey })

  const prompt = `You are a friendly, professional conference organizer for WBR 2027 (World Business Review 2027), an exclusive executive summit.

Write a warm, brief reminder email to a sponsor contact. The email should:
- Be addressed to "${contactName}" at "${sponsorName}"
- Mention their profile is ${pct}% complete
- List specifically what still needs to be done (numbered list):
${missingLabels.map((l, i) => `  ${i + 1}. ${l}`).join('\n')}
- Include this portal link: ${portalUrl}
- End with an encouraging, friendly sign-off from "The WBR 2027 Team"
- Keep it under 200 words, conversational but professional
- Do NOT use excessive exclamation marks or salesy language

Return only the plain text email body, no subject line.`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 400,
    temperature: 0.7,
  })

  return response.choices[0]?.message?.content?.trim() ?? ''
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sponsorId, draftOnly, subject, body } = await req.json()
  if (!sponsorId) return NextResponse.json({ error: 'sponsorId required' }, { status: 400 })

  const sponsor = await prisma.sponsor.findUnique({
    where: { id: sponsorId },
    include: { _count: { select: { users: true, meetings: true } } },
  })
  if (!sponsor) return NextResponse.json({ error: 'Sponsor not found' }, { status: 404 })

  // "At least one team member" counts related rows rather than reading a column,
  // so the subject is the company PLUS its attached-user count.
  const readiness: SponsorReadinessSubject = {
    ...sponsor,
    attachedUserCount: sponsor._count.users,
  }
  const missing = missingSponsorItems(readiness).map(item => item.label)
  const done = SPONSOR_READINESS_ITEMS.length - missing.length
  const pct = Math.round((done / SPONSOR_READINESS_ITEMS.length) * 100)

  const to = sponsor.contactEmail
  const contactName = sponsor.contactName || 'Sponsor Team'
  const portalUrl = process.env.SPONSOR_PORTAL_URL ?? 'https://sponsors.wbr.com'
  const defaultSubject = `Action required: Complete your WBR 2027 Sponsor Profile (${pct}% done)`

  if (draftOnly) {
    let preview = ''
    try {
      preview = await generateAiDraft(sponsor.name, contactName, missing, pct, portalUrl)
    } catch {
      // Fallback to template if AI fails
      preview = `Hi ${contactName},

Your WBR 2027 sponsor profile is ${pct}% complete. Please log into the Sponsor Portal (${portalUrl}) and complete the following:

${missing.map((item, i) => `  ${i + 1}. ${item}`).join('\n')}

Completing your profile ensures better visibility and a smoother experience at WBR 2027.

See you there!
The WBR 2027 Team`
    }
    return NextResponse.json({ ok: true, to, sponsorName: sponsor.name, pct, missing, subject: defaultSubject, preview })
  }

  // Send mode — use provided body/subject or fall back
  const finalSubject = subject ?? defaultSubject
  const finalBody = body ?? ''
  if (!finalBody) return NextResponse.json({ error: 'body required' }, { status: 400 })

  let emailStatus: 'SENT' | 'FAILED' = 'FAILED'
  let errorMsg: string | null = null

  const transporter = await getTransporter()
  if (transporter) {
    try {
      const gmailIntegration = await prisma.integration.findFirst({
        where: { provider: { in: ['GMAIL', 'OUTLOOK'] }, status: 'CONNECTED' },
      })
      const fromEmail = gmailIntegration?.accountLabel ?? 'noreply@conference.app'
      const safeHtml = finalBody
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/\n/g, '<br>')

      await transporter.sendMail({
        from: `"WBR 2027" <${fromEmail}>`,
        to: to ?? undefined,
        subject: finalSubject,
        text: finalBody,
        html: safeHtml,
      })
      emailStatus = 'SENT'
    } catch (err: any) {
      errorMsg = err?.message ?? 'Send failed'
    }
  } else {
    console.warn(`[remind] No email integration — logging only. Would have sent to ${to}`)
  }

  await prisma.emailLog.create({
    data: { to: to ?? 'unknown', subject: finalSubject, body: finalBody, status: emailStatus, sponsorId },
  })

  if (errorMsg) return NextResponse.json({ error: errorMsg }, { status: 500 })
  return NextResponse.json({ ok: true, to, sponsorName: sponsor.name, missingCount: missing.length, pct })
}
