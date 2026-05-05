import { NextResponse, type NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { scrypt, timingSafeEqual } from 'crypto'

// ─── Database: node:sqlite for local, libsql for Turso ──────────────────────

type UserRow = {
  id: string; email: string; name: string | null; password: string | null;
  role: string; sponsorId: string | null;
}

const USER_SQL = `SELECT id, email, name, password, role, sponsorId FROM User WHERE email = ? LIMIT 1`

let queryUser: (email: string) => Promise<UserRow | null>

const localDbUrl = process.env.DATABASE_URL
const tursoUrl = process.env.TURSO_DATABASE_URL
const tursoToken = process.env.TURSO_AUTH_TOKEN

if (localDbUrl?.startsWith('file:')) {
  const { DatabaseSync } = require('node:sqlite')
  const dbPath = localDbUrl.replace('file:', '')
  const sqlite = new DatabaseSync(dbPath)
  const stmt = sqlite.prepare(USER_SQL)
  queryUser = async (email) => (stmt.get(email) as UserRow) ?? null
} else if (tursoUrl && tursoToken && tursoUrl.startsWith('libsql://')) {
  // Dynamic require hidden from webpack static analysis
  const { createClient } = (0, eval)('require')('@libsql/client') as typeof import('@libsql/client')
  const client = createClient({ url: tursoUrl, authToken: tursoToken })
  queryUser = async (email) => {
    const r = await client.execute({ sql: USER_SQL, args: [email] })
    return (r.rows[0] as unknown as UserRow) ?? null
  }
} else {
  throw new Error('[login] No database configured — set DATABASE_URL or TURSO_DATABASE_URL')
}

// ─── Fast inline password verify ────────────────────────────────────────────
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 64

function verifyFast(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const parts = hash.split('.')
    if (parts.length < 2) return resolve(false)
    const [hashed, salt, costStr] = parts
    if (!hashed || !salt) return resolve(false)
    const N = costStr ? parseInt(costStr, 10) : 16384
    scrypt(password, salt, SCRYPT_KEYLEN, { N, r: SCRYPT_R, p: SCRYPT_P }, (err, buf) => {
      if (err) return reject(err)
      resolve(timingSafeEqual(buf, Buffer.from(hashed, 'hex')))
    })
  })
}

// ─── Single-request login endpoint ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.email || !body?.password) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
  }

  const email = body.email.trim().toLowerCase()

  const user = await queryUser(email)
  if (!user?.password) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const valid = await verifyFast(body.password, user.password)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const secret = process.env.NEXTAUTH_SECRET!
  const token = await encode({
    secret,
    token: {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name ?? email.split('@')[0],
      role: user.role,
      sponsorId: user.sponsorId ?? null,
    },
    maxAge: 30 * 24 * 60 * 60,
  })

  const res = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sponsorId: user.sponsorId,
    },
  })

  const isSecure = req.nextUrl.protocol === 'https:'
  const cookieName = isSecure
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'

  res.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })

  return res
}
