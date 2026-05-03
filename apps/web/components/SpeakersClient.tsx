'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

type Speaker = {
  id: string
  name: string
  photoUrl: string | null
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
  twitterHandle: string
  linkedinUrl: string
}

export default function SpeakersClient({ initialSpeakers }: { initialSpeakers: Speaker[] }) {
  const [speakers, setSpeakers] = useState(initialSpeakers)
  const [editingSpeaker, setEditingSpeaker] = useState<Speaker | null>(null)
  const [form, setForm] = useState<SpeakerForm>({
    name: '', company: '', jobTitle: '', bio: '', photoUrl: '', twitterHandle: '', linkedinUrl: '',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  function openEdit(speaker: Speaker) {
    setEditingSpeaker(speaker)
    setForm({
      name: speaker.name,
      company: speaker.company ?? '',
      jobTitle: speaker.jobTitle ?? '',
      bio: speaker.bio ?? '',
      photoUrl: speaker.photoUrl ?? '',
      twitterHandle: speaker.twitterHandle ?? '',
      linkedinUrl: speaker.linkedinUrl ?? '',
    })
    setError('')
  }

  function closeEdit() {
    setEditingSpeaker(null)
    setError('')
  }

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
                        <Image src={speaker.photoUrl} alt={speaker.name} width={40} height={40}
                          className="w-full h-full object-cover" />
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

                {/* Photo preview + URL */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Profile Image</label>
                  <div className="flex items-center gap-4 mb-2">
                    {form.photoUrl ? (
                      <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 border border-gray-200">
                        <img src={form.photoUrl} alt="Preview" className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary font-bold text-xl">{form.name?.[0] ?? '?'}</span>
                      </div>
                    )}
                    <div className="flex-1">
                      <input
                        type="url"
                        value={form.photoUrl}
                        onChange={e => setForm(f => ({ ...f, photoUrl: e.target.value }))}
                        placeholder="https://example.com/photo.jpg"
                        className={inputClass}
                      />
                      <p className="text-xs text-gray-400 mt-1">Enter an image URL for the speaker photo</p>
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
