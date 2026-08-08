# Glossary

Canonical terminology for the WBR conferencing app. This file is a glossary — pure term definitions with cross-references. Implementation details live elsewhere:

- Architectural decisions → `docs/adr/`
- Current-state system architecture → `docs/architecture.md`
- Sprint-grade decision index → `docs/decisions.md`
- Phase scope + acceptance criteria → engineer-local PRD (gitignored).

## Terms

### intro

An AI-drafted opener that a sponsor writes to a meeting recipient. Distinct from:

- **chat message** — real-time in-app conversation (`Message` model).
- **email log entry** — admin-app transactional email (`EmailLog` model).
- **sponsor reminder draft** — admin-app AI-drafted email to incomplete-profile sponsors (`apps/web/app/api/sponsors/remind/route.ts`).

Storage, lifecycle, and write-path semantics: see [ADR 0005](docs/adr/0005-ai-intros-via-meeting-request-message.md).

### `MeetingRequest.message`

The database field storing an `intro` attached to a meeting request. See [ADR 0005](docs/adr/0005-ai-intros-via-meeting-request-message.md) for the two parallel write paths (existing one-click Connect vs new Draft intro flow) and their semantics.

### intro draft modal

The sponsor-facing surface where an AI-drafted `intro` is reviewed and (optionally) edited before send. Contents, friction contract, provenance line, and failure UX are specified in the engineer-local PRD § Phase 12a (gitignored).

### solutions taxonomy

The canonical list of business-solution category names used across the sponsor app for filtering, profile editing, and matchmaking. Sourced from `apps/sponsor/lib/solutions.ts` (exported as `SOLUTIONS`). A flat 18-item list; strings are the shared vocabulary that attendee `solutionsSeeking` values, sponsor `solutionsOffering` values, filter chips in `SponsorBrowseView`, and the `SolutionBadge` + `SOLUTION_COLORS` styling all agree on.

Distinct from:

- **`INDUSTRIES`** (`lib/solutions.ts`) — retail industry categorization (e.g. "Fashion & Apparel", "Beauty & Cosmetics").
- **`JOB_FUNCTIONS`** (`lib/solutions.ts`) — attendee role/job-family taxonomy (e.g. "Marketing", "Ecommerce").

Storage, reconciliation history, and taxonomy-choice rationale: see [ADR 0006](docs/adr/0006-sponsor-solution-taxonomy-reconciliation.md).

### `solutionsSeeking` / `solutionsOffering`

Paired user-profile fields expressing the two sides of B2B matchmaking:

- **`solutionsSeeking`** — lives on attendee profiles (buyers). Lists the `solutions taxonomy` values the attendee is looking to buy at the conference.
- **`solutionsOffering`** — lives on sponsor profiles (sellers). Lists the `solutions taxonomy` values the sponsor sells.

Both are stored as JSON-encoded array strings in `String?` columns via Prisma (e.g. `"[\"Email Marketing\",\"Loyalty & Rewards\"]"`). Matchmaking pairs attendee-seeking against sponsor-offering. Inverting the role-to-field mapping (attendee showing "offering", sponsor showing "seeking") is a domain-logic defect, not a data-shape defect.

### profile completeness

A soft *measure* of how much of a profile is populated, shown or sent to nudge someone into filling in more. It never blocks anyone. Not one concept with one definition — four independent instances exist, each over a different field list, and they are not expected to agree:

- **sponsor dashboard** — a percentage over 18 fields of a `Sponsor` company record (`apps/sponsor/components/DashboardView.tsx completeness()`). Fifteen scalar fields are checked for a truthy value; three array fields (`solutionsOffering`, `solutionsSeeking`, `targetIndustries`) require parsing the JSON-encoded array to detect emptiness — `"[]"` is a truthy string but represents empty data.
- **admin sponsor reminder checklist** — nine *curated* items over a `Sponsor` and its related users (`apps/web/app/api/sponsors/remind/route.ts`), each carrying an imperative label ("Upload your company logo"). Distinct in kind from the others: some items span two columns (contact = name **and** email; social = LinkedIn **or** Twitter), one applies a content rule rather than a presence rule (description longer than 20 characters), and one counts related records rather than reading a column (at least one assigned team member). This is the only instance authored as a list of things a sponsor *ought to have done*.
- **meetings portal** — a percentage over 8 fields of a `User` (`apps/meetings/components/DashboardView.tsx`).
- **attendee home screen** — a percentage over a different 6 fields of a `User` (`apps/attendee/lib/home-data.ts`).

