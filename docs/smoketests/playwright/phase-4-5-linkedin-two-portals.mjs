/**
 * Phases 4+5 — sign in with LinkedIn on the meetings portal and the sponsor
 * portal. Merged into one deliverable as UF-52.
 *
 * WHAT THIS SCRIPT IS FOR, AND WHAT IT CANNOT DO.
 *
 * A real LinkedIn sign-in cannot be driven from a script: LinkedIn asks for an
 * account password, and this project's rules forbid putting one in a script.
 * Group D of the smoketest document covers that part by hand. Everything a
 * script CAN settle is settled here, and the split is stated rather than hidden.
 *
 *   Group S — the shape of the change: one module, three importers, and the
 *             arguments each application actually passes at its own call site.
 *   Group A — the decision rules, called directly.
 *   Group B — negative controls over Group A.
 *   Group C — the running applications: registered providers, the button, and
 *             the sentences each refusal marker produces.
 *
 * WHAT GROUP A DOES NOT PROVE, STATED PLAINLY BECAUSE ROUND 2 OF THE ADVERSARIAL
 * REVIEW CAUGHT THIS DOCUMENT CLAIMING OTHERWISE. Group A calls the shared
 * decision function with arguments this file supplies. It therefore proves the
 * function is right; it proves nothing about whether an application passes the
 * right arguments, or honours the answer. That is Group S's job, by reading each
 * application's own call site, and Step 4's job, by hand, for the database
 * effects. No check here establishes that a refused sign-in leaves no row — only
 * that the decision handed to the caller contains nothing to write.
 *
 * ON GROUP B. Three controls in the previous session were worthless: two turned
 * a run red through a compile error rather than a failed assertion, and one
 * stayed green with its defect present. Two rules follow from that, and round 2
 * added the second:
 *
 *   1. A control must fail on an assertion. Every control here re-creates its
 *      defect as a function in this same file, so it cannot fail to compile.
 *   2. A control must run THE ASSERTION IT VOUCHES FOR, not a paraphrase of it.
 *      Each shared assertion below is a named function called by Group A and by
 *      Group B. Rewriting the assertion changes both, so a control cannot go on
 *      vouching for a check that no longer says what it said.
 *
 * RUN:
 *   node docs/smoketests/playwright/phase-4-5-linkedin-two-portals.mjs
 *
 * Group C needs both portals running. It is SKIPPED when they are not, which
 * would let an incomplete run exit 0 — so require it explicitly when the run is
 * the one being recorded:
 *   REQUIRE_PORTALS=1 node docs/smoketests/playwright/phase-4-5-linkedin-two-portals.mjs
 *
 *   pnpm --filter meetings build && pnpm --filter meetings start   # port 3002
 *   pnpm --filter sponsor  build && pnpm --filter sponsor  start   # port 3003
 */

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, readdirSync, statSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../..')
const RULES = join(REPO, 'packages/db/src/linkedin-identity.ts')
const ACCESS = join(REPO, 'packages/db/src/app-access.ts')

const MEETINGS_URL = process.env.MEETINGS_URL ?? 'http://localhost:3002'
const SPONSOR_URL = process.env.SPONSOR_URL ?? 'http://localhost:3003'
const REQUIRE_PORTALS = process.env.REQUIRE_PORTALS === '1'

let passed = 0
let failed = 0
const failures = []

function check(id, description, fn) {
  let outcome
  try {
    outcome = fn()
  } catch (e) {
    failed++
    failures.push(`${id} ${description}\n      threw: ${e.message}`)
    console.log(`  FAIL ${id} ${description}\n       threw: ${e.message}`)
    return false
  }
  if (outcome === true) {
    passed++
    console.log(`  pass ${id} ${description}`)
    return true
  }
  failed++
  failures.push(`${id} ${description}\n      ${outcome}`)
  console.log(`  FAIL ${id} ${description}\n       ${outcome}`)
  return false
}

/** Assertion helpers that return either `true` or a sentence saying what was seen. */
const expect = {
  kind(action, wanted) {
    return action.kind === wanted ? true : `expected kind "${wanted}", got "${action.kind}"`
  },
  field(object, key, wanted) {
    return object[key] === wanted
      ? true
      : `expected ${key} to be ${JSON.stringify(wanted)}, got ${JSON.stringify(object[key])}`
  },
}

