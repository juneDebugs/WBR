import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import * as nodemailer from 'nodemailer'
import { rateLimit, getClientIp } from '@/lib/rateLimit'

async function getTransporter() {
  // Try Gmail first, then Outlook
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

export async function POST(req: Request) {
  if (!rateLimit(`email:${getClientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { to, subject, body, sponsorId } = await req.json()
  if (!to || !subject || !body) {
    return NextResponse.json({ error: 'to, subject, and body are required' }, { status: 400 })
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(to)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }
  if (subject.length > 200) {
    return NextResponse.json({ error: 'Subject too long (max 200 chars)' }, { status: 400 })
  }
  if (body.length > 10000) {
    return NextResponse.json({ error: 'Body too long (max 10000 chars)' }, { status: 400 })
  }

  const transporter = await getTransporter()

  if (!transporter) {
    // No integration configured — log only
    console.warn(`[email] No email integration configured. Would have sent to ${to}: ${subject}`)
    await prisma.emailLog.create({
      data: { to, subject, body, status: 'FAILED', sponsorId: sponsorId ?? null },
    })
    return NextResponse.json({ error: 'No email integration configured. Connect Gmail or Outlook in Integrations.' }, { status: 503 })
  }

  try {
    // Get sender address from integration metadata
    const gmailIntegration = await prisma.integration.findFirst({
      where: { provider: { in: ['GMAIL', 'OUTLOOK'] }, status: 'CONNECTED' },
    })
    let fromEmail = gmailIntegration?.accountLabel ?? 'noreply@conference.app'
    let fromName = 'WBR 2027'

    const safeHtml = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '<br>')

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text: body,
      html: safeHtml,
    })

    await prisma.emailLog.create({
      data: { to, subject, body, status: 'SENT', sponsorId: sponsorId ?? null },
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[email] Send failed:', err?.message)

    await prisma.emailLog.create({
      data: { to, subject, body, status: 'FAILED', sponsorId: sponsorId ?? null },
    })

    return NextResponse.json(
      { error: err?.message ?? 'Failed to send email' },
      { status: 500 }
    )
  }
}
