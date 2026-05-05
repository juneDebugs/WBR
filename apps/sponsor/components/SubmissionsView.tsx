'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'

const FORM_TYPES = [
  { value: 'ABSTRACT',         label: 'Abstract',           color: '#6366f1', bg: '#eef2ff', desc: 'Short summaries of proposed presentations or research' },
  { value: 'FULL_PAPER',       label: 'Full Paper',         color: '#2563eb', bg: '#dbeafe', desc: 'Complete academic or industry research papers' },
  { value: 'SPEAKER_PROPOSAL', label: 'Speaker Proposal',   color: '#7c3aed', bg: '#ede9fe', desc: 'Individual speaker session pitches and bios' },
  { value: 'PANEL',            label: 'Panel / Discussion',  color: '#db2777', bg: '#fce7f3', desc: 'Multi-speaker panel topic and participant proposals' },
  { value: 'SYMPOSIUM',        label: 'Symposium',          color: '#0891b2', bg: '#cffafe', desc: 'Full-day or half-day symposia with multiple sessions' },
  { value: 'CUSTOM',           label: 'Custom Form',        color: '#64748b', bg: '#f1f5f9', desc: 'Freeform structured data collection' },
]

const FIELD_TYPES = [
  { value: 'text',     label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'email',    label: 'Email' },
  { value: 'url',      label: 'URL / Link' },
  { value: 'select',   label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
]

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  PENDING:  { bg: '#fef9c3', text: '#92400e', label: 'Pending' },
  REVIEWED: { bg: '#dbeafe', text: '#1d4ed8', label: 'Reviewed' },
  ACCEPTED: { bg: '#dcfce7', text: '#166534', label: 'Accepted' },
  REJECTED: { bg: '#fee2e2', text: '#991b1b', label: 'Rejected' },
}

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

interface Props {
  initialForms: SubmissionFormData[]
}

