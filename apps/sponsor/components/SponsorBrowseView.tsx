'use client'
import { useState, useMemo } from 'react'
import { getIndustry, getJobFunction, getTitleLevel } from '@/lib/solutions'
import { SolutionBadge } from './SolutionBadge'

const SOLUTION_CATEGORIES: { label: string; items: string[] }[] = [
  { label: 'Marketing Solutions', items: [
    'Affiliate Marketing Solutions', 'Consumer Sentiment & Reviews', 'Content Marketing Solutions',
    'Creative & Design Services', 'Digital Marketing Services', 'Email Marketing Solutions',
    'Influencer Marketing Solutions', 'Location Based Marketing Solutions', 'Loyalty & Rewards (inc. Rebates) Solutions',
    'Marketing Analytics', 'Marketing Automation Platforms', 'Marketing Campaign Management',
    'Marketing Personalization Solutions', 'Media Buying Services', 'Mobile, App & SMS Marketing Solutions',
    'Multichannel Marketing Platforms', 'Retargeting Solutions', 'Search Engine Optimization & Marketing (SEO & SEM)',
    'Social Media Marketing Solutions', 'Video Marketing Solutions',
  ]},
  { label: 'Data, Analytics & AI', items: [
    'Artificial Intelligence (inc. Machine Learning)', 'Business Intelligence Tools', 'Data Visualization Tools',
    'In-Store Analytics', 'Predictive Analytics', 'Product Data Management Solutions',
    'Web & App Analytics',
  ]},
  { label: 'Commerce Platforms', items: [
    'B2B Ecommerce Platforms', 'Cross-Border Ecommerce Platforms', 'Ecommerce Platforms',
    'Marketplace Platforms', 'Mobile & App Commerce Platforms', 'Social Commerce Platforms',
  ]},
  { label: 'Web & Mobile', items: [
    'Augmented Reality & Virtual Reality', 'Content Production Services & Solutions',
    'Product Information Management (PIM) Solutions', 'Shoppable Video & Livestreaming Solutions',
    'Site Personalization Solutions', 'Site Search Solutions',
    'Translation & Localization Services', 'Web Performance & Security Solutions',
  ]},
  { label: 'In-Store Solutions', items: [
    'Associate Mobility Solutions', 'Automated Retail Solutions', 'In-Store Solutions',
    'POS Hardware & Peripherals',
  ]},
  { label: 'Payments, Banking & Embedded Products', items: [
    'BNPL, Customer Installment Lending & Financing Solutions', 'Fraud Detection & Risk Management Solutions',
    'Merchant Services Solutions', 'Mobile POS Solutions', 'Mobile Wallets & Payments Solutions',
    'POS Solutions', 'Subscription Management & Recurring Payment Solutions',
  ]},
  { label: 'CRM & Customer Service', items: [
    'Clienteling Solutions', 'Customer Data Platforms', 'Customer Feedback Solutions',
    'Customer Relationship Management (CRM) Solutions', 'Live Chat, Chatbots & Virtual Assistants Solutions',
    'Loyalty Management Solutions',
  ]},
  { label: 'Infrastructure & IT', items: [
    'Data Architecture & Infrastructure Solutions', 'Data Integrity & Cybersecurity Solutions',
    'Data Management Platforms',
  ]},
  { label: 'Supply Chain, Merchandising, Pricing & Planning', items: [
    'Category Management Solutions', 'Competitive Pricing Insights & Solutions',
    'Delivery (inc. Last Mile) & Pickup Solutions', 'Forecasting & Replenishment Solutions',
    'Fulfillment Solutions', 'Inventory Management Systems',
    'Inventory Planning & Optimization Tools', 'Merchandising Analytics',
    'Merchandising Assortment Planning & Management', 'Order Management Systems',
    'Price Optimization Solutions', 'Product Lifecycle Management (PLM) Solutions',
    'Returns Solutions', 'Sourcing Solutions & Services',
    'Supply Chain Management Software', 'Sustainability Solutions',
    'Third Party Logistics (3PL) Services', 'Warehouse & Distribution Center Management',
  ]},
  { label: 'Professional Services', items: [
    'Consultancy & Advisory Services', 'Market Research & Analysis Services',
  ]},
  { label: 'Back Office & HR', items: [
    'Back Office & Financial Solutions', 'HR & Payroll Solutions',
  ]},
]

const ALL_SOLUTIONS = SOLUTION_CATEGORIES.flatMap(c => c.items)

const INDUSTRIES = [
  'Fashion & Apparel', 'Beauty & Cosmetics', 'Skincare', 'Health & Wellness',
  'Food & Beverage', 'Home & Lifestyle', 'Jewelry & Accessories', 'Pet', 'Kids & Baby',
  'Technology',
]

const COMPANY_SIZES = ['STARTUP', 'SMB', 'MIDMARKET', 'ENTERPRISE']
const REVENUE_RANGES = ['<1M', '1M-10M', '10M-50M', '50M-250M', '250M+']
const ROLES = ['ATTENDEE', 'SPEAKER']

