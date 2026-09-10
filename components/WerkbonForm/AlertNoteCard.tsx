'use client'

import { useState } from 'react'

interface Props {
  note: string
  /** Who wrote it — only they get the edit and delete buttons. */
  noteBy?: string
  currentUserId: string
  workOrderId: string
  onChange: (note: string | null) => void
}

/**
 * The warning note, as the first card on the werkbon.
 *
 * It sits above everything else because it is the thing that changes what the
 * technician does next — calling the customer first, or coming back in the
 * morning. Reading it after driving out is too late.
 *
 * The edit and delete buttons only appear for the person who wrote it. The
 * server checks the same thing; this just keeps a button from appearing that
 * would only ever fail.
 */
export default function AlertNoteCard({ note, noteBy, currentUserId, workOrderId, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAuthor = Boolean(noteBy) && noteBy === currentUserId

  async function save(next: string | null) {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/work-orders/${workOrderId}/alert-note`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: next ?? '', changedBy: currentUserId }),
      })
      const json = (await response.json()) as { alertNote?: string | null; error?: string }

      if (!response.ok) throw new Error(json.error ?? 'Opslaan mislukt')

      onChange(json.alertNote ?? null)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border-2 border-brand-red bg-brand-red/10 p-4 flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <span className="w-7 h-7 shrink-0 rounded-full bg-brand-red text-white font-bold flex items-center justify-center">
          !
        </span>

        {editing ? (
          <textarea
            rows={3}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
            className="flex-1 rounded-xl px-3 py-2 text-base bg-white border border-brand-red text-ink outline-none resize-none"
          />
        ) : (
          <p className="flex-1 font-bold text-base leading-snug text-ink">{note}</p>
        )}
      </div>

      {error && <p className="text-sm font-semibold text-brand-red">{error}</p>}

      {isAuthor && (
        <div className="flex gap-2 justify-end">
          {editing ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => { setDraft(note); setEditing(false); setError(null) }}
                className="px-4 py-2 rounded-lg text-sm font-bold text-ink-soft disabled:opacity-50"
              >
                Annuleren
              </button>
              <button
                type="button"
                disabled={saving || !draft.trim()}
                onClick={() => void save(draft.trim())}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-brand-red text-white disabled:opacity-50"
              >
                {saving ? 'Bezig…' : 'Bewaren'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(null)}
                className="px-4 py-2 rounded-lg text-sm font-bold text-brand-red disabled:opacity-50"
              >
                Verwijderen
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => { setDraft(note); setEditing(true) }}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-brand-red text-white disabled:opacity-50"
              >
                Aanpassen
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
