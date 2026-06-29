# Phase 11B Smoketest — Orientation Corpus

Verifies the Phase 11B documentation set ships in a consistent, accurate, and usable state.

## What this verifies

Per the PRD §8.5 architectural-fidelity bar + executable run/debug verification bar.

1. All nine new Phase 11B files exist at their committed paths.
2. The two refresh passes (`README.md`, `docs/architecture.md`) actually landed — placeholder language removed, forward-links added, per-app surface detail migrated down.
3. `CLAUDE.md` is ≤70 lines and contains the six sections from the shared-understanding doc §6.
4. `CONTRIBUTING.md` opens with the template-framing disclaimer and contains the ten sections from §6.
5. Every in-doc bracket link target resolves (no broken links across the Phase 11B set + the Phase 11A files it forward-references).
6. Codebase-derived claims in the per-app READMEs match the codebase as of the smoketest run.
7. No PII (personal names of employees, executives, stakeholders) is present in any of the new files.
8. No engineer-local-directory path substrings appear in committed content (the leading-dot scratch directory at the repo root is gitignored by convention and on the Tailor pre-commit blocklist — would reject the diff).
9. Per-app READMEs link up to `docs/architecture.md` for cross-cutting; per-package READMEs link to the relevant ADR.

Shape rules: every step below declares its category per [`CONTRACT.md`](CONTRACT.md). All steps are `[contract]` — Phase 11B is doc-only and makes no perf claims.

---

## Step 1 — All nine new Phase 11B files exist [contract]

**Procedure.**

```bash
test -f CLAUDE.md \
  && test -f CONTRIBUTING.md \
  && test -f apps/web/README.md \
  && test -f apps/attendee/README.md \
  && test -f apps/meetings/README.md \
  && test -f apps/sponsor/README.md \
  && test -f packages/db/README.md \
  && test -f packages/types/README.md \
  && test -f packages/supabase/README.md \
  && echo PASS
```

**Pass criterion.** Stdout is exactly `PASS`. Exit code 0.

---

## Step 2 — README.md and architecture.md refresh passes landed [contract]

**Procedure.**

```bash
# README.md should no longer contain "added in Phase 0b" placeholder language
# and should list docs/adr/ as a corpus-map row.
grep -q "added in Phase 0b" README.md && echo "FAIL: README still has Phase 0b placeholder" || echo OK
grep -q '\[`docs/adr/`\]' README.md && echo OK || echo "FAIL: README missing docs/adr/ row"

# architecture.md should no longer carry the stale per-app surface bullet lists;
# each app section should now end with a working-here link.
grep -c 'Working-here detail:' docs/architecture.md
```

**Pass criterion.** First two greps print `OK` each. Third grep prints `4` (one working-here link per app section).

---

## Step 3 — CLAUDE.md is ≤70 lines and structurally complete [contract]

**Procedure.**

```bash
wc -l CLAUDE.md
grep -E '^## (Project orientation|First-read file order|The four apps|Workflow conventions|Architecture decisions|Pre-existing known issues)' CLAUDE.md | wc -l
```

**Pass criterion.** Line count ≤ 70. Header count = 6.

---

## Step 4 — CONTRIBUTING.md template-framing + section coverage [contract]

**Procedure.**

```bash
# Template-framing disclaimer in the opener paragraph.
head -5 CONTRIBUTING.md | grep -qE 'starting template|not a binding ruleset' && echo OK || echo FAIL

# Ten numbered top-level sections.
grep -cE '^## [0-9]+\. ' CONTRIBUTING.md
```

**Pass criterion.** First check prints `OK`. Section count = 10.

---

## Step 5 — Every internal bracket link resolves [contract]

**Procedure.** Phase 11B docs cross-link to one another and to Phase 11A's corpus + the codebase. This step verifies that every relative bracket link target exists at smoketest time.

```bash
# Enumerate every relative markdown link in the Phase 11B file set.
grep -rEn '\]\(' \
  CLAUDE.md \
  CONTRIBUTING.md \
  apps/web/README.md \
  apps/attendee/README.md \
  apps/meetings/README.md \
  apps/sponsor/README.md \
  packages/db/README.md \
  packages/types/README.md \
  packages/supabase/README.md \
  | grep -vE '\]\(https?://|\]\(mailto:|\]\(#'

# For each printed target that is a relative path, confirm the file or directory exists.
# (Manual or scripted; the cold runner walks the list.)
```