const rules = await import(RULES)
const access = await import(ACCESS)

const {
  linkedInAction,
  linkedInSignInDecision,
  linkedInBindingDecision,
  prefillFields,
  LINKEDIN_NO_ACCOUNT_MARKER,
  LINKEDIN_NO_EMAIL_MARKER,
  LINKEDIN_UNVERIFIED_MARKER,
} = rules
const { canAccessApp } = access

/** The three applications' own role tests, exactly as their sign-in files pass them. */
const admits = {
  attendee: role => canAccessApp('attendee', role),
  meetings: role => canAccessApp('meetings', role),
  sponsor: role => canAccessApp('sponsor', role),
}

/** The role each application gives an account it creates. All three say ATTENDEE. */
const CREATE_ROLE = 'ATTENDEE'

/** A sign-in arriving with everything in order, unless a case overrides it. */
function arrival(overrides = {}) {
  return {
    email: 'newcomer@example.com',
    emailVerified: true,
    existing: null,
    incoming: { name: 'A Newcomer', image: 'https://example.com/photo.jpg' },
    createRole: CREATE_ROLE,
    ...overrides,
  }
}

/**
 * THE SHARED ASSERTIONS.
 *
 * Each takes the decision function to exercise, so Group A can pass the shipped
 * one and Group B can pass a deliberately broken one. There is exactly one copy
 * of each assertion, which is what stops a control vouching for a check that has
 * since been reworded.
 */
const assertion = {
  sponsorRefusesAFirstTimer(action) {
    const outcome = action({ ...arrival(), roleAdmitted: admits.sponsor })
    if (outcome.kind !== 'refuse') return `expected kind "refuse", got "${outcome.kind}"`
    return expect.field(outcome, 'redirectTo', `/login?error=${LINKEDIN_NO_ACCOUNT_MARKER}`)
  },

  aRefusalCarriesNothingToWrite(action) {
    // Every input below must produce a refusal. Each is checked, so a decision
    // function that admits one of them fails here rather than passing vacuously.
    const refusingInputs = [
      ['a first-timer at the sponsor portal', { ...arrival(), roleAdmitted: admits.sponsor }],
      ['no email address at all', { ...arrival({ email: null }), roleAdmitted: admits.meetings }],
      [
        'an unverified address at an account that exists',
        {
          ...arrival({ emailVerified: false, existing: { role: 'SPONSOR', name: null, image: null } }),
          roleAdmitted: admits.sponsor,
        },
      ],
      [
        'a role the portal does not admit',
        {
          ...arrival({ existing: { role: 'ATTENDEE', name: null, image: null } }),
          roleAdmitted: admits.sponsor,
        },
      ],
    ]
    for (const [label, input] of refusingInputs) {
      const outcome = action(input)
      if (outcome.kind !== 'refuse') return `${label}: expected a refusal, got "${outcome.kind}"`
      const wrote = ['email', 'name', 'image', 'role', 'update'].filter(k => k in outcome)
      if (wrote.length > 0) return `${label}: the refusal carried ${wrote.join(', ')}`
    }
    return true
  },

  /**
   * The role written is the role that was TESTED — not merely a role this file
   * also happens to name.
   *
   * Round 2 was right that comparing the result to a constant declared here
   * proves nothing about the tested value. So a sentinel role is used, and the
   * role test records what it was asked about. Two things must hold: the test
   * was asked about the sentinel, and the sentinel came back out.
   */
  theCreatedRoleIsTheRoleThatWasTested(action) {
    const SENTINEL = 'ROLE_UNDER_TEST'
    const asked = []
    const outcome = action({
      ...arrival({ createRole: SENTINEL }),
      roleAdmitted: role => {
        asked.push(role)
        return true
      },
    })
    if (outcome.kind !== 'create') return `expected kind "create", got "${outcome.kind}"`
    if (!asked.includes(SENTINEL)) {
      return `the role test was never asked about the role being created; it was asked about ${JSON.stringify(asked)}`
    }
    return expect.field(outcome, 'role', SENTINEL)
  },
}

// ---------------------------------------------------------------------------
console.log('\nGroup S — the shape of the change [contract]\n')

