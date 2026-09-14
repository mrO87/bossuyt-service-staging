/**
 * De knopjes rechts in de kop van de werkbon.
 *
 * Drie mogelijke: het origineel dat binnenkwam, de afgewerkte bon die eruit
 * ging, en het potlood om de gegevens recht te zetten. Wat er staat hangt af
 * van wat er bestaat — een knop die niets opent is erger dan geen knop.
 *
 * Ze passen alleen doordat de titel ingekort is tot "SERVICE BON". Nagemeten op
 * 400 px: de volledige tweetalige titel vraagt 241 px en krijgt er met drie
 * knopjes 190; ingekort vraagt hij er 101. De Franse helft staat nog altijd op
 * de PDF zelf, dus er gaat niets verloren.
 */
'use client'

import { useEffect, useState } from 'react'
import { BonFileButton, kindForPath } from './BonFileButton'

interface BonFiles {
  original: string | null
  finished: string | null
}

export function BonHeaderButtons({
  workOrderId,
  /** Het origineel dat het scherm al kent; de server bevestigt of vult aan. */
  scanPath,
  /** Of deze bon nog aangepast mag worden. Afgewerkt is afgewerkt. */
  editable,
  onEdit,
}: {
  workOrderId: string
  scanPath?: string
  editable: boolean
  onEdit: () => void
}) {
  const [files, setFiles] = useState<BonFiles>({ original: scanPath ?? null, finished: null })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/work-orders/${workOrderId}/files`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: BonFiles | null) => {
        if (cancelled || !data) return
        // Het scherm kende het origineel al uit zijn eigen kopie; de server mag
        // dat bevestigen maar niet wegnemen als hij even niets vindt.
        setFiles(vorige => ({
          original: data.original ?? vorige.original,
          finished: data.finished,
        }))
      })
      .catch(() => { /* offline: dan blijft het bij wat het scherm al wist */ })
    return () => { cancelled = true }
  }, [workOrderId])

  return (
    <div className="flex shrink-0 items-center gap-1">
      {files.original && (
        <BonFileButton kind={kindForPath(files.original)} href={files.original} />
      )}

      {files.finished && <BonFileButton kind="afgewerkt" href={files.finished} />}

      {editable && (
        <button
          type="button"
          onClick={onEdit}
          aria-label="Gegevens van deze bon aanpassen"
          className="flex min-w-[38px] shrink-0 flex-col items-center gap-0.5 rounded-lg bg-white/10 px-1.5 pb-0.5 pt-0.5 active:bg-white/20"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/bon-aanpassen.svg" alt="" width={16} height={16} className="block" />
          <span className="text-[6px] font-bold uppercase leading-none tracking-tight text-white/75">
            aanpassen
          </span>
        </button>
      )}
    </div>
  )
}
