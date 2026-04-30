'use client'
import { useState } from 'react'
import {
  SOLUTIONS, COMPANY_SIZES, REVENUE_RANGES, COMPANY_SIZE_LABELS, REVENUE_LABELS,
  INDUSTRIES, JOB_FUNCTIONS, TITLE_LEVELS, SOLUTION_COLORS,
} from '@/lib/solutions'

export interface Filters {
  roles: string[]
  industries: string[]
  titleLevels: string[]
  jobFunctions: string[]
  companySizes: string[]
  revenues: string[]
  solutionsOffering: string[]
  solutionsSeeking: string[]
  search: string
}

export const EMPTY_FILTERS: Filters = {
  roles: [], industries: [], titleLevels: [], jobFunctions: [],
  companySizes: [], revenues: [], solutionsOffering: [], solutionsSeeking: [], search: '',
}

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  mode: 'sponsor-browsing-people' | 'attendee-browsing-sponsors'
}

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between mb-2 group"
      >
        <span className="text-sm font-bold text-pink-500 tracking-wide">{label}</span>
        <svg
          className={`w-4 h-4 text-pink-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="flex flex-wrap gap-1.5">{children}</div>}
    </div>
  )
}

function Chip({ active, onClick, children, solution }: { active: boolean; onClick: () => void; children: React.ReactNode; solution?: string }) {
  const c = solution ? SOLUTION_COLORS[solution] : null
  if (c) {
    const bg = active
      ? `linear-gradient(to right, ${c.activeFrom}, ${c.activeTo})`
      : `linear-gradient(to right, ${c.bgFrom}, ${c.bgTo})`
    const color = active ? '#fff' : c.text
    const dot = active ? 'rgba(255,255,255,0.6)' : c.dot
    return (
      <button
        onClick={onClick}
        className="chip border border-transparent"
        style={{ background: bg, color }}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
        {children}
      </button>
    )
  }
  return (
    <button onClick={onClick} className={`chip ${active ? 'chip-active' : 'chip-inactive'}`}>
      {children}
    </button>
  )
}

export function FilterPanel({ filters, onChange, mode }: Props) {
  const f = filters
  const hasAny = f.roles.length > 0 || f.industries.length > 0 || f.titleLevels.length > 0 ||
    f.jobFunctions.length > 0 || f.companySizes.length > 0 || f.revenues.length > 0 ||
    f.solutionsOffering.length > 0 || f.solutionsSeeking.length > 0 || !!f.search

  return (
    <div className="space-y-5">

      {/* Search */}
      <div>
        <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl bg-white focus-within:ring-2 focus-within:ring-primary/40">
          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, company, or topic…"
            value={f.search}
            onChange={e => onChange({ ...f, search: e.target.value })}
            className="flex-1 text-sm focus:outline-none bg-transparent"
          />
          {f.search && (
            <button onClick={() => onChange({ ...f, search: '' })} className="text-gray-300 hover:text-gray-500">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Title */}
      <Section label="Title">
        {TITLE_LEVELS.map(lvl => (
          <Chip key={lvl} active={f.titleLevels.includes(lvl)} onClick={() => onChange({ ...f, titleLevels: toggle(f.titleLevels, lvl) })}>
            {lvl}
          </Chip>
        ))}
      </Section>

      {/* Brand & Retailer Job Function */}
      <Section label="Solution Provider Job Function">
        {JOB_FUNCTIONS.map(fn => (
          <Chip key={fn} active={f.jobFunctions.includes(fn)} onClick={() => onChange({ ...f, jobFunctions: toggle(f.jobFunctions, fn) })}>
            {fn}
          </Chip>
        ))}
      </Section>

      {/* Role — sponsor browsing people only */}
      {mode === 'sponsor-browsing-people' && (
        <Section label="Role">
          {['ATTENDEE', 'SPEAKER'].map(role => (
            <Chip key={role} active={f.roles.includes(role)} onClick={() => onChange({ ...f, roles: toggle(f.roles, role) })}>
              {role.charAt(0) + role.slice(1).toLowerCase()}
            </Chip>
          ))}
        </Section>
      )}

      {/* Industry */}
      <Section label="Industry">
        {INDUSTRIES.map(ind => (
          <Chip key={ind} active={f.industries.includes(ind)} onClick={() => onChange({ ...f, industries: toggle(f.industries, ind) })}>
            {ind}
          </Chip>
        ))}
      </Section>

      {/* Company Size */}
      <Section label="Company Size">
        {COMPANY_SIZES.map(size => (
          <Chip key={size} active={f.companySizes.includes(size)} onClick={() => onChange({ ...f, companySizes: toggle(f.companySizes, size) })}>
            {COMPANY_SIZE_LABELS[size]}
          </Chip>
        ))}
      </Section>

      {/* Annual Revenue */}
      <Section label="Annual Revenue">
        {REVENUE_RANGES.map(rev => (
          <Chip key={rev} active={f.revenues.includes(rev)} onClick={() => onChange({ ...f, revenues: toggle(f.revenues, rev) })}>
            {REVENUE_LABELS[rev]}
          </Chip>
        ))}
      </Section>

      {/* Strategic Solutions */}
      <Section label="Strategic Solutions">
        {SOLUTIONS.map(sol => (
          <Chip key={sol} solution={sol} active={f.solutionsOffering.includes(sol)} onClick={() => onChange({ ...f, solutionsOffering: toggle(f.solutionsOffering, sol) })}>
            {sol}
          </Chip>
        ))}
      </Section>

      {/* Clear */}
      {hasAny && (
        <button onClick={() => onChange(EMPTY_FILTERS)} className="text-xs text-primary hover:underline">
          Clear all filters
        </button>
      )}
    </div>
  )
}
