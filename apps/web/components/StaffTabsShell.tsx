'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { StaffTable } from '@/components/StaffTable'
import { RolesPermissionsPanel } from '@/components/RolesPermissionsPanel'
import { useDialogFocus } from '@/lib/useDialogFocus'
import type { StaffPage } from '@/lib/staff-query'
import type { RoleConfig } from '@/lib/permissions'

type Tab = 'members' | 'roles'
const TABS: { id: Tab; label: string }[] = [
  { id: 'members', label: 'Members' },
  { id: 'roles', label: 'Roles & Permissions' },
]

export function StaffTabsShell({
  initialData,
  initialRoles,
  canEditRoles,
}: {
  initialData: StaffPage
  initialRoles: RoleConfig[]
  canEditRoles: boolean
}) {
  const [active, setActive] = useState<Tab>('members')
  const [rolesDirty, setRolesDirty] = useState(false)
  const [pendingTab, setPendingTab] = useState<Tab | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const discardRef = useRef<(() => void) | null>(null)

  const registerDiscard = useCallback((fn: () => void) => { discardRef.current = fn }, [])
  const onDirtyChange = useCallback((d: boolean) => setRolesDirty(d), [])

  // Guard leaving the Roles tab with unsaved edits.
  function requestTab(next: Tab) {
    if (next === active) return
    if (active === 'roles' && rolesDirty) { setPendingTab(next); return }
    setActive(next)
  }

  function confirmDiscard() {
    discardRef.current?.()
    if (pendingTab) setActive(pendingTab)
    setPendingTab(null)
  }

  const cancelDiscard = useCallback(() => setPendingTab(null), [])
  const dialogRef = useDialogFocus<HTMLDivElement>(pendingTab !== null)

  useEffect(() => {
    if (pendingTab === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelDiscard() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pendingTab, cancelDiscard])

  // Roving-tabindex arrow-key navigation for the tablist.
  function onTabKeyDown(e: React.KeyboardEvent, idx: number) {
    let target = idx
    if (e.key === 'ArrowRight') target = (idx + 1) % TABS.length
    else if (e.key === 'ArrowLeft') target = (idx - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') target = 0
    else if (e.key === 'End') target = TABS.length - 1
    else return
    e.preventDefault()
    tabRefs.current[target]?.focus()
    requestTab(TABS[target].id)
  }

  return (
    <div>
      <div role="tablist" aria-label="Staff views" className="flex border-b border-gray-200 mb-6">
        {TABS.map((tab, idx) => {
          const selected = active === tab.id
          return (
            <button
              key={tab.id}
              ref={el => { tabRefs.current[idx] = el }}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => requestTab(tab.id)}
              onKeyDown={e => onTabKeyDown(e, idx)}
              className={`min-h-[44px] px-5 py-3 text-sm font-medium border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset ${
                selected ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Both panels stay mounted (hidden, not unmounted) so StaffTable keeps
          its search/scroll state and its one-time cache-priming effect isn't
          re-run — and roles-tab edits survive a peek at Members. */}
      <div
        role="tabpanel"
        id="panel-members"
        aria-labelledby="tab-members"
        hidden={active !== 'members'}
      >
        <StaffTable initialData={initialData} />
      </div>

      <div
        role="tabpanel"
        id="panel-roles"
        aria-labelledby="tab-roles"
        tabIndex={0}
        hidden={active !== 'roles'}
      >
        <RolesPermissionsPanel
          initialRoles={initialRoles}
          canEdit={canEditRoles}
          onDirtyChange={onDirtyChange}
          registerDiscard={registerDiscard}
        />
      </div>

      {/* Discard guard */}
      {pendingTab !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={cancelDiscard}>
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="discard-title"
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 focus:outline-none"
            onClick={e => e.stopPropagation()}
          >
            <h2 id="discard-title" className="font-semibold text-gray-900 text-lg">Discard unsaved changes?</h2>
            <p className="text-sm text-gray-500 mt-1">
              You have unsaved changes to role permissions. Leaving now will discard them.
            </p>
            <div className="flex justify-end gap-2 pt-5">
              <button
                type="button"
                onClick={cancelDiscard}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={confirmDiscard}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Discard changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
