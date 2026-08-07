# ADR 0008 — The onboarding gate is about the person, not the app

- **Status:** Accepted (2026-07-31). Implemented in the participant app (Phase 3, merged) and the sponsor portal (Phase 5). **Amended 2026-08-07** to extend the gate to the meetings portal — see [Amendments after acceptance](#amendments-after-acceptance). The decision this record makes is unchanged by that amendment.
- **Date:** 2026-07-31
- **Supersedes:** None. It replaces an earlier *plan-level* decision that named two never-gated apps; that plan document is archived at `.claude/plans/archived/floor-plan-onboarding-2026-07-21.md` and was never an ADR.
- **Superseded by:** None

## Context

The customer, evaluating this app against an incumbent they already run events on, was asked directly whether a participant should be made to finish their profile before using the app. Their answer was that all onboarding information must be entered before a person is allowed to navigate the app. That produced the **onboarding gate**: a check that stops a participant whose required profile fields are empty and routes them to a checklist naming exactly what is missing.

A rule that absolute needs an equally clear statement of who it does *not* apply to, because the people who run the event are not participants in it. An organizer opening the participant app to see what participants see, or opening the sponsor portal to help an exhibitor who has phoned in for help, is doing their job — not evading onboarding.

The first attempt at stating the exception was a list of app names: organizers are never gated in the admin app, and WBR staff are never gated in the meetings portal. Both statements are true and neither is sufficient. Measured consequences of that wording:

- **An organizer inside the participant app was gated exactly like a delegate.** Nothing in the two statements covered that combination. The workaround actually applied during the first phase was to give the organizer demonstration account a company size and an annual revenue so it would pass — treating a policy gap as a data problem.
- **The primary demonstration login would have been trapped in the sponsor portal.** `wbr@test.com` holds the organizer role, has **no exhibiting company**, and is admitted to the sponsor portal by `APP_ALLOWED_ROLES` in `packages/db/src/app-access.ts`. Gating that portal on an exhibiting company's profile sends it to a checklist whose save address answers `403 No sponsor linked`. A form it can never complete, in front of a customer, on the account the repository's own credentials table describes as reaching all four apps. Verified 2026-07-31 by reading the account: `role=ORGANIZER`, `sponsorId=(none)`.
- **A fifth app would inherit the same hole,** silently, because a list of app names says nothing about an app that does not exist yet.

Two further facts shaped the choice. The access-policy module already holds the list of WBR-side roles — `WBR`, `ORGANIZER`, `ADMIN`, `STAFF` — behind a function named `isWbrStaff()`, used to decide which role may sign in to which app. And the required sets differ by kind of participant: a delegate is measured on their own profile, a sponsor representative on their exhibiting company's profile, so "which required set applies" is already a question about the person rather than the app.

**Alternatives considered:**

1. **Keep the rule as a list of never-gated apps.** Cheapest, and already written down. Rejected on the measured consequences above: it leaves every role/app combination not explicitly named to chance, it traps the primary demonstration login in the sponsor portal, and every new app reopens it.
2. **Gate every account and give the event-operating accounts complete profiles.** Superficially attractive because it needs no exemption at all. Rejected: it does not work for the sponsor portal, where the blocking subject is an exhibiting *company* and the organizer account has none — there is no profile to complete, so no amount of data fixes it. It also silently converts a policy question into a data-maintenance chore that has to be redone on every reseed.
3. **A second role list, local to the gate.** Rejected: a list of roles that must agree with `APP_ALLOWED_ROLES` but is stored somewhere else is a list that will eventually disagree with it, and the disagreement would show up as somebody being gated or released wrongly rather than as a failure.
4. **State the rule as a kind of person, tested by the existing role function (chosen).**

## Decision

**The onboarding gate exempts people, not apps. Before any completeness question is asked, the gate consults `isWbrStaff()` from `packages/db/src/app-access.ts`; if the role is WBR-side — organizer, admin, staff, WBR — the person is released, in every app, unconditionally. Everyone else is a participant and is measured against the required set for their kind: a delegate against their own profile, a sponsor representative against their exhibiting company's profile.**

Shape of the decision:

- **One test, reused, never re-declared.** The exemption is the `isWbrStaff()` function that already decides app access. No gate, guard, or checklist introduces its own list of roles.
- **The order of questions is fixed:** does the account row exist → is this person WBR-side → is the required set complete. The role question comes before the completeness question, so an event-operating account is released without its profile ever being measured.
- **It applies at both enforcement points and on the checklist itself.** Screen gates, request guards, and the checklist routes all ask the role question first. A checklist that did not would put a form in front of somebody the gate had already released — and, for an organizer with no company, a form that cannot save.
- **Fail closed on a missing subject.** If the account row is absent, or a sponsor representative has no exhibiting company, the person is refused rather than released. Carried over from finding F-6, which measured the opposite choice allowing a session that pointed at a deleted person to create records against real participants.
- **The admin app and the meetings portal carry no gate at all.** Only the participant app and the sponsor portal do.

## Consequences

**Easier:**

- Adding a fifth app cannot silently gate the people running the event: the exemption travels with the role test, not with a list that would need editing.
- The primary demonstration login reaches all four apps as its documentation claims, with no per-account data grooming to keep it that way.
- One sentence explains the behaviour to a future reader — *the gate is about who you are, not where you are* — instead of a table of app-and-role combinations.
- Demonstration accounts stop drifting: no account needs fields populated purely to get past a gate it should never have met.

**Harder, and accepted:**

- **The exemption is only as narrow as the role list it borrows.** Anything added to `WBR_ROLES` in the access-policy module becomes exempt from onboarding everywhere, immediately, with no separate review. That coupling is the point — one list rather than two — but it means `WBR_ROLES` is now load-bearing for two unrelated questions, and a change to it needs to be read with both in mind. A note at the definition records this.
- **Role is read from the database on every gated request, not from the session token.** A token is issued at sign-in and never changes, so an account whose role was revoked would keep its exemption until it signed in again — the wrong direction to be wrong in. This costs one query that the completeness check needs anyway, so the practical cost is nil, but it does mean the gate cannot be answered from the token alone.
- **Nothing at the framework level enforces the convention.** Both apps call the gate from route-group layouts, and a newly added route group that omits the call is ungated. Finding F-3 recorded exactly that defect in the participant app, where one of two route groups was left open and a person blocked from every visible section could still open a chat room. Mitigated by a note at each gate's definition and a smoketest step per app, not by enforcement.
- **"Never gated anywhere" is a deliberately blunt instrument.** It is stated as absolute so that it cannot be eroded case by case. If a future requirement genuinely needs an event-operating account to complete something, that is a new decision and supersedes this record rather than adding an exception to it.

## Verification

- Participant app: `docs/smoketests/phase-3-person-based-gate-exemption.md`, which asserts that an organizer and a staff account with deliberately incomplete profiles reach every screen and are refused at no data address, while a delegate and a sponsor-role account with the *same* incompleteness are still blocked — the behavioural half of "no second role list".
- Sponsor portal: `docs/smoketests/phase-5-sponsor-screen-gate.md`, which asserts the same for all six portal screens through real page loads, using a throwaway staff account created and deleted inside the run.
- Both runs also assert the direction that matters most: the exemption cannot be used to skip onboarding. A participant with the same incomplete state stays blocked.
- Meetings portal: `docs/smoketests/phase-1-meetings-onboarding-gate.md`, added with the amendment below.

## Amendments after acceptance

- **The meetings portal now carries the gate, decided 2026-08-07 and recorded with the change that builds it.** This withdraws one bullet from the Decision section above — "The admin app and the meetings portal carry no gate at all. Only the participant app and the sponsor portal do." The admin app still carries none. The meetings portal now does.

  The change was asked for by the customer during the final user-acceptance run on 2026-08-05, on the reasoning that the sponsor portal and the meetings portal are the two places a participant actually signs in, so a participant who is never stopped there is never asked to complete anything before reaching the rest of the product.

  **The decision this record makes is unchanged, and is what makes the extension small.** Because the exemption is stated as a kind of person rather than a list of app names, the meetings portal inherits it with nothing written for it: the WBR-side roles are released by the same `isWbrStaff()` test, which is what keeps that portal's staff queue reachable without an exception being carved for it. Had the rule still been a list of never-gated apps, this amendment would have had to name a third app and would have left the same hole for a fourth.

  Shape of the extension:

  - **It measures the existing delegate required set, unchanged.** A person admitted to the meetings portal who is not WBR-side is a delegate, measured on their own profile — the same six fields, from the same single source of truth, as in the participant app. No new required set was introduced. Giving one person two definitions of "complete" depending on which app they opened is the outcome this ADR exists to prevent, and a second block would have made a sixth answer in this codebase to the question "is this profile complete?".
  - **Both enforcement points, as everywhere else.** The screen gate is called from every authenticated route group in that portal — note it has two, `(portal)` and `staff`, and a gate placed only on the first repeats finding F-3. Request handlers carry their own guard — nine of them — with the profile-save address excluded, because guarding the address the checklist writes through traps every incomplete person permanently. The `staff/*` addresses are not guarded and do not need to be: each already refuses anyone who is not WBR-side, and WBR-side people are exempt from this check, so the guard could never fire there. That argument only holds because those addresses ask the **database** for the role, as this gate does. They asked the session token until this change, which meant a revoked operator was refused by the gate everywhere and admitted by them — recorded as UF-31 and fixed alongside, in `apps/meetings/lib/staff-api.ts`.
  - **A checklist screen was added to that portal**, at `/onboarding`, inside the authenticated area but outside **both** gated route groups, matching the arrangement in the other two apps so the gate cannot redirect it to itself.
  - **Speakers are affected and this is not new.** The delegate required set includes company size and annual revenue, which an independent speaker may not hold. Such a person is already refused by the participant app today under the same rule; the meetings portal now refuses them too. This amendment does not change who is complete, only where completeness is asked.

  Recorded here rather than only in the phase requirements document because it withdraws a statement from the Decision section, which a reader of this record would otherwise take as current.
