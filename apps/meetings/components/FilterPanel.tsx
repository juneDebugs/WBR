'use client'
import { useState } from 'react'
import {
  SOLUTIONS, COMPANY_SIZES, REVENUE_RANGES, COMPANY_SIZE_LABELS, REVENUE_LABELS,
  INDUSTRIES, JOB_FUNCTIONS, TITLE_LEVELS, CATEGORY_BORDER_COLORS, SOLUTION_CATEGORY_GROUPS,
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
        className="flex items-center justify-between w-full mb-2 group"
      >
        <span className="text-sm font-bold text-primary">{label}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="flex flex-wrap gap-1.5">{children}</div>}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
      active ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary'
    }`}>
      {children}
    </button>
  )
}

function SolutionCategoryFilter({ selected, toggleSolution }: { selected: string[]; toggleSolution: (s: string) => void }) {
  const [openCat, setOpenCat] = useState<string | null>(null)

  const selectedCountByCat = (items: string[]) => items.filter(s => selected.includes(s)).length

  return (
    <div>
      <p className="text-sm font-bold text-primary mb-3">Strategic Solutions</p>
      <div className="space-y-1">
        {SOLUTION_CATEGORY_GROUPS.map(cat => {
          const isOpen = openCat === cat.label
          const count = selectedCountByCat(cat.items)
          return (
            <div key={cat.label}>
              <button
                onClick={() => setOpenCat(isOpen ? null : cat.label)}
                className={`flex items-center justify-between w-full px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isOpen ? 'bg-primary/10 text-primary' : count > 0 ? 'bg-primary/5 text-primary' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="flex items-center gap-2 truncate text-left">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_BORDER_COLORS[cat.label] ?? '#d1d5db' }} />
                  {cat.label}
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                  {count > 0 && (
                    <span className="bg-primary text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{count}</span>
                  )}
                  <svg className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {isOpen && (
                <div className="pl-1 py-1 space-y-0.5">
                  {cat.items.map(s => (
                    <button
                      key={s}
                      onClick={() => toggleSolution(s)}
                      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${
                        selected.includes(s) ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                        selected.includes(s) ? 'bg-primary border-primary' : 'border-gray-300'
                      }`}>
                        {selected.includes(s) && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-[10px] text-primary font-medium mt-2">{selected.length} selected</p>
      )}
    </div>
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

      {/* Job Function */}
      <Section label="Brand & Retailer Job Function">
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

      {/* Strategic Solutions — nested accordion */}
      <SolutionCategoryFilter
        selected={f.solutionsOffering}
        toggleSolution={(s) => onChange({ ...f, solutionsOffering: toggle(f.solutionsOffering, s) })}
      />

      {/* Clear */}
      {hasAny && (
        <button onClick={() => onChange(EMPTY_FILTERS)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
          Clear all filters
        </button>
      )}
    </div>
  )
}
