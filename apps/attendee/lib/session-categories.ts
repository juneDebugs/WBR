// Single source of truth for session-category colours.
// Previously two conflicting maps lived in HomeScreen.tsx and SessionCard.tsx for
// the same keynote/talk/workshop/panel/meeting/break types. This unifies the
// colour vocabulary onto the design-system tokens (brand indigo + Apple status
// colours). Labels and icons stay component-local — only colours are shared.
//
//   KEYNOTE  → warning  (#ff9f0a)
//   TALK     → brand    (#6366f1 / #818cf8)
//   WORKSHOP → success  (#34c759)
//   PANEL    → danger   (#ff3b30)
//   MEETING  → brand-light (#818cf8 / #6366f1)
//   BREAK    → ink-3    (#8e8e93)

export interface SessionCategoryColor {
  /** Primary accent (solid badge bg, gradient start). */
  color: string
  /** Gradient end / secondary accent. */
  color2: string
  /** Low-alpha tint for card / icon surfaces. */
  tint: string
}

export const SESSION_CATEGORY_COLORS: Record<string, SessionCategoryColor> = {
  KEYNOTE:  { color: '#ff9f0a', color2: '#ff9f0a', tint: 'rgba(255,159,10,0.08)' },
  TALK:     { color: '#6366f1', color2: '#818cf8', tint: 'rgba(99,102,241,0.06)' },
  WORKSHOP: { color: '#34c759', color2: '#34c759', tint: 'rgba(52,199,89,0.06)' },
  PANEL:    { color: '#ff3b30', color2: '#ff3b30', tint: 'rgba(255,59,48,0.06)' },
  MEETING:  { color: '#818cf8', color2: '#6366f1', tint: 'rgba(129,140,248,0.10)' },
  BREAK:    { color: '#8e8e93', color2: '#8e8e93', tint: 'rgba(142,142,147,0.08)' },
}

export function sessionCategoryColor(type: string): SessionCategoryColor {
  return SESSION_CATEGORY_COLORS[type?.toUpperCase()] ?? SESSION_CATEGORY_COLORS.TALK
}