const JOB_FUNCTIONS = [
  'Marketing', 'Ecommerce', 'Stores/Retail', 'Customer Experience', 'Digital',
  'Strategy/Innovation', 'Information Technology', 'Operations', 'C-Suite/GM',
  'Supply Chain/Logistics', 'Merchandising',
]

function parseArr(val: string | null | undefined): string[] {
  if (!val) return []
  try { return JSON.parse(val) } catch { return [] }
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
      active ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary'
    }`}>{label}</button>
  )
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full mb-2 group">
        <span className="text-sm font-bold text-primary">{title}</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="flex flex-wrap gap-1.5">{children}</div>}
    </div>
  )
}

function SolutionOfferingsFilter({ seeking, toggle }: { seeking: string[]; toggle: (s: string) => void }) {
  const [openCat, setOpenCat] = useState<string | null>(null)

  const selectedCountByCat = (items: string[]) => items.filter(s => seeking.includes(s)).length

  return (
    <div>
      <p className="text-sm font-bold text-primary mb-3">Solution Seeking</p>
      <div className="space-y-1">
        {SOLUTION_CATEGORIES.map(cat => {
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
                <span className="truncate text-left">{cat.label}</span>
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
                      onClick={() => toggle(s)}
                      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${
                        seeking.includes(s) ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                        seeking.includes(s) ? 'bg-primary border-primary' : 'border-gray-300'
                      }`}>
                        {seeking.includes(s) && (
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
      {seeking.length > 0 && (
        <p className="text-[10px] text-primary font-medium mt-2">{seeking.length} selected</p>
      )}
    </div>
  )
}

