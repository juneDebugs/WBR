// Detect / start / stop a `next start` prod server on a given port.
//
// `ensureServer({ app, port })` returns `{ url, stop, started }`:
//   - If the port is already listening, returns the URL and a no-op `stop()`
//     plus `started: false` so the caller knows not to kill someone else's
//     server.
//   - Otherwise spawns `pnpm exec next start -p <port>` from `apps/<app>` and
//     waits up to 60s for the port to listen. Returns `started: true` so the
//     caller knows to call `stop()` on cleanup.

import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import net from 'node:net'

function portInUse(port) {
  return new Promise((resolve) => {
    const tester = net.connect({ port, host: 'localhost' }, () => {
      tester.end()
      resolve(true)
    })
    tester.once('error', () => resolve(false))
  })
}

export async function ensureServer({ app, port, timeoutMs = 60_000 }) {
  if (await portInUse(port)) {
    return { url: `http://localhost:${port}`, stop: async () => {}, started: false }
  }

  const child = spawn('pnpm', ['exec', 'next', 'start', '-p', String(port)], {
    cwd: `apps/${app}`,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // Stream stderr so build/start errors surface in the runner's output.
  child.stderr.on('data', (d) => process.stderr.write(`[server:${app}] ${d}`))

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(500)
    if (await portInUse(port)) {
      return {
        url: `http://localhost:${port}`,
        stop: async () => {
          child.kill('SIGTERM')
          await sleep(500)
        },
        started: true,
      }
    }
    if (child.exitCode !== null) {
      throw new Error(`server ${app}:${port} exited with code ${child.exitCode} before listening`)
    }
  }

  child.kill('SIGTERM')
  throw new Error(`server ${app}:${port} did not start within ${timeoutMs}ms`)
}
