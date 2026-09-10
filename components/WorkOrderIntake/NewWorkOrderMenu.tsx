'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { queueIntakeUpload } from '@/lib/idb'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * The three ways a work order starts, behind the + in the day view.
 *
 * Two of them begin with a file. Rather than sending the technician to another
 * screen to tap a second button, the camera and the file picker open straight
 * from this sheet: the hidden <input type="file"> cannot be styled, so a <label>
 * wraps it and tapping the label opens the picker exactly as tapping the input
 * would.
 *
 * The chosen file then has to reach /werkbon/upload, and a file cannot travel in
 * a URL. It goes into the same IndexedDB queue an upload uses anyway, and only
 * its clientId travels — which also means a bon survives the technician closing
 * the tab between picking it and it reaching the server.
 */
export default function NewWorkOrderMenu({ open, onClose }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  // Lock the page behind the sheet, the same way SettingsSheet does.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Clear the input so picking the same file twice in a row still fires.
    event.target.value = ''
    if (!file) return

    setBusy(true)
    try {
      const clientId = crypto.randomUUID()
      await queueIntakeUpload({
        clientId,
        fileName: file.name || 'werkbon',
        mimeType: file.type,
        size: file.size,
        file,
        createdAt: new Date().toISOString(),
      })
      onClose()
      router.push(`/werkbon/upload?bron=${clientId}`)
    } finally {
      setBusy(false)
    }
  }

  const itemClass =
    'w-full flex items-center gap-4 px-5 py-5 text-left border-b border-stroke last:border-b-0 active:opacity-70 cursor-pointer'
  const iconClass = 'w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-white'

  return (
    <>
      <div
        onClick={onClose}
        className={[
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      />

      <div
        className={[
          'fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl',
          'transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-stroke" />
        </div>

        <p className="px-5 pt-2 pb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
          Nieuwe werkbon
        </p>

        <button type="button" onClick={() => { onClose(); router.push('/werkbon/nieuw') }} className={itemClass}>
          <span className={`${iconClass} bg-brand-orange text-2xl font-bold leading-none`}>+</span>
          <span>
            <span className="block font-bold text-base text-ink">Zelf invullen</span>
            <span className="block text-sm text-ink-soft">Klant, locatie en toestel kiezen</span>
          </span>
        </button>

        <label className={itemClass}>
          <span className={`${iconClass} bg-brand-blue`}>
            {/* Camera outline */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </span>
          <span>
            <span className="block font-bold text-base text-ink">Foto maken</span>
            <span className="block text-sm text-ink-soft">Papieren bon fotograferen</span>
          </span>
          <input type="file" accept="image/*" capture="environment" onChange={handleFile} disabled={busy} className="hidden" />
        </label>

        <label className={itemClass}>
          <span className={`${iconClass} bg-brand-green`}>
            {/* Document outline */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
          </span>
          <span>
            <span className="block font-bold text-base text-ink">PDF of bestand kiezen</span>
            <span className="block text-sm text-ink-soft">Bon die al digitaal binnenkwam</span>
          </span>
          <input type="file" accept="application/pdf,image/*" onChange={handleFile} disabled={busy} className="hidden" />
        </label>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-4 mt-1 mb-[env(safe-area-inset-bottom)] font-bold text-base text-ink-soft"
        >
          Annuleren
        </button>
      </div>
    </>
  )
}
