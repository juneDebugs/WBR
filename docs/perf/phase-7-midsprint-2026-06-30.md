# Phase 7 — Mid-sprint Lighthouse re-measurement + Tier B gating decision

**Measurement date:** 2026-06-30
**Environment tier:** A (production)
**Lighthouse:** 13.4.0, headless Chrome 149
**Runner:** [`docs/perf/run-lighthouse.sh`](run-lighthouse.sh) (idempotent; rebuild procedure in [`README.md`](README.md))
**Baseline reference:** `recon/perf_phase2_baseline_2026_06_18.md` (engineer-local recon doc, gitignored)
**PRD reference:** §6 Phase 7 + §4 success criteria (observed-LCP amendment 2026-06-27)

## Tier B gating decision

**No additional engineering required.** Phase 8 (`initialData` wire-up on attendee landing pages) does not need to trigger. All gating success criteria from PRD §4 are met on the production deployment ahead of the 2026-07-01 tech-check window.

This phase's output feeds Phase 13's perf delta report at `docs/perf-delta-2026-07-06.md`.

## Sprint exit criteria — verdict

| Criterion (PRD §4) | Bar | Result | Status |
|---|---|---|---|
| **#1 Attendee observed LCP** | ≤ 3s on `/home`, `/speakers`, `/schedule`, `/people` mobile | 1.86s / 645ms / 447ms / 495ms | ✅ Pass |
| **#2 Login total transfer** | ≤ 250KB mobile on all four `/login` | admin 159KB · attendee 187KB · meetings 121KB · sponsor 120KB | ✅ Pass |
| **#3 Sponsor iOS layout** | Real-device verification | Not Lighthouse-measurable; deferred to UAT in the dry-run window | ⏳ UAT-batched |
| **#4 No admin regression** | Existing admin baselines hold or improve | admin `/dashboard/attendees` mobile observed LCP 1.30s vs Phase 2 sim 9.50s baseline; admin `/login` mobile post-rerun sim 1.51s / obs 1.37s vs Phase 2 sim 1.51s baseline (no regression) | ✅ Pass |
| **#5 Demo paths end-to-end** | Render + behave on production | Not Lighthouse-measurable; deferred to UAT | ⏳ UAT-batched |

## Phase 2 baseline → Phase 7 measured — mobile delta

Mobile profile only (the gating profile per PRD §4). Simulated LCP is the Phase 2 baseline-comparable column; observed LCP is the new gating metric per the 2026-06-27 amendment.

| App | Route | Phase 2 LCP (sim) | Phase 7 LCP (sim) | Phase 7 LCP (obs) | Δ sim | Verdict |
|---|---|---|---|---|---|---|
| attendee | /home | 17.10s | 7.20s | **1.86s** | −58% | Passes observed gate |
| attendee | /speakers | 15.50s | 8.53s | **645ms** | −45% | Passes observed gate |
| attendee | /schedule | 8.83s | 8.28s | **447ms** | −6% sim (observed dominates) | Passes observed gate |
| attendee | /people | 8.14s | 2.13s | **495ms** | −74% | Passes observed gate |
| admin | /dashboard/attendees | 9.50s | 4.32s | **1.30s** | −54% | Passes Phase 9 ≤3s bar |
| attendee | /login | 1.75s | 1.74s | 2.36s | −1% | Already-passing |
| admin | /login | 1.51s | 1.51s | 1.37s | 0% | Already-passing |
| meetings | /login | 1.78s | 1.45s | 1.33s | −19% | Phase 4 win |
| sponsor | /login | 1.75s | 1.45s | 1.29s | −17% | Phase 4 win + Phase 3 contribution |

The `Δ sim` column is the simulated-LCP delta only — Phase 2 baseline measured simulated LCP, so observed-LCP deltas are not computable. The `Phase 7 LCP (obs)` column is shown alongside as supplementary information per the PRD §4 amendment 2026-06-27 (observed LCP is the gating metric; simulated LCP is the baseline-comparable column).

## Login transfer-size delta — Phase 2 baseline → Phase 7

Mobile profile only. Sprint exit criterion #2 is the 250KB ceiling.

| App | Route | Phase 2 total | Phase 7 total | Δ | Bar (≤250KB) |
|---|---|---|---|---|---|
| admin | /login | 159KB | 159KB | 0 | ✅ |
| attendee | /login | 187KB | 187KB | 0 | ✅ |
| meetings | /login | 549KB | 121KB | −78% | ✅ (Phase 4 strip) |
| sponsor | /login | 1289KB | 120KB | −91% | ✅ (Phase 4 strip) |

