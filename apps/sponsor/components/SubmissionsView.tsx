'use client'

import { useState, useMemo, useEffect } from 'react'
import { format } from 'date-fns'
import { useSubmissionForms } from '@/lib/hooks'

const FORM_TYPES = [
  { value: 'ABSTRACT',         label: 'Abstract',           desc: 'Short summaries of proposed presentations or research' },
  { value: 'FULL_PAPER',       label: 'Full Paper',         desc: 'Complete academic or industry research papers' },
  { value: 'SPEAKER_PROPOSAL', label: 'Speaker Proposal',   desc: 'Individual speaker session pitches and bios' },
  { value: 'PANEL',            label: 'Panel / Discussion', desc: 'Multi-speaker panel topic and participant proposals' },
  { value: 'SYMPOSIUM',        label: 'Symposium',          desc: 'Full-day or half-day symposia with multiple sessions' },
  { value: 'CUSTOM',           label: 'Custom Form',        desc: 'Freeform structured data collection' },
]

const FIELD_TYPES = [
  { value: 'text',     label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'email',    label: 'Email' },
  { value: 'url',      label: 'URL / Link' },
  { value: 'select',   label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
]

// Status → design-system badge tint (unified with the rest of the app):
// pending→warning, reviewed→brand/info, accepted→success, rejected→danger.
const STATUS_META: Record<string, { badge: string; dot: string; label: string }> = {
  PENDING:  { badge: 'badge-warning', dot: 'bg-warning', label: 'Pending' },
  REVIEWED: { badge: 'badge-brand',   dot: 'bg-brand',   label: 'Reviewed' },
  ACCEPTED: { badge: 'badge-success', dot: 'bg-success', label: 'Accepted' },
  REJECTED: { badge: 'badge-danger',  dot: 'bg-danger',  label: 'Rejected' },
}

const DOC_ICON = 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'

interface FormField {
  id: string
  label: string
  type: string
  required: boolean
  options?: string[]
  placeholder?: string
}

interface SubmissionFormData {
  id: string
  title: string
  type: string
  description: string | null
  fields: string
  isOpen: boolean
  deadline: string | null
  createdAt: string
  submissionCount: number
}

interface Submission {
  id: string
  name: string | null
  email: string | null
  data: string
  status: string
  createdAt: string
}

function typeInfo(type: string) {
  return FORM_TYPES.find(t => t.value === type) ?? FORM_TYPES[FORM_TYPES.length - 1]
}

function statusMeta(status: string) {
  return STATUS_META[status] ?? STATUS_META.PENDING
}

function newField(): FormField {
  return { id: crypto.randomUUID(), label: '', type: 'text', required: false }
}

const DEFAULT_FIELDS: Record<string, FormField[]> = {
  ABSTRACT: [
    { id: crypto.randomUUID(), label: 'Title', type: 'text', required: true, placeholder: 'Paper or presentation title' },
    { id: crypto.randomUUID(), label: 'Abstract', type: 'textarea', required: true, placeholder: '250–500 words summarizing your work' },
    { id: crypto.randomUUID(), label: 'Keywords', type: 'text', required: false, placeholder: 'Comma-separated keywords' },
    { id: crypto.randomUUID(), label: 'Author(s)', type: 'text', required: true, placeholder: 'Full names of all authors' },
    { id: crypto.randomUUID(), label: 'Affiliation', type: 'text', required: false, placeholder: 'Institution or company' },
  ],
  FULL_PAPER: [
    { id: crypto.randomUUID(), label: 'Title', type: 'text', required: true, placeholder: 'Full paper title' },
    { id: crypto.randomUUID(), label: 'Abstract', type: 'textarea', required: true, placeholder: 'Brief abstract (150–250 words)' },
    { id: crypto.randomUUID(), label: 'Paper URL / Upload Link', type: 'url', required: true, placeholder: 'Link to full paper (Google Drive, Dropbox, etc.)' },
    { id: crypto.randomUUID(), label: 'Author(s)', type: 'text', required: true, placeholder: 'Full names of all authors' },
    { id: crypto.randomUUID(), label: 'Contact Email', type: 'email', required: true, placeholder: 'Corresponding author email' },
    { id: crypto.randomUUID(), label: 'Track / Category', type: 'select', required: false, options: ['Technology', 'Business', 'Research', 'Industry', 'Other'] },
  ],
  SPEAKER_PROPOSAL: [
    { id: crypto.randomUUID(), label: 'Talk Title', type: 'text', required: true, placeholder: 'Your session title' },
    { id: crypto.randomUUID(), label: 'Session Description', type: 'textarea', required: true, placeholder: 'What will attendees learn? (200–400 words)' },
    { id: crypto.randomUUID(), label: 'Speaker Name', type: 'text', required: true, placeholder: 'Your full name' },
    { id: crypto.randomUUID(), label: 'Speaker Bio', type: 'textarea', required: true, placeholder: 'Short bio (100–200 words)' },
    { id: crypto.randomUUID(), label: 'LinkedIn / Website', type: 'url', required: false, placeholder: 'https://...' },
    { id: crypto.randomUUID(), label: 'Previous Speaking Experience', type: 'textarea', required: false, placeholder: 'Links to past talks or references' },
    { id: crypto.randomUUID(), label: 'Session Format', type: 'select', required: true, options: ['Talk (30 min)', 'Talk (45 min)', 'Workshop (90 min)', 'Lightning Talk (10 min)', 'Q&A / AMA'] },
  ],
  PANEL: [
    { id: crypto.randomUUID(), label: 'Panel Topic', type: 'text', required: true, placeholder: 'Proposed panel title' },
    { id: crypto.randomUUID(), label: 'Overview', type: 'textarea', required: true, placeholder: 'Describe the discussion focus and goals (200–400 words)' },
    { id: crypto.randomUUID(), label: 'Proposed Panelists', type: 'textarea', required: false, placeholder: 'Names and affiliations of suggested participants' },
    { id: crypto.randomUUID(), label: 'Moderator', type: 'text', required: false, placeholder: 'Proposed moderator name' },
    { id: crypto.randomUUID(), label: 'Contact Email', type: 'email', required: true, placeholder: 'Your email' },
    { id: crypto.randomUUID(), label: 'Desired Duration', type: 'select', required: true, options: ['30 minutes', '45 minutes', '60 minutes', '90 minutes'] },
  ],
  SYMPOSIUM: [
    { id: crypto.randomUUID(), label: 'Symposium Title', type: 'text', required: true, placeholder: 'Full symposium title' },
    { id: crypto.randomUUID(), label: 'Theme & Goals', type: 'textarea', required: true, placeholder: 'Overall theme, goals, and expected outcomes (300–600 words)' },
    { id: crypto.randomUUID(), label: 'Organizer Name', type: 'text', required: true, placeholder: 'Lead organizer full name' },
    { id: crypto.randomUUID(), label: 'Organizer Email', type: 'email', required: true, placeholder: 'Organizer contact email' },
    { id: crypto.randomUUID(), label: 'Proposed Sessions', type: 'textarea', required: false, placeholder: 'List of sessions with speakers (if known)' },
    { id: crypto.randomUUID(), label: 'Duration', type: 'select', required: true, options: ['Half day (4 hrs)', 'Full day (8 hrs)', '2 days'] },
    { id: crypto.randomUUID(), label: 'Target Audience', type: 'text', required: false, placeholder: 'Who should attend?' },
  ],
  CUSTOM: [
    { id: crypto.randomUUID(), label: 'Name', type: 'text', required: true, placeholder: 'Submitter full name' },
    { id: crypto.randomUUID(), label: 'Email', type: 'email', required: true, placeholder: 'Contact email' },
  ],
}

export function SubmissionsView() {
  // TanStack Query: cached for 5 min — no server round-trip on navigation
  const { data: rawForms, isLoading } = useSubmissionForms()

  // Normalize API response (_count.submissions) to component format (submissionCount)
  const initialForms = useMemo(() =>
    (rawForms ?? []).map((f: any) => ({
      id: f.id,
      title: f.title,
      type: f.type,
      description: f.description,
      fields: typeof f.fields === 'string' ? f.fields : JSON.stringify(f.fields ?? []),
      isOpen: f.isOpen,
      deadline: f.deadline ? (typeof f.deadline === 'string' ? f.deadline : new Date(f.deadline).toISOString()) : null,
      createdAt: typeof f.createdAt === 'string' ? f.createdAt : new Date(f.createdAt).toISOString(),
      submissionCount: f.submissionCount ?? f._count?.submissions ?? 0,
    })),
    [rawForms],
  )

  const [forms, setForms] = useState<SubmissionFormData[]>([])
  const [synced, setSynced] = useState(false)
  if (initialForms.length > 0 && !synced) {
    setForms(initialForms)
    setSynced(true)
  }

  // Pre-parse JSON fields once instead of on every render
  const parsedFieldsMap = useMemo(() => {
    const map = new Map<string, FormField[]>()
    for (const f of forms) {
      try { map.set(f.id, JSON.parse(f.fields)) } catch { map.set(f.id, []) }
    }
    return map
  }, [forms])

  function getFields(form: SubmissionFormData): FormField[] {
    return parsedFieldsMap.get(form.id) ?? (() => { try { return JSON.parse(form.fields) } catch { return [] } })()
  }
  const [showCreate, setShowCreate] = useState(false)
  const [selectedForm, setSelectedForm] = useState<SubmissionFormData | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loadingSubs, setLoadingSubs] = useState(false)
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  // Create form state
  const [step, setStep] = useState<'type' | 'build'>('type')
  const [newType, setNewType] = useState('ABSTRACT')
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newDeadline, setNewDeadline] = useState('')
  const [newFields, setNewFields] = useState<FormField[]>([])
  const [saving, setSaving] = useState(false)

  // Close the open overlay on Escape (a11y).
  useEffect(() => {
    if (!showCreate && !selectedForm) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (selectedForm) { setSelectedForm(null); setSelectedSub(null) }
      else if (showCreate) setShowCreate(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showCreate, selectedForm])

  function openCreate() {
    setStep('type')
    setNewType('ABSTRACT')
    setNewTitle('')
    setNewDesc('')
    setNewDeadline('')
    setNewFields([])
    setShowCreate(true)
  }

  function selectType(type: string) {
    setNewType(type)
    setNewFields((DEFAULT_FIELDS[type] ?? []).map(f => ({ ...f, id: crypto.randomUUID() })))
    const info = typeInfo(type)
    setNewTitle(info.label + ' Submission')
    setStep('build')
  }

  function addField() {
    setNewFields(prev => [...prev, newField()])
  }

  function removeField(id: string) {
    setNewFields(prev => prev.filter(f => f.id !== id))
  }

  function updateField(id: string, patch: Partial<FormField>) {
    setNewFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))
  }

  function moveField(id: string, dir: -1 | 1) {
    setNewFields(prev => {
      const idx = prev.findIndex(f => f.id === id)
      if (idx < 0) return prev
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  async function createForm() {
    if (!newTitle.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, type: newType, description: newDesc, fields: newFields, deadline: newDeadline || null }),
      })
      if (res.ok) {
        const form = await res.json()
        setForms(prev => [{ ...form, submissionCount: 0 }, ...prev])
        setShowCreate(false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function toggleOpen(form: SubmissionFormData) {
    const res = await fetch(`/api/submissions/${form.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isOpen: !form.isOpen }),
    })
    if (res.ok) {
      setForms(prev => prev.map(f => f.id === form.id ? { ...f, isOpen: !f.isOpen } : f))
    }
  }

  async function deleteForm(id: string) {
    if (!confirm('Delete this form and all its submissions?')) return
    const res = await fetch(`/api/submissions/${id}`, { method: 'DELETE' })
    if (res.ok) setForms(prev => prev.filter(f => f.id !== id))
  }

  async function openFormSubmissions(form: SubmissionFormData) {
    setSelectedForm(form)
    setSelectedSub(null)
    setLoadingSubs(true)
    try {
      const res = await fetch(`/api/submissions/${form.id}`)
      if (res.ok) {
        const data = await res.json()
        setSubmissions(data.submissions ?? [])
      }
    } finally {
      setLoadingSubs(false)
    }
  }

  async function updateSubStatus(subId: string, status: string) {
    setUpdatingStatus(subId)
    try {
      await fetch(`/api/submissions/${selectedForm!.id}/submissions/${subId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, status } : s))
      if (selectedSub?.id === subId) setSelectedSub(s => s ? { ...s, status } : s)
    } finally {
      setUpdatingStatus(null)
    }
  }

  const stats = [
    { label: 'Total Forms',       value: forms.length,                                       color: 'text-brand-600',   bg: 'bg-brand-50',       icon: DOC_ICON },
    { label: 'Open',              value: forms.filter(f => f.isOpen).length,                 color: 'text-success-ink', bg: 'bg-success-soft',   icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Total Submissions', value: forms.reduce((a, f) => a + f.submissionCount, 0),    color: 'text-brand-600',   bg: 'bg-brand-50',       icon: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4' },
    { label: 'Closed',            value: forms.filter(f => !f.isOpen).length,                color: 'text-ink-3',       bg: 'bg-fill',           icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  ]

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Submission Forms</h1>
          <p className="text-sm text-ink-2 mt-0.5">Collect abstracts, papers, speaker proposals, panels, and symposia via structured forms</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Form
        </button>
      </div>

      {/* Stats — shared tile recipe (matches Dashboard) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="card p-5">
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
              <svg className={`w-5 h-5 ${s.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} />
              </svg>
            </div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-ink-2 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Form list */}
      {forms.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-dashed border-hairline shadow-card py-20 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-brand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={DOC_ICON} />
            </svg>
          </div>
          <p className="text-sm font-semibold text-ink-2">No forms yet</p>
          <p className="text-xs text-ink-3 mt-1 mb-4">Create your first submission form to start collecting proposals</p>
          <button onClick={openCreate} className="btn-primary btn-sm">
            Create a form
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-hairline flex items-center gap-2">
            <p className="text-sm font-semibold text-ink">Your Forms</p>
            <span className="text-xs text-ink-3">{forms.length} total</span>
          </div>
          <div className="divide-y divide-hairline">
            {forms.map(form => {
              const info = typeInfo(form.type)
              const fields = getFields(form)
              return (
                <div key={form.id} className="flex items-center gap-4 px-5 py-4 hover:bg-fill/50 transition-colors group">
                  {/* Type icon */}
                  <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={DOC_ICON} />
                    </svg>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-ink">{form.title}</p>
                      <span className="badge badge-brand uppercase tracking-wider text-[10px]">{info.label}</span>
                      <span className={`badge text-[10px] ${form.isOpen ? 'badge-success' : 'badge-neutral'}`}>
                        {form.isOpen ? 'Open' : 'Closed'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-ink-3">{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
                      {form.deadline && (
                        <span className="text-xs text-ink-3">
                          Deadline: {format(new Date(form.deadline), 'MMM d, yyyy')}
                        </span>
                      )}
                      <span className="text-xs text-ink-3">
                        Created {format(new Date(form.createdAt), 'MMM d')}
                      </span>
                    </div>
                  </div>

                  {/* Submissions count */}
                  <button
                    onClick={() => openFormSubmissions(form)}
                    className={`badge px-3 py-1.5 text-xs transition-opacity hover:opacity-80 ${form.submissionCount > 0 ? 'badge-brand' : 'badge-neutral'}`}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    {form.submissionCount} submission{form.submissionCount !== 1 ? 's' : ''}
                  </button>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => toggleOpen(form)}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors hover:bg-fill text-ink-2"
                      title={form.isOpen ? 'Close form' : 'Reopen form'}>
                      {form.isOpen ? 'Close' : 'Reopen'}
                    </button>
                    <button onClick={() => deleteForm(form.id)}
                      aria-label="Delete form"
                      className="icon-btn icon-btn-sm text-ink-3 hover:text-danger">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── CREATE FORM MODAL ─────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fade-in"
          onClick={() => setShowCreate(false)}>
          <div role="dialog" aria-modal="true"
            aria-label={step === 'type' ? 'Choose form type' : 'Build your form'}
            className="bg-surface rounded-2xl shadow-pop overflow-hidden flex flex-col w-full max-w-2xl max-h-[90vh] animate-slide-up"
            onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-ink">
                  {step === 'type' ? 'Choose Form Type' : 'Build Your Form'}
                </h2>
                <p className="text-xs text-ink-2 mt-0.5">
                  {step === 'type' ? 'Select what kind of submissions you want to collect' : 'Customize fields and settings'}
                </p>
              </div>
              <button onClick={() => setShowCreate(false)} aria-label="Close" className="icon-btn icon-btn-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {step === 'type' ? (
                // Step 1: Type picker
                <div className="p-6 grid grid-cols-2 gap-3">
                  {FORM_TYPES.map(t => (
                    <button key={t.value} onClick={() => selectType(t.value)}
                      className="text-left p-4 rounded-2xl border border-hairline bg-surface hover:border-brand-300 hover:bg-brand-50 transition-colors active:scale-[0.99]">
                      <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mb-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={DOC_ICON} />
                        </svg>
                      </div>
                      <p className="text-sm font-semibold text-ink">{t.label}</p>
                      <p className="text-[11px] text-ink-2 mt-0.5 leading-snug">{t.desc}</p>
                    </button>
                  ))}
                </div>
              ) : (
                // Step 2: Form builder
                <div className="p-6 space-y-5">
                  {/* Back */}
                  <button onClick={() => setStep('type')} className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to type selection
                  </button>

                  {/* Title + description */}
                  <div className="space-y-3">
                    <div>
                      <label className="label">Form Title</label>
                      <input className="input" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Description <span className="font-normal text-ink-3">(optional)</span></label>
                      <textarea className="textarea" value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2}
                        placeholder="Briefly explain the purpose or guidelines for submitters…" />
                    </div>
                    <div>
                      <label className="label">Submission Deadline <span className="font-normal text-ink-3">(optional)</span></label>
                      <input className="input" type="date" value={newDeadline} onChange={e => setNewDeadline(e.target.value)} />
                    </div>
                  </div>

                  {/* Fields */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="label mb-0">Form Fields</label>
                      <button onClick={addField}
                        className="flex items-center gap-1 text-xs text-brand-600 font-semibold hover:text-brand-800 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add field
                      </button>
                    </div>
                    <div className="space-y-2">
                      {newFields.map((field, idx) => (
                        <div key={field.id} className="flex items-start gap-2 p-3 rounded-xl bg-fill border border-hairline">
                          {/* Reorder */}
                          <div className="flex flex-col gap-0.5 pt-1.5">
                            <button onClick={() => moveField(field.id, -1)} disabled={idx === 0}
                              aria-label="Move field up"
                              className="text-ink-3 hover:text-ink-2 disabled:opacity-20 transition-colors">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            </button>
                            <button onClick={() => moveField(field.id, 1)} disabled={idx === newFields.length - 1}
                              aria-label="Move field down"
                              className="text-ink-3 hover:text-ink-2 disabled:opacity-20 transition-colors">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>

                          <div className="flex-1 grid grid-cols-3 gap-2">
                            <input value={field.label} onChange={e => updateField(field.id, { label: e.target.value })}
                              placeholder="Field label"
                              className="input col-span-2" />
                            <select value={field.type} onChange={e => updateField(field.id, { type: e.target.value })}
                              className="select">
                              {FIELD_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                            {field.type === 'select' && (
                              <input
                                value={field.options?.join(', ') ?? ''}
                                onChange={e => updateField(field.id, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                placeholder="Option 1, Option 2, …"
                                className="input col-span-3" />
                            )}
                          </div>

                          <div className="flex items-center gap-2 pt-3">
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input type="checkbox" checked={field.required}
                                onChange={e => updateField(field.id, { required: e.target.checked })}
                                className="rounded text-primary focus:ring-primary/40" />
                              <span className="text-[10px] text-ink-2">Req</span>
                            </label>
                            <button onClick={() => removeField(field.id)}
                              aria-label="Remove field"
                              className="text-ink-3 hover:text-danger transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                      {newFields.length === 0 && (
                        <button onClick={addField}
                          className="w-full py-4 rounded-xl border-2 border-dashed border-hairline text-xs text-ink-3 hover:border-brand-300 hover:text-brand-400 transition-colors">
                          + Add your first field
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            {step === 'build' && (
              <div className="px-6 py-4 border-t border-hairline flex items-center justify-between bg-surface-2">
                <span className="text-xs text-ink-3">{newFields.length} field{newFields.length !== 1 ? 's' : ''} · Form will be open for submissions immediately</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowCreate(false)} className="btn-secondary btn-sm">Cancel</button>
                  <button onClick={createForm} disabled={!newTitle.trim() || saving} className="btn-primary btn-sm">
                    {saving ? 'Creating…' : 'Create Form'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SUBMISSIONS PANEL ─────────────────────────────────────── */}
      {selectedForm && (
        <div className="fixed inset-0 z-50 flex bg-black/35 animate-fade-in"
          onClick={() => { setSelectedForm(null); setSelectedSub(null) }}>
          <div role="dialog" aria-modal="true" aria-label={`Submissions for ${selectedForm.title}`}
            className="ml-auto h-full flex bg-surface shadow-elevated overflow-hidden"
            style={{ width: selectedSub ? 900 : 620 }}
            onClick={e => e.stopPropagation()}>

            {/* Submissions list */}
            <div className="flex flex-col border-r border-hairline" style={{ width: 620 }}>
              {/* Panel header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-hairline">
                <button onClick={() => { setSelectedForm(null); setSelectedSub(null) }}
                  aria-label="Close submissions"
                  className="icon-btn icon-btn-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-ink truncate">{selectedForm.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {(() => { const info = typeInfo(selectedForm.type); return (
                      <span className="badge badge-brand uppercase tracking-wider text-[10px]">{info.label}</span>
                    )})()}
                    <span className={`badge text-[10px] ${selectedForm.isOpen ? 'badge-success' : 'badge-neutral'}`}>
                      {selectedForm.isOpen ? 'Open' : 'Closed'}
                    </span>
                    <span className="text-xs text-ink-3">{submissions.length} submission{submissions.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>

              {/* Submission list body */}
              <div className="flex-1 overflow-y-auto">
                {loadingSubs ? (
                  <div className="p-5 space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="skeleton w-2 h-2 rounded-full mt-2 flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="skeleton h-4 w-40" />
                          <div className="skeleton h-3 w-24" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : submissions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                    <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-brand-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={DOC_ICON} />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-ink-2">No submissions yet</p>
                    <p className="text-xs text-ink-3 mt-1">{selectedForm.isOpen ? 'Share the form link to start collecting responses' : 'This form is currently closed'}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-hairline">
                    {submissions.map(sub => {
                      const sc = statusMeta(sub.status)
                      const isSelected = selectedSub?.id === sub.id
                      const data = JSON.parse(sub.data) as Record<string, string>
                      const fields = getFields(selectedForm)
                      const firstField = fields[0]
                      const preview = firstField ? (data[firstField.id] ?? data[firstField.label] ?? '') : ''
                      return (
                        <button key={sub.id}
                          onClick={() => setSelectedSub(isSelected ? null : sub)}
                          className={`w-full text-left flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-fill/60 ${isSelected ? 'bg-brand-50' : ''}`}>
                          {/* Status dot */}
                          <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${sc.dot}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-ink truncate">
                                {sub.name ?? (preview.slice(0, 40) || 'Unnamed submission')}
                              </p>
                              <span className={`badge text-[10px] flex-shrink-0 ${sc.badge}`}>{sc.label}</span>
                            </div>
                            {sub.email && <p className="text-xs text-ink-3 truncate">{sub.email}</p>}
                            {preview && <p className="text-xs text-ink-2 truncate mt-0.5">{preview.slice(0, 80)}</p>}
                            <p className="text-[10px] text-ink-3 mt-0.5">{format(new Date(sub.createdAt), 'MMM d, yyyy · h:mm a')}</p>
                          </div>
                          <svg className={`w-4 h-4 text-ink-3 flex-shrink-0 mt-1 transition-transform ${isSelected ? 'rotate-90' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Submission detail */}
            {selectedSub && (() => {
              const sc = statusMeta(selectedSub.status)
              const fields = getFields(selectedForm)
              const data = JSON.parse(selectedSub.data) as Record<string, string>
              return (
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="px-5 py-4 border-b border-hairline flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-ink">{selectedSub.name ?? 'Submission'}</p>
                      {selectedSub.email && <p className="text-xs text-ink-3 mt-0.5">{selectedSub.email}</p>}
                      <p className="text-[10px] text-ink-3 mt-0.5">{format(new Date(selectedSub.createdAt), 'MMM d, yyyy · h:mm a')}</p>
                    </div>
                    <span className={`badge flex-shrink-0 ${sc.badge}`}>{sc.label}</span>
                  </div>

                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {fields.map(field => {
                      const val = data[field.id] ?? data[field.label] ?? ''
                      return (
                        <div key={field.id}>
                          <p className="section-title mb-1">{field.label}</p>
                          {val ? (
                            <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{val}</p>
                          ) : (
                            <p className="text-sm text-ink-3 italic">—</p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Status actions */}
                  <div className="px-5 py-4 border-t border-hairline bg-surface-2">
                    <p className="section-title mb-2">Update Status</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {Object.entries(STATUS_META).map(([status, meta]) => {
                        const isActive = selectedSub.status === status
                        const isUpdating = updatingStatus === selectedSub.id
                        return (
                          <button key={status}
                            onClick={() => updateSubStatus(selectedSub.id, status)}
                            disabled={isActive || isUpdating}
                            aria-pressed={isActive}
                            className={`badge px-3 py-1.5 transition-all disabled:cursor-default ${isActive ? `${meta.badge} ring-2 ring-primary/30` : 'badge-neutral hover:bg-fill-2'} ${isUpdating ? 'opacity-50' : ''}`}>
                            {meta.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
