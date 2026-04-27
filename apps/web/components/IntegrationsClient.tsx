'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { useRouter, useSearchParams } from 'next/navigation'

interface SavedIntegration {
  provider: string
  status: string
  accountLabel: string | null
  connectedAt: string | null
}

interface Props {
  saved: SavedIntegration[]
}

type Field = { key: string; label: string; type: 'text' | 'password' | 'url'; placeholder: string; help?: string }

interface Integration {
  provider: string
  name: string
  description: string
  category: string
  logo: React.ReactNode
  accentFrom: string
  accentTo: string
  connectType: 'form' | 'coming_soon'
  formTitle?: string
  formSubtitle?: string
  formFields?: Field[]
  formGuide?: { step: string; text: string }[]
}

const INTEGRATIONS: Integration[] = [
  {
    provider: 'GMAIL',
    name: 'Gmail',
    description: 'Send meeting confirmations, reminders, and notifications directly from your Gmail account.',
    category: 'Email',
    accentFrom: '#EA4335',
    accentTo: '#FBBC05',
    connectType: 'form',
    formTitle: 'Connect Gmail',
    formSubtitle: 'Use a Google App Password — no OAuth setup required.',
    formFields: [
      { key: 'email', label: 'Gmail address', type: 'text', placeholder: 'you@gmail.com' },
      { key: 'appPassword', label: 'App Password', type: 'password', placeholder: 'xxxx xxxx xxxx xxxx', help: 'Not your regular Gmail password.' },
    ],
    formGuide: [
      { step: '1', text: 'Go to your Google Account → Security' },
      { step: '2', text: 'Under "How you sign in to Google", click 2-Step Verification' },
      { step: '3', text: 'Scroll to the bottom → App passwords' },
      { step: '4', text: 'Create a new app password, copy it, and paste it above' },
    ],
    logo: (
      <svg viewBox="0 0 24 24" className="w-7 h-7">
        <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/>
      </svg>
    ),
  },
  {
    provider: 'OUTLOOK',
    name: 'Outlook Mail',
    description: 'Send meeting emails through your Microsoft Outlook or Office 365 account.',
    category: 'Email',
    accentFrom: '#0072C6',
    accentTo: '#00B4F0',
    connectType: 'form',
    formTitle: 'Connect Outlook Mail',
    formSubtitle: 'Use a Microsoft App Password for secure SMTP access.',
    formFields: [
      { key: 'email', label: 'Outlook / Microsoft email', type: 'text', placeholder: 'you@outlook.com' },
      { key: 'appPassword', label: 'App Password', type: 'password', placeholder: 'Enter app password', help: 'Not your regular account password.' },
    ],
    formGuide: [
      { step: '1', text: 'Go to account.microsoft.com → Security' },
      { step: '2', text: 'Under "Advanced security options", find App passwords' },
      { step: '3', text: 'Create a new app password for "Mail"' },
      { step: '4', text: 'Copy the generated password and paste it above' },
    ],
    logo: (
      <svg viewBox="0 0 24 24" className="w-7 h-7">
        <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.32-.32-.34-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V10.85l1.24.72h.01q.26.15.41.43.14.28.14.59zm-7.64-3.93q0-.44-.3-.75-.29-.3-.73-.3t-.73.3q-.3.3-.3.75v4.35l-2.49-2.35q-.31-.3-.73-.3-.41 0-.7.29-.29.3-.29.72 0 .42.3.72l3.6 3.4q.3.29.71.29.41 0 .7-.29l3.61-3.4q.29-.3.29-.72 0-.41-.29-.71-.28-.3-.7-.3-.4 0-.7.3L16.37 13V8.07z" fill="#0072C6"/>
      </svg>
    ),
  },
]

const CATEGORIES = ['All', 'Email']