## Full metrics — all 18 reports

Both simulated and observed LCP + FCP per PRD §4 amendment. Total / JS / IMG / CSS in KB. CLS unitless. All other times in ms or s.

| App | Route | Profile | Score | LCP sim | LCP obs | FCP sim | FCP obs | CLS | TBT | SI | TTI | Total | JS | IMG | CSS | Reqs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| admin | /dashboard/attendees | desktop | 1.00 | 561ms | 477ms | 301ms | 284ms | 0.000 | 0ms | 365ms | 571ms | 1484KB | 191KB | 1261KB | 10KB | 103 |
| admin | /dashboard/attendees | mobile | 0.85 | 4.32s | 1.30s | 980ms | 1.27s | 0.000 | 22ms | 2.35s | 4.33s | 1489KB | 192KB | 1261KB | 10KB | 115 |
| admin | /login | desktop | 1.00 | 402ms | 318ms | 231ms | 303ms | 0.000 | 0ms | 288ms | 402ms | 159KB | 106KB | 39KB | 10KB | 10 |
| admin | /login | mobile | 1.00 | 1.51s | 1.37s | 809ms | 1.37s | 0.000 | 1ms | 2.25s | 1.52s | 159KB | 106KB | 39KB | 10KB | 10 |
| attendee | /home | desktop | 0.94 | 1.63s | 809ms | 259ms | 362ms | 0.019 | 0ms | 516ms | 1.63s | 2247KB | 189KB | 82KB | 8KB | 59 |
| attendee | /home | mobile | 0.75 | 7.20s | 1.86s | 923ms | 193ms | 0.053 | 105ms | 2.88s | 7.20s | 2240KB | 189KB | 75KB | 8KB | 57 |
| attendee | /login | desktop | 1.00 | 381ms | 258ms | 232ms | 258ms | 0.000 | 0ms | 263ms | 383ms | 187KB | 107KB | 39KB | 8KB | 12 |
| attendee | /login | mobile | 0.98 | 1.74s | 2.36s | 932ms | 2.36s | 0.000 | 4ms | 3.68s | 1.76s | 187KB | 107KB | 39KB | 8KB | 12 |
| attendee | /people | desktop | 1.00 | 674ms | 364ms | 239ms | 178ms | 0.000 | 0ms | 241ms | 674ms | 2167KB | 189KB | 3KB | 8KB | 37 |
| attendee | /people | mobile | 0.99 | 2.13s | 495ms | 804ms | 303ms | 0.000 | 20ms | 875ms | 2.13s | 2172KB | 189KB | 7KB | 8KB | 37 |
| attendee | /schedule | desktop | 0.99 | 998ms | 413ms | 242ms | 164ms | 0.017 | 0ms | 260ms | 998ms | 2244KB | 189KB | 79KB | 8KB | 51 |
| attendee | /schedule | mobile | 0.76 | 8.28s | 447ms | 800ms | 163ms | 0.008 | 15ms | 836ms | 8.28s | 2238KB | 189KB | 72KB | 8KB | 50 |
| attendee | /speakers | desktop | 0.95 | 1.54s | 862ms | 287ms | 516ms | 0.002 | 0ms | 631ms | 1.54s | 2436KB | 189KB | 272KB | 8KB | 73 |
| attendee | /speakers | mobile | 0.75 | 8.53s | 645ms | 826ms | 176ms | 0.003 | 74ms | 1.26s | 8.55s | 2287KB | 189KB | 122KB | 8KB | 48 |
| meetings | /login | desktop | 1.00 | 358ms | 300ms | 231ms | 300ms | 0.000 | 0ms | 286ms | 358ms | 120KB | 106KB | 0KB | 7KB | 11 |
| meetings | /login | mobile | 1.00 | 1.45s | 1.33s | 1.11s | 1.33s | 0.000 | 0ms | 2.39s | 1.45s | 121KB | 106KB | 0KB | 7KB | 11 |
| sponsor | /login | desktop | 1.00 | 358ms | 267ms | 231ms | 267ms | 0.000 | 0ms | 267ms | 358ms | 120KB | 106KB | 0KB | 7KB | 11 |
| sponsor | /login | mobile | 1.00 | 1.45s | 1.29s | 822ms | 1.29s | 0.000 | 1ms | 2.15s | 1.45s | 120KB | 106KB | 0KB | 7KB | 11 |

