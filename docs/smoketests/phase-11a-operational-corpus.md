# Phase 11A Smoketest — Operational Corpus

Verifies the Phase 11A documentation set ships in a consistent, accurate, and usable state.

## What this verifies

Per the PRD §8.5 architectural-fidelity bar + executable run/debug verification bar.

1. All seven Phase 11A files exist at their committed paths.
2. Every in-doc bracket-link target resolves (no broken links inside the Phase 11A set; forward references to Phase 11B files are explicitly enumerated).
3. ADR documents follow Michael Nygard format — each has Status, Context, Decision, Consequences headers.
4. `incident-playbook.md` entries follow the four-step shape (Symptom / Check / Likely cause / Mitigation).
5. Codebase-derived claims in the runbook + ADRs match the codebase as of the smoketest run — `dbConnectionMode` values, NetworkFirst rule table, env-var list in `turbo.json`, scrypt cost factor, multi-mode client behavior.
6. Selected runbook procedures execute end-to-end against the live codebase.
7. No PII (personal names of employees, executives, stakeholders) is present in any of the seven files.

Shape rules: every step below declares its category per [`CONTRACT.md`](CONTRACT.md). All steps in this smoketest are `[contract]` — Phase 11A makes no perf claims that would require a `[perf-bar tier B/C]` step.

---

## Step 1 — All seven Phase 11A files exist [contract]

**Procedure.**

```bash
test -f docs/runbook.md \
  && test -f docs/incident-playbook.md \
  && test -f docs/decisions.md \
  && test -f docs/adr/0001-monorepo-of-four-nextjs-apps.md \
  && test -f docs/adr/0002-nextauth-jwt-sessions-with-scrypt.md \
  && test -f docs/adr/0003-turso-libsql-data-layer.md \
  && test -f docs/adr/0004-base64-images-in-db.md \
  && echo PASS
```

**Pass criterion.** Stdout is exactly `PASS`. Exit code 0.

---

## Step 2 — Every internal bracket link resolves [contract]

**Procedure.** Phase 11A's docs cross-link extensively. Forward references to Phase 11B files (`CLAUDE.md`, `CONTRIBUTING.md`, per-app and per-package READMEs) are expected and acceptable — they resolve when Phase 11B ships. This step verifies that **non-forward** links land on existing files.

```bash
# Enumerate every markdown link (form: [text](target)) inside Phase 11A files,
# then filter out external (http/https/mailto) targets. The two-pass approach
# avoids PCRE lookaheads, which BSD grep does not support.
grep -rEn '\]\(' \
  docs/runbook.md \
  docs/incident-playbook.md \
  docs/decisions.md \
  docs/adr/ \
  | grep -vE '\]\(https?://|\]\(mailto:'

# For each printed target that is a path, confirm the target exists.
# (Manual or scripted; the cold runner walks the list.)
```

The expected forward references to Phase 11B that may not resolve at Phase 11A merge time:
- `CONTRIBUTING.md` (mentioned by file name in `decisions.md`; the entry was rewritten to avoid a bracket-link).

**Pass criterion.** Every listed link target is either (a) an existing file in the repo, (b) an existing anchor in an existing file, or (c) a documented forward reference to a Phase 11B file. No broken bracket-links remain in Phase 11A.

---

## Step 3 — ADR documents follow Nygard format [contract]

**Procedure.**

```bash
for f in docs/adr/0001-*.md docs/adr/0002-*.md docs/adr/0003-*.md docs/adr/0004-*.md; do
  echo "--- $f ---"
  grep -E '^- \*\*Status:\*\*|^## Context$|^## Decision$|^## Consequences$' "$f" | wc -l
done
```

**Pass criterion.** Each of the four ADRs reports `4` — one `Status:` line + three required section headers (`Context`, `Decision`, `Consequences`). Reference and Supersedes headers are present too; they're not part of this minimum.

---

## Step 4 — `incident-playbook.md` entries follow the four-step shape [contract]

**Procedure.** Every numbered entry (1 through 13) carries the four bold markers `**Symptom.**`, `**Check.**`, `**Likely cause.**`, `**Mitigation.**`.

```bash
grep -c '^\*\*Symptom\.\*\*' docs/incident-playbook.md
grep -c '^\*\*Check\.\*\*' docs/incident-playbook.md
grep -c '^\*\*Likely cause\.\*\*' docs/incident-playbook.md
grep -c '^\*\*Mitigation\.\*\*' docs/incident-playbook.md
```