export function IntegrationsClient({ saved }: Props) {
  const [activeCategory, setActiveCategory] = useState('All')
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [modal, setModal] = useState<Integration | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  const [statuses, setStatuses] = useState<Record<string, { status: string; accountLabel: string | null; connectedAt: string | null }>>(
    Object.fromEntries(saved.map(s => [s.provider, { status: s.status, accountLabel: s.accountLabel, connectedAt: s.connectedAt }]))
  )

  // Handle OAuth callback
  useEffect(() => {
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')
    if (connected) {
      showToast(`${connected.replace(/_/g, ' ')} connected`, 'success')
      router.replace('/dashboard/integrations')
      router.refresh()
    } else if (error) {
      showToast(`Connection failed: ${error.replace(/_/g, ' ')}`, 'error')
      router.replace('/dashboard/integrations')
    }
  }, [searchParams, router])

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  function openModal(integration: Integration) {
    setFormValues({})
    setTestResult(null)
    setModal(integration)
  }

  function closeModal() {
    setModal(null)
    setFormValues({})
    setTestResult(null)
  }

  async function saveCredentials() {
    if (!modal) return
    setSaving(true)
    setTestResult(null)
    try {
      const email = formValues.email ?? formValues.webhookUrl ?? null
      const accountLabel = email ?? modal.name
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: modal.provider,
          status: 'CONNECTED',
          accountLabel,
          metadata: JSON.stringify(formValues),
        }),
      })
      if (res.ok) {
        setStatuses(prev => ({
          ...prev,
          [modal.provider]: { status: 'CONNECTED', accountLabel, connectedAt: new Date().toISOString() },
        }))
        showToast(`${modal.name} connected`, 'success')
        closeModal()
      } else {
        showToast('Failed to save. Try again.', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  async function disconnect(provider: string) {
    setDisconnecting(provider)
    try {
      const res = await fetch('/api/integrations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      if (res.ok) {
        setStatuses(prev => { const n = { ...prev }; delete n[provider]; return n })
        showToast('Disconnected', 'success')
      }
    } finally {
      setDisconnecting(null)
    }
  }

  const filtered = activeCategory === 'All'
    ? INTEGRATIONS
    : INTEGRATIONS.filter(i => i.category === activeCategory)

  const connectedCount = Object.values(statuses).filter(s => s.status === 'CONNECTED').length

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.type === 'success'
            ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          }
          {toast.msg}
        </div>
      )}

      {/* Credential modal */}
      {modal && modal.connectType === 'form' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
                    {modal.logo}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{modal.formTitle}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{modal.formSubtitle}</p>
                  </div>
                </div>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Form fields */}
              {modal.formFields?.map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">{field.label}</label>
                  <input
                    type={field.type}
                    value={formValues[field.key] ?? ''}
                    onChange={e => setFormValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                  />
                  {field.help && <p className="text-[11px] text-gray-400 mt-1">{field.help}</p>}
                </div>
              ))}

              {/* Step-by-step guide */}
              {modal.formGuide && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">How to get your credentials</p>
                  {modal.formGuide.map(g => (
                    <div key={g.step} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {g.step}
                      </div>
                      <p className="text-xs text-gray-600 leading-snug">{g.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {testResult && (
                <p className="text-xs text-center text-red-500 bg-red-50 rounded-lg py-2 px-3">{testResult}</p>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-2.5">
              <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={saveCredentials}
                disabled={saving || !modal.formFields?.every(f => !f.key.includes('Password') && !f.key.includes('Url') && !f.key.includes('webhook') ? true : !!formValues[f.key])}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, ${modal.accentFrom}, ${modal.accentTo})` }}
              >
                {saving ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 bg-white border border-gray-200 rounded-xl px-6 py-5 flex items-center justify-between gap-6">
        <div>
          <h2 className="font-semibold text-gray-900 text-base">Integrations</h2>
          <p className="text-sm text-gray-500 mt-0.5 max-w-xl">
            Connect the tools your team already uses. Meeting confirmations, calendar invites, and notifications sync automatically.
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-2xl font-bold text-primary">{connectedCount}</p>
          <p className="text-xs text-gray-400">of {INTEGRATIONS.filter(i => i.connectType !== 'coming_soon').length} connected</p>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-5">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={`text-xs font-semibold px-3.5 py-1.5 rounded-full transition-colors ${
              activeCategory === cat ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
            }`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(integration => {
          const savedState = statuses[integration.provider]
          const isConnected = savedState?.status === 'CONNECTED'
          const isDisconnecting = disconnecting === integration.provider
          const isComingSoon = integration.connectType === 'coming_soon'

          return (
            <div key={integration.provider}
              className={`bg-white border rounded-2xl overflow-hidden flex flex-col transition-shadow ${isComingSoon ? 'border-gray-100 opacity-60' : 'border-gray-200 hover:shadow-md'}`}>
              {/* Accent strip */}
              <div className="h-1" style={{
                background: isConnected
                  ? `linear-gradient(90deg, ${integration.accentFrom}, ${integration.accentTo})`
                  : isComingSoon ? '#f3f4f6' : '#e5e7eb',
              }} />

              <div className="p-5 flex flex-col flex-1">
                {/* Logo + status */}
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                    {integration.logo}
                  </div>
                  {isConnected ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Connected
                    </span>
                  ) : isComingSoon ? (
                    <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                      Soon
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                      {integration.category}
                    </span>
                  )}
                </div>

                <p className="font-semibold text-gray-900 text-sm">{integration.name}</p>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed flex-1">{integration.description}</p>

                {isConnected && savedState?.accountLabel && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <p className="text-xs text-gray-500 truncate">{savedState.accountLabel}</p>
                  </div>
                )}
                {isConnected && savedState?.connectedAt && (
                  <p className="text-[10px] text-gray-400 mt-0.5 ml-3">
                    Since {format(new Date(savedState.connectedAt), 'MMM d, yyyy')}
                  </p>
                )}

                {/* CTA */}
                <div className="mt-4">
                  {isConnected ? (
                    <button onClick={() => disconnect(integration.provider)} disabled={isDisconnecting}
                      className="w-full py-2 rounded-xl text-xs font-semibold border border-gray-200 text-gray-500 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50">
                      {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  ) : isComingSoon ? (
                    <div className="w-full py-2 rounded-xl text-xs font-semibold text-center text-gray-400 bg-gray-50 border border-dashed border-gray-200">
                      Coming soon
                    </div>
                  ) : (
                    <button onClick={() => openModal(integration)}
                      className="w-full py-2 rounded-xl text-xs font-semibold text-white transition-all active:scale-95"
                      style={{ background: `linear-gradient(135deg, ${integration.accentFrom}, ${integration.accentTo})` }}>
                      Connect
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-8 bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-6 text-center">
        <p className="text-sm font-semibold text-gray-500">More integrations coming soon</p>
        <p className="text-xs text-gray-400 mt-1">Google Calendar, Outlook Calendar, Slack, and more</p>
      </div>
    </div>
  )
}
