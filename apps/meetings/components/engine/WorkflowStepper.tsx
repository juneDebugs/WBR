'use client'
// eTail-style 5-step workflow stepper. "Manage Meetings" is the active step for
// the meeting engine. Chevron segments via clip-path.
const STEPS = [
  { n: 1, label: 'Event Setup', color: '#5cb85c' },
  { n: 2, label: 'Preview & Launch', color: '#f0ad4e' },
  { n: 3, label: 'Monitor Registration', color: '#c9ccd1' },
  { n: 4, label: 'Manage Meetings', color: '#c9ccd1' },
  { n: 5, label: 'Post-Event Actions', color: '#c9ccd1' },
]
const ACTIVE = 4

export function WorkflowStepper() {
  return (
    <div className="flex w-full select-none" style={{ fontFamily: 'Arial, sans-serif' }}>
      {STEPS.map((s, i) => {
        const active = s.n === ACTIVE
        const bg = active ? '#2f6fb3' : s.color
        const isLast = i === STEPS.length - 1
        return (
          <div
            key={s.n}
            className="relative flex items-center gap-2 flex-1 h-12 pl-5 pr-2 text-white"
            style={{
              backgroundColor: bg,
              clipPath: isLast
                ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)'
                : i === 0
                ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
                : 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)',
              marginLeft: i === 0 ? 0 : -14,
              zIndex: STEPS.length - i,
            }}
          >
            <span className="text-2xl font-bold leading-none opacity-90">{s.n}</span>
            <span className={`text-[13px] leading-tight ${active ? 'font-bold' : 'font-semibold'} ${s.color === '#c9ccd1' && !active ? 'text-white/95' : ''}`}>
              {s.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
