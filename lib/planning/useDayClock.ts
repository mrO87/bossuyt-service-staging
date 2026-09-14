/**
 * De dagklok van één dag, in het scherm.
 *
 * Tikken moet meteen te zien zijn en mag nooit verloren gaan. Dus: de nieuwe
 * tijd staat direct in de toestand, de schrijfactie gaat in de wachtrij, en die
 * vertrekt zodra er verbinding is. Precies hetzelfde pad als een sleep in de
 * planning, en om dezelfde reden — het knopje wordt getikt op het moment dat je
 * in de wagen stapt, en daar is lang niet altijd bereik.
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { enqueuePendingWrite } from '@/lib/idb'
import { syncPendingWrites } from '@/lib/sync'

export interface DayClock {
  day: string
  /** ISO-tijdstip, of null zolang er niet vertrokken is. */
  startedAt: string | null
  /** ISO-tijdstip, of null zolang de dag niet afgesloten is. */
  endedAt: string | null
}

/** Minuten sinds middernacht van een ISO-tijdstip, op de klok van de kijker. */
export function minutesOfDay(iso: string | null): number | null {
  if (!iso) return null
  const moment = new Date(iso)
  if (Number.isNaN(moment.getTime())) return null
  return moment.getHours() * 60 + moment.getMinutes()
}

/** Een uur op een dag, als ISO-tijdstip. `HH:MM` + `YYYY-MM-DD`. */
export function isoForTimeOn(day: string, hhmm: string): string {
  const [uur, minuut] = hhmm.split(':').map(Number)
  const moment = new Date(`${day}T00:00:00`)
  moment.setHours(uur || 0, minuut || 0, 0, 0)
  return moment.toISOString()
}

const LEEG = (day: string): DayClock => ({ day, startedAt: null, endedAt: null })

export function useDayClock(technicianId: string, day: string) {
  /**
   * Wat er geladen is, mét de dag waar het bij hoort.
   *
   * Die dag hoort erbij en is geen versiering: zonder dat merkje zou de klok
   * van gisteren een tel lang naast de planning van vandaag staan, tussen het
   * wisselen van dag en het binnenkomen van het antwoord. En omdat de dag
   * meereist, hoeft dit niet leeggemaakt te worden bij het begin van het
   * effect — wat de lus zou zijn die React terecht afkeurt.
   */
  const [geladen, setGeladen] = useState<DayClock | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(`/api/day-clock?technicianId=${encodeURIComponent(technicianId)}&date=${day}`)
      .then(r => (r.ok ? r.json() : { days: [] }))
      .then((data: { days?: DayClock[] }) => {
        if (cancelled) return
        setGeladen(data.days?.find(d => d.day === day) ?? LEEG(day))
      })
      // Offline: dan blijft de klok leeg staan tot er weer verbinding is.
      .catch(() => { if (!cancelled) setGeladen(LEEG(day)) })

    return () => { cancelled = true }
  }, [technicianId, day])

  const hoortErbij = geladen?.day === day
  const clock = hoortErbij ? geladen! : LEEG(day)
  const loading = !hoortErbij

  /**
   * Eén van de twee uren zetten, of weghalen met `null`.
   *
   * Alleen het uur dat verandert gaat mee in de payload. De server laat wat er
   * niet in staat met rust, zodat een telefoon die enkel het vertrek meldt de
   * thuiskomst van een andere telefoon niet wist.
   */
  const zet = useCallback(async (welk: 'startedAt' | 'endedAt', iso: string | null) => {
    setGeladen(huidig => ({ ...(huidig?.day === day ? huidig : LEEG(day)), [welk]: iso }))

    await enqueuePendingWrite({
      type: 'set_day_clock',
      createdAt: new Date().toISOString(),
      payload: { technicianId, day, [welk]: iso },
    })

    if (typeof navigator === 'undefined' || navigator.onLine) {
      await syncPendingWrites().catch(() => null)
    }
  }, [technicianId, day])

  return { clock, loading, zet }
}
