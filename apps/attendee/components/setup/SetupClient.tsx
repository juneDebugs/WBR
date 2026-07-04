'use client'

import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { signOut } from 'next-auth/react'
import Image from 'next/image'
import { SOLUTIONS, COMPANY_SIZES, REVENUE_RANGES, COMPANY_SIZE_LABELS, REVENUE_LABELS } from '@/lib/solutions'

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
}

interface BlackoutTime {
  id: string
  startsAt: string
  endsAt: string
  reason: string | null
}

interface Props {
  userId: string
  userName: string | null
  userImage: string | null
  userBio: string | null
  userJobTitle: string | null
  userCompany: string | null
  userWebsite: string | null
  userCompanySize: string | null
  userAnnualRevenue: string | null
  userSolutionsOffering: string | null
  userSolutionsSeeking: string | null
  blackouts: BlackoutTime[]
}

export function SetupClient({ userId, userName, userImage, userBio, userJobTitle, userCompany, userWebsite, userCompanySize, userAnnualRevenue, userSolutionsOffering, userSolutionsSeeking, blackouts: initialBlackouts }: Props) {
  // Photo state
  const [photoUrl, setPhotoUrl] = useState(userImage ?? '')
  const [photoSaving, setPhotoSaving] = useState(false)
  const [photoSaved, setPhotoSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Profile form state
  const [profile, setProfile] = useState({
    name: userName ?? '',
    bio: userBio ?? '',
    jobTitle: userJobTitle ?? '',
    company: userCompany ?? '',
    website: userWebsite ?? '',
    companySize: userCompanySize ?? '',
    annualRevenue: userAnnualRevenue ?? '',
    solutionsOffering: userSolutionsOffering ? JSON.parse(userSolutionsOffering) as string[] : [],
    solutionsSeeking: userSolutionsSeeking ? JSON.parse(userSolutionsSeeking) as string[] : [],
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  // Blackout state
  const [blackouts, setBlackouts] = useState(initialBlackouts)
  const [blackoutStartsAt, setBlackoutStartsAt] = useState('')
  const [blackoutEndsAt, setBlackoutEndsAt] = useState('')
  const [blackoutReason, setBlackoutReason] = useState('')
  const [blackoutError, setBlackoutError] = useState('')
  const [blackoutLoading, setBlackoutLoading] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setPhotoUrl((ev.target?.result as string) ?? '')
    reader.readAsDataURL(file)
  }

  async function savePhoto() {
    setPhotoSaving(true)
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: photoUrl || null }),
      })
      setPhotoSaved(true)
      setTimeout(() => setPhotoSaved(false), 2500)
    } finally {
      setPhotoSaving(false)
    }
  }

  async function saveProfile() {
    setProfileSaving(true)
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          solutionsOffering: JSON.stringify(profile.solutionsOffering),
          solutionsSeeking: JSON.stringify(profile.solutionsSeeking),
        }),
      })
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2500)
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleAddBlackout(e: React.FormEvent) {
    e.preventDefault()
    setBlackoutError('')
    setBlackoutLoading(true)
    try {
      const res = await fetch('/api/setup/blackout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startsAt: blackoutStartsAt, endsAt: blackoutEndsAt, reason: blackoutReason || null }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to add blackout')
      }
      const created = await res.json()
      setBlackouts(prev => [...prev, created].sort((a, b) => a.startsAt.localeCompare(b.startsAt)))
      setBlackoutStartsAt('')
      setBlackoutEndsAt('')
      setBlackoutReason('')
    } catch (err: unknown) {
      setBlackoutError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBlackoutLoading(false)
    }
  }

  async function handleDeleteBlackout(id: string) {
    try {
      await fetch(`/api/setup/blackout?id=${id}`, { method: 'DELETE' })
      setBlackouts(prev => prev.filter(b => b.id !== id))
    } catch {
      // silently ignore
    }
  }

  const inputCls = 'input'
  const chipCls = (active: boolean) => `chip ${active ? 'chip-active' : 'chip-inactive'}`

  return (
    <div className="page-container space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Settings</h1>
          <p className="text-sm text-ink-2 mt-1">Manage your profile and availability.</p>
        </div>
        <button onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-sm text-ink-2 hover:text-ink px-3 py-1.5 rounded-lg hover:bg-fill transition-colors">
          Sign out
        </button>
      </div>

      {/* Profile Photo */}
      <section>
        <h2 className="text-base font-semibold text-ink mb-3">Profile Photo</h2>
        <div className="card flex items-start gap-4">
          <div className="flex-shrink-0">
            {photoUrl ? (
              <img src={photoUrl} alt="Profile" loading="lazy" className="w-20 h-20 rounded-full object-cover ring-2 ring-brand-200 shadow-card" onError={() => setPhotoUrl('')} />
            ) : (
              <div className="w-20 h-20 rounded-full bg-brand-100 flex items-center justify-center ring-2 ring-brand-200">
                <span className="text-brand font-bold text-2xl">{(userName ?? '?')[0].toUpperCase()}</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-2.5">
            <div>
              <label className="label">Photo URL</label>
              <input type="url" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg" className={inputCls} />
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="btn-secondary btn-sm">
                Upload from device
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <button type="button" onClick={savePhoto} disabled={photoSaving}
                className="btn-primary btn-sm">
                {photoSaving ? 'Saving…' : photoSaved ? '✓ Saved' : 'Save Photo'}
              </button>
            </div>
            <p className="text-[10px] text-ink-3">This photo appears in the People section, meeting cards, and all WBR 2027 apps.</p>
          </div>
        </div>
      </section>

      {/* Profile Info */}
      <section>
        <h2 className="text-base font-semibold text-ink mb-3">Profile Info</h2>

        <div className="card space-y-4 mb-4">
          {([
            ['name', 'Name', 'Your name', 'text'],
            ['jobTitle', 'Job Title', 'e.g. Head of eCommerce', 'text'],
            ['company', 'Company', 'Your company', 'text'],
            ['website', 'Website', 'https://yourcompany.com', 'url'],
          ] as const).map(([key, label, placeholder, type]) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-ink-2 uppercase mb-1">{label}</label>
              <input type={type} value={profile[key]} onChange={e => setProfile(p => ({ ...p, [key]: e.target.value }))}
                placeholder={placeholder} className={inputCls} />
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold text-ink-2 uppercase mb-1">Bio</label>
            <textarea value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
              placeholder="A brief intro…" rows={3} className="textarea" />
          </div>
        </div>

        <div className="card space-y-5 mb-4">
          <div>
            <label className="block text-xs font-semibold text-ink-2 uppercase mb-2">Company Size</label>
            <div className="flex flex-wrap gap-2">
              {COMPANY_SIZES.map(s => (
                <button key={s} type="button" onClick={() => setProfile(p => ({ ...p, companySize: p.companySize === s ? '' : s }))}
                  className={chipCls(profile.companySize === s)}>
                  {COMPANY_SIZE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-2 uppercase mb-2">Annual Revenue</label>
            <div className="flex flex-wrap gap-2">
              {REVENUE_RANGES.map(r => (
                <button key={r} type="button" onClick={() => setProfile(p => ({ ...p, annualRevenue: p.annualRevenue === r ? '' : r }))}
                  className={chipCls(profile.annualRevenue === r)}>
                  {REVENUE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card space-y-5 mb-4">
          <div>
            <label className="block text-xs font-semibold text-ink-2 uppercase mb-2">Solutions I Offer</label>
            <div className="flex flex-wrap gap-2">
              {SOLUTIONS.map(s => (
                <button key={s} type="button" onClick={() => setProfile(p => ({ ...p, solutionsOffering: toggle(p.solutionsOffering, s) }))}
                  className={chipCls(profile.solutionsOffering.includes(s))}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-2 uppercase mb-2">Solutions I&apos;m Seeking</label>
            <div className="flex flex-wrap gap-2">
              {SOLUTIONS.map(s => (
                <button key={s} type="button" onClick={() => setProfile(p => ({ ...p, solutionsSeeking: toggle(p.solutionsSeeking, s) }))}
                  className={chipCls(profile.solutionsSeeking.includes(s))}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={saveProfile} disabled={profileSaving}
          className={`btn-primary w-full ${profileSaved ? 'bg-success' : ''}`}>
          {profileSaved ? '✓ Saved!' : profileSaving ? 'Saving…' : 'Save Profile'}
        </button>
      </section>

      {/* Availability */}
      <section>
        <h2 className="text-base font-semibold text-ink mb-3">My Availability</h2>

        {blackouts.length > 0 ? (
          <div className="space-y-2 mb-4">
            {blackouts.map(b => (
              <div key={b.id} className="card flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {format(new Date(b.startsAt), 'MMM d, h:mm a')} – {format(new Date(b.endsAt), 'h:mm a')}
                  </p>
                  {b.reason && <p className="text-xs text-ink-2 mt-0.5">{b.reason}</p>}
                </div>
                <button onClick={() => handleDeleteBlackout(b.id)}
                  className="text-xs text-danger hover:text-danger-ink font-medium whitespace-nowrap flex-shrink-0 mt-0.5">
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="card text-center py-6 mb-4">
            <p className="text-sm text-ink-3">No blackout times set. Add times when you are unavailable.</p>
          </div>
        )}

        <div className="card">
          <p className="text-sm font-semibold text-ink mb-3">Add Unavailable Time</p>
          <form onSubmit={handleAddBlackout} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-2 block mb-1">From *</label>
                <input type="datetime-local" required value={blackoutStartsAt}
                  onChange={e => setBlackoutStartsAt(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-ink-2 block mb-1">To *</label>
                <input type="datetime-local" required value={blackoutEndsAt}
                  onChange={e => setBlackoutEndsAt(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="text-xs text-ink-2 block mb-1">Reason (optional)</label>
              <input type="text" value={blackoutReason} onChange={e => setBlackoutReason(e.target.value)}
                placeholder="e.g. Lunch, Travel, Prior commitment" className={inputCls} />
            </div>
            {blackoutError && <p className="text-xs text-danger-ink">{blackoutError}</p>}
            <button type="submit" disabled={blackoutLoading}
              className="btn-primary w-full">
              {blackoutLoading ? 'Saving…' : 'Mark as Unavailable'}
            </button>
          </form>
        </div>
      </section>

    </div>
  )
}
