'use client'
import { useState, useRef } from 'react'

/**
 * Company logo input — paste a URL, or pick a file and store it inline.
 *
 * MOVED HERE, NOT COPIED. This was a private helper inside ProfileEditor.tsx
 * until Phase 5, when the sponsor onboarding checklist needed the same input.
 * It is one file with two importers rather than two lookalike uploaders,
 * because the whole point of the phase this belongs to is that one thing should
 * have one definition.
 *
 * The move changed one character of logic and nothing else: the initial mode was
 * written `value ? 'url' : 'url'`, which returns 'url' either way, and is now
 * just 'url'. Recorded rather than left for a reader to spot and wonder about.
 *
 * It is deliberately NOT imported from ProfileEditor. That module carries its
 * own large option lists and the full editor component, so importing through it
 * would pull all of that into the checklist's browser bundle.
 *
 * A chosen file becomes a base64 data URL stored in the database column, per
 * docs/adr/0004-base64-images-in-db.md. That is the repository's current
 * decision for images, not a shortcut taken here; moving images out of the
 * database is tracked as separate work.
 */
export function LogoUploader({ value, onChange, inputId }: {
  value: string
  onChange: (v: string) => void
  /**
   * Id for the address field, so a caller's visible label can point at it with
   * htmlFor. Optional because the profile editor wraps this in its own Field
   * component; the onboarding checklist passes one, because that screen is the
   * only way a blocked representative gets out and its controls have to be
   * reachable by name to somebody using a screen reader.
   */
  inputId?: string
}) {
  const [mode, setMode] = useState<'url' | 'upload'>('url')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    // Convert to base64 data URL for local storage (no external service needed)
    const reader = new FileReader()
    reader.onload = (ev) => {
      onChange(ev.target?.result as string)
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button type="button" onClick={() => setMode('url')}
          className={`chip ${mode === 'url' ? 'chip-active' : 'chip-inactive'}`}>
          URL
        </button>
        <button type="button" onClick={() => setMode('upload')}
          className={`chip ${mode === 'upload' ? 'chip-active' : 'chip-inactive'}`}>
          Upload file
        </button>
      </div>

      {/* type="text", NOT type="url" — and this is load-bearing.
       *
       * `type="url"` makes the browser refuse an address that is not absolute,
       * and refusal happens as HTML form validation: the submit event never
       * fires, no handler runs, and nothing on screen explains why. Measured on
       * 2026-07-31: every one of the 20 seeded exhibiting companies stores a
       * RELATIVE logo path such as `/sponsors/tailor-erp.png`, so
       * `form.checkValidity()` was false on the sponsor profile screen for all
       * of them and pressing Save All Changes did nothing at all — no request,
       * no error, no page change. That was a live bug in the profile editor
       * before this input moved here.
       *
       * It also mattered more than that. The onboarding checklist uses this same
       * input, so a company with a relative logo and any other missing item
       * could not submit the checklist either — which traps a blocked
       * representative on the one screen that is supposed to release them, the
       * exact failure the requirements document forbids by name.
       *
       * A relative path is a legitimate value for this column: the app renders
       * it straight into an <img src>, and the seed data is built that way. The
       * required-set rule is that the value is PRESENT, not that it parses as an
       * absolute URL, so browser URL validation can only ever refuse a save the
       * rule itself would have accepted. inputMode keeps the URL-friendly
       * keyboard on a phone without the validation.
       */}
      {mode === 'url' ? (
        <input className="input" type="text" inputMode="url" value={value}
          id={inputId}
          onChange={e => onChange(e.target.value)}
          aria-label={inputId ? undefined : 'Company logo address'}
          placeholder="https://yourcompany.com/logo.png or /sponsors/logo.png"
          data-testid="logo-url-input" />
      ) : (
        <div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
            className="hidden" onChange={handleFile} />
          <button type="button" onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="btn-secondary btn-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {uploading ? 'Processing…' : 'Choose file (PNG, JPG, SVG, WebP)'}
          </button>
        </div>
      )}

      {value && (
        <div className="flex items-center gap-3 p-3 bg-fill rounded-xl">
          <img
            src={value}
            alt="Logo preview"
            className="w-14 h-14 object-contain rounded-lg border border-hairline bg-surface"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div className="text-xs text-ink-2">
            <p className="font-medium text-ink">Logo preview</p>
            <p className="truncate max-w-[200px]">{value.startsWith('data:') ? 'Uploaded file' : value}</p>
          </div>
          <button type="button" onClick={() => onChange('')}
            aria-label="Remove logo"
            className="ml-auto icon-btn icon-btn-sm text-ink-3 hover:text-danger">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
