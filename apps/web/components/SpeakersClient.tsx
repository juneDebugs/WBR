'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'

type Speaker = {
  id: string
  name: string
  photoUrl: string | null
  photoPosition?: string | null
  jobTitle: string | null
  company: string | null
  bio?: string | null
  twitterHandle?: string | null
  linkedinUrl?: string | null
  _count: { confSessions: number }
}

type SpeakerForm = {
  name: string
  company: string
  jobTitle: string
  bio: string
  photoUrl: string
  photoPosition: string
  twitterHandle: string
  linkedinUrl: string
}

export default function SpeakersClient({ initialSpeakers }: { initialSpeakers: Speaker[] }) {
  const [speakers, setSpeakers] = useState(initialSpeakers)
  const [editingSpeaker, setEditingSpeaker] = useState<Speaker | null>(null)
  const [form, setForm] = useState<SpeakerForm>({
    name: '', company: '', jobTitle: '', bio: '', photoUrl: '', photoPosition: '50% 50%', twitterHandle: '', linkedinUrl: '',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [repositioning, setRepositioning] = useState(false)
  const [reposSavedPosition, setReposSavedPosition] = useState('50% 50%')
  const [visible, setVisible] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const reposContainerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  function openEdit(speaker: Speaker) {
    setEditingSpeaker(speaker)
    setForm({
      name: speaker.name,
      company: speaker.company ?? '',
      jobTitle: speaker.jobTitle ?? '',
      bio: speaker.bio ?? '',
      photoUrl: speaker.photoUrl ?? '',
      photoPosition: speaker.photoPosition ?? '50% 50%',
      twitterHandle: speaker.twitterHandle ?? '',
      linkedinUrl: speaker.linkedinUrl ?? '',
    })
    setError('')
    setRepositioning(false)
    // Trigger animation
    requestAnimationFrame(() => setVisible(true))
  }

  function closeEdit() {
    setVisible(false)
    setTimeout(() => {
      setEditingSpeaker(null)
      setError('')
      setRepositioning(false)
    }, 250)
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && editingSpeaker) closeEdit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingSpeaker])

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB')
      return
    }
    setUploading(true)
    setError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      setForm(f => ({ ...f, photoUrl: ev.target?.result as string, photoPosition: '50% 50%' }))
      setUploading(false)
    }
    reader.onerror = () => {
      setError('Failed to read file')
      setUploading(false)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleReposMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
  }, [])

  const handleReposMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !reposContainerRef.current) return
    const rect = reposContainerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    setForm(f => ({ ...f, photoPosition: `${Math.round(x)}% ${Math.round(y)}%` }))
  }, [])

  const handleReposMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  const handleReposTouchMove = useCallback((e: React.TouchEvent) => {
    if (!reposContainerRef.current) return
    const touch = e.touches[0]
    const rect = reposContainerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((touch.clientY - rect.top) / rect.height) * 100))
    setForm(f => ({ ...f, photoPosition: `${Math.round(x)}% ${Math.round(y)}%` }))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editingSpeaker) return
    setSaving(true)
    setError('')
    try {
      // Only send photoUrl if it actually changed (avoids re-sending large base64 strings)
      const photoChanged = form.photoUrl !== (editingSpeaker.photoUrl ?? '')
      const payload: Record<string, string> = {
        name: form.name,
        company: form.company,
        jobTitle: form.jobTitle,
        bio: form.bio,
        photoPosition: form.photoPosition,
        twitterHandle: form.twitterHandle,
        linkedinUrl: form.linkedinUrl,
      }
      if (photoChanged) {
        payload.photoUrl = form.photoUrl
      }

      const res = await fetch(`/api/speakers/${editingSpeaker.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      let data: any
      try {
        data = await res.json()
      } catch {
        throw new Error(res.ok ? 'Unexpected server response' : `Server error (${res.status})`)
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save')
      }

      setSpeakers(prev => prev.map(s => s.id === editingSpeaker.id ? { ...s, ...updated(data, photoChanged) } : s))
      closeEdit()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function updated(data: any, photoChanged: boolean) {
    // If photo wasn't sent, preserve the current form value in local state
    return photoChanged ? data : { ...data, photoUrl: form.photoUrl }
  }

  async function handleDelete() {
    if (!editingSpeaker) return
    if (!confirm('Delete this speaker? This cannot be undone.')) return
    setDeleting(true)
    setError('')
    try {
      const res = await fetch(`/api/speakers/${editingSpeaker.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }
      setSpeakers(prev => prev.filter(s => s.id !== editingSpeaker.id))
      closeEdit()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  // iOS-style grouped input
  const iosInput = 'w-full bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 outline-none'

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">{speakers.length} speakers total</p>
        <Link href="/dashboard/speakers/new" className="btn-primary text-sm">+ New Speaker</Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Speaker</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Company</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sessions</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {speakers.map((speaker) => (
              <tr key={speaker.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openEdit(speaker)}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {speaker.photoUrl ? (
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-gray-100">
                        <img src={speaker.photoUrl} alt={speaker.name} width={40} height={40}
                          className="w-full h-full object-cover"
                          style={{ objectPosition: speaker.photoPosition ?? '50% 50%' }} />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center flex-shrink-0">
                        <span className="text-gray-500 font-semibold text-sm">{speaker.name[0]}</span>
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{speaker.name}</p>
                      {speaker.jobTitle && <p className="text-xs text-gray-400">{speaker.jobTitle}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">{speaker.company ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{speaker._count.confSessions}</td>
                <td className="px-4 py-3 text-right">
                  <span className="text-primary text-xs font-medium">Edit</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {speakers.length === 0 && <p className="text-center text-gray-400 py-12">No speakers yet.</p>}
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

      {/* iOS-style Edit Speaker Modal */}
      {editingSpeaker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-250"
          style={{
            backgroundColor: visible ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)',
            backdropFilter: visible ? 'blur(8px)' : 'blur(0px)',
            WebkitBackdropFilter: visible ? 'blur(8px)' : 'blur(0px)',
          }}
          onClick={closeEdit}
        >
          <div
            className="w-full max-w-md max-h-[88vh] flex flex-col transition-all duration-250"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(20px)',
              borderRadius: '20px',
              background: '#f2f2f7',
              boxShadow: '0 25px 60px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(0,0,0,0.08)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* iOS-style navigation bar */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2 flex-shrink-0">
              <button onClick={closeEdit} className="text-[#007AFF] text-[15px] font-normal hover:opacity-70 transition-opacity">
                Cancel
              </button>
              <h2 className="text-[17px] font-semibold text-gray-900">Edit Speaker</h2>
              <button
                onClick={handleSave as any}
                disabled={saving || deleting || !form.name.trim()}
                className="text-[#007AFF] text-[15px] font-semibold hover:opacity-70 transition-opacity disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Done'}
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
                {error && (
                  <div className="mx-1 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                  </div>
                )}

                {/* Profile Photo Card */}
                {repositioning && form.photoUrl ? (
                  /* LinkedIn-style reposition mode */
                  <div className="bg-[#1b1f23] rounded-2xl overflow-hidden">
                    {/* Info banner */}
                    <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0a66c2]">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                      <span className="text-white text-[13px] font-medium">Drag to reposition photo</span>
                    </div>

                    {/* Reposition area with circular mask */}
                    <div className="relative flex items-center justify-center py-6 px-6">
                      <div
                        ref={reposContainerRef}
                        className="relative w-44 h-44 cursor-grab active:cursor-grabbing select-none"
                        onMouseDown={handleReposMouseDown}
                        onMouseMove={handleReposMouseMove}
                        onMouseUp={handleReposMouseUp}
                        onMouseLeave={handleReposMouseUp}
                        onTouchStart={() => { isDragging.current = true }}
                        onTouchMove={handleReposTouchMove}
                        onTouchEnd={handleReposMouseUp}
                      >
                        {/* Full image */}
                        <img
                          src={form.photoUrl}
                          alt="Reposition"
                          className="w-full h-full object-cover rounded-full pointer-events-none"
                          style={{ objectPosition: form.photoPosition }}
                          draggable={false}
                        />
                        {/* Semi-transparent ring overlay */}
                        <div className="absolute inset-0 rounded-full pointer-events-none"
                          style={{ boxShadow: '0 0 0 40px rgba(27,31,35,0.65)' }} />
                        {/* Dashed circle border */}
                        <div className="absolute inset-0 rounded-full border-2 border-dashed border-white/40 pointer-events-none" />
                      </div>
                    </div>

                    {/* Reposition actions */}
                    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          setForm(f => ({ ...f, photoPosition: reposSavedPosition }))
                          setRepositioning(false)
                        }}
                        className="px-4 py-1.5 text-[13px] font-semibold text-white rounded-full border border-white/30 hover:bg-white/10 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setRepositioning(false)}
                        className="px-4 py-1.5 text-[13px] font-semibold text-white bg-[#0a66c2] rounded-full hover:bg-[#004182] transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal photo card */
                  <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
                    <div className="flex flex-col items-center py-5 px-4">
                      {/* Avatar */}
                      {form.photoUrl ? (
                        <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 ring-1 ring-black/5">
                          <img src={form.photoUrl} alt="Preview" className="w-full h-full object-cover"
                            style={{ objectPosition: form.photoPosition }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        </div>
                      ) : (
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                          <span className="text-gray-500 font-bold text-3xl">{form.name?.[0] ?? '?'}</span>
                        </div>
                      )}

                      {/* Action buttons row */}
                      <div className="flex items-center gap-3 mt-4">
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          disabled={uploading}
                          className="text-[#007AFF] text-[13px] font-medium hover:opacity-70 transition-opacity"
                        >
                          {uploading ? 'Uploading...' : form.photoUrl ? 'Change Photo' : 'Add Photo'}
                        </button>
                        {form.photoUrl && (
                          <>
                            <span className="text-gray-300 text-xs">|</span>
                            <button
                              type="button"
                              onClick={() => {
                                setReposSavedPosition(form.photoPosition)
                                setRepositioning(true)
                              }}
                              className="text-[#007AFF] text-[13px] font-medium hover:opacity-70 transition-opacity"
                            >
                              Reposition
                            </button>
                            <span className="text-gray-300 text-xs">|</span>
                            <button
                              type="button"
                              onClick={() => { setForm(f => ({ ...f, photoUrl: '', photoPosition: '50% 50%' })); setRepositioning(false) }}
                              className="text-[#FF3B30] text-[13px] font-medium hover:opacity-70 transition-opacity"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>

                      {/* URL input for external images */}
                      {!form.photoUrl.startsWith('data:') && (
                        <div className="w-full mt-3 px-1">
                          <input
                            type="text"
                            value={form.photoUrl}
                            onChange={e => setForm(f => ({ ...f, photoUrl: e.target.value, photoPosition: '50% 50%' }))}
                            placeholder="Or paste an image URL..."
                            className="w-full px-3 py-2 bg-[#f2f2f7] rounded-lg text-[13px] text-gray-900 placeholder:text-gray-400 outline-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Info Group */}
                <div>
                  <p className="text-[13px] font-medium text-gray-500 uppercase tracking-wide px-4 mb-1.5">Info</p>
                  <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
                    {/* Name */}
                    <div className="flex items-center px-4 py-2.5">
                      <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">Name</label>
                      <input type="text" required value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Required"
                        className={iosInput} />
                    </div>
                    <div className="ml-24 border-b border-gray-100" />
                    {/* Company */}
                    <div className="flex items-center px-4 py-2.5">
                      <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">Company</label>
                      <input type="text" value={form.company}
                        onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                        placeholder="Optional"
                        className={iosInput} />
                    </div>
                    <div className="ml-24 border-b border-gray-100" />
                    {/* Job Title */}
                    <div className="flex items-center px-4 py-2.5">
                      <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">Title</label>
                      <input type="text" value={form.jobTitle}
                        onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
                        placeholder="Optional"
                        className={iosInput} />
                    </div>
                  </div>
                </div>

                {/* Bio Group */}
                <div>
                  <p className="text-[13px] font-medium text-gray-500 uppercase tracking-wide px-4 mb-1.5">Bio</p>
                  <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
                    <textarea
                      value={form.bio}
                      onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                      rows={4}
                      placeholder="Write a short bio..."
                      className="w-full px-4 py-3 bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 outline-none resize-none"
                    />
                  </div>
                </div>

                {/* Social Group */}
                <div>
                  <p className="text-[13px] font-medium text-gray-500 uppercase tracking-wide px-4 mb-1.5">Social</p>
                  <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center px-4 py-2.5">
                      <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">X / Twitter</label>
                      <input type="text" value={form.twitterHandle}
                        onChange={e => setForm(f => ({ ...f, twitterHandle: e.target.value }))}
                        placeholder="@handle"
                        className={iosInput} />
                    </div>
                    <div className="ml-24 border-b border-gray-100" />
                    <div className="flex items-center px-4 py-2.5">
                      <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">LinkedIn</label>
                      <input type="url" value={form.linkedinUrl}
                        onChange={e => setForm(f => ({ ...f, linkedinUrl: e.target.value }))}
                        placeholder="https://linkedin.com/in/..."
                        className={iosInput} />
                    </div>
                  </div>
                </div>

                {/* Delete */}
                <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting || saving}
                    className="w-full px-4 py-3 text-[#FF3B30] text-[15px] font-normal text-center hover:bg-red-50 transition-colors disabled:opacity-40"
                  >
                    {deleting ? 'Deleting...' : 'Delete Speaker'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