The **`onboarding required set`** below is deliberately not one of these. It is a hard rule rather than a measure, which makes five separate answers in this codebase to the question "is this profile complete?" — four nudges and one block.

A person can read 100% on one of these measures and still be refused by the **onboarding gate**, because the field lists differ. Only the two instances that parse array fields treat an empty multi-select as empty; the others count the string `"[]"` as filled.

### onboarding required set

The defined list of profile fields a signed-in person must have populated before the **onboarding gate** lets them use an app. One list per kind of participant — one for delegates, one for sponsor representatives — each held as a single source of truth read by the gate, the checklist, and any surface that chases the same items, so none of them can disagree about what "complete" means.

Its emptiness rules are stricter than any `profile completeness` measure, because this is a hard block rather than a nudge:

- a scalar field counts as missing when blank after trimming, so a single space does not satisfy it;
- an array field counts as missing when the stored JSON parses to an empty list;
- a stored value that is valid JSON but not a list of strings also counts as missing.

Attendees are buyers, so the attendee required set includes `solutionsSeeking` and never `solutionsOffering`. Sponsors are sellers, so the sponsor required set mirrors that with `solutionsOffering` and never `solutionsSeeking`.

The sponsor required set is drawn from the same curated list of items the **admin sponsor reminder checklist** chases by email, so a reminder and a refusal can never name different things. The two are related but not identical: the reminder chases more items than the gate blocks on, because some of them are not the sponsor's to supply (a booth number is assigned by the organizer), are optional (a social link), or are already true of anyone who can reach the app at all (having a team member, which is what being attached to a company means).

### onboarding gate

The rule that refuses a signed-in person access to an app until their **onboarding required set** is populated, routing them to a checklist instead. It refuses in two places, because either one alone leaves the other open:

- **screens** — the layout of every authenticated route group consults the gate. A route group added without that call is not gated; nothing at the framework level enforces it.
- **data requests** — request handlers are not rendered inside any layout, so the screen check never runs for them and they carry their own guard. A person whose required set is incomplete is refused by every one of the app's data addresses, with a single exception: the profile-save address the checklist itself writes through, which if guarded would trap every incomplete person permanently. Sign-in and shared-secret addresses fall outside the rule because there is no person's profile to consult.

**The gate is about the person, not the app.** WBR staff and organizers — the roles `isWbrStaff()` recognises in `packages/db/src/app-access.ts` — are never gated anywhere, because they operate the event rather than participate in it. That is the principle behind "operational tooling is always reachable", stated as a kind of person rather than as a list of app names, so it still holds when a fifth app appears.

Participants are gated:

- a **delegate** (buyer) on their own profile's required set, in the attendee app **and in the meetings portal** — the same required set in both, because the set follows the person rather than the app;
- a **sponsor representative** (seller) on their exhibiting company's required set, in the sponsor portal.

A sponsor representative with no exhibiting company attached has nothing to complete — the profile-save address refuses them outright — so they are refused with an explanation rather than routed to a checklist that cannot save.

The admin app (`apps/web`) carries no gate at all.

Distinct from:

- **`profile completeness`** — a soft measure that nudges but never blocks.
- **the `setup` / Settings screen** (`apps/attendee/components/setup/SetupClient.tsx`) — the always-reachable edit surface for the same fields; the gate is a separate, blocking flow shown when required fields are missing.

