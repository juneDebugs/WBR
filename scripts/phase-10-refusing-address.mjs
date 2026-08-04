#!/usr/bin/env node
// An address that refuses everything, for witnessing Phase 10's refusal log.
//
//   node scripts/phase-10-refusing-address.mjs [port]
//
// Point ATTENDEE_APP_URL at this and every cache invalidation the admin app sends
// is refused with 403. Used by scripts/phase-10-witness-refusal-log.mjs.
//
// Why a purpose-built refuser rather than an existing address: it has to refuse
// for an unambiguous reason. Pointing the helper at a path that happens to 404, or
// at an app whose middleware redirects, would produce a refusal that could be read
// as something other than "the other app said no" — and this criterion exists
// precisely because a silent failure was once mistaken for success.
//
// 403 rather than 401: the helper treats any non-2xx the same way, and 403 cannot
// be confused with the genuine 401 the participant app returns when the shared
// secret is wrong, which is a different case with its own coverage.

import { createServer } from 'node:http'

const port = Number(process.argv[2] ?? 3999)

const server = createServer((req, res) => {
  console.log(`refused ${req.method} ${req.url}`)
  res.writeHead(403, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'This address refuses everything, on purpose.' }))
})

server.listen(port, () => {
  console.log(`refusing address listening on http://localhost:${port} — answers 403 to everything`)
})
