'use client'

import { useState, useRef, useCallback } from 'react'
import Image from 'next/image'
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
  }

  function closeEdit() {
    setEditingSpeaker(null)
    setError('')
    setRepositioning(false)
  }

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
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  // Drag-to-reposition handlers
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

  // Touch support for repositioning
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
      const res = await fetch(`/api/speakers/${editingSpeaker.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      const updated = await res.json()
      setSpeakers(prev =>
        prev.map(s =>
          s.id === editingSpeaker.id
            ? { ...s, ...updated }
            : s
        )
      )
      closeEdit()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editingSpeaker) return
    if (!confirm('Delete this speaker? This cannot be undone.')) return
    setDeleting(true)
    setError('')

    try {
      const res = await fetch(`/api/speakers/${editingSpeaker.id}`, {
        method: 'DELETE',
      })

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

  const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">{speakers.length} speakers total</p>
        <Link href="/dashboard/speakers/new" className="btn-primary text-sm">
          + New Speaker
        </Link>
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
                      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                        <img src={speaker.photoUrl} alt={speaker.name} width={40} height={40}
                          className="w-full h-full object-cover"
                          style={{ objectPosition: speaker.photoPosition ?? '50% 50%' }} />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary font-semibold text-sm">{speaker.name[0]}</span>
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
                  <span className="text-primary hover:underline text-xs font-medium">Edit</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {speakers.length === 0 && (
          <p className="text-center text-gray-400 py-12">No speakers yet.</p>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Edit Speaker Modal */}
      {editingSpeaker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeEdit}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Edit Speaker</h2>
                <p className="text-sm text-gray-500">{editingSpeaker.name}</p>
              </div>
              <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
                {error && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200/60 text-red-600 text-xs">
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                  </div>
                )}

                {/* Profile Image Section */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Profile Image</label>

                  {/* Image preview + reposition */}
                  <div className="flex items-start gap-4 mb-3">
                    <div className="flex flex-col items-center gap-2">
                      {form.photoUrl ? (
                        repositioning ? (
                          /* Reposition mode: larger preview with drag */
                          <div
                            ref={reposContainerRef}
                            className="w-32 h-32 rounded-xl overflow-hidden bg-gray-100 border-2 border-primary cursor-crosshair relative select-none"
                            onMouseDown={handleReposMouseDown}
                            onMouseMove={handleReposMouseMove}
                            onMouseUp={handleReposMouseUp}
                            onMouseLeave={handleReposMouseUp}
                            onTouchStart={() => { isDragging.current = true }}
                            onTouchMove={handleReposTouchMove}
                            onTouchEnd={handleReposMouseUp}
                          >
                            <img
                              src={form.photoUrl}
                              alt="Reposition"
                              className="w-full h-full object-cover pointer-events-none"
                              style={{ objectPosition: form.photoPosition }}
                              draggable={false}
                            />
                            {/* Crosshair overlay */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-6 h-6 rounded-full border-2 border-white/80 shadow-sm" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                            <img
                              src={form.photoUrl}
                              alt="Preview"
                              className="w-full h-full object-cover"
                              style={{ objectPosition: form.photoPosition }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          </div>
                        )
                      ) : (
                        <div className="w-20 h-20 rounded-xl bg-primary/10 flex items-center justify-center">
                          <span className="text-primary font-bold text-2xl">{form.name?.[0] ?? '?'}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 space-y-2">
                      {/* Upload + Reposition buttons */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          disabled={uploading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary text-xs font-medium rounded-lg hover:bg-primary/20 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {uploading ? 'Uploading...' : 'Upload Image'}
                        </button>

                        {form.photoUrl && (
                          <button
                            type="button"
                            onClick={() => setRepositioning(!repositioning)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                              repositioning
                                ? 'bg-primary text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                            {repositioning ? 'Done Repositioning' : 'Reposition'}
                          </button>
                        )}

                        {form.photoUrl && (
                          <button
                            type="button"
                            onClick={() => { setForm(f => ({ ...f, photoUrl: '', photoPosition: '50% 50%' })); setRepositioning(false) }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 text-xs font-medium rounded-lg hover:bg-red-100 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Remove
                          </button>
                        )}
                      </div>

                      {repositioning && (
                        <p className="text-xs text-primary">Click and drag on the image to set the focal point</p>
                      )}

                      {/* URL input */}
                      <div>
                        <input
                          type="text"
                          value={form.photoUrl.startsWith('data:') ? '' : form.photoUrl}
                          onChange={e => setForm(f => ({ ...f, photoUrl: e.target.value, photoPosition: '50% 50%' }))}
                          placeholder={form.photoUrl.startsWith('data:') ? 'Image uploaded' : 'https://example.com/photo.jpg'}
                          disabled={form.photoUrl.startsWith('data:')}
                          className={`${inputClass} ${form.photoUrl.startsWith('data:') ? 'bg-gray-50 text-gray-400' : ''}`}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          {form.photoUrl.startsWith('data:') ? 'Image uploaded from file' : 'Or paste an image URL'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className={inputClass}
                  />
                </div>

                {/* Company + Job Title */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                    <input
                      type="text"
                      value={form.company}
                      onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Job Title</label>
                    <input
                      type="text"
                      value={form.jobTitle}
                      onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Bio */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Bio</label>
                  <textarea
                    value={form.bio}
                    onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                    rows={4}
                    className={inputClass}
                  />
                </div>

                {/* Twitter + LinkedIn */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Twitter / X Handle</label>
                    <input
                      type="text"
                      value={form.twitterHandle}
                      onChange={e => setForm(f => ({ ...f, twitterHandle: e.target.value }))}
                      placeholder="@handle"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">LinkedIn URL</label>
                    <input
                      type="url"
                      value={form.linkedinUrl}
                      onChange={e => setForm(f => ({ ...f, linkedinUrl: e.target.value }))}
                      placeholder="https://linkedin.com/in/..."
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting || saving}
                  className="btn-danger text-sm"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
                <div className="flex gap-3">
                  <button type="button" onClick={closeEdit} className="btn-secondary text-sm" disabled={saving}>
                    Cancel
                  </button>
                  <button type="submit" disabled={saving || deleting} className="btn-primary text-sm">
                    {saving ? 'Saving...' : 'Save Changes'}
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