The gate consults the required set rather than any stored "onboarded" marker, so a required field cleared later blocks again instead of being waved through by a one-time flag. It stands alone on email/password sign-in and never assumes any OAuth provider. "Sign in with LinkedIn" is an **optional** additive layer: when used it pre-fills `name` and `image` only (LinkedIn's API does not expose job title or company), so those remain manual checklist entries; when absent the checklist is filled entirely by hand with no loss of function.

### gate demonstration account

An account that exists so the **onboarding gate** can be shown on cue rather than being met unannounced on somebody else's sign-in. It is a participant account held deliberately short of its **onboarding required set**, so the gate always refuses it and routes it to the checklist.

Its defining property is that the incompleteness is *restored when it signs in with its password*. An ordinary incomplete account stops demonstrating anything the moment somebody completes it; a gate demonstration account returns to its incomplete state each time it signs in, so a rehearsal cannot use it up.

**Password sign-in specifically, and that is the whole of it.** The repair lives in `authorize()`, which only the email-and-password provider runs. The Google and LinkedIn callbacks find or create a row by email address and issue a session without consulting it, so an account arriving that way is not restored.

This is stated rather than fixed, on an operational assumption rather than an enforced rule: a gate demonstration account's address is at `@test.com`, and nobody is expected to hold a Google or LinkedIn account there. **Nothing in the code enforces that.** The OAuth callbacks match on whatever email address the provider returns, so if one ever returned a canonical address the session would be issued without the repair running. The property is "restored on password sign-in", and a demonstration account at a real email address would need this looked at again.

Today there is one: a **delegate** account, short one field on its own profile, reaching the attendee app and the meetings portal. A sponsor representative is gated on their exhibiting **company** rather than on their own profile, so a sponsor-side one is measured on a different subject and is not covered by the mechanism below.

**The mechanism.** `packages/db/src/test-accounts.ts` defines the canonical accounts and repairs them on the sign-in path. A definition may carry `restoreRequiredFields`; for one that does, the health check compares the six `DELEGATE_REQUIRED_FIELDS` values against the definition, so a profile completed by hand counts as unhealthy and the repair that already exists puts it back. Definitions without the flag are compared on password, role and company link only, exactly as before, and are never written by it. The repair runs in `authorize()` and nowhere near the token callback: the token callback runs repeatedly during a session, so a restore there would blank the field while the checklist was being filled in.

The photograph is outside the comparison by construction, because `DELEGATE_REQUIRED_FIELDS` does not contain `image` — a definition holds a picture address while a stored row may hold nothing, and comparing the two would leave the account unhealthy forever and write on every sign-in. A repair that fires for some other reason does still set the photograph, since it writes the whole definition.

Distinct from:

- **a canonical test account** — the ordinary demonstration logins for each role, which are complete and pass the gate. A gate demonstration account is one of these that is deliberately kept failing.

### venue map

An uploaded floor-plan picture (raster image; a PDF is converted to an image on upload) belonging to a `Conference`, shown to attendees. A conference has several (3–4 typical) that switch in a fixed order to cover multiple buildings / floors. The picture itself carries no structure — see **pin**. Rationale and the rejected vector-map alternative: [ADR 0007](docs/adr/0007-floor-plan-human-authored-pins-over-raster.md).

### booth number

The stand identifier for an exhibiting company at an event (`Sponsor.boothNumber`, e.g. `B-01`). **Assigned by the organizer, not by the sponsor** — a company does not choose where the floor sells it a stand. The organizer is therefore its only author, and sets it from the floor plan screen; the sponsor sees it in their portal profile but cannot change it, and the sponsor profile-save address refuses the field.

One company holds one booth number per event, because the field lives on the `Sponsor` record rather than on a `pin`. A company occupying two stands is out of scope and would be a data-model change, not a screen change.

It is a shared value, not a floor-plan value. Changing it moves what a delegate reads on a `booth pin`, what the sponsor sees in their own portal, and what the organizer's sponsor screens and CSV export report. That breadth is the reason for the single-author rule.

The two map screens label a marker differently, on purpose: a delegate's marker shows the booth number, while the organizer's shows the company name, because an organizer placing stands needs to know which company a marker is.

Distinct from:

- **a `room pin`'s label** — free text typed on one pin (e.g. "Ballroom A"), belonging to that pin alone and shared with nothing.

Not part of the **onboarding required set**: the gate never blocks a sponsor on a value the sponsor cannot supply.

### pin

A human-placed point marker on a `venue map`, positioned as x/y percentages of the image. Two kinds:

- **booth pin** — links to a `Sponsor` and, on the attendee side, displays that company's **booth number**, falling back to the company name when no number is assigned yet. Tapping it on the attendee side opens a card for that company: **beneath the map below 768 pixels of window width, and over the map at 768 and above**. The narrow arrangement exists because a card drawn over the map covered the very marker just tapped, and how much it covered was decided by the shape of the uploaded picture; below that width the map also takes a height limit so there is room for the card, and no overlay is drawn, so a second marker is one tap. A full attendee-facing company profile page is a deliberate fast-follow, not part of the demo — see [ADR 0007](docs/adr/0007-floor-plan-human-authored-pins-over-raster.md).
- **room pin** — carries a typed label (e.g. "Ballroom A"); marks a session/room location.

Pins are authored by WBR staff by tapping the spot and assigning it — never drawn, never auto-detected. Distinct from a drawn/shaded booth *area*, which is deliberately out of scope. See [ADR 0007](docs/adr/0007-floor-plan-human-authored-pins-over-raster.md).
