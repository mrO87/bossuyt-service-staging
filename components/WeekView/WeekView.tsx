/**
 * WeekView — de week als agenda, met de open pool eronder.
 *
 * Haalt per dag de planning op en laat computeDaySchedule er kloktijden van
 * maken. In deze taak is alles alleen-lezen; het slepen komt in Task 3.
 */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, PointerSensor, TouchSensor, closestCenter, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useSettings, getStartCoordinatesFromSettings } from '@/lib/hooks/useSettings'
import { useTasks } from '@/lib/task-store'
import { clockToMinutes, UNPAID_BREAK_MINUTES } from '@/lib/planning/workSchedule'
import { computeDaySchedule, type DayScheduleResult, type TravelLookup } from '@/lib/planning/daySchedule'
import { toLocalDateStr, weekDaysAround } from '@/lib/planning/weekDays'
import { estimateTravel } from '@/lib/routing/estimateTravel'
import { knownRoute } from '@/lib/routing/knownRoutes'
import { dayDroppableId, resolveWeekDrop } from '@/lib/planning/weekDropIntent'
import { buildPlanningWrite } from '@/lib/planning/planningWrite'
import { enqueuePlanningWrite, updateInterventionSequence, upsertIntervention } from '@/lib/idb'
import { OpenPool } from '@/components/DayView/OpenPool'
import type { Intervention } from '@/types'
import type { ReactNode } from 'react'
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
  const [refusal, setRefusal] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

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

  const dayOf = useMemo(() => {
    const map: Record<string, string | undefined> = {}
    for (const [date, list] of Object.entries(byDate)) for (const i of list) map[i.id] = date
    return map
  }, [byDate])

  const statusById = useMemo(() => {
    const map: Record<string, Intervention['status']> = {}
    for (const i of [...Object.values(byDate).flat(), ...pool]) map[i.id] = i.status
    return map
  }, [byDate, pool])

  /**
   * Eén dag wegschrijven. savePlanningSnapshot beschrijft altijd precies één
   * dag, dus een verplaatsing tussen twee dagen is twee van deze.
   */
  async function persistDay(dateStr: string, list: Intervention[], moved?: Intervention) {
    await Promise.all(list.map((i, index) => updateInterventionSequence(i.id, index + 1)))
    if (moved) await upsertIntervention(moved)
    await enqueuePlanningWrite(
      buildPlanningWrite({
        day: list,
        actor: currentUser,
        technicianId: currentUser.id,
        date: new Date(`${dateStr}T12:00:00`),
        // `moved` only ever arrives from elsewhere (the pool, or the other
        // day in a move) — its planningVersion describes where it came from,
        // not this day, and must not raise this day's version.
        arrivingIds: moved ? [moved.id] : undefined,
      }),
    )
  }

  async function handleDragEnd(event: DragEndEvent) {
    setRefusal(null)

    const intent = resolveWeekDrop({
      activeId: String(event.active.id),
      overId: event.over ? String(event.over.id) : null,
      dayOf,
      statusById,
    })

    if (intent.kind === 'none') {
      if (intent.reason === 'het werk is al begonnen') {
        setRefusal('Deze werkbon is al gestart en blijft op zijn dag staan.')
      }
      return
    }

    const all = [...Object.values(byDate).flat(), ...pool]
    const moving = all.find(i => i.id === intent.workOrderId)
    if (!moving) return

    if (intent.kind === 'unschedule') {
      const rest = (byDate[intent.fromDate] ?? []).filter(i => i.id !== moving.id)
      const released: Intervention = {
        ...moving,
        plannedDate: undefined,
        status: moving.status === 'gepland' || moving.status === 'onderweg' ? 'aangemaakt' : moving.status,
      }
      setByDate(current => ({ ...current, [intent.fromDate]: rest }))
      setPool(current => [released, ...current])
      await persistDay(intent.fromDate, rest, released)
      return
    }

    if (intent.kind === 'schedule') {
      const target = [...(byDate[intent.toDate] ?? []), moving]
      const scheduled: Intervention = {
        ...moving,
        plannedDate: `${intent.toDate}T00:00:00.000Z`,
        status: moving.status === 'aangemaakt' ? 'gepland' : moving.status,
      }
      setPool(current => current.filter(i => i.id !== moving.id))
      setByDate(current => ({ ...current, [intent.toDate]: [...(current[intent.toDate] ?? []), scheduled] }))
      await persistDay(intent.toDate, target.map(i => (i.id === moving.id ? scheduled : i)), scheduled)
      return
    }

    // move: de oude dag eerst. Mislukt de tweede schrijfbeweging, dan staat de
    // bon in de pool — vervelend, maar beter dan op twee dagen tegelijk.
    const without = (byDate[intent.fromDate] ?? []).filter(i => i.id !== moving.id)
    const scheduled: Intervention = { ...moving, plannedDate: `${intent.toDate}T00:00:00.000Z` }
    const target = [...(byDate[intent.toDate] ?? []), scheduled]

    setByDate(current => ({ ...current, [intent.fromDate]: without, [intent.toDate]: target }))
    await persistDay(intent.fromDate, without)
    await persistDay(intent.toDate, target, scheduled)
  }

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

      <div className="flex items-center justify-between border-b border-brand-mid bg-brand-dark px-4 pb-2">
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

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {refusal && (
            <div className="mb-3 rounded-xl border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-xs text-ink">
              {refusal}
            </div>
          )}

          <WeekGrid
            days={days}
            schedules={schedules}
            interventionsById={interventionsById}
            pixelsPerHour={pixelsPerHour}
            selectedDate={new Date()}
            onOpenIntervention={id => router.push(`/interventions/${id}`)}
            renderDayColumn={(day, index, column) => (
              <DayDroppable dateStr={toLocalDateStr(day)}>{column}</DayDroppable>
            )}
          />

          <OpenPool
            interventions={pool}
            visible
            onToggleVisible={() => {}}
            onOpen={id => router.push(`/interventions/${id}`)}
          />
        </DndContext>
      </main>
    </div>
  )
}

function monthName(day: Date): string {
  return new Intl.DateTimeFormat('nl-BE', { month: 'short' }).format(day)
}

/**
 * Een hele dagkolom als doelwit, niet de blokken erin.
 *
 * Dat is wat 62 px bruikbaar maakt met een duim: je mikt op een dag, niet op
 * een uur. Het uur volgt uit de berekening, dus grof richten is genoeg.
 */
function DayDroppable({ dateStr, children }: { dateStr: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDroppableId(dateStr) })
  return (
    <div
      ref={setNodeRef}
      className={isOver ? 'bg-brand-orange/10 outline-2 outline-dashed outline-brand-orange' : ''}
    >
      {children}
    </div>
  )
}