## Pattern observations

- **The observed-LCP gap is structurally wider than expected.** Attendee `/schedule` mobile simulated LCP is 8.28s but observed LCP is 447ms — a ~19× ratio. `/speakers` is ~13×; `/home` is ~4×; `/people` is ~4×. The lantern-model + base64-image amplification documented in ADR 0004 and `project_lantern_model_base64_finding` is the cause. Phase 16 (post-sprint) is the architectural unlock.
- **Simulated-LCP improvements alone meet the original ≥50% reduction bar on `/home` (−58%), `/speakers` (−45% just under), and `/people` (−74%) but not `/schedule` (−6%).** The amended observed-LCP gate clears all four comfortably.
- **JS bundle size is consistent across routes within an app** — 189KB on attendee, 191KB on admin. Code splitting at the App Router boundary is intact.
- **TBT is healthy everywhere** (max 105ms on attendee `/home` mobile). JS execution is not the bottleneck.
- **Admin `/dashboard/attendees` mobile total transfer dropped from 7281KB baseline to 1489KB** — a 5× reduction from Phase 9's server-side pagination.

## Deployment topology — finding (Vercel project audit)

Discovered during cookie-capture preparation; recorded here because it affects Phase 13's measurement methodology and any production-URL references in stakeholder comms.

The Vercel team carries **six active wbr-* projects**, not four. Two pairs of duplicates serve the same source:

| App | Canonical Vercel project | Production host | Legacy duplicate | Last deploy (duplicate) |
|---|---|---|---|---|
| attendee | `wbr` | `wbr-mobile.vercel.app` | `wbr-mobile` (`wbr-mobile-seven.vercel.app`) | 2026-06-29 (Phase 14 commit) |
| admin | `wbr-web` | `wbr-web.vercel.app` | `wbr-admin` (`wbr-admin.vercel.app`) | 2026-05-12 (49d stale; missed Phase 9 + Phase 14) |
| meetings | `wbr-meetings` | `wbr-meetings.vercel.app` | — | — |
| sponsor | `wbr-sponsor` | `wbr-sponsor.vercel.app` | — | — |

Deployment evidence — exact deploy IDs captured via `vercel inspect <host>` on the `june-1220s-projects` team on 2026-06-30 during Phase 7 setup. Resolve any specific deploy with `vercel inspect <deployment-id>`:

| Project | Deployment ID | Deployed at | Notes |
|---|---|---|---|
| `wbr` (attendee, canonical) | `dpl_2isy4iQXunKxdHx5Ue3gZkSTnGs4` | 2026-06-29 23:14 ET | Phase 14 commit `d8b878a` |
| `wbr-mobile` (attendee, legacy) | `dpl_J9wgmCgCeu36DfSkXhnYyQj4i4Q1` | 2026-06-29 23:14 ET | Parallel deploy from same commit |
| `wbr-web` (admin, canonical) | `dpl_G44H4wi2h8u86zbSHg38n4yUif6F` | 2026-06-29 23:14 ET | Phase 14 commit `d8b878a` |
| `wbr-admin` (admin, legacy) | `dpl_GyQFbV499abHwnWEXNhBk92Nzzci` | 2026-05-12 11:55 ET | 49 days stale; pre-Phase-9 + pre-Phase-14 |
| `wbr-meetings` | `dpl_82gDaXYgczCkLnmUByZGea4a1eLM` | 2026-06-29 23:14 ET | Phase 14 commit (no meetings code change; monorepo-wide rebuild) |
| `wbr-sponsor` | `dpl_84P8hCSRxFQVJXk3dQvaB18zKDyH` | 2026-06-29 23:14 ET | Phase 14 commit (no sponsor code change; monorepo-wide rebuild) |

"Deployed at" values were taken verbatim from each `vercel inspect <host>` output's `created` field (format: `Mon Jun 29 2026 23:14:07 GMT-0400 (Eastern Daylight Time)`). Re-run `vercel inspect <deployment-id>` to verify any specific entry; re-run `vercel project ls` + `vercel inspect <host>` to refresh the audit before citing this table downstream.

The Phase 11B engineer-local handoff's documented mapping (`apps/web` → `wbr-admin`) was stale. The current admin production target is `wbr-web`. The Phase 11B and Phase 14 engineer-local handoff "Technical learnings" entries on Vercel project names need correction (those handoffs are gitignored, so the correction lives in-repo); `docs/architecture.md` § Vercel deployment topology is the appropriate durable home.

