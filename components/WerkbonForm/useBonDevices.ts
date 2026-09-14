/**
 * De toestellen van deze bon, één keer opgehaald.
 *
 * Deze lijst zat in `BonDeviceTabs` opgesloten. Dat was genoeg zolang alleen
 * die rij knoppen hem nodig had, maar de afgewerkte bon heeft hem óók nodig —
 * en die kreeg hem niet. Gevolg: de bon van Trianon noemt drie toestellen, het
 * scherm toonde ze alle drie, en op de PDF stond er één.
 *
 * Dus staat hij nu één niveau hoger, waar beide erbij kunnen. Eén lijst, twee
 * lezers, geen kans dat ze uit elkaar lopen.
 */
'use client'

import { useEffect, useState } from 'react'

export interface BonDevice {
  id: string
  brand: string
  model: string
  unitNumber?: string
  sourceLabel?: string
  deliveryDate?: string
  warrantyUntil?: string
  /** Het toestel waar het verslag en de onderdelen aan hangen. */
  isMain: boolean
}

/** Hoe een toestel heet op het scherm, ook wanneer het merk niet herkend is. */
export function deviceLabel(device: BonDevice): string {
  const naam = [device.brand, device.model].filter(Boolean).join(' ').trim()
  // Geen merk en geen model: dan is de ruwe regel van de bon nog altijd beter
  // dan een lege knop — dezelfde gedachte als achter `customerLabel`.
  return naam || device.sourceLabel?.trim() || 'Toestel zonder naam'
}

export function useBonDevices(workOrderId: string): BonDevice[] {
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

  return devices
}
