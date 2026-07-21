'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChatPageClient } from '@/components/ChatPageClient'
import { ChatSettingsPanel, type ChatSettingsData } from '@/components/ChatSettingsPanel'
import { useDialogFocus } from '@/lib/useDialogFocus'

type Tab = 'broadcast' | 'settings'
const TABS: { id: Tab; label: string }[] = [
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'settings', label: 'Settings' },
]

export function ChatTabsShell({
  chatInitialData,
  settingsInitialData,
  canEditSettings,
}: {
  chatInitialData?: any
  settingsInitialData: ChatSettingsData
  canEditSettings: boolean
}) {
  const [active, setActive] = useState<Tab>('broadcast')
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [pendingTab, setPendingTab] = useState<Tab | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const discardRef = useRef<(() => void) | null>(null)

  const registerDiscard = useCallback((fn: () => void) => {
    discardRef.current = fn
  }, [])
  const onDirtyChange = useCallback((d: boolean) => setSettingsDirty(d), [])

  // Guard leaving the Settings tab with unsaved edits.
  function requestTab(next: Tab) {
    if (next === active) return
    if (active === 'settings' && settingsDirty) {
      setPendingTab(next)
      return
    }
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelDiscard()
    }
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
      <div role="tablist" aria-label="Chat views" className="flex border-b border-hairline mb-6">
        {TABS.map((tab, idx) => {
          const selected = active === tab.id
          return (
            <button
              key={tab.id}
              ref={el => {
                tabRefs.current[idx] = el
              }}
              role="tab"
              id={`chat-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`chat-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => requestTab(tab.id)}
              onKeyDown={e => onTabKeyDown(e, idx)}
              className={`min-h-[44px] px-5 py-3 text-sm font-medium border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset ${
                selected ? 'border-primary text-primary' : 'border-transparent text-ink-2 hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Both panels stay mounted (hidden, not unmounted) so the broadcast tab
          keeps its query cache and the settings tab keeps unsaved edits across a
          peek at Broadcast. */}
      <div role="tabpanel" id="chat-panel-broadcast" aria-labelledby="chat-tab-broadcast" hidden={active !== 'broadcast'}>
        <ChatPageClient initialData={chatInitialData} />
      </div>

      <div role="tabpanel" id="chat-panel-settings" aria-labelledby="chat-tab-settings" tabIndex={0} hidden={active !== 'settings'}>
        <ChatSettingsPanel
          initialData={settingsInitialData}
          canEdit={canEditSettings}
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
            aria-labelledby="chat-discard-title"
            className="bg-white rounded-2xl shadow-pop w-full max-w-md p-6 focus:outline-none"
            onClick={e => e.stopPropagation()}
          >
            <h2 id="chat-discard-title" className="font-semibold text-ink text-lg">
              Discard unsaved changes?
            </h2>
            <p className="text-sm text-ink-2 mt-1">
              You have unsaved changes to chat settings. Leaving now will discard them.
            </p>
            <div className="flex justify-end gap-2 pt-5">
              <button
                type="button"
                onClick={cancelDiscard}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-ink bg-white border border-hairline rounded-xl hover:bg-fill transition-colors"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={confirmDiscard}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft rounded-xl transition-colors"
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