Phase 7's measurement targeted the canonical hosts. Two follow-ups out of Phase 7 scope:

1. Surface the `wbr-admin` 49-day-stale state to the engineer-of-record — anyone hitting `wbr-admin.vercel.app` is seeing pre-Phase-9, pre-Phase-11 admin.
2. Cleanup candidate post-sprint: delete the `wbr-mobile` and `wbr-admin` legacy projects after confirming nothing references them.

## Methodology

- **Mobile profile** = Lighthouse default (Moto G Power viewport, Slow 4G throttling, 4× CPU emulation).
- **Desktop profile** = `--preset=desktop`.
- **Throttling method** = `simulate` (lantern). Single run per route × profile captures both `audits.largest-contentful-paint.numericValue` (simulated) and `audits.metrics.details.items[0].observedLargestContentfulPaint` (observed paint timing).
- **Auth posture** = every route, including `/login`, ran with the captured `__Secure-next-auth.session-token` cookie passed via `--extra-headers=docs/perf/headers/<app>.json`. This matches the Phase 2 baseline methodology ("all auth'd with a seeded `june@tailor.tech` ORGANIZER session cookie" — `recon/perf_phase2_baseline_2026_06_18.md` line 6). The `/login` route handlers do not gate on auth, so the cookie has no rendering effect on those routes — confirmed empirically: `finalDisplayedUrl` on all eight `/login` Lighthouse reports equals the requested `/login` URL (no redirect to authenticated routes). The methodology divergence flagged in the Codex R1 review (Phase 7 originally omitted cookies on `/login`) was resolved by re-running the eight `/login` reports with cookies on 2026-06-30; the table above reflects the re-measured values. The `finalDisplayedUrl` no-redirect check is reproducible in-band — see `docs/smoketests/phase-7-midsprint-measurement.md` § Step 3.

- **Cache-bypass observation** = the auth cookie sent to `/login` shows no evidence of bypassing Vercel's edge cache. Mobile total-transfer byte delta between the cookie-off run (original Phase 7 measurement) and the cookie-on re-run was small and bounded: admin 158→159KB (+1KB), attendee 187→187KB (no change), meetings 120→121KB (+1KB), sponsor 118→120KB (+2KB). These deltas sit within Lighthouse's documented single-run variance (~±10–15%, with absolute floor on small payloads) and an order of magnitude below what a cache invalidation would produce — a bypassed cache on an unauthenticated `/login` HTML response would shift total transfer by hundreds of KB if the page had to be re-rendered at the function layer per request.
- **Cold-start mitigation** = each route was curl-warmed before its Lighthouse run.
- **Sample size** = single measurement per route × profile (consistent with Phase 2 baseline methodology). Lighthouse variance is ±10–15% on synthetic LCP; aggregate trends are trustworthy, individual cell precision is not.

## Known limitations

- **Single-run variance**: re-running may shift any single cell ±10–15%. The aggregate verdict (all gating routes pass with substantial margin) is robust to this variance.
- **Service worker not registered during Lighthouse runs**. Phase 5 (PWA NetworkFirst timeout split) AC items aren't measurable here; the Phase 5 Playwright contract script (`docs/smoketests/playwright/phase-5-pwa-timeout-split.mjs`) covers SW behavior separately.
- **Only the `june@tailor.tech` ORGANIZER perspective measured.** A sponsor-scope or attendee-scope user might surface different data shapes, but render perf is identical.
- **Visual diffs not in this artifact.** Phase 13's perf delta report carries the visual-diff requirement per PRD §6 Phase 13; Phase 14's gradient + Phase 4's imagery strip will be captured then.

## References

- PRD §6 Phase 7 — phase scope and acceptance criteria.
- PRD §4 — sprint exit criteria + 2026-06-27 observed-LCP amendment.
- `recon/perf_phase2_baseline_2026_06_18.md` — Phase 2 baseline numbers used in the delta tables.
- `recon/perf_investigation_2026_06_18.md` §"Re-measurement instructions" — original runner spec; this phase re-implemented it in a durable in-repo location.
- ADR 0004 — base64 images in DB; the storage pattern that drives the lantern-model amplification on simulated LCP.
- `project_lantern_model_base64_finding` memory — root cause framing for the simulated/observed LCP gap.
- `docs/perf/README.md` — rebuild procedure for the runner.
- `docs/smoketests/CONTRACT.md` — smoketest shape rules (this phase's smoketest declares Tier A).
