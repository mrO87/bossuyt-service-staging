/**
 * WeekView — de week als agenda, met de open pool eronder.
 *
 * Haalt per dag de planning op en laat computeDaySchedule er kloktijden van
 * maken. Slepen verplaatst een werkbon tussen de pool en een dag, of van dag
 * naar dag — die laatste richting kent de dagweergave niet en is twee
 * momentopnames na elkaar, niet één verplaatsing (zie handleDragEnd).
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
import { resolveLeg, sharedTravelCache } from '@/lib/routing/travelCache'
import { dayDroppableId, resolveWeekDrop } from '@/lib/planning/weekDropIntent'
import { buildPlanningWrite } from '@/lib/planning/planningWrite'
import { enqueuePlanningWrite, updateInterventionSequence, upsertIntervention } from '@/lib/idb'
import { ViewSwitcher } from '@/components/planning/ViewSwitcher'
import { OpenPool } from '@/components/DayView/OpenPool'
import type { Intervention } from '@/types'
import type { ReactNode } from 'react'
import { WeekGrid } from './WeekGrid'

/**
 * Dezelfde vier lagen als de dagweergave, via dezelfde gedeelde cache — zodat
 * een job nooit het ene uur op de week laat zien en het andere op de dag. De
 * weekweergave vraagt zelf nooit iets aan de routeringsdienst; ze leest alleen
 * wat de dagweergave (de enige die `/api/route/daily` aanroept) al heeft
 * geleerd. Is die rit nog nooit opgevraagd, dan valt dit terug op de schatting
 * — precies zoals vroeger.
 */
const lookupTravel: TravelLookup = (from, to) => {
  const leg = resolveLeg(sharedTravelCache, from, to)
  return leg.provider === 'unknown' ? null : leg.minutes
}

export default function WeekView() {
  const router = useRouter()
  const { settings } = useSettings()
  const { currentUser } = useTasks()

  const [anchor, setAnchor] = useState(() => new Date())
  const [pixelsPerHour, setPixelsPerHour] = useState(54)
  const [byDate, setByDate] = useState<Record<string, Intervention[]>>({})
  const [pool, setPool] = useState<Intervention[]>([])
  const [poolVisible, setPoolVisible] = useState(true)
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
      poolIds: pool.map(i => i.id),
      statusById,
    })

    if (intent.kind === 'none') {
      if (intent.reason === 'het werk is al begonnen') {
        setRefusal('Deze werkbon is al gestart en blijft op de dag staan.')
      }
      return
    }

    const all = [...Object.values(byDate).flat(), ...pool]
    const moving = all.find(i => i.id === intent.workOrderId)
    if (!moving) return

    if (intent.kind === 'unschedule') {
      const previousDay = byDate[intent.fromDate] ?? []
      const previousPool = pool
      const rest = previousDay.filter(i => i.id !== moving.id)
      const released: Intervention = {
        ...moving,
        plannedDate: undefined,
        status: moving.status === 'gepland' || moving.status === 'onderweg' ? 'aangemaakt' : moving.status,
      }

      setByDate(current => ({ ...current, [intent.fromDate]: rest }))
      setPool(current => [released, ...current])

      try {
        await persistDay(intent.fromDate, rest, released)
      } catch {
        // Nog niets is gelukt: zet de dag en de pool terug zoals ze waren.
        setByDate(current => ({ ...current, [intent.fromDate]: previousDay }))
        setPool(previousPool)
        setRefusal('Verplaatsen is niet gelukt. Probeer het opnieuw.')
      }
      return
    }

    if (intent.kind === 'schedule') {
      const previousDay = byDate[intent.toDate] ?? []
      const previousPool = pool
      const scheduled: Intervention = {
        ...moving,
        plannedDate: `${intent.toDate}T00:00:00.000Z`,
        status: moving.status === 'aangemaakt' ? 'gepland' : moving.status,
      }
      const target = [...previousDay, scheduled]

      setPool(current => current.filter(i => i.id !== moving.id))
      setByDate(current => ({ ...current, [intent.toDate]: target }))

      try {
        await persistDay(intent.toDate, target, scheduled)
      } catch {
        // Nog niets is gelukt: zet de dag en de pool terug zoals ze waren.
        setByDate(current => ({ ...current, [intent.toDate]: previousDay }))
        setPool(previousPool)
        setRefusal('Verplaatsen is niet gelukt. Probeer het opnieuw.')
      }
      return
    }

    // move: de oude dag eerst. Mislukt de tweede schrijfbeweging, dan staat de
    // bon in de pool — vervelend, maar beter dan op twee dagen tegelijk. Het
    // scherm volgt dezelfde volgorde: elke schrijfbeweging wordt pas op het
    // scherm gezet nadat de vorige echt gelukt is, nooit vooruitlopend op een
    // schrijfbeweging die nog kan mislukken — anders lopen scherm en
    // IndexedDB uiteen zodra er iets misgaat.
    const fromList = byDate[intent.fromDate] ?? []
    const without = fromList.filter(i => i.id !== moving.id)
    const scheduled: Intervention = { ...moving, plannedDate: `${intent.toDate}T00:00:00.000Z` }

    setByDate(current => ({ ...current, [intent.fromDate]: without }))

    try {
      await persistDay(intent.fromDate, without)
    } catch {
      // Nog niets is gelukt: zet de oude dag terug zoals hij was.
      setByDate(current => ({ ...current, [intent.fromDate]: fromList }))
      setRefusal('Verplaatsen is niet gelukt. Probeer het opnieuw.')
      return
    }

    const target = [...(byDate[intent.toDate] ?? []), scheduled]
    setByDate(current => ({ ...current, [intent.toDate]: target }))

    try {
      await persistDay(intent.toDate, target, scheduled)
    } catch {
      // De oude dag is al bijgewerkt; er terug naartoe zou een derde
      // schrijfbeweging vergen die evengoed kan mislukken. In plaats daarvan
      // volgt het scherm de bon naar waar hij werkelijk staat: op geen enkele
      // dag, dus de pool — de vluchtroute die de schrijfvolgorde bewust openhoudt.
      const released: Intervention = { ...moving, plannedDate: undefined }
      setByDate(current => ({
        ...current,
        [intent.toDate]: (current[intent.toDate] ?? []).filter(i => i.id !== scheduled.id),
      }))
      setPool(current => [released, ...current])
      try {
        await upsertIntervention(released)
      } catch {
        // Best-effort: the screen already shows the bon back in the pool, and
        // the user needs to hear that the move failed regardless of whether
        // this recovery write itself reached IndexedDB.
      }
      setRefusal('Verplaatsen niet volledig gelukt — de werkbon staat terug in de pool.')
    }
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
      {/* De titel is de knop naar de andere weergaven — zie ViewSwitcher. De
          losse "← Dag" die hier stond is daarmee overbodig: terug naar de dag
          is nu één van de keuzes in de lijst, en niet langer een aparte weg. */}
      <header className="flex items-center gap-3 bg-brand-dark px-4 py-3">
        <div>
          <p className="text-sm font-bold leading-tight text-white">bossuyt</p>
          <ViewSwitcher current="week" />
        </div>
      </header>

      <div className="flex items-center justify-between border-b border-brand-mid bg-brand-dark px-4 pb-2">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          className="h-11 w-11 rounded-full text-ink-soft active:bg-brand-mid/40"
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
          className="h-11 w-11 rounded-full text-ink-soft active:bg-brand-mid/40"
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
            visible={poolVisible}
            onToggleVisible={() => setPoolVisible(v => !v)}
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