**Pass criterion.** Each of the four counts is `13` (one per failure surface).

---

## Step 5 — `dbConnectionMode` values in runbook match the codebase [contract]

**Procedure.** The runbook's `dbConnectionMode` table at [`runbook.md` → Inspect database state](../runbook.md#inspect-database-state) lists six possible values. Verify each value appears in the source.

```bash
for v in build-phase-sqlite turso-http turso-embedded-replica 'turso-failed:' 'sqlite:' no-database; do
  grep -q "$v" packages/db/src/client.ts || echo "MISSING: $v"
done
echo "All present."
```

**Pass criterion.** No `MISSING:` lines printed. Stdout ends with `All present.`

---

## Step 6 — `turbo.json` env-var list matches the runbook claim [contract]

**Procedure.** The runbook's "Add a new env var across all four projects" procedure says the env-var contract lives at `turbo.json` lines 7 and 12. Confirm.

```bash
sed -n '7p;12p' turbo.json
```

**Pass criterion.** Both printed lines contain `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` as JSON array members.

---

## Step 7 — NetworkFirst rule table matches `apps/attendee/next.config.js` [contract]

**Procedure.** The runbook's "Tune NetworkFirst timeout thresholds" section ships a table of seven rule classes with their handlers and timeouts. Confirm against source.

```bash
grep -E "handler: 'StaleWhileRevalidate'|handler: 'NetworkFirst'|handler: 'CacheFirst'|networkTimeoutSeconds" apps/attendee/next.config.js
```

**Pass criterion.** Output shows exactly:
- 4× `handler: 'StaleWhileRevalidate'` (next-image, cross-origin-images, unsplash-images, static-assets)
- 2× `handler: 'NetworkFirst'` (next-data, pages)
- 1× `handler: 'CacheFirst'` (google-fonts)
- 2× `networkTimeoutSeconds: 5` (next-data, pages)

Total: 7 handler lines + 2 timeout lines = 9 matching lines.

---

## Step 8 — scrypt cost factor in ADR 0002 matches the codebase [contract]

**Procedure.** ADR 0002 names `N = 2048` as the current scrypt cost factor. Confirm against source.

```bash
grep -E "SCRYPT_N|const N" packages/db/src/index.ts | head -5
```

**Pass criterion.** Output contains `const SCRYPT_N = 2048` and the fallback `N = 16384` line for legacy hash verification (`const N = costStr ? parseInt(costStr, 10) : 16384`).

---

## Step 9 — Multi-mode client write-op set in ADR 0003 matches the source [contract]

**Procedure.** ADR 0003 names the write-op set (`create`, `createMany`, `update`, `updateMany`, `delete`, `deleteMany`, `upsert`) as hardcoded at `client.ts:62`. Confirm.

```bash
sed -n '62p' packages/db/src/client.ts
```

**Pass criterion.** Output is the line declaring `const WRITE_OPS = new Set([...])` and includes all seven op names verbatim.

---

## Step 10 — `pnpm db:studio` opens against the canonical local DB [contract]

**Procedure.** Runbook claims `pnpm db:studio` opens Prisma Studio on `localhost:5555`. The `db:studio` script does **not** set `DATABASE_URL` (unlike `db:push` and the seed scripts), so the caller must supply it explicitly.

```bash
DATABASE_URL="file:./packages/db/prisma/dev.db" pnpm db:studio &
STUDIO_PID=$!
sleep 5
curl -fsS http://localhost:5555 > /dev/null && echo PASS || echo FAIL
kill $STUDIO_PID 2>/dev/null
wait 2>/dev/null
```

**Pass criterion.** Stdout contains `PASS`. The HTTP fetch on `localhost:5555` returns a non-error response.

---

## Step 11 — `./dev.sh` launches all four apps [contract]

**Procedure.** Runbook claims `./dev.sh` brings all four apps up on ports 3000–3003. Verify each port serves a response after the launcher's 8-second readiness window.

```bash
./dev.sh
sleep 12  # 8s launcher sleep + 4s buffer for slow startup
for port in 3000 3001 3002 3003; do
  curl -fsSI -o /dev/null -w "port $port: %{http_code}\n" "http://localhost:$port"
done
./clean.sh  # teardown
```

**Pass criterion.** Each port reports a `200`, `302`, or `307` status code (200 = root content, 302/307 = redirect to `/login`, both acceptable). No `000` (connection refused) or `5xx` entries.

---

## Step 12 — No personal names appear in committed Phase 11A docs [contract]

