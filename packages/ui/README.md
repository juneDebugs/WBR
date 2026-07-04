# @conference/ui — shared design system

The single source of truth for the WBR design language across all four apps
(`web`, `attendee`, `meetings`, `sponsor`). HIG-grounded (Clarity · Deference · Depth).

## What's here

- **`preset.cjs`** — a Tailwind **preset**. It defines the token scale (colors,
  system-font stack, type scale, radii, shadows, keyframes) and injects the shared
  base + component layers (`.card`, `.btn-*`, `.input`, `.badge*`, `.chip*`, `.tab-bar`,
  `.section-title`, focus-visible rings, reduced-motion, …).

## How apps consume it

Build-time only — nothing is imported into the client bundle. Each app's
`tailwind.config.ts`:

```ts
const preset = require('../../packages/ui/preset.cjs')
const config: Config = {
  presets: [preset],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
}
```

Each app's `globals.css` is reduced to the three `@tailwind` directives plus any
genuinely app-specific rules (e.g. the attendee PWA safe-area handling).

Because it's a Tailwind preset (read by PostCSS at build), it needs **no**
`transpilePackages` entry and no workspace symlink — it's `require()`'d by relative path.

## Rules

See [`docs/design-system.md`](../../docs/design-system.md) for tokens, component
vocabulary, and the usage rules implementers must follow (no raw hex / no rogue palette
colors; use the token utilities and component classes).

## Tests

`node scripts/test-design-system.mjs` asserts every app wires this preset, that the
preset exposes the expected token + component surface, and that no app reintroduces
rogue brand/neutral hex colors in its styling.
