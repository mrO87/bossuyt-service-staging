/**
 * De toestellen van deze bon, als rij om uit te kiezen.
 *
 * Een servicebon noemt er soms drie. Tot nu toe toonde de werkbon er één — het
 * hoofdtoestel, waar het verslag en de onderdelen aan hangen — en waren de
 * andere twee onzichtbaar, ook al stonden ze netjes in de database. Wie ter
 * plaatse het schema van het tweede vuur nodig had, vond het niet.
 *
 * Kiezen verandert alléén wat je ziet. Het verslag blijft aan het hoofdtoestel
 * hangen; dat is wat de gebruiker gevraagd heeft en het staat er ook bij. Een
 * tik hier schrijft niets weg.
 *
 * Bij één toestel toont dit niets: een keuze uit één is geen keuze, en een lege
 * rij knoppen is enkel ruis op een telefoonscherm.
 */
'use client'

import { useEffect, useState } from 'react'

export interface BonDevice {
  id: string
  brand: string
  model: string
  unitNumber?: string
  sourceLabel?: string
  isMain: boolean
}

/** Hoe een toestel heet op het scherm, ook wanneer het merk niet herkend is. */
export function deviceLabel(device: BonDevice): string {
  const naam = [device.brand, device.model].filter(Boolean).join(' ').trim()
  // Geen merk en geen model: dan is de ruwe regel van de bon nog altijd beter
  // dan een lege knop — dezelfde gedachte als achter `customerLabel`.
  return naam || device.sourceLabel?.trim() || 'Toestel zonder naam'
}

export function BonDeviceTabs({
  workOrderId,
  selectedId,
  onSelect,
}: {
  workOrderId: string
  selectedId: string | null
  onSelect: (device: BonDevice) => void
}) {
  const [devices, setDevices] = useState<BonDevice[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/work-orders/${workOrderId}/devices`)
      .then(r => (r.ok ? r.json() : { devices: [] }))
      .then((data: { devices?: BonDevice[] }) => {
        if (!cancelled) setDevices(data.devices ?? [])
      })
      .catch(() => { if (!cancelled) setDevices([]) })
    return () => { cancelled = true }
  }, [workOrderId])

  if (devices.length < 2) return null

  return (
    <div className="mb-2">
      <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
        {devices.length} toestellen op deze bon
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {devices.map(device => {
          const gekozen = device.id === selectedId
          return (
            <button
              key={device.id}
              type="button"
              onClick={() => onSelect(device)}
              aria-pressed={gekozen}
              className={[
                'shrink-0 rounded-lg border px-2.5 py-1.5 text-left',
                gekozen
                  ? 'border-brand-orange bg-brand-orange/10'
                  : 'border-stroke bg-white',
              ].join(' ')}
            >
              <span className="block text-xs font-bold text-ink">{deviceLabel(device)}</span>
              <span className="block text-[10px] tabular-nums text-ink-soft">
                {device.unitNumber ?? '—'}
                {device.isMain && <span className="ml-1 text-brand-orange">· verslag</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
