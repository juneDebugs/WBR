import { SOLUTION_COLORS } from '@/lib/solutions'

export function SolutionBadge({ label }: { label: string }) {
  const c = SOLUTION_COLORS[label]
  if (!c) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-footnote font-medium bg-fill text-ink-2">
      <span className="w-1.5 h-1.5 rounded-full bg-ink-3 flex-shrink-0" />
      {label}
    </span>
  )
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-footnote font-medium"
      style={{
        background: `linear-gradient(to right, ${c.bgFrom}, ${c.bgTo})`,
        color: c.text,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: c.dot }}
      />
      {label}
    </span>
  )
}
