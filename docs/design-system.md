# WBR Design System — "A퟇" (HIG-grounded)

> One design language across all four apps (`web`, `attendee`, `meetings`, `sponsor`).
> Grounded in Apple's Human Interface Guidelines: **Clarity, Deference, Depth.**
> Single source of truth: [`packages/ui/preset.cjs`](../packages/ui/preset.cjs).
> Every app's `tailwind.config.ts` extends this preset; every app's `globals.css` is
> reduced to `@tailwind` directives plus genuinely app-specific rules only.

## Principles (HIG)

1. **Clarity** — legible type at every size, precise use of the accent color, hairline
   separators instead of heavy borders, generous negative space. Content over chrome.
2. **Deference** — the UI defers to content: near-white canvas, white surfaces, minimal
   and layered shadows (never drop-shadow-heavy), translucency ("materials") used only
   for floating chrome (nav/tab bars).
3. **Depth** — hierarchy communicated through elevation (canvas → card → sheet/popover),
   crisp motion on interaction, and consistent, continuous corner radii.

## Tokens

### Color

Semantic tokens (use these; never hardcode hex in pages):

| Token | Value | Use |
|---|---|---|
| `canvas` | `#f5f5f7` | App background (all apps, unified) |
| `surface` | `#ffffff` | Cards, bars, sheets |
| `surface-2` | `#fbfbfd` | Nested / secondary surface |
| `fill` | `#f2f2f7` | Secondary fills (segmented, inactive chip) |
| `fill-2` | `#e9e9ee` | Pressed secondary fill |
| `hairline` | `#e5e5ea` | Separators, card borders |
| `ink` | `#1d1d1f` | Primary text (Apple near-black) |
| `ink-2` | `#6e6e73` | Secondary text / labels |
| `ink-3` | `#8e8e93` | Tertiary text / placeholders |

Brand accent — indigo ramp anchored on the existing `#6366f1`:

`brand.50 #eef2ff` · `100 #e0e7ff` · `200 #c7d2fe` · `300 #a5b4fc` · `400 #818cf8` ·
`500 #6366f1 (DEFAULT)` · `600 #4f46e5 (hover)` · `700 #4338ca` · `800 #3730a3` · `900 #312e81`

Also aliased as `primary` / `primary-dark` / `primary-light` for backward compatibility.

Status (Apple system colors, with accessible subtle bg + text pairs):

| Status | solid | bg | text |
|---|---|---|---|
| success | `#34c759` | `#e7f8ec` | `#1c7a3f` |
| warning | `#ff9f0a` | `#fff3e0` | `#8a5300` |
| danger | `#ff3b30` | `#ffeceb` | `#c81e14` |
| info | `#6366f1` | `#eef2ff` | `#4338ca` |

### Typography

**System font** — no web-font download (HIG-native, fastest):
`-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji'`.

Tailwind's default size scale (`text-xs`…`text-3xl`) is retained so no page breaks.
HIG-named semantic sizes are **added** for new headings (opt-in), with tuned tracking:

`text-largetitle` 34 · `text-title1` 28 · `text-title2` 22 · `text-title3` 20 ·
`text-headline` 17/600 · `text-body` 17 · `text-callout` 16 · `text-subhead` 15 ·
`text-footnote` 13 · `text-caption` 12. Large text gets negative letter-spacing.

Weights: 400 body, 500 medium, 600 semibold (headlines/buttons), 700 titles.

### Shape

Continuous, consistent radii: cards/sheets `rounded-2xl` (16px), controls
(buttons/inputs/chips containers) `rounded-xl` (12px), small `rounded-lg` (10px),
pills/avatars `rounded-full`.

### Elevation (shadows — subtle, layered)

| Token | Use |
|---|---|
| `shadow-card` | Resting card: `0 1px 2px rgba(0,0,0,.04), 0 1px 3px rgba(0,0,0,.06)` |
| `shadow-elevated` | Sheets/menus: `0 4px 16px rgba(0,0,0,.08)` |
| `shadow-pop` | Popovers/toasts: `0 8px 30px rgba(0,0,0,.12)` |

### Motion

150–200ms `ease-out`. Tap feedback `active:scale-[0.97]`. All motion wrapped by
`@media (prefers-reduced-motion: reduce)` → no transforms/animation.

### Touch targets

Every interactive control ≥ **44×44px** (HIG minimum). Encoded into `.btn*`, `.tab-item`,
`.input`, and icon-button helper `.icon-btn`.

### Focus (accessibility)

Global `:focus-visible` ring: `2px solid brand`, `outline-offset: 2px`. Applied in base
layer so keyboard users get a visible focus indicator everywhere.

## Component vocabulary (defined once in the preset)

The preset injects the **union** of every class the four apps already use, so nothing
breaks and all four render identically:

- Layout: `.page-container`, `.hairline`, `.section-title` (HIG grouped-list header)
- Surfaces: `.card`, `.card-flat`, `.glass` / `.glass-card` (material blur), `.material-bar`
- Buttons: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`, `.icon-btn`
  - **`.btn-primary`** is the signature CTA: a **solid indigo fill** (`brand-600 #4f46e5`)
    with a light lavender edge (`brand-300`) and a soft **violet glow** halo — built from
    `color` + `box-shadow` only (zero layout impact). Hover darkens to `brand-700` and
    intensifies the glow. (It replaced the earlier blue→pink gradient CTA on 2026-07-06.)
    The blue→pink `.brand-gradient` / `bg-brand-gradient` is retained **only** for
    decorative identity marks — logo squares, avatar/icon fallbacks — never for buttons.
- Forms: `.input`, `.textarea`, `.select`, `.label`, `.form-input`, `.form-label`
- Data/status: `.badge` + `.badge-{success,warning,danger,brand,neutral}`
- Filters: `.chip`, `.chip-active`, `.chip-inactive`
- Nav (mobile): `.tab-bar`, `.tab-item`, `.tab-item.active`
- Feedback: `.skeleton` (shimmer), `.empty-state`

## Usage rules for implementers

1. **Never** hardcode a hex or a raw Tailwind palette color (`indigo-600`, `purple-500`,
   `blue-600`, `slate-*`) for brand or neutral UI. Use tokens: `text-ink`, `text-ink-2`,
   `bg-canvas`, `bg-surface`, `border-hairline`, `text-brand`, `bg-brand`.
2. Use the component classes for buttons/inputs/cards/badges/chips instead of inline recipes.
3. Status colors only via `badge-*` or the `success/warning/danger` token families.
4. Titles use `.section-title` or the semantic `text-title*/headline`. Body is `text-ink`;
   secondary text is `text-ink-2` (never `text-gray-400` for body — fails contrast).
5. Keep one gray family — the `ink`/`hairline`/`fill` tokens. Do not mix `gray-*` and `slate-*`.
