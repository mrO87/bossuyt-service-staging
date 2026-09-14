/**
 * Het play- en stopknopje in de START- en EINDE-regel van de dag.
 *
 * Het staat bewust in de regel die er al was, en niet in een eigen balk: daar
 * begint en eindigt de dag al op het scherm, dus valt er niets nieuws te leren.
 * Het uur staat erachter — grijs zolang het het gepláánde uur is, zwart zodra
 * het het échte is. Dat verschil in kleur is het hele onderscheid.
 *
 * Tikken op het knopje zet het uur van nu. Tikken als er al een uur staat opent
 * het venster om het te wijzigen, want vergeten te tikken is de gewone gang van
 * zaken en niet de uitzondering.
 */
'use client'

import { useEffect, useState } from 'react'
import { formatClock } from '@/components/planning/interventionLabels'

export type DayClockKind = 'start' | 'end'

/** De gedeelde kloktijd — zie `formatClock`; hij slaat om op 24 uur. */
const klok = formatClock

export function DayClockButton({
  kind,
  actualMinutes,
  plannedMinutes,
  onSet,
  onClear,
}: {
  kind: DayClockKind
  /** Het echte uur, of null zolang er niet getikt is. */
  actualMinutes: number | null
  /** Het uur waarop de planning rekent. Null bij een lege dag. */
  plannedMinutes: number | null
  /** Een nieuw uur, in minuten sinds middernacht. */
  onSet: (minutes: number) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const gezet = actualMinutes !== null
  const toon = actualMinutes ?? plannedMinutes

  // Een dag zonder werk heeft geen verwacht uur; dan is er ook niets te tikken.
  if (toon === null) return null

  return (
    <>
      <button
        type="button"
        onClick={() => (gezet ? setOpen(true) : onSet(nuInMinuten()))}
        aria-label={
          gezet
            ? `${kind === 'start' ? 'Vertrokken' : 'Thuis'} om ${klok(toon)} — tik om te wijzigen`
            : kind === 'start' ? 'Start mijn dag' : 'Dag afsluiten'
        }
        className={[
          'ml-auto flex shrink-0 items-center gap-1.5 rounded-full border bg-white py-0.5 pl-0.5 pr-2.5',
          gezet ? 'border-ink' : 'border-stroke',
        ].join(' ')}
      >
        <span
          aria-hidden
          className={[
            'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white',
            gezet ? 'bg-brand-dark' : kind === 'start' ? 'bg-brand-green pl-0.5' : 'bg-brand-red',
          ].join(' ')}
        >
          {gezet ? '✓' : kind === 'start' ? '▶' : '■'}
        </span>
        <span
          className={[
            'text-sm font-bold tabular-nums',
            gezet ? 'text-ink' : 'text-ink-faint',
          ].join(' ')}
        >
          {klok(toon)}
        </span>
      </button>

      {open && (
        <DayClockSheet
          kind={kind}
          minutes={actualMinutes ?? toon}
          onClose={() => setOpen(false)}
          onSave={minutes => { onSet(minutes); setOpen(false) }}
          onClear={() => { onClear(); setOpen(false) }}
        />
      )}
    </>
  )
}

/** Het uur van nu, in minuten sinds middernacht. */
function nuInMinuten(): number {
  const nu = new Date()
  return nu.getHours() * 60 + nu.getMinutes()
}

/**
 * Het venster om een uur recht te zetten.
 *
 * Drie manieren, want er zijn drie situaties. "Nu" voor wie er meteen aan
 * denkt. De kwartierstapjes voor wie het een halfuur later beseft — dat is
 * sneller dan tikken op een telefoon met handschoenen aan. En het veld zelf
 * voor wie het uur gewoon weet.
 */
function DayClockSheet({
  kind,
  minutes,
  onClose,
  onSave,
  onClear,
}: {
  kind: DayClockKind
  minutes: number
  onClose: () => void
  onSave: (minutes: number) => void
  onClear: () => void
}) {
  const [waarde, setWaarde] = useState(klok(minutes))

  // Escape sluit, zoals elk venster hoort te doen.
  useEffect(() => {
    const opToets = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', opToets)
    return () => window.removeEventListener('keydown', opToets)
  }, [onClose])

  const verschuif = (delta: number) => {
    const [u, m] = waarde.split(':').map(Number)
    const totaal = Math.max(0, Math.min(23 * 60 + 59, (u || 0) * 60 + (m || 0) + delta))
    setWaarde(klok(totaal))
  }

  const bewaar = () => {
    const [u, m] = waarde.split(':').map(Number)
    if (Number.isNaN(u) || Number.isNaN(m)) return
    onSave(u * 60 + m)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end bg-ink/45"
      role="dialog"
      aria-modal="true"
      aria-label={kind === 'start' ? 'Wanneer ben je vertrokken?' : 'Wanneer was je thuis?'}
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl bg-white p-4 pb-5"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="mb-3 text-sm font-bold text-ink">
          {kind === 'start' ? 'Wanneer ben je vertrokken?' : 'Wanneer was je thuis?'}
        </h3>

        <input
          type="time"
          value={waarde}
          onChange={e => setWaarde(e.target.value)}
          aria-label="Uur"
          className="w-full rounded-xl border-2 border-brand-orange bg-orange-50 py-2.5 text-center text-3xl font-extrabold tabular-nums text-ink outline-none"
        />

        <div className="my-3 flex gap-2">
          <button
            type="button"
            onClick={() => verschuif(-15)}
            className="flex-1 rounded-lg border border-stroke bg-surface py-2 text-xs font-bold text-ink"
          >
            − 15 min
          </button>
          <button
            type="button"
            onClick={() => setWaarde(klok(nuInMinuten()))}
            className="flex-1 rounded-lg bg-brand-dark py-2 text-xs font-bold text-white"
          >
            Nu
          </button>
          <button
            type="button"
            onClick={() => verschuif(15)}
            className="flex-1 rounded-lg border border-stroke bg-surface py-2 text-xs font-bold text-ink"
          >
            + 15 min
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl border border-stroke px-3 py-2.5 text-xs font-bold text-ink-soft"
          >
            Wissen
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-stroke py-2.5 text-sm font-bold text-ink-soft"
          >
            Laat staan
          </button>
          <button
            type="button"
            onClick={bewaar}
            className="flex-1 rounded-xl bg-brand-orange py-2.5 text-sm font-bold text-white"
          >
            Bewaren
          </button>
        </div>
      </div>
    </div>
  )
}
