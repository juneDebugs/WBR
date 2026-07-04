'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  PERMISSION_SECTIONS,
  MANAGEABLE_ROLES,
  LOCKED_KEYS_BY_ROLE,
  type ManageableRole,
  type PermissionKey,
  type RoleConfig,
} from '@/lib/permissions'

const DESCRIPTION_MAX = 280

const roleBadge: Record<ManageableRole, string> = {
  ORGANIZER: 'bg-brand-100 text-brand-700',
  STAFF: 'bg-brand-100 text-brand-700',
}
const roleLabel: Record<ManageableRole, string> = { STAFF: 'Staff', ORGANIZER: 'Organizer' }

type Draft = Record<ManageableRole, { description: string; perms: Set<PermissionKey> }>
type Status = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

function toDraft(configs: RoleConfig[]): Draft {
  const draft = {} as Draft
  for (const role of MANAGEABLE_ROLES) {
    const cfg = configs.find(c => c.role === role)
    draft[role] = {
      description: cfg?.description ?? '',
      perms: new Set(cfg?.permissions ?? []),
    }
  }
  return draft
}

function cloneDraft(d: Draft): Draft {
  const out = {} as Draft
  for (const role of MANAGEABLE_ROLES) {
    out[role] = { description: d[role].description, perms: new Set(d[role].perms) }
  }
  return out
}

function isLocked(role: ManageableRole, key: PermissionKey): boolean {
  return LOCKED_KEYS_BY_ROLE[role].includes(key)
}

function rolesEqual(a: Draft, b: Draft, role: ManageableRole): boolean {
  if (a[role].description !== b[role].description) return false
  if (a[role].perms.size !== b[role].perms.size) return false
  for (const k of a[role].perms) if (!b[role].perms.has(k)) return false
  return true
}