/** Every .ts/.tsx file in the repository, ignoring build output and dependencies. */
function sourceFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.next', '.git', 'dist', '.claude'].includes(entry)) continue
    const full = join(dir, entry)
    const info = statSync(full)
    if (info.isDirectory()) sourceFiles(full, found)
    else if (/\.tsx?$/.test(entry)) found.push(full)
  }
  return found
}

const allSources = sourceFiles(REPO)

check('S1', 'exactly one linkedin-identity module exists in the repository (AC-1)', () => {
  const copies = allSources.filter(f => f.endsWith('linkedin-identity.ts'))
  if (copies.length !== 1) {
    return `found ${copies.length} copies: ${copies.map(f => f.replace(REPO + '/', '')).join(', ')}`
  }
  return copies[0] === RULES ? true : `the one copy is at ${copies[0].replace(REPO + '/', '')}`
})

check('S2', 'no application imports it from anywhere but the shared package (AC-1)', () => {
  const wrong = []
  for (const file of allSources) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/from\s+'([^']*linkedin-identity)'/g)) {
      if (match[1] !== '@conference/db/src/linkedin-identity') {
        wrong.push(`${file.replace(REPO + '/', '')} imports '${match[1]}'`)
      }
    }
  }
  return wrong.length === 0 ? true : wrong.join('; ')
})

/**
 * The arguments each application actually passes.
 *
 * Round 2's first finding: Group A reconstructs `roleAdmitted` and `createRole`
 * itself, so it would stay green if an application passed the wrong ones. This
 * reads the three sign-in files and asserts what is written there. It is a
 * source assertion rather than a behavioural one, and that limit is real — but
 * a wrong app name or a wrong created role is a textual mistake, and this is
 * what catches it.
 */
const CALL_SITES = [
  ['attendee', join(REPO, 'apps/attendee/lib/auth.ts')],
  ['meetings', join(REPO, 'apps/meetings/lib/auth.ts')],
  ['sponsor', join(REPO, 'apps/sponsor/lib/auth.ts')],
]

for (const [app, file] of CALL_SITES) {
  const text = readFileSync(file, 'utf8')
  const short = file.replace(REPO + '/', '')

  check(`S3-${app}`, `${short} asks its own role test, not another application's`, () => {
    const found = [...text.matchAll(/roleAdmitted:\s*role\s*=>\s*canAccessApp\('([a-z]+)'/g)].map(m => m[1])
    if (found.length !== 1) return `expected one roleAdmitted line, found ${found.length}`
    return found[0] === app ? true : `it asks canAccessApp('${found[0]}'), not '${app}'`
  })

  check(`S4-${app}`, `${short} states the role a new account would be given`, () => {
    const found = [...text.matchAll(/createRole:\s*'([A-Z_]+)'/g)].map(m => m[1])
    if (found.length !== 1) return `expected one createRole line, found ${found.length}`
    return found[0] === CREATE_ROLE ? true : `it states '${found[0]}', expected '${CREATE_ROLE}'`
  })
}

/**
 * The LinkedIn branch of a sign-in file, and only that branch.
 *
 * Round 3 found the first version of this slicing from one provider string to
 * the next, which breaks the moment the two branches are reordered or a comment
 * mentions the other one. This matches braces instead: find the `if` that opens
 * the LinkedIn branch, then walk forward counting braces until it closes.
 * Returns null when the branch cannot be located, and every caller treats null
 * as a failure rather than as an empty branch that trivially passes.
 */
function linkedInBranchOf(text) {
  const opener = text.indexOf("if (account?.provider === 'linkedin')")
  if (opener === -1) return null
  const firstBrace = text.indexOf('{', opener)
  if (firstBrace === -1) return null
  let depth = 0
  for (let i = firstBrace; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return text.slice(firstBrace, i + 1)
    }
  }
  return null
}

check('S5', 'the two applications that create accounts write the role the decision returned', () => {
  // The sponsor portal is excluded: every create is refused there, so it has no
  // create branch to check. That exclusion is asserted separately, at S6.
  //
  // Everything below is read from INSIDE the LinkedIn branch, so a role literal
  // living elsewhere in the file — the Google branch writes one, legitimately —
  // is neither counted against this check nor able to satisfy it.
  const wrong = []
  for (const [app, file] of CALL_SITES.filter(([a]) => a !== 'sponsor')) {
    const branch = linkedInBranchOf(readFileSync(file, 'utf8'))
    if (branch === null) {
      wrong.push(`${app}: could not locate the LinkedIn branch`)
      continue
    }
    if (!/role:\s*action\.role/.test(branch)) {
      wrong.push(`${app} does not write "role: action.role" inside its LinkedIn branch`)
    }
    const literals = [...branch.matchAll(/role:\s*'([A-Z_]+)'/g)].map(m => m[1])
    if (literals.length > 0) {
      wrong.push(`${app} writes a role literal inside its LinkedIn branch: ${literals.join(', ')}`)
    }
  }
  return wrong.length === 0 ? true : wrong.join('; ')
})

