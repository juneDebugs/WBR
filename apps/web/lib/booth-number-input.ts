/**
 * What a valid booth number is, in one place.
 *
 * The booth number is the stand identifier for an exhibiting company — `B-01`,
 * `P02`, `Hall 3 / B-124`. It is stored on the company record rather than on a
 * marker, so one company holds one number per event and every marker pointing at
 * that company shows it.
 *
 * ── Who may write it ─────────────────────────────────────────────────────────
 *
 * The organizer, and only the organizer. A company does not choose where the floor
 * sells it a stand. CONTEXT.md has said this since the onboarding work — it is the
 * stated reason the onboarding gate does not block a sponsor on a missing booth
 * number — but until this phase the only text box for the field lived in the
 * sponsor's own portal, which is the opposite of what the glossary claimed. The
 * sponsor-side control is display-only from this phase, and the sponsor
 * profile-save address refuses the field outright rather than ignoring it.
 *
 * ── Why this module exists rather than an inline check ───────────────────────
 *
 * Two callers apply these rules: the organizer's floor-plan screen before it sends
 * anything, and the address that writes it. Two copies of "how long may a booth
 * number be" is how the two of them end up disagreeing, and the disagreement
 * surfaces as a save that the screen accepted and the server refused. Same
 * reasoning as lib/pin-input.ts and packages/db/src/onboarding-policy.ts.
 *
 * It does no input or output and imports nothing, so its branches can be checked
 * directly rather than only through a browser.
 */

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * The longest booth number accepted.
 *
 * Real stand identifiers are short: the seeded data uses `B-01`. Twenty characters
 * comfortably holds a venue that qualifies its stands by hall — `Hall 3 / B-124`
 * is 15 — and refuses a company description pasted into the wrong box.
 *
 * The limit is a refusal carrying a message, never a silent truncation. An
 * organizer who types a long value and gets a shorter one back has no way to tell
 * what happened, and the shortened value would then be printed on a delegate's map
 * as though somebody had chosen it. Same rule, and the same reasoning, as
 * MAX_LABEL_LENGTH in lib/pin-input.ts.
 */
export const MAX_BOOTH_NUMBER_LENGTH = 20

/**
 * A booth number arriving from a caller.
 *
 * Returns the value to store. `null` means "this company has no stand number",
 * which is a legitimate state an organizer can return a company to — a company
 * that pulls out of the floor still exists as an exhibitor record.
 *
 * ── Blank means cleared, not rejected ────────────────────────────────────────
 *
 * An empty string, or one that is only spaces, stores `null` rather than storing
 * `"   "`. A stored blank-but-not-empty value would satisfy every truthiness check
 * in the four applications that read this field while being no booth number at
 * all, which is precisely the class of defect the onboarding policy module
 * documents in its emptiness table.
 *
 * ── Strings only, no coercion ────────────────────────────────────────────────
 *
 * A number, a boolean or an array is refused rather than converted. `Number`-style
 * coercion of a JSON `null` or `[]` into something storable is how a marker ended
 * up at position 0,0 in Phase 11 — recorded in readPercent in lib/pin-input.ts.
 * The browser sends a string, so accepting anything else widens the contract for
 * no caller that exists. A booth number that arrives as the JSON number `12` is a
 * mistake in the caller, and storing `"12"` for it would hide that mistake.
 */
export function validateBoothNumber(raw: unknown): Validated<string | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null }

  if (typeof raw !== 'string') {
    return { ok: false, error: 'The booth number must be text.' }
  }

  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: true, value: null }

  if (trimmed.length > MAX_BOOTH_NUMBER_LENGTH) {
    return {
      ok: false,
      error: `That booth number is ${trimmed.length} characters. Keep it to ${MAX_BOOTH_NUMBER_LENGTH} or fewer.`,
    }
  }

  return { ok: true, value: trimmed }
}

/**
 * The body of a booth-number request, checked as a whole.
 *
 * The field must be PRESENT, even when its value is null. An absent field and a
 * null field mean different things to an organizer — "I sent nothing" against "I
 * am clearing this" — and a caller that omitted the key by mistake would otherwise
 * silently wipe a stand number that somebody else had just set.
 */
export function validateBoothNumberBody(body: unknown): Validated<string | null> {
  // The body must be an object before anything asks what is in it.
  //
  // Found by adversarial review round 1. The sibling validator in lib/pin-input.ts
  // casts to a record and then READS properties, which is harmless on a primitive
  // — `("B-77").type` is simply undefined. This function uses `in`, and `in`
  // THROWS on a primitive. So a request whose body was the bare JSON value
  // `"B-77"` or `12` produced an unhandled TypeError and a 500, where the honest
  // answer is a 400 naming what arrived. An array is refused for the same reason
  // it is not an object anyone meant to send.
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Expected an object with a booth number.' }
  }

  const raw = body as Record<string, unknown>

  if (!('boothNumber' in raw)) {
    return { ok: false, error: 'Nothing was sent to change.' }
  }

  return validateBoothNumber(raw.boothNumber)
}
