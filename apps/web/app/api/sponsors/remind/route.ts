import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import * as nodemailer from 'nodemailer'
import OpenAI from 'openai'

const CHECKLIST = [
  { key: 'logo',        label: 'Upload your company logo',           check: (s: any) => !!s.logoUrl },
  { key: 'tagline',     label: 'Add a company tagline',              check: (s: any) => !!s.tagline },
  { key: 'description', label: 'Write a company description',        check: (s: any) => !!s.description && s.description.length > 20 },
  { key: 'contact',     label: 'Set primary contact name & email',   check: (s: any) => !!s.contactName && !!s.contactEmail },
  { key: 'booth',       label: 'Confirm your booth number',          check: (s: any) => !!s.boothNumber },
  { key: 'solutions',   label: 'List your solutions / offerings',    check: (s: any) => { try { return JSON.parse(s.solutionsOffering || '[]').length > 0 } catch { return false } } },
  { key: 'teammates',   label: 'Assign at least one team member',    check: (s: any) => s._count.users > 0 },
  { key: 'website',     label: 'Add your website URL',               check: (s: any) => !!s.website },
  { key: 'social',      label: 'Add LinkedIn or Twitter/X link',     check: (s: any) => !!s.socialLinkedIn || !!s.socialTwitter },
]

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

  const missing = CHECKLIST.filter(item => !item.check(sponsor)).map(item => item.label)
  const done = CHECKLIST.length - missing.length
  const pct = Math.round((done / CHECKLIST.length) * 100)

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