check('S6', 'the sponsor portal has no path that creates an account from a LinkedIn sign-in', () => {
  const branch = linkedInBranchOf(readFileSync(join(REPO, 'apps/sponsor/lib/auth.ts'), 'utf8'))
  if (branch === null) return 'could not locate the sponsor portal\'s LinkedIn branch to read'
  const writes = [...branch.matchAll(/prisma\.user\.(create|upsert)/g)].map(m => m[1])
  return writes.length === 0
    ? true
    : `the LinkedIn branch calls prisma.user.${writes.join(', prisma.user.')} — the sponsor portal must never create an account this way`
})

check('S6b', 'that branch check is reading a real branch, not an empty slice', () => {
  // A slice that silently came back empty would make S6 pass forever. Round 3's
  // point about the first version. Each branch must contain the decision call it
  // is supposed to be about.
  for (const [app, file] of CALL_SITES) {
    const branch = linkedInBranchOf(readFileSync(file, 'utf8'))
    if (branch === null) return `${app}: no LinkedIn branch found`
    if (!/linkedInAction\(/.test(branch)) {
      return `${app}: the located branch does not call linkedInAction — the slice is wrong`
    }
  }
  return true
})

check('S7', 'the role tables are what every check below assumes, not what it hopes', () => {
  const facts = [
    ['sponsor', 'ATTENDEE', false],
    ['sponsor', 'SPONSOR', true],
    ['sponsor', 'ORGANIZER', true],
    ['meetings', 'ATTENDEE', true],
    ['meetings', 'SPONSOR', false],
    ['attendee', 'ATTENDEE', true],
  ]
  for (const [app, role, wanted] of facts) {
    if (canAccessApp(app, role) !== wanted) {
      return `canAccessApp('${app}', '${role}') is ${canAccessApp(app, role)}, expected ${wanted}`
    }
  }
  return true
})

// ---------------------------------------------------------------------------
console.log('\nGroup A — the decision rules, called directly [contract]\n')

function actionFor(app, overrides = {}) {
  return linkedInAction({ ...arrival(overrides), roleAdmitted: admits[app] })
}

check('A1', 'participant app: a first-time person is created', () =>
  expect.kind(actionFor('attendee'), 'create')
)

check('A2', 'meetings portal: a first-time person is created', () =>
  expect.kind(actionFor('meetings'), 'create')
)

check('A3', 'sponsor portal: a first-time person is refused, by name, not created (UF-53)', () =>
  assertion.sponsorRefusesAFirstTimer(linkedInAction)
)

check('A4', 'every refusal carries nothing to write — four different refusals', () =>
  assertion.aRefusalCarriesNothingToWrite(linkedInAction)
)

check('A5', 'a created account carries the role the role test was asked about', () =>
  assertion.theCreatedRoleIsTheRoleThatWasTested(linkedInAction)
)

check('A6', 'sponsor portal: the first-timer refusal does not depend on the address being verified', () => {
  // NOT a check of the unverified rule — the sponsor portal refuses a first-time
  // person on the role, whatever LinkedIn says about the address. Round 2
  // correctly called the original wording of this check a tautology. What it is
  // worth asserting is that the two rules do not interact: an unverified
  // first-timer must not slip past the role refusal.
  const verified = actionFor('sponsor', { emailVerified: true })
  const unverified = actionFor('sponsor', { emailVerified: false })
  if (verified.kind !== 'refuse' || unverified.kind !== 'refuse') {
    return `expected both to refuse, got "${verified.kind}" and "${unverified.kind}"`
  }
  return verified.redirectTo === unverified.redirectTo
    ? true
    : `the two refusals name different causes: ${verified.redirectTo} and ${unverified.redirectTo}`
})

check('A7', 'sponsor portal: an existing sponsor representative joins their own account', () =>
  expect.kind(actionFor('sponsor', { existing: { role: 'SPONSOR', name: 'Rep', image: null } }), 'join')
)

check('A8', 'sponsor portal: a join writes only the blank field, leaving the edited name alone', () => {
  const action = actionFor('sponsor', {
    existing: { role: 'SPONSOR', name: 'Name They Corrected', image: null },
  })
  if (action.kind !== 'join') return `expected kind "join", got "${action.kind}"`
  const keys = Object.keys(action.update)
  return keys.length === 1 && keys[0] === 'image'
    ? true
    : `expected only the blank photo to be written, got ${JSON.stringify(action.update)}`
})

check('A9', 'sponsor portal: a delegate whose address matches is refused, with no cause named', () => {
  // Naming a cause here would confirm to whoever pressed the button that this
  // address has an account on this portal. The generic refusal does not.
  const action = actionFor('sponsor', {
    existing: { role: 'ATTENDEE', name: 'A Delegate', image: null },
  })
  if (action.kind !== 'refuse') return `expected kind "refuse", got "${action.kind}"`
  return expect.field(action, 'redirectTo', null)
})

check('A10', 'meetings portal: a sponsor representative is refused — that portal excludes them', () =>
  expect.kind(actionFor('meetings', { existing: { role: 'SPONSOR', name: 'Rep', image: null } }), 'refuse')
)

check('A11', 'meetings portal: WBR staff pass through on an existing account', () =>
  expect.kind(
    actionFor('meetings', { existing: { role: 'ORGANIZER', name: 'Staff', image: null } }),
    'join'
  )
)

check('A12', 'no email address: refused before anything else, on every application', () => {
  for (const app of ['attendee', 'meetings', 'sponsor']) {
    const action = actionFor(app, { email: null })
    if (action.kind !== 'refuse') return `${app}: expected "refuse", got "${action.kind}"`
    if (action.redirectTo !== `/login?error=${LINKEDIN_NO_EMAIL_MARKER}`) {
      return `${app}: expected the no-email marker, got ${JSON.stringify(action.redirectTo)}`
    }
  }
  return true
})

check('A13', 'an unverified address may not join an account that already exists', () => {
  const action = actionFor('sponsor', {
    emailVerified: false,
    existing: { role: 'SPONSOR', name: 'A Rep', image: null },
  })
  if (action.kind !== 'refuse') return `expected "refuse", got "${action.kind}"`
  return expect.field(action, 'redirectTo', `/login?error=${LINKEDIN_UNVERIFIED_MARKER}`)
})

check('A14', 'the decision still produces the participant application\'s three outcomes', () => {
  // NOT a check that apps/attendee behaves as before — this file does not run
  // that application. Round 2 was right to say so. What this asserts is that the
  // shared decision, given the participant application's own role test, still
  // answers as it did. The application itself is covered by the phase 12 script,
  // which drives it in a browser; the smoketest document points AC-2 there.
  const created = actionFor('attendee')
  if (created.kind !== 'create') return `first-time person: expected "create", got "${created.kind}"`

  const joined = actionFor('attendee', {
    existing: { role: 'ATTENDEE', name: 'Corrected Name', image: null },
  })
  if (joined.kind !== 'join') return `returning person: expected "join", got "${joined.kind}"`
  if (JSON.stringify(joined.update) !== JSON.stringify({ image: 'https://example.com/photo.jpg' })) {
    return `pre-fill wrote more than the blank field: ${JSON.stringify(joined.update)}`
  }

  const refused = actionFor('attendee', { email: null })
  if (refused.kind !== 'refuse') return `no address: expected "refuse", got "${refused.kind}"`
  return true
})

// ---------------------------------------------------------------------------
console.log('\nGroup B — negative controls [contract]\n')

/**
 * The create path as it stood before UF-53: `create` returned before anything
 * consulted the role.
 */
function actionWithoutCreateRoleCheck(args) {
  const signIn = linkedInSignInDecision({ email: args.email })
  if (!signIn.allowed) return { kind: 'refuse', redirectTo: signIn.redirectTo }
  const binding = linkedInBindingDecision({
    emailVerified: args.emailVerified,
    personExists: args.existing !== null,
  })
  if (!binding.allowed) return { kind: 'refuse', redirectTo: binding.redirectTo }
  if (args.existing === null) {
    // THE DEFECT: no role test here.
    return { kind: 'create', email: signIn.email, name: args.incoming.name, image: args.incoming.image }
  }
  if (!args.roleAdmitted(args.existing.role)) return { kind: 'refuse', redirectTo: null }
  return { kind: 'join', update: prefillFields(args.existing, args.incoming) }
}

/**
 * A refusal that carries the fields it would have written.
 *
 * A separate defect from the one above, and round 2 was right that it needed to
 * be: the create-path defect returns a CREATE, so asserting against it only
 * proves the check notices a create. This one returns a refusal that still
 * carries write data, which is the shape F-28 recorded and the shape the
 * no-write assertion actually exists to catch.
 */
function actionWhoseRefusalCarriesAWrite(args) {
  const shipped = linkedInAction(args)
  if (shipped.kind !== 'refuse') return shipped
  return { ...shipped, update: { name: args.incoming.name }, email: args.email }
}

/** The create path writing a role of its own rather than the one that was tested. */
function actionWithDriftingCreateRole(args) {
  const shipped = linkedInAction(args)
  if (shipped.kind !== 'create') return shipped
  // THE DEFECT: a literal repeated here instead of the role the decision tested.
  return { ...shipped, role: 'ATTENDEE' }
}

/** The create path returning the tested role but never asking the role test. */
function actionThatNeverAsksOnCreate(args) {
  const signIn = linkedInSignInDecision({ email: args.email })
  if (!signIn.allowed) return { kind: 'refuse', redirectTo: signIn.redirectTo }
  if (args.existing === null) {
    // THE DEFECT: the role travels out, so it LOOKS tested, but nothing asked.
    return {
      kind: 'create',
      email: signIn.email,
      name: args.incoming.name,
      image: args.incoming.image,
      role: args.createRole,
    }
  }
  if (!args.roleAdmitted(args.existing.role)) return { kind: 'refuse', redirectTo: null }
  return { kind: 'join', update: prefillFields(args.existing, args.incoming) }
}

function control(id, description, brokenAction, sharedAssertion) {
  return check(id, description, () => {
    const outcome = sharedAssertion(brokenAction)
    return outcome === true
      ? 'the control stayed GREEN with its defect present — the check it vouches for proves nothing'
      : true
  })
}

control(
  'B1',
  'A3 turns red when the create-path role test is removed',
  actionWithoutCreateRoleCheck,
  assertion.sponsorRefusesAFirstTimer
)

control(
  'B2',
  'A4 turns red when a refusal carries the fields it would have written',
  actionWhoseRefusalCarriesAWrite,
  assertion.aRefusalCarriesNothingToWrite
)

control(
  'B3',
  'A4 also turns red when the create-path role test is removed',
  actionWithoutCreateRoleCheck,
  assertion.aRefusalCarriesNothingToWrite
)

control(
  'B4',
  'A5 turns red when the created role drifts from the role that was tested',
  actionWithDriftingCreateRole,
  assertion.theCreatedRoleIsTheRoleThatWasTested
)

control(
  'B5',
  'A5 turns red when the role travels out but the role test is never asked',
  actionThatNeverAsksOnCreate,
  assertion.theCreatedRoleIsTheRoleThatWasTested
)

// ---------------------------------------------------------------------------
console.log('\nGroup C — the running portals [contract]\n')

async function providersAt(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/providers`, { redirect: 'manual' })
  if (!res.ok) throw new Error(`${baseUrl} answered ${res.status}`)
  return res.json()
}

async function reachable(baseUrl) {
  try {
    await fetch(`${baseUrl}/api/auth/providers`, { signal: AbortSignal.timeout(3000) })
    return true
  } catch {
    return false
  }
}

const portals = [
  ['meetings portal', MEETINGS_URL, 'C1'],
  ['sponsor portal', SPONSOR_URL, 'C2'],
]

const running = []
for (const portal of portals) {
  if (await reachable(portal[1])) running.push(portal)
  else if (REQUIRE_PORTALS) {
    check(portal[2], `${portal[0]} is running at ${portal[1]}`, () =>
      `not reachable, and REQUIRE_PORTALS=1 was set — this group is not optional for a recorded run`
    )
  } else {
    console.log(`  SKIP ${portal[2]} ${portal[0]} not running at ${portal[1]}`)
    console.log('       (set REQUIRE_PORTALS=1 to make a skipped portal a failure)')
  }
}

for (const [name, url, id] of running) {
  const providers = await providersAt(url)
  check(`${id}a`, `${name} registers LinkedIn when both credentials are set`, () =>
    'linkedin' in providers
      ? true
      : `the provider list holds ${Object.keys(providers).join(', ')} — LinkedIn is absent`
  )
  check(`${id}b`, `${name} sends people to its own callback address`, () =>
    // NOTE: this is the address the portal WILL send. Whether that address is
    // registered on the LinkedIn developer application is a separate fact, which
    // no request from here can establish; the smoketest records it by hand.
    providers.linkedin?.callbackUrl === `${url}/api/auth/callback/linkedin`
      ? true
      : `callback is ${JSON.stringify(providers.linkedin?.callbackUrl)}, expected ${url}/api/auth/callback/linkedin`
  )
}

/**
 * The button and the refusal sentences, in a real browser.
 *
 * The button cannot be read from the server's HTML: the screen asks the running
 * portal which providers exist and only then draws it, so the markup that
 * arrives first never contains it.
 */
if (running.length > 0) {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  try {
    for (const [name, url, id] of running) {
      const page = await browser.newPage()
      await page.goto(`${url}/login`, { waitUntil: 'networkidle' })
      const drawn = await page.getByTestId('signin-linkedin').count()
      check(`${id}c`, `${name} draws the LinkedIn button on its sign-in screen`, () =>
        drawn === 1 ? true : `found ${drawn} LinkedIn buttons on ${url}/login, expected 1`
      )
      await page.close()

      /**
       * Each marker produces its OWN sentence.
       *
       * Round 2's point: markers being distinct strings does not stop two of them
       * rendering the same text, because each screen keeps its own message table.
       * So the rendered text is read and compared, rather than the markers.
       *
       * Only the sponsor portal carries the no-account message. The meetings
       * portal admits a first-time person rather than refusing one, so that
       * marker cannot occur there — which is asserted, not assumed.
       */
      const markers =
        id === 'C2'
          ? [LINKEDIN_NO_EMAIL_MARKER, LINKEDIN_UNVERIFIED_MARKER, LINKEDIN_NO_ACCOUNT_MARKER]
          : [LINKEDIN_NO_EMAIL_MARKER, LINKEDIN_UNVERIFIED_MARKER]

      const sentences = {}
      for (const marker of markers) {
        const p = await browser.newPage()
        await p.goto(`${url}/login?error=${marker}`, { waitUntil: 'networkidle' })
        sentences[marker] = (await p.locator('body').innerText()).replace(/\s+/g, ' ')
        await p.close()
      }

      // The plain screen, for the comparison below. A refusal message that is
      // always on screen would satisfy every check above while telling everyone
      // who ever loads the page that their sign-in failed.
      const plainPage = await browser.newPage()
      await plainPage.goto(`${url}/login`, { waitUntil: 'networkidle' })
      const plainText = (await plainPage.locator('body').innerText()).replace(/\s+/g, ' ')
      await plainPage.close()

      check(`${id}d`, `${name} gives each refusal marker its own sentence`, () => {
        const bodies = markers.map(m => sentences[m])
        const unique = new Set(bodies)
        return unique.size === markers.length
          ? true
          : `${markers.length} markers produced ${unique.size} distinct screens — two causes read the same`
      })

      if (id === 'C2') {
        check('C2e', `${name} names the no-account cause in words a person can act on`, () =>
          /sponsor portal is open to exhibiting companies/i.test(sentences[LINKEDIN_NO_ACCOUNT_MARKER])
            ? true
            : 'the no-account refusal did not render its own sentence'
        )
      }

      check(`${id}f`, `${name} shows no refusal message on a plain sign-in screen`, () => {
        const leaked = markers.filter(m => sentences[m] === plainText)
        if (leaked.length > 0) {
          return `the screen reads the same with and without ${leaked.join(', ')} — the marker changes nothing`
        }
        return /LinkedIn didn't share an email|hasn't confirmed that email|open to exhibiting companies/i.test(
          plainText
        )
          ? 'a refusal sentence is on screen with no marker in the address'
          : true
      })
    }
  } finally {
    await browser.close()
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log('Failures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