function typeInfo(type: string) {
  return FORM_TYPES.find(t => t.value === type) ?? FORM_TYPES[FORM_TYPES.length - 1]
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

export function SubmissionsView({ initialForms }: Props) {
  const [forms, setForms] = useState<SubmissionFormData[]>(initialForms)

  // Pre-parse JSON fields once instead of on every render
  const parsedFieldsMap = useMemo(() => {
    const map = new Map<string, FormField[]>()
    for (const f of initialForms) {
      try { map.set(f.id, JSON.parse(f.fields)) } catch { map.set(f.id, []) }
    }
    return map
  }, [initialForms])

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
    { label: 'Total Forms',      value: forms.length,                                          color: '#6366f1', bg: '#eef2ff' },
    { label: 'Open',             value: forms.filter(f => f.isOpen).length,                   color: '#16a34a', bg: '#dcfce7' },
    { label: 'Total Submissions', value: forms.reduce((a, f) => a + f.submissionCount, 0),    color: '#2563eb', bg: '#dbeafe' },
    { label: 'Closed',           value: forms.filter(f => !f.isOpen).length,                  color: '#9ca3af', bg: '#f3f4f6' },
  ]

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Submission Forms</h1>
          <p className="text-sm text-gray-500 mt-0.5">Collect abstracts, papers, speaker proposals, panels, and symposia via structured forms</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-all active:scale-95"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Form
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-2xl px-5 py-4 border border-gray-100 flex items-center gap-4"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: s.bg }}>
              <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
            <p className="text-xs text-gray-500 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Form list */}
      {forms.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-20 flex flex-col items-center justify-center text-center"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'linear-gradient(135deg, #eef2ff, #ede9fe)' }}>
            <svg className="w-7 h-7 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-600">No forms yet</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">Create your first submission form to start collecting proposals</p>
          <button onClick={openCreate}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            Create a form
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)' }}>
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">Your Forms</p>
            <span className="text-xs text-gray-400">{forms.length} total</span>
          </div>
          <div className="divide-y divide-gray-50">
            {forms.map(form => {
              const info = typeInfo(form.type)
              const fields = getFields(form)
              return (
                <div key={form.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors group">
                  {/* Type icon */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: info.bg }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: info.color }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900">{form.title}</p>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{ background: info.bg, color: info.color }}>{info.label}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${form.isOpen ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {form.isOpen ? 'Open' : 'Closed'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-400">{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
                      {form.deadline && (
                        <span className="text-xs text-gray-400">
                          Deadline: {format(new Date(form.deadline), 'MMM d, yyyy')}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        Created {format(new Date(form.createdAt), 'MMM d')}
                      </span>
                    </div>
                  </div>

                  {/* Submissions count */}
                  <button
                    onClick={() => openFormSubmissions(form)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors hover:opacity-80"
                    style={{ background: form.submissionCount > 0 ? '#eef2ff' : '#f8fafc', color: form.submissionCount > 0 ? '#6366f1' : '#9ca3af' }}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    {form.submissionCount} submission{form.submissionCount !== 1 ? 's' : ''}
                  </button>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => toggleOpen(form)}
                      className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors hover:bg-gray-100 text-gray-500"
                      title={form.isOpen ? 'Close form' : 'Reopen form'}>
                      {form.isOpen ? 'Close' : 'Reopen'}
                    </button>
                    <button onClick={() => deleteForm(form.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-3xl overflow-hidden flex flex-col w-full max-w-2xl max-h-[90vh]"
            style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {step === 'type' ? 'Choose Form Type' : 'Build Your Form'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {step === 'type' ? 'Select what kind of submissions you want to collect' : 'Customize fields and settings'}
                </p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
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
                      className="text-left p-4 rounded-2xl border-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
                      style={{ borderColor: t.bg, background: t.bg }}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-2"
                        style={{ background: 'white' }}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: t.color }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold" style={{ color: t.color }}>{t.label}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{t.desc}</p>
                    </button>
                  ))}
                </div>
              ) : (
                // Step 2: Form builder
                <div className="p-6 space-y-5">
                  {/* Back */}
                  <button onClick={() => setStep('type')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to type selection
                  </button>

                  {/* Title + description */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Form Title</label>
                      <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Description <span className="font-normal text-gray-400">(optional)</span></label>
                      <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2}
                        placeholder="Briefly explain the purpose or guidelines for submitters…"
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Submission Deadline <span className="font-normal text-gray-400">(optional)</span></label>
                      <input type="date" value={newDeadline} onChange={e => setNewDeadline(e.target.value)}
                        className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                    </div>
                  </div>

                  {/* Fields */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-gray-600">Form Fields</label>
                      <button onClick={addField}
                        className="flex items-center gap-1 text-xs text-indigo-600 font-semibold hover:text-indigo-800 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add field
                      </button>
                    </div>
                    <div className="space-y-2">
                      {newFields.map((field, idx) => (
                        <div key={field.id} className="flex items-start gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
                          {/* Reorder */}
                          <div className="flex flex-col gap-0.5 pt-1.5">
                            <button onClick={() => moveField(field.id, -1)} disabled={idx === 0}
                              className="text-gray-300 hover:text-gray-500 disabled:opacity-20 transition-colors">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            </button>
                            <button onClick={() => moveField(field.id, 1)} disabled={idx === newFields.length - 1}
                              className="text-gray-300 hover:text-gray-500 disabled:opacity-20 transition-colors">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>

                          <div className="flex-1 grid grid-cols-3 gap-2">
                            <input value={field.label} onChange={e => updateField(field.id, { label: e.target.value })}
                              placeholder="Field label"
                              className="col-span-2 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                            <select value={field.type} onChange={e => updateField(field.id, { type: e.target.value })}
                              className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white">
                              {FIELD_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                            {field.type === 'select' && (
                              <input
                                value={field.options?.join(', ') ?? ''}
                                onChange={e => updateField(field.id, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                placeholder="Option 1, Option 2, …"
                                className="col-span-3 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                            )}
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <label className="flex items-center gap-1 cursor-pointer">
                              <input type="checkbox" checked={field.required}
                                onChange={e => updateField(field.id, { required: e.target.checked })}
                                className="rounded text-indigo-500 focus:ring-indigo-200" />
                              <span className="text-[10px] text-gray-500">Req</span>
                            </label>
                            <button onClick={() => removeField(field.id)}
                              className="text-gray-300 hover:text-red-400 transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                      {newFields.length === 0 && (
                        <button onClick={addField}
                          className="w-full py-4 rounded-xl border-2 border-dashed border-gray-200 text-xs text-gray-400 hover:border-indigo-200 hover:text-indigo-400 transition-colors">
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
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                <span className="text-xs text-gray-400">{newFields.length} field{newFields.length !== 1 ? 's' : ''} · Form will be open for submissions immediately</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
                  <button onClick={createForm} disabled={!newTitle.trim() || saving}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
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
        <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={() => { setSelectedForm(null); setSelectedSub(null) }}>
          <div className="ml-auto h-full flex bg-white overflow-hidden"
            style={{ width: selectedSub ? 900 : 620, boxShadow: '-8px 0 40px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}>

            {/* Submissions list */}
            <div className="flex flex-col border-r border-gray-100" style={{ width: 620 }}>
              {/* Panel header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                <button onClick={() => { setSelectedForm(null); setSelectedSub(null) }}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{selectedForm.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {(() => { const info = typeInfo(selectedForm.type); return (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{ background: info.bg, color: info.color }}>{info.label}</span>
                    )})()}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${selectedForm.isOpen ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      {selectedForm.isOpen ? 'Open' : 'Closed'}
                    </span>
                    <span className="text-xs text-gray-400">{submissions.length} submission{submissions.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>

              {/* Submission list body */}
              <div className="flex-1 overflow-y-auto">
                {loadingSubs ? (
                  <div className="flex items-center justify-center py-20">
                    <svg className="w-5 h-5 text-indigo-300 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                    </svg>
                  </div>
                ) : submissions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                      style={{ background: 'linear-gradient(135deg, #eef2ff, #ede9fe)' }}>
                      <svg className="w-6 h-6 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-gray-500">No submissions yet</p>
                    <p className="text-xs text-gray-400 mt-1">{selectedForm.isOpen ? 'Share the form link to start collecting responses' : 'This form is currently closed'}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {submissions.map(sub => {
                      const sc = STATUS_COLORS[sub.status] ?? STATUS_COLORS.PENDING
                      const isSelected = selectedSub?.id === sub.id
                      const data = JSON.parse(sub.data) as Record<string, string>
                      const fields = getFields(selectedForm)
                      const firstField = fields[0]
                      const preview = firstField ? (data[firstField.id] ?? data[firstField.label] ?? '') : ''
                      return (
                        <button key={sub.id}
                          onClick={() => setSelectedSub(isSelected ? null : sub)}
                          className="w-full text-left flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50"
                          style={{ background: isSelected ? '#eef2ff' : '' }}>
                          {/* Status dot */}
                          <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
                            style={{ background: sc.text }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-900 truncate">
                                {sub.name ?? (preview.slice(0, 40) || 'Unnamed submission')}
                              </p>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                                style={{ background: sc.bg, color: sc.text }}>{sc.label}</span>
                            </div>
                            {sub.email && <p className="text-xs text-gray-400 truncate">{sub.email}</p>}
                            {preview && <p className="text-xs text-gray-500 truncate mt-0.5">{preview.slice(0, 80)}</p>}
                            <p className="text-[10px] text-gray-400 mt-0.5">{format(new Date(sub.createdAt), 'MMM d, yyyy · h:mm a')}</p>
                          </div>
                          <svg className={`w-4 h-4 text-gray-300 flex-shrink-0 mt-1 transition-transform ${isSelected ? 'rotate-90' : ''}`}
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
              const sc = STATUS_COLORS[selectedSub.status] ?? STATUS_COLORS.PENDING
              const fields = getFields(selectedForm)
              const data = JSON.parse(selectedSub.data) as Record<string, string>
              return (
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{selectedSub.name ?? 'Submission'}</p>
                      {selectedSub.email && <p className="text-xs text-gray-400 mt-0.5">{selectedSub.email}</p>}
                      <p className="text-[10px] text-gray-400 mt-0.5">{format(new Date(selectedSub.createdAt), 'MMM d, yyyy · h:mm a')}</p>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
                      style={{ background: sc.bg, color: sc.text }}>{sc.label}</span>
                  </div>

                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {fields.map(field => {
                      const val = data[field.id] ?? data[field.label] ?? ''
                      return (
                        <div key={field.id}>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{field.label}</p>
                          {val ? (
                            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{val}</p>
                          ) : (
                            <p className="text-sm text-gray-300 italic">—</p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Status actions */}
                  <div className="px-5 py-4 border-t border-gray-100 bg-gray-50">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Update Status</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {Object.entries(STATUS_COLORS).map(([status, colors]) => (
                        <button key={status}
                          onClick={() => updateSubStatus(selectedSub.id, status)}
                          disabled={selectedSub.status === status || updatingStatus === selectedSub.id}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all disabled:opacity-50"
                          style={{
                            background: selectedSub.status === status ? colors.bg : '#f3f4f6',
                            color: selectedSub.status === status ? colors.text : '#6b7280',
                            boxShadow: selectedSub.status === status ? `0 0 0 2px ${colors.text}40` : 'none',
                          }}>
                          {colors.label}
                        </button>
                      ))}
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