export function SponsorBrowseView({
  people, sponsorId, isStaff,
}: {
  people: any[]; sponsorId: string | null; isStaff: boolean;
}) {
  const [search, setSearch] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [jobFunctions, setJobFunctions] = useState<string[]>([])
  const [industries, setIndustries] = useState<string[]>([])
  const [sizes, setSizes] = useState<string[]>([])
  const [revenues, setRevenues] = useState<string[]>([])
  const [seeking, setSeeking] = useState<string[]>([])
  const [requested, setRequested] = useState<Set<string>>(new Set())
  const [showModal, setShowModal] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const toggle = (val: string, arr: string[], set: (v: string[]) => void) =>
    set(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val])

  const filtered = useMemo(() => {
    return people.filter(p => {
      if (search) {
        const q = search.toLowerCase()
        if (!`${p.name} ${p.company} ${p.jobTitle} ${p.bio}`.toLowerCase().includes(q)) return false
      }
      if (roles.length && !roles.includes(p.role)) return false
      if (jobFunctions.length && !jobFunctions.includes(getJobFunction(p.jobTitle))) return false
      if (industries.length && !industries.includes(getIndustry(p.company))) return false
      if (sizes.length && !sizes.includes(p.companySize)) return false
      if (revenues.length && !revenues.includes(p.annualRevenue)) return false
      if (seeking.length) {
        const their = parseArr(p.solutionsSeeking)
        if (!seeking.some(s => their.includes(s))) return false
      }
      return true
    })
  }, [people, search, roles, jobFunctions, industries, sizes, revenues, seeking])

  async function requestMeeting() {
    if (!sponsorId || !showModal) return
    setSending(true)
    try {
      await fetch('/api/request-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: showModal, message }),
      })
      setRequested(prev => new Set([...prev, showModal]))
    } finally {
      setSending(false)
      setShowModal(null)
      setMessage('')
    }
  }

  const modalPerson = showModal ? filtered.find(p => p.id === showModal) ?? people.find(p => p.id === showModal) : null

  const activeFilters = roles.length + jobFunctions.length + industries.length + sizes.length + revenues.length + seeking.length

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex gap-6">
        {/* Sidebar filters */}
        <aside className="w-64 flex-shrink-0 space-y-5 hidden lg:block">
          <h2 className="font-semibold text-gray-900">Filters
            {activeFilters > 0 && (
              <span className="ml-2 text-xs bg-primary text-white rounded-full px-1.5 py-0.5">{activeFilters}</span>
            )}
          </h2>
          <FilterSection title="Role">
            {ROLES.map(r => <Chip key={r} label={r} active={roles.includes(r)} onClick={() => toggle(r, roles, setRoles)} />)}
          </FilterSection>
          <FilterSection title="Brand & Retailer Job Function">
            {JOB_FUNCTIONS.map(fn => <Chip key={fn} label={fn} active={jobFunctions.includes(fn)} onClick={() => toggle(fn, jobFunctions, setJobFunctions)} />)}
          </FilterSection>
          <FilterSection title="Industry">
            {INDUSTRIES.map(i => <Chip key={i} label={i} active={industries.includes(i)} onClick={() => toggle(i, industries, setIndustries)} />)}
          </FilterSection>
          <FilterSection title="Company Size">
            {COMPANY_SIZES.map(s => <Chip key={s} label={{ STARTUP: 'Startup (1–50)', SMB: 'SMB (51–500)', MIDMARKET: 'Mid-Market (501–2K)', ENTERPRISE: 'Enterprise (2K+)' }[s] ?? s} active={sizes.includes(s)} onClick={() => toggle(s, sizes, setSizes)} />)}
          </FilterSection>
          <FilterSection title="Annual Revenue">
            {REVENUE_RANGES.map(r => <Chip key={r} label={{ '<1M': 'Under $1M', '1M-10M': '$1M–$10M', '10M-50M': '$10M–$50M', '50M-250M': '$50M–$250M', '250M+': '$250M+' }[r] ?? r} active={revenues.includes(r)} onClick={() => toggle(r, revenues, setRevenues)} />)}
          </FilterSection>
          <SolutionOfferingsFilter seeking={seeking} toggle={(s: string) => toggle(s, seeking, setSeeking)} />
          {activeFilters > 0 && (
            <button onClick={() => { setRoles([]); setJobFunctions([]); setIndustries([]); setSizes([]); setRevenues([]); setSeeking([]) }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors">
              Clear all filters
            </button>
          )}
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Browse Attendees</h1>
              <p className="text-sm text-gray-500">{filtered.length} of {people.length} attendees</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl bg-white focus-within:ring-2 focus-within:ring-primary/40 w-64">
              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                className="flex-1 text-sm focus:outline-none bg-transparent"
                placeholder="Search name, company…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-gray-300 hover:text-gray-500">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
            {filtered.map(p => {
              const theirSeeking = parseArr(p.solutionsSeeking)
              const theirOffering = parseArr(p.solutionsOffering)
              const isRequested = requested.has(p.id)
              const industry = getIndustry(p.company)
              const jobFn = getJobFunction(p.jobTitle)
              const titleLevel = getTitleLevel(p.jobTitle)

              return (
                <div key={p.id} className="card hover:shadow-md transition-shadow flex flex-col justify-between">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden">
                      {p.image ? (
                        <img src={p.image} alt={p.name ?? ''} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary font-bold text-lg">
                          {(p.name ?? '?')[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 text-sm">{p.name ?? '—'}</h3>
                        <span className={`badge ${
                          p.role === 'SPEAKER' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {p.role.charAt(0) + p.role.slice(1).toLowerCase()}
                        </span>
                      </div>
                      {p.jobTitle && (
                        <p className="text-xs text-gray-700 font-medium mt-0.5">{p.jobTitle}</p>
                      )}
                      {p.company && (
                        <p className="text-xs text-gray-400">{p.company}</p>
                      )}
                    </div>
                  </div>

                  {/* Industry / Function / Title metadata */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="badge bg-violet-50 text-violet-700">{industry}</span>
                    <span className="badge bg-sky-50 text-sky-700">{jobFn}</span>
                    <span className="badge bg-gray-100 text-gray-600">{titleLevel}</span>
                    {p.annualRevenue && (
                      <span className="badge bg-emerald-50 text-emerald-700">{p.annualRevenue} ARR</span>
                    )}
                  </div>

                  {p.bio && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{p.bio}</p>}
                  <div className="flex-1" />

                  {theirOffering.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Offers</p>
                      <div className="flex flex-wrap gap-1">
                        {theirOffering.slice(0, 4).map(t => <SolutionBadge key={t} label={t} />)}
                        {theirOffering.length > 4 && <span className="badge bg-gray-100 text-gray-500">+{theirOffering.length - 4}</span>}
                      </div>
                    </div>
                  )}

                  {theirSeeking.length > 0 && (
                    <div className="mb-3 bg-primary/5 rounded-xl p-2.5">
                      <p className="text-[10px] font-bold text-primary uppercase tracking-wide mb-1.5">Looking For</p>
                      <div className="flex flex-wrap gap-1">
                        {theirSeeking.slice(0, 5).map(t => <SolutionBadge key={t} label={t} />)}
                        {theirSeeking.length > 5 && <span className="badge bg-gray-100 text-gray-500">+{theirSeeking.length - 5}</span>}
                      </div>
                    </div>
                  )}

                  {/* Request meeting */}
                  {sponsorId && (
                    <>
                      <button
                        onClick={() => isRequested ? null : setShowModal(p.id)}
                        disabled={isRequested}
                        className={`w-full py-2 rounded-xl text-sm font-semibold transition-colors ${
                          isRequested
                            ? 'bg-green-50 text-green-600 cursor-default'
                            : 'bg-primary text-white hover:bg-primary-dark active:scale-95'
                        }`}
                      >
                        {isRequested ? '✓ Requested' : 'Request Meeting'}
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p>No attendees match your filters.</p>
            </div>
          )}
        </div>
      </div>

      {/* Request Meeting Modal */}
      {showModal && modalPerson && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <h2 className="font-bold text-gray-900 mb-1">Request a meeting</h2>
            <p className="text-sm text-gray-500 mb-4">with {modalPerson.name} ({modalPerson.company ?? modalPerson.role})</p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="What would you like to discuss? (optional)"
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 mb-4 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => { setShowModal(null); setMessage('') }} className="btn-secondary flex-1">Cancel</button>
              <button onClick={requestMeeting} disabled={sending} className="btn-primary flex-1">
                {sending ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
