/**
 * WeekView — de week als agenda, met de open pool eronder.
 *
 * Haalt per dag de planning op en laat computeDaySchedule er kloktijden van
 * maken. In deze taak is alles alleen-lezen; het slepen komt in Task 3.
 */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSettings, getStartCoordinatesFromSettings } from '@/lib/hooks/useSettings'
import { useTasks } from '@/lib/task-store'
import { clockToMinutes, UNPAID_BREAK_MINUTES } from '@/lib/planning/workSchedule'
import { computeDaySchedule, type DayScheduleResult, type TravelLookup } from '@/lib/planning/daySchedule'
import { toLocalDateStr, weekDaysAround } from '@/lib/planning/weekDays'
import { estimateTravel } from '@/lib/routing/estimateTravel'
import { knownRoute } from '@/lib/routing/knownRoutes'
import type { Intervention } from '@/types'
import { WeekGrid } from './WeekGrid'

/**
 * Dezelfde lagen als de dagweergave, minus de cache: die leeft in
 * useRouteTimeline en hoort niet in twee componenten tegelijk te staan. Voor de
 * weekweergave zijn geschatte tijden genoeg — het gaat om overzicht, niet om de
 * minuut.
 */
const lookupTravel: TravelLookup = (from, to) => {
  if (!from || !to) return null
  const pinned = knownRoute(from, to)
  if (pinned) return pinned.minutes
  const estimated = estimateTravel(from, to)
  return estimated ? estimated.minutes : null
}

export default function WeekView() {
  const router = useRouter()
  const { settings } = useSettings()
  const { currentUser } = useTasks()

  const [anchor, setAnchor] = useState(() => new Date())
  const [pixelsPerHour, setPixelsPerHour] = useState(54)
  const [byDate, setByDate] = useState<Record<string, Intervention[]>>({})
  const [pool, setPool] = useState<Intervention[]>([])

  const days = useMemo(() => weekDaysAround(anchor), [anchor])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const results = await Promise.all(
        days.map(async day => {
          const date = toLocalDateStr(day)
          try {
            const res = await fetch(`/api/sync/today?technicianId=${currentUser.id}&date=${date}`)
            if (!res.ok) return { date, planned: [] as Intervention[], open: [] as Intervention[] }
            const data = await res.json() as { planned: Intervention[]; open: Intervention[] }
            return { date, planned: data.planned, open: data.open }
          } catch {
            return { date, planned: [] as Intervention[], open: [] as Intervention[] }
          }
        }),
      )

      if (cancelled) return
      const next: Record<string, Intervention[]> = {}
      for (const r of results) next[r.date] = r.planned
      setByDate(next)
      setPool(results[0]?.open ?? [])
    }

    void load()
    return () => { cancelled = true }
  }, [days, currentUser.id])

  const origin = useMemo(() => getStartCoordinatesFromSettings(settings), [settings])
  const departureMinutes = useMemo(() => clockToMinutes(settings.startTime), [settings.startTime])

  const schedules: DayScheduleResult[] = useMemo(
    () => days.map(day =>
      computeDaySchedule({
        departureMinutes,
        origin,
        jobs: (byDate[toLocalDateStr(day)] ?? []).map(i => ({
          id: i.id,
          estimatedMinutes: i.estimatedMinutes,
          at: typeof i.siteLat === 'number' && typeof i.siteLon === 'number'
            ? { lat: i.siteLat, lon: i.siteLon }
            : undefined,
        })),
        travelBetween: lookupTravel,
        breakMinutes: UNPAID_BREAK_MINUTES,
      }),
    ),
    [days, byDate, departureMinutes, origin],
  )

  const interventionsById = useMemo(() => {
    const map: Record<string, Intervention> = {}
    for (const list of Object.values(byDate)) for (const i of list) map[i.id] = i
    return map
  }, [byDate])

  function shiftWeek(weeks: number) {
    setAnchor(current => {
      const next = new Date(current)
      next.setDate(next.getDate() + weeks * 7)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex items-center justify-between bg-brand-dark px-4 py-3">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="text-xs font-semibold text-ink-soft active:opacity-70"
        >
          ← Dag
        </button>
        <p className="text-sm font-bold text-white">Weekplanning</p>
        <span className="w-10" />
      </header>

      <div className="flex items-center justify-between border-b border-brand-mid bg-brand-dark px-2 pb-2">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          className="h-9 w-9 rounded-full text-ink-soft active:bg-brand-mid/40"
          aria-label="Vorige week"
        >
          ‹
        </button>
        <p className="text-sm text-ink-soft">
          {days[0].getDate()} {monthName(days[0])} — {days[6].getDate()} {monthName(days[6])}
        </p>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          className="h-9 w-9 rounded-full text-ink-soft active:bg-brand-mid/40"
          aria-label="Volgende week"
        >
          ›
        </button>
      </div>

      <main className="px-4 py-4 pb-24">
        <label className="mb-2 flex items-center gap-3 text-xs text-ink-soft">
          Hoogte per uur
          <input
            id="week-zoom"
            type="range"
            min={34}
            max={96}
            step={2}
            value={pixelsPerHour}
            onChange={event => setPixelsPerHour(Number(event.target.value))}
            className="max-w-44 flex-1 accent-brand-orange"
          />
          <span className="tabular-nums">{pixelsPerHour} px</span>
        </label>

        <WeekGrid
          days={days}
          schedules={schedules}
          interventionsById={interventionsById}
          pixelsPerHour={pixelsPerHour}
          selectedDate={new Date()}
          onOpenIntervention={id => router.push(`/interventions/${id}`)}
        />

        <h2 className="mb-2 mt-8 text-sm font-bold uppercase tracking-wide text-ink">Open pool</h2>
        <p className="mb-3 text-xs text-ink-soft">{pool.length} job(s) zonder dag</p>
      </main>
    </div>
  )
}

function monthName(day: Date): string {
  return new Intl.DateTimeFormat('nl-BE', { month: 'short' }).format(day)
}
