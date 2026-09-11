/**
 * EstimateBadge — the duration chip, made editable.
 *
 * Tap it, type minutes, done. Empty is allowed: no field in this app is
 * mandatory, and a work order whose length nobody knows yet should still be
 * storable. An empty estimate simply counts as nothing towards the day, which
 * is honest — better than a made-up number that quietly shifts the overrun
 * warning.
 *
 * Writes go to IndexedDB first and onto the pending queue, like every other
 * change here, so it works with no signal in a cellar.
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import { enqueuePendingWrite, getIntervention, upsertIntervention } from '@/lib/idb'
import { formatMinutes } from './interventionLabels'

export function EstimateBadge({
  interventionId,
  minutes,
  onChanged,
}: {
  interventionId: string
  minutes?: number
  onChanged?: (next: number | undefined) => void
}) {
  const [editing, setEditing] = useState(false)
  // Seeded when editing starts, so there is nothing to keep in sync with the
  // prop while the field is closed.
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function save() {
    setEditing(false)

    const trimmed = draft.trim()
    const parsed = trimmed === '' ? undefined : Number(trimmed)

    // Nonsense is dropped rather than stored; the badge keeps showing the old
    // value because that is still what the work order says.
    if (parsed !== undefined && (!Number.isFinite(parsed) || parsed <= 0 || parsed > 24 * 60)) {
      return
    }
    if (parsed === minutes) return

    const cached = await getIntervention(interventionId)
    if (cached) {
      await upsertIntervention({ ...cached, estimatedMinutes: parsed })
    }

    await enqueuePendingWrite({
      type: 'update_estimate',
      createdAt: new Date().toISOString(),
      payload: { workOrderId: interventionId, estimatedMinutes: parsed ?? null },
    })

    onChanged?.(parsed)
  }

  if (editing) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-white border border-brand-orange px-2 py-0.5"
        onClick={event => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={event => {
            if (event.key === 'Enter') save()
            if (event.key === 'Escape') setEditing(false)
          }}
          aria-label="Geschatte duur in minuten"
          className="w-14 bg-transparent text-[11px] font-semibold text-ink outline-none"
        />
        <span className="text-[11px] text-ink-soft">min</span>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={event => {
        event.stopPropagation()   // the card behind this opens the work order
        setDraft(minutes ? String(minutes) : '')
        setEditing(true)
      }}
      aria-label={
        minutes ? `Duur aanpassen, nu ${formatMinutes(minutes)}` : 'Duur invullen'
      }
      className={[
        'text-[11px] px-2 py-0.5 rounded-full font-semibold active:opacity-70 transition-opacity',
        minutes
          ? 'bg-stroke text-ink-soft'
          : 'bg-white text-ink-soft border border-dashed border-stroke',
      ].join(' ')}
    >
      {minutes ? formatMinutes(minutes) : 'duur?'}
    </button>
  )
}