**Pass criterion.** Every listed link target is either (a) an existing file or directory in the repo, or (b) an existing anchor in an existing file. No broken bracket links.

---

## Step 6 — Codebase-derived claims in per-app READMEs are accurate [contract]

**Procedure.** Spot-checks of load-bearing factual claims that drove the per-app READMEs.

```bash
# apps/web role gate at lib/auth.ts:43 + 68
sed -n '43p;68p' apps/web/lib/auth.ts | grep -c 'STAFF.*ORGANIZER.*ADMIN'

# apps/attendee BottomNav TS2514 site at line 40
sed -n '40p' apps/attendee/components/BottomNav.tsx | grep -c 'pathIdx'

# apps/meetings staff role gate in PATCH route
grep -c "role !== 'STAFF'" apps/meetings/app/api/meeting-requests/\[id\]/route.ts

# apps/sponsor per-route sponsorId gate
grep -c '!user.sponsorId' apps/sponsor/app/api/profile/route.ts

# packages/db schema declares sqlite provider
grep -c 'provider = "sqlite"' packages/db/prisma/schema.prisma

# Vercel project name correction: wbr-admin (not wbr-web)
grep -q 'wbr-admin' apps/web/README.md && echo OK || echo FAIL
grep -q 'wbr-web' apps/web/README.md && echo "FAIL: stale wbr-web reference" || echo OK

# Cross-app revalidate call documented in apps/web README
grep -q 'localhost:3001/api/revalidate' apps/web/README.md && echo OK || echo FAIL
```

**Pass criterion.** Each `grep -c` returns ≥ 1. Each `OK/FAIL` line prints `OK`.

---

## Step 7 — `ADMIN_EMAILS` documentation-residue claim is consistent across docs [contract]

**Procedure.**

```bash
# Both apps/web/README.md and docs/architecture.md should describe ADMIN_EMAILS as documentation residue.
grep -q 'documentation residue' apps/web/README.md && echo OK || echo FAIL
grep -q 'documentation residue' docs/architecture.md && echo OK || echo FAIL
```

**Pass criterion.** Both lines print `OK`.

---

## Step 8 — No PII, no employee names, no customer slugs [contract]

**Procedure.** Committed engineering docs use role labels, not personal names. The scan combines a generic heuristic (no literal names committed to the smoketest itself, mirroring the Phase 11A Step 12 approach) with a manual review against the runner's working list of identifiers — that list lives outside the committed tree, in the engineer-of-record's session memory and the Tailor commit-msg blocklist at `~/.config/tailor/customer-blocklist.txt`.

```bash
# Generic heuristic — flags name-with-suffix (-san) patterns and "Mr./Ms./Dr." salutations.
# Does not enumerate any specific names, so the smoketest itself is safe to include in scope.
grep -inE '\b[A-Z][a-z]+[- ]san\b|\b(Mr|Ms|Mrs|Dr)\. [A-Z][a-z]+' \
  CLAUDE.md CONTRIBUTING.md \
  apps/web/README.md apps/attendee/README.md apps/meetings/README.md apps/sponsor/README.md \
  packages/db/README.md packages/types/README.md packages/supabase/README.md \
  && echo "FAIL: salutation/suffix match above" || echo OK

# Manual cross-check: the runner runs the Tailor blocklist scan locally against the same file
# set (the hook would do this on commit anyway). Out-of-band; no literal blocklist tokens
# are committed to this smoketest.
```

**Pass criterion.** Single line `OK` on the heuristic. The runner separately confirms no blocklist match on the manual cross-check. The pre-commit hook is the final enforcement boundary.

---

## Step 9 — No engineer-local scratch path substrings in committed content [contract]

**Procedure.** The leading-dot scratch directory at the repo root is on the Tailor pre-commit blocklist. The hook scans diff content and will reject the commit if the substring appears. This step catches it earlier than commit time. The check looks for any leading-dot directory reference matching the scratch path shape; the exact token is constructed by the runner outside this file to avoid committing it.