// ─── iOS-style switch ────────────────────────────────────────────────────────
function PermissionSwitch({
  checked, locked, disabled, labelledBy, describedBy, onChange,
}: {
  checked: boolean
  locked: boolean
  disabled: boolean
  labelledBy: string
  describedBy?: string
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      // Locked stays focusable (so SR users hear the reason) but is not a real
      // disabled control; read-only/saving uses the actual disabled attribute.
      disabled={disabled && !locked}
      aria-disabled={locked || undefined}
      onClick={() => { if (locked || disabled) return; onChange(!checked) }}
      title={locked ? 'Organizers always keep access to Roles & Permissions, so no one can be locked out.' : undefined}
      className="relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors motion-reduce:transition-none ${
          checked ? 'bg-primary' : 'bg-fill-2'
        } ${locked ? 'cursor-not-allowed' : disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
        {locked && (
          <svg className="absolute left-1.5 h-3 w-3 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        )}
      </span>
    </button>
  )
}

export function RolesPermissionsPanel({
  initialRoles,
  canEdit,
  onDirtyChange,
  registerDiscard,
}: {
  initialRoles: RoleConfig[]
  canEdit: boolean
  // Lets the parent shell know when there are unsaved changes (to guard tab
  // switches) and gives it a way to force-discard when the user confirms.
  onDirtyChange?: (dirty: boolean) => void
  registerDiscard?: (fn: () => void) => void
}) {
  const queryClient = useQueryClient()
  // toDraft() builds fresh Sets on each call, so snapshot and draft start as
  // independent copies without an extra clone.
  const [snapshot, setSnapshot] = useState<Draft>(() => toDraft(initialRoles))
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialRoles))
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  const dirtyRoles = useMemo(
    () => MANAGEABLE_ROLES.filter(role => !rolesEqual(draft, snapshot, role)),
    [draft, snapshot],
  )
  const dirty = dirtyRoles.length > 0

  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  const discard = useCallback(() => {
    setDraft(cloneDraft(snapshot))
    setStatus('idle')
    setErrorMsg('')
  }, [snapshot])

  useEffect(() => { registerDiscard?.(discard) }, [registerDiscard, discard])

  // Warn before a full page unload while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

  function setDescription(role: ManageableRole, value: string) {
    setDraft(prev => {
      const next = cloneDraft(prev)
      next[role].description = value.slice(0, DESCRIPTION_MAX)
      return next
    })
    if (status === 'saved') setStatus('idle')
  }

  function toggle(role: ManageableRole, key: PermissionKey, on: boolean) {
    if (isLocked(role, key)) return
    setDraft(prev => {
      const next = cloneDraft(prev)
      if (on) next[role].perms.add(key)
      else next[role].perms.delete(key)
      return next
    })
    if (status === 'saved') setStatus('idle')
  }

  async function save() {
    setStatus('saving')
    setErrorMsg('')
    // Save role-by-role, recording each server-confirmed config. A later
    // failure must NOT re-mark an already-persisted role as dirty, so we commit
    // the succeeded roles into the snapshot regardless of where we stop.
    const saved: { role: ManageableRole; description: string; perms: Set<PermissionKey> }[] = []
    let failure: string | null = null
    for (const role of dirtyRoles) {
      try {
        const res = await fetch('/api/roles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role,
            description: draft[role].description.trim(),
            permissions: [...draft[role].perms],
          }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          failure = d.error ?? 'Couldn’t save role permissions. Your changes weren’t applied.'
          break
        }
        // Use the server-normalized config (trimmed description, coerced locked keys).
        const body = await res.json().catch(() => ({}))
        const cfg = body.role
        saved.push({
          role,
          description: typeof cfg?.description === 'string' ? cfg.description : draft[role].description.trim(),
          perms: new Set<PermissionKey>(Array.isArray(cfg?.permissions) ? cfg.permissions : [...draft[role].perms]),
        })
      } catch {
        failure = 'Network error — role permissions weren’t saved.'
        break
      }
    }

    if (saved.length > 0) {
      const apply = (d: Draft) => {
        const next = cloneDraft(d)
        for (const s of saved) next[s.role] = { description: s.description, perms: new Set(s.perms) }
        return next
      }
      setSnapshot(apply)
      setDraft(apply)
    }

    if (failure) {
      setStatus('error')
      setErrorMsg(failure)
      setTimeout(() => errorRef.current?.focus(), 0) // move focus to alert for SR users
      return
    }

    setStatus('saved')
    // Role changes ripple into the Staff/Access surfaces; keep them fresh.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['staff'] }),
      queryClient.invalidateQueries({ queryKey: ['access'] }),
    ])
    savedTimer.current = setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 3000)
  }

  const busy = status === 'saving'
  const showSaveBar = canEdit && (dirty || status === 'saving' || status === 'saved')

  return (
    <div className="max-w-5xl space-y-6">
      <p className="text-sm text-ink-2">
        Control which parts of the dashboard each admin role can open. Changes apply to everyone with that role.
      </p>

      {!canEdit && (
        <div role="status" className="flex items-center gap-2 px-4 py-2.5 bg-brand-50 border border-brand/30 rounded-lg">
          <svg className="w-4 h-4 text-brand flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-brand-700">You’re viewing roles in read-only mode. Only organizers can change permissions.</p>
        </div>
      )}

      {status === 'error' && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="flex items-center justify-between gap-2 px-4 py-2 bg-danger-soft border border-danger/30 rounded-lg focus:outline-none"
        >
          <p className="text-sm text-danger-ink">{errorMsg}</p>
          <button onClick={() => setStatus(dirty ? 'dirty' : 'idle')} className="text-danger hover:text-danger-ink" aria-label="Dismiss error">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Role details */}
      <div className="bg-white border border-hairline rounded-xl p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-ink mb-4">Role details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MANAGEABLE_ROLES.map(role => {
            const remaining = DESCRIPTION_MAX - draft[role].description.length
            return (
              <div key={role}>
                <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${roleBadge[role]}`}>
                  {roleLabel[role]}
                </span>
                <label htmlFor={`role-desc-${role}`} className="block text-xs font-medium text-ink-2 mb-1 mt-3">
                  Description
                </label>
                {canEdit ? (
                  <>
                    <textarea
                      id={`role-desc-${role}`}
                      rows={3}
                      maxLength={DESCRIPTION_MAX}
                      value={draft[role].description}
                      onChange={e => setDescription(role, e.target.value)}
                      disabled={busy}
                      placeholder="Describe what this role is for…"
                      className="w-full px-3 py-2 text-sm border border-hairline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none min-h-[72px] disabled:opacity-60"
                    />
                    <p className="text-caption text-ink-2 mt-1">
                      {remaining <= 20 ? `${remaining} characters left` : 'Shown when assigning roles.'}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-ink whitespace-pre-wrap min-h-[72px]">
                    {draft[role].description.trim() || '—'}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Permission matrix */}
      <div className={`bg-white border border-hairline rounded-xl overflow-hidden ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        <div className="px-4 py-3 border-b border-hairline">
          <h2 className="text-sm font-semibold text-ink">Dashboard access</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-hairline">
              <tr>
                <th className="py-2 px-4 text-left" />
                {MANAGEABLE_ROLES.map(role => (
                  <th key={role} scope="col" id={`perm-col-${role}`} className="py-2 px-4 text-right w-24">
                    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${roleBadge[role]}`}>
                      {roleLabel[role]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              <tr>
                <td colSpan={3} className="px-4 py-2.5 border-b border-hairline">
                  <span className="flex items-center gap-1.5 text-xs text-ink-2">
                    <svg className="w-3.5 h-3.5 text-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Overview — always available to every admin
                  </span>
                </td>
              </tr>
              {PERMISSION_SECTIONS.map(section => (
                <Fragment key={section.section}>
                  <tr>
                    <th colSpan={3} scope="colgroup" className="px-4 pt-4 pb-1 text-left text-caption font-semibold uppercase tracking-wider text-ink-2">
                      {section.section}
                    </th>
                  </tr>
                  {section.items.map(item => (
                    <tr key={item.key} className="hover:bg-fill transition-colors">
                      <th scope="row" id={`perm-row-${item.key}`} className="px-4 py-2.5 text-left text-sm font-medium text-ink truncate">
                        {item.label}
                      </th>
                      {MANAGEABLE_ROLES.map(role => {
                        const locked = isLocked(role, item.key)
                        return (
                          <td key={role} className="px-4 py-2.5 text-right w-24">
                            <span className="inline-flex justify-end w-full">
                              <PermissionSwitch
                                checked={locked || draft[role].perms.has(item.key)}
                                locked={locked}
                                disabled={!canEdit || busy}
                                labelledBy={`perm-row-${item.key} perm-col-${role}`}
                                describedBy={locked ? 'lock-hint' : undefined}
                                onChange={next => toggle(role, item.key, next)}
                              />
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p id="lock-hint" className="sr-only">
          Organizers always keep access to Roles &amp; Permissions, so no one can be locked out.
        </p>
      </div>

      {/* Sticky save bar */}
      {showSaveBar && (
        <div className="sticky bottom-4 z-20 mt-2 flex items-center justify-between gap-3 bg-white border border-hairline rounded-xl shadow-lg px-4 py-3">
          {status === 'saved' ? (
            <span role="status" className="flex items-center gap-1.5 text-sm text-success-ink">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              All changes saved
            </span>
          ) : (
            <span className="flex items-center gap-2 text-sm text-ink-2">
              <span className="w-2 h-2 rounded-full bg-warning" aria-hidden="true" />
              Unsaved changes
            </span>
          )}
          <div className="flex items-center gap-2">
            {status !== 'saved' && (
              <button
                type="button"
                onClick={discard}
                disabled={busy}
                className="btn-secondary"
              >
                Discard
              </button>
            )}
            {status !== 'saved' && (
              <button
                type="button"
                onClick={save}
                disabled={busy || !dirty}
                className="btn-primary"
              >
                {busy && (
                  <svg className="w-4 h-4 animate-spin motion-reduce:animate-none" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