**Procedure.** Committed engineering docs use role labels, not personal names. The scan combines a generic heuristic (no literal names committed to the smoketest itself) with a manual review against the runner's working list of names — that list lives outside the committed tree, in the engineer-of-record's session memory.

```bash
# Generic heuristic — flags name-with-suffix (-san) patterns and "Mr./Ms./Dr." salutations.
# Does not enumerate any specific names, so the smoketest itself is safe to include in scope.
grep -inE '\b[A-Z][a-z]+[- ]san\b|\b(Mr|Ms|Mrs|Dr)\. [A-Z][a-z]+' \
  docs/runbook.md \
  docs/incident-playbook.md \
  docs/decisions.md \
  docs/adr/*.md \
  docs/smoketests/phase-11a-operational-corpus.md \
  || echo "Heuristic: no match."
```

Then a **manual review pass**: the runner reads each of the seven Phase 11A files and the smoketest itself, looking for personal names from their session context (stakeholders, employees, customers, anyone mentioned in PRD / handoff / async-comms artifacts). This step is irreducibly manual — there is no committed denylist to grep against.

**Pass criterion.** Both halves pass — the heuristic emits `Heuristic: no match.`, and the manual review surfaces no personal names. Any match is edited out before merge.

Edge case: external library names or generic English words that happen to match (rare; surface explicitly in the run log if it happens).

---

## Step 13 — Runbook + incident-playbook + decisions + ADRs cross-link bidirectionally [contract]

**Procedure.** Spot-check that each ADR references the runbook/incident-playbook procedures it implicates, and vice versa:

- `runbook.md` → references `decisions.md`, `architecture.md`, `incident-playbook.md`, smoketest CONTRACT (manual scan).
- `incident-playbook.md` → references `runbook.md`, `architecture.md`, `decisions.md`, `client.ts` (manual scan).
- `decisions.md` → references all four ADRs, `architecture.md`, `runbook.md`, `incident-playbook.md` (manual scan).
- `adr/0001` → references `architecture.md`, `decisions.md`, `0002`, `0003` (manual scan).
- `adr/0002` → references `architecture.md`, `runbook.md`, `incident-playbook.md`, `decisions.md`, `0001`, `packages/db/src/index.ts` (manual scan).
- `adr/0003` → references `architecture.md`, `runbook.md`, `incident-playbook.md`, `decisions.md`, `packages/db/src/client.ts`, `packages/db/src/index.ts`, `0004` (manual scan).
- `adr/0004` → references `decisions.md`, `architecture.md`, `0003`, two smoketests (`phase-1`, `phase-15`) (manual scan).

**Pass criterion.** Every named cross-reference is present in the relevant file. Runner records a short summary of which references were verified.

---

## Summary table

| Step | Category | Verified |
|---|---|---|
| 1 — Seven files exist | contract | ☐ |
| 2 — Internal links resolve | contract | ☐ |
| 3 — ADRs follow Nygard format | contract | ☐ |
| 4 — Playbook entries follow four-step shape | contract | ☐ |
| 5 — `dbConnectionMode` values match source | contract | ☐ |
| 6 — `turbo.json` env list correct | contract | ☐ |
| 7 — NetworkFirst rule table matches source | contract | ☐ |
| 8 — scrypt cost factor matches source | contract | ☐ |
| 9 — Multi-mode client write-op set matches source | contract | ☐ |
| 10 — `pnpm db:studio` opens | contract | ☐ |
| 11 — `./dev.sh` brings all four apps up | contract | ☐ |
| 12 — No personal names in committed docs | contract | ☐ |
| 13 — Cross-link integrity | contract | ☐ |

The runner ticks each box after executing the corresponding step. A check mark requires the deterministic pass criterion to fire; a failed step blocks the Phase 11A PR until it converges or is escalated per the Codex review protocol.

## Notes for the runner

- Run from the repo root. Many commands assume `pwd` is the repo root.
- If `pnpm db:studio` (step 10) is already running on 5555, kill it before re-running step 10 to avoid an "address in use" false negative.
- Step 11 modifies port state (binds 3000–3003). Either run on a clean machine or accept that this step will momentarily occupy those ports. The `./clean.sh` teardown at the end is required.
- Step 12 is conservative — it flags any match of common personal-name tokens. If the codebase legitimately contains one of these as a non-PII reference (rare; e.g., in a comment about a library author), surface it in the run log and confirm intent.
- Steps 2 and 13 are partially manual (link enumeration and cross-reference inventory). The shell snippets bound the surface; final judgment is the runner's.
