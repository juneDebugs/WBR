# Meeting Engine — Apple HIG UI/UX Spec

Desktop console in `apps/meetings` `/staff`. Reuses the shared preset (`packages/ui/preset.cjs`): SF system font; `canvas #f5f5f7` / `surface` / `fill` / `hairline #e5e5ea` / `ink,ink-2,ink-3`; status `success #34c759 / warning #ff9f0a / danger #ff3b30 / info`; brand indigo `#6366f1`; HIG type scale; shadows `card/elevated/pop`; 44px targets; `:focus-visible` rings; reduced-motion handled.

## New component classes (added to preset)

| Class | Intent |
|---|---|
| `.segmented` / `.segmented-item` / `.active` | iOS segmented control: `fill` track, 2px pad, 12px radius; active = raised white pill (`surface` + `shadow-card`). Used for day switch and cancel toggle. |
| `.split-view` / `.split-view-sidebar` | Two-pane flex shell; sidebar 340px, `border-right hairline`, `overflow-y:auto`, `surface`. |
| `.sheet-scrim` / `.sheet-panel` | Side sheet: light `black/25` scrim (lighter than modal); 440px right panel, `shadow-elevated`, slide-in. |
| `.popover-card` | HUD popover shell: `surface`, `shadow-pop`, 12px radius, 260px. |
| `.meter` / `.meter-fill` (`.success/.warning/.danger`) | Fill-rate bar: 6px track `fill`; fill color by threshold. |

## Surface decisions (HIG mapping)

1. **Company Directory** — grouped `<table>` (not card soup): Clarity. `canvas` bg, one saturated element per row = fill meter: Deference. Row = single click target (Fitts). Fill meter thresholds `<50 danger / 50–79 warning / ≥80 success`, reinforced by numeral (never color-only). `aria-sort` on sortable headers; row wrapped in one focusable control. Skeleton rows on load; `.empty-state` on empty search.

2. **Schedule Matrix (split view)** — `role="region"`×2 (bank / grid). Bank sidebar 340px `surface`; grid `flex-1` `canvas`: Depth (three visible layers). Day switch = `.segmented` styled control implemented as ARIA tablist (`←/→` roving, auto-activate). Bank = `role="listbox"`, cards `role="option"` (`↑/↓`, Enter → Assign). Slot rows = semantic `<table>` (Time · Attendee · Room · Actions). Empty slot = dashed hairline border + "Open — assign". Rank badge = `badge-neutral` (ordinal, not a state). Interest = `success/warning/neutral` for High/Med/Low (closed palette). Edit/Cancel `.icon-btn` fade in on row hover/focus, always in DOM/tab order. Drop-target flash `success-soft` 400ms (skipped under reduced-motion). Keyboard path always available (Assign sheet), drag is an accelerator only.

3. **Assign sheet** — right side sheet 440px, light scrim (bounded in-context task, not stop-and-decide). Slot picker (grouped by day) → room picker with occupancy badges (`Available` success / `Tight` warning / `Conflict` danger+disabled) → load-balance hint (`info-soft` callout). `role="dialog" aria-modal`, focus trap, Esc close, focus returns to trigger. Assign disabled until slot+room chosen; success flashes the new slot.

4. **Edit / Reschedule sheet** — same sheet shell. Shows current assignment inline (subtitle). New-slot list grouped by day, only mutually-free slots (no dead-ends); current slot tagged `badge-neutral "Current"`. Auto-scroll to current day. Room picker reused.

5. **Cancel sheet** — centered **modal** (`role="alertdialog"`, `black/40 backdrop-blur`): stop-and-decide. `.segmented` toggle "Preserve request (return to bank)" vs "Remove entirely". Reason `.select` + notes `.textarea` gated behind a choice. Destructive button styling is **conditional**: preserve → `btn-primary "Return to Bank"`; remove → `btn-danger "Remove Meeting"`. Focus lands on the toggle, never the destructive button. Esc = "Never mind".

6. **HUD popover** — non-modal `.popover-card`, `role="group"` (not tooltip — structured content), anchored to card, 300ms hover delay / instant on focus, stays open when pointer enters it (WCAG 1.4.13). Key-value: name, rank "4 of 19", interest badge, confirmed count, source company. Never the only home of an action.

No new color tokens — every state maps onto existing `success/warning/danger/info/brand/neutral`.
