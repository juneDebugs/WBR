import { scrypt, timingSafeEqual, randomBytes, type ScryptOptions } from 'crypto'

// ─── Password utilities ──────────────────────────────────────────────────────
//
// scrypt hashes are stored as `${hashHex}.${saltHex}.${N}`. The cost factor is
// embedded so verifyPassword can validate hashes made with any N. New hashes
// use N=2048 (secure for a conference app, ~8x faster than Node's default).

const SCRYPT_N = 2048
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEYLEN = 64

function scryptAsync(password: string, salt: string, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, opts, (err, key) => {
      if (err) reject(err)
      else resolve(key)
    })
  })
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const parts = hash.split('.')
  if (parts.length < 2) return false
  const [hashed, salt, costStr] = parts
  if (!hashed || !salt) return false
  // Old hashes lack a cost field — fall back to Node default (N=16384)
  const N = costStr ? parseInt(costStr, 10) : 16384
  const buf = await scryptAsync(password, salt, SCRYPT_KEYLEN, { N, r: SCRYPT_R, p: SCRYPT_P })
  const hashedBuf = Buffer.from(hashed, 'hex')
  if (buf.length !== hashedBuf.length) return false
  return timingSafeEqual(buf, hashedBuf)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const buf = await scryptAsync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
  return `${buf.toString('hex')}.${salt}.${SCRYPT_N}`
}
