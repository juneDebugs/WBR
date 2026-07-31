# Codex adversarial review — sponsor logos blocked by middleware

**Branch:** `fix-static-image-middleware`. **Date:** 2026-07-30. **Rounds:** 3 of 3, the full cap.

Reviewed: a three-file change to the middleware matcher in the participant app, the meetings portal and the sponsor portal.

**The review changed the fix twice.** The version that shipped is the third. That is the whole value of the cycle here, so the discarded versions are recorded rather than quietly dropped.

---

## Round 1 — exposure, regex, user content, inconsistency

**Verdict: approve, no material findings.** But it observed that excluding by file extension is "broad", and rested that on a claim worth testing: that dynamic pages still check authentication themselves once middleware is skipped.

**Tested, and the claim did not hold the way it needed to.** Against a running production build with no session:

```
/people                  -> 307   (redirected to sign-in, correct)
/people/anything.png     -> 200   19,798 bytes
/chat/room.svg           -> 200   11,826 bytes
/people/x.PNG            -> 307   (uppercase not excluded)
```

The first version of this fix copied `apps/web/middleware.ts`, which excludes any path ending in an image extension. That let an anonymous caller reach real page routes whose dynamic segment merely ended in one.

**Nothing leaked** — both pages rendered an empty shell, with zero real attendee names in the HTML, because every data address behind those screens is guarded. But the screens should not have been reachable, and the behaviour split on case.

**Fix replaced.** Version two excluded by folder name — `sponsors` beside the existing `icons` — which has no such hole. Both paths returned to 307.

## Round 2 — can a folder-name exclusion be tricked

**Verdict: approve**, with one observation that turned out to matter: the terms are unanchored, so they also match anything *starting* with those letters.

**Tested, and confirmed:**

```
/sponsorship      -> 404    middleware SKIPPED it
/sponsorsecret    -> 404    middleware SKIPPED it
/sponsors-admin   -> 404    middleware SKIPPED it
/iconsecret       -> 404    middleware SKIPPED it
```

A 404 rather than a 307 means the request never reached the middleware. Those are harmless only because no such route exists today — and `/sponsorship` is an entirely plausible page for a conference app to grow. Whoever added it would get an unauthenticated page with no warning.

**Fix tightened.** Version three anchors both terms with a trailing slash: `icons/` and `sponsors/`. All four now return 307, and the real folders still serve. This also tightens the pre-existing `icons` term, which had the same weakness before this branch existed.

## Round 3 — what is left

**Verdict: approve, no material findings.** Two observations recorded, neither acted on:

- **Unescaped dots.** `favicon.ico`, `manifest.json` and `sw.js` contain a `.`, which in a regular expression matches any character, so `/swXjs` and similar skip the middleware. No route exists at any such path in these three apps. Pre-existing, unchanged by this work.
- **Dead terms.** `sw.js` and `workbox-*` are unnecessary in the meetings and sponsor portals, which have no service worker. They exclude nothing that exists. Left in place so all three matchers stay identical and easy to compare.

---

## What shipped

```
'/((?!_next/static|_next/image|favicon.ico|icons/|sponsors/|manifest.json|sw.js|workbox-.*).*)'
```

Identical in `apps/attendee`, `apps/meetings` and `apps/sponsor`.

## Deliberately not fixed here

`apps/web/middleware.ts` still excludes by file extension and therefore still has the hole round 1 found. It is a different app, the fault predates this work, and it deserves its own change with its own testing rather than being folded into a logo fix. Recorded so it is not lost.

## The lesson worth keeping

The first version copied an existing pattern from a neighbouring app on the reasoning that a pattern already in use must be sound. It was not. **An existing pattern is a claim, not evidence** — the same rule this project already applies to a review tool's findings.