```bash
# The runner sets DOT_DIR to the literal scratch-directory name (with leading dot)
# before running this step. The literal token is provided by the runner from session
# memory or the engineer-of-record's working list — never committed to this file.
test -n "$DOT_DIR" || { echo "FAIL: runner must set DOT_DIR"; exit 1; }
grep -n "$DOT_DIR" \
  CLAUDE.md CONTRIBUTING.md \
  apps/web/README.md apps/attendee/README.md apps/meetings/README.md apps/sponsor/README.md \
  packages/db/README.md packages/types/README.md packages/supabase/README.md \
  README.md \
  && echo "FAIL: $DOT_DIR substring above" || echo OK
```

**Pass criterion.** Single line `OK`. The pre-commit hook is the final enforcement boundary; the smoketest catches it earlier.

---

## Step 10 — BottomNav TS2514 path is consistent across docs [contract]

**Procedure.** The handoff doc propagated a wrong path (`apps/web/components/BottomNav.tsx`); Phase 11B corrects to `apps/attendee/components/BottomNav.tsx`. Verify no doc still asserts the wrong path.

```bash
grep -rn 'apps/web/components/BottomNav' \
  CLAUDE.md CONTRIBUTING.md \
  apps/*/README.md packages/*/README.md \
  README.md docs/architecture.md docs/runbook.md docs/incident-playbook.md docs/decisions.md \
  && echo "FAIL: stale BottomNav path above" || echo OK

grep -q 'apps/attendee/components/BottomNav' apps/attendee/README.md && echo OK || echo FAIL
grep -q 'apps/attendee/components/BottomNav' CLAUDE.md && echo OK || echo FAIL
```

**Pass criterion.** First grep prints single line `OK`. Both follow-up greps print `OK`.

---

## Step 11 — Per-app READMEs link up to architecture.md [contract]

**Procedure.**

```bash
for f in apps/web/README.md apps/attendee/README.md apps/meetings/README.md apps/sponsor/README.md; do
  grep -q 'docs/architecture.md' "$f" && echo "$f OK" || echo "$f FAIL"
done
```

**Pass criterion.** All four lines end `OK`.

---

## Step 12 — Per-package READMEs link to the relevant ADR or to db [contract]

**Procedure.**

```bash
grep -q 'docs/adr/0003' packages/db/README.md && echo "db→ADR0003 OK" || echo FAIL
grep -q 'docs/adr/0002' packages/db/README.md && echo "db→ADR0002 OK" || echo FAIL
grep -q 'packages/db' packages/types/README.md && echo "types→db OK" || echo FAIL
grep -q 'packages/db' packages/supabase/README.md && echo "supabase→db OK" || echo FAIL
```

**Pass criterion.** All four lines end `OK`.

---

## Step summary

| Step | Category | Environment | Status (filled by runner) |
|---|---|---|---|
| 1. Nine new files exist | contract | anywhere | |
| 2. Refresh passes landed | contract | anywhere | |
| 3. CLAUDE.md ≤70 lines + 6 sections | contract | anywhere | |
| 4. CONTRIBUTING.md template-framed + 10 sections | contract | anywhere | |
| 5. Bracket links resolve | contract | anywhere | |
| 6. Codebase-derived claims accurate | contract | anywhere | |
| 7. ADMIN_EMAILS residue claim consistent | contract | anywhere | |
| 8. No PII | contract | anywhere | |
| 9. No engineer-local scratch substrings | contract | anywhere | |
| 10. BottomNav path consistent | contract | anywhere | |
| 11. Per-app READMEs link to architecture.md | contract | anywhere | |
| 12. Per-package READMEs link to ADR/db | contract | anywhere | |

## Pass / fail

Phase 11B ships when:
- All 12 contract steps PASS.
- Codex N=3 adversarial review reports zero open AC-failing findings at end of cycle (per PRD §8.2 + `feedback_commit_at_end_of_review_cycle`).

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- `CLAUDE.md`, `CONTRIBUTING.md`, or `README.md`
- Any `apps/<app>/README.md` or `packages/<pkg>/README.md`
- `docs/architecture.md` (the canonical content that per-subtree READMEs link up to)

Per PRD §8.1, "a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance."
