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
  DndContext, MeasuringStrategy, PointerSensor, TouchSensor, closestCenter, useDroppable,
  useSensor, useSensors,
  type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { useSettings, getStartCoordinatesFromSettings } from '@/lib/hooks/useSettings'
import { useTasks } from '@/lib/task-store'
import { clockToMinutes, UNPAID_BREAK_MINUTES } from '@/lib/planning/workSchedule'
import { computeDaySchedule, type DayScheduleResult, type TravelLookup } from '@/lib/planning/daySchedule'
import { toLocalDateStr, weekDaysAround } from '@/lib/planning/weekDays'
import { resolveLeg, sharedTravelCache } from '@/lib/routing/travelCache'
import { dayDroppableId, resolveWeekDrop } from '@/lib/planning/weekDropIntent'
import { conflictMessage, orderByHour, snapDuration, snapToStep } from '@/lib/planning/pinnedHour'
import { buildPlanningWrite } from '@/lib/planning/planningWrite'
import {
  enqueuePendingWrite,
  enqueuePlanningWrite,
  getPlannedInterventions,
  updateInterventionSequence,
  upsertIntervention,
} from '@/lib/idb'
import { syncPendingWrites } from '@/lib/sync'
import { ViewSwitcher } from '@/components/planning/ViewSwitcher'
import { OpenPool } from '@/components/DayView/OpenPool'
import type { Intervention } from '@/types'
import type { ReactNode } from 'react'
import { RESIZE_PREFIX, WeekGrid } from './WeekGrid'

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

/** Waar elk blok stond toen de vinger neerkwam. */
type SpanMap = Record<string, { startMinutes: number; endMinutes: number } | undefined>

/**
 * Wat er onder de vinger gebeurt, terwijl hij nog niet losgelaten is.
 *
 * Dit is de enige toestand in dit scherm die niets met de database te maken
 * heeft: ze bestaat tussen aanraken en loslaten, en verdwijnt daarna. De
 * berekende dag leest ze mee, zodat het rooster meebeweegt in plaats van te
 * wachten tot er iets bewaard is.
 *
 * `baseline` is de momentopname van bij het begin. Elke verschuiving wordt
 * daartegen afgemeten en nooit tegen wat er nú staat — dat laatste beweegt
 * immers mee, en dan zou het blok onder je vinger wegrennen omdat het zijn
 * eigen verplaatsing er telkens opnieuw bij optelt.
 */
type DragPreview =
  | {
      kind: 'move'
      id: string
      date: string
      /** Het uur waar het blok stond toen de sleep begon. */
      fromMinutes: number
      /** Het uur waar het nu staat, ingeklikt op het kwartier. */
      startMinutes: number
      baseline: SpanMap
    }
  | {
      kind: 'resize'
      id: string
      date: string
      /** De duur waarmee de sleep begon. */
      fromMinutes: number
      /** De duur die de vinger nu aangeeft, ingeklikt op het kwartier. */
      minutes: number
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
  const [drag, setDrag] = useState<DragPreview | null>(null)

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
    () => days.map(day => {
      const dateStr = toLocalDateStr(day)
      let list = byDate[dateStr] ?? []

      // Tijdens het slepen rekent de dag mee onder de vinger: de rijtijden
      // verspringen, de vertrektijd schuift op, de arcering verschijnt. Zonder
      // dit sleep je blind en zie je pas na het loslaten wat je gedaan hebt.
      //
      // De volgorde volgt mee, want de rekenkern loopt de dag af in
      // lijstvolgorde. Ze wordt bepaald tegen de momentopname van bij het
      // begin van de sleep en niet tegen wat er nú getekend staat — anders
      // vergelijkt het blok zich met een positie die door hemzelf verschoven
      // is, en dan wisselen twee bonnen van plaats en weer terug bij elke
      // vingerbeweging.
      if (drag?.kind === 'move' && drag.date === dateStr && list.some(i => i.id === drag.id)) {
        const ordered = orderByHour(
          list.map(i => {
            const start = i.id === drag.id
              ? drag.startMinutes
              : drag.baseline[i.id]?.startMinutes ?? 0
            return { id: i.id, startMinutes: start, endMinutes: start + (i.estimatedMinutes ?? 0) }
          }),
        )
        const byId = new Map(list.map(i => [i.id, i]))
        list = ordered
          .map(id => byId.get(id))
          .filter((i): i is Intervention => Boolean(i))
      }

      return computeDaySchedule({
        departureMinutes,
        origin,
        jobs: list.map(i => ({
          id: i.id,
          estimatedMinutes: drag?.kind === 'resize' && drag.id === i.id
            ? drag.minutes
            : i.estimatedMinutes,
          at: typeof i.siteLat === 'number' && typeof i.siteLon === 'number'
            ? { lat: i.siteLat, lon: i.siteLon }
            : undefined,
          // Het enige uur dat deze app onthoudt. Ontbreekt het, dan rekent de
          // motor het uit zoals hij altijd deed. Tijdens een sleep telt het uur
          // waar de vinger nu staat, nog vóór er iets bewaard is.
          startMinutes: drag?.kind === 'move' && drag.id === i.id
            ? drag.startMinutes
            : i.plannedStartMinutes ?? null,
        })),
        travelBetween: lookupTravel,
        breakMinutes: UNPAID_BREAK_MINUTES,
      })
    }),
    [days, byDate, departureMinutes, origin, drag],
  )

  const interventionsById = useMemo(() => {
    const map: Record<string, Intervention> = {}
    for (const list of Object.values(byDate)) for (const i of list) map[i.id] = i
    return map
  }, [byDate])

  /**
   * Waar elk blok nú ligt, volgens de berekening.
   *
   * Slepen verschuift ten opzichte van dit uur en niet ten opzichte van de
   * bovenkant van de kolom: een bon die getekend staat op 08:22 en twee
   * kwartier naar beneden gaat, hoort op 09:00 te belanden — op het kwartier,
   * want dat is de stap waarmee gemikt wordt.
   */
  const spanOf = useMemo(() => {
    const map: Record<string, { startMinutes: number; endMinutes: number }> = {}
    for (const schedule of schedules) {
      for (const block of schedule.blocks) {
        if (block.kind === 'job' && block.interventionId) {
          map[block.interventionId] = {
            startMinutes: block.startMinutes,
            endMinutes: block.endMinutes,
          }
        }
      }
    }
    return map
  }, [schedules])

  /**
   * De botsingen in de zichtbare week, met genoeg erbij om ze te kunnen noemen.
   *
   * Ze worden getoond en niet geweigerd. Het uur is bewaard, de arcering staat
   * op het rooster, en de melding noemt de drie uitwegen — welke de juiste is,
   * weet alleen wie de klant gebeld heeft.
   */
  const conflicts = useMemo(
    () =>
      days.flatMap((day, index) =>
        schedules[index].conflicts.map(conflict => ({
          ...conflict,
          date: toLocalDateStr(day),
          customerName: (byDate[toLocalDateStr(day)] ?? [])
            .find(i => i.id === conflict.interventionId)?.customerName,
        })),
      ),
    [days, schedules, byDate],
  )

  /**
   * Dagen waarop het vertrekuur vóór de ingestelde start valt.
   *
   * Dat gebeurt alleen door een vastgezet uur op de eerste job: om er om 07:30
   * te staan moet je soms om 06:00 vertrekken. Het wordt niet geweigerd —
   * vroeger vertrekken kan echt — maar ongezien mag het niet gebeuren.
   */
  const earlyDepartures = useMemo(
    () =>
      days
        .map((day, index) => ({ day, depart: schedules[index].departFromOriginMinutes }))
        .filter((entry): entry is { day: Date; depart: number } =>
          entry.depart !== null && entry.depart < departureMinutes),
    [days, schedules, departureMinutes],
  )

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

    await flushQueue(dateStr)
  }

  /**
   * De wachtrij wegsturen, en daarna weten wat de server ervan vond.
   *
   * Twee dingen die allebei ontbraken, en die alleen samen werken.
   *
   * Het eerste: de weekweergave stuurde haar wachtrij nooit weg. Dat viel niet
   * op omdat de dagweergave hem leegt bij het openen (useDayData), dus vroeg of
   * laat vertrok alles. Maar de weekweergave leest van de server en niet uit
   * IndexedDB — wie hier iets versleept en herlaadt zonder ooit de dagweergave
   * te openen, zag zijn wijziging terugspringen naar wat de server nog dacht.
   *
   * Het tweede: na een geslaagde schrijfactie verhoogt de server het
   * versienummer van de dag, en dit scherm hield het oude vast. De tweede
   * handeling op rij stuurde dan een versie die niet meer bestond, kreeg een
   * 409, en werd weggegooid — het uur zetten lukte, het speldje erna niet, en
   * niets zei waarom. Met de hand gezien in de browser, niet beredeneerd.
   *
   * Alleen het versienummer wordt overgenomen. De rest van wat hier op het
   * scherm staat is net bevestigd door diezelfde geslaagde schrijfactie; de
   * hele dag overschrijven zou een sleep die ondertussen begonnen is ongedaan
   * maken.
   */
  async function flushQueue(dateStr: string) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return

    try {
      const result = await syncPendingWrites()
      if (result.synced === 0) return

      const fresh = await getPlannedInterventions(dateStr)
      const versions = new Map(fresh.map(i => [i.id, i.planningVersion]))

      setByDate(current => ({
        ...current,
        [dateStr]: (current[dateStr] ?? []).map(i =>
          versions.has(i.id) ? { ...i, planningVersion: versions.get(i.id) } : i),
      }))
    } catch {
      // De schrijfactie staat in de wachtrij en vertrekt bij de volgende
      // gelegenheid. Offline hoort hier niets van te merken.
    }
  }

  /**
   * Een bon op een uur zetten, of dat uur weer weghalen.
   *
   * Eén weg voor alle drie de handelingen — slepen, het speldje, het kruisje —
   * omdat ze onderaan hetzelfde doen: het veld wijzigen, de dag opnieuw in de
   * juiste volgorde zetten, en die hele dag wegschrijven. Bij een fout gaat het
   * scherm terug naar wat het was, zoals overal in dit bestand.
   */
  async function changeHour(
    dateStr: string,
    workOrderId: string,
    patch: { plannedStartMinutes?: number; startIsAppointment: boolean },
  ) {
    const previousDay = byDate[dateStr] ?? []
    const target = previousDay.find(i => i.id === workOrderId)
    if (!target) return

    const updated: Intervention = { ...target, ...patch }

    // De volgorde volgt het uur: de lijstvolgorde is wat computeDaySchedule
    // afloopt, dus een bon die naar de avond gaat hoort ook achteraan te staan.
    // Wat geen eigen uur heeft, blijft liggen waar de berekening het zette.
    const withNewHour = previousDay.map(i => (i.id === workOrderId ? updated : i))
    const ordered = orderByHour(
      withNewHour.map(i => {
        const span = spanOf[i.id]
        const start = i.id === workOrderId && patch.plannedStartMinutes !== undefined
          ? patch.plannedStartMinutes
          : span?.startMinutes ?? 0
        return { id: i.id, startMinutes: start, endMinutes: start + (i.estimatedMinutes ?? 0) }
      }),
    )
    const next = ordered
      .map(id => withNewHour.find(i => i.id === id))
      .filter((i): i is Intervention => Boolean(i))

    setByDate(current => ({ ...current, [dateStr]: next }))

    try {
      await upsertIntervention(updated)
      await persistDay(dateStr, next)
    } catch {
      setByDate(current => ({ ...current, [dateStr]: previousDay }))
      setRefusal('Het uur bewaren is niet gelukt. Probeer het opnieuw.')
    }
  }

  /**
   * Het speldje omzetten.
   *
   * Staat er nog geen uur op, dan legt dit het uur vast waar de bon nu getekend
   * staat. Let op het verschil met slepen: daar klikt het uur in op het
   * kwartier, hier niet. Slepen ís verplaatsen, en dan helpt een raster je
   * mikken. Markeren is zeggen dat het uur dat er staat afgesproken is — dan
   * mag 08:39 niet stilletjes 08:45 worden, want dat verschuift een afspraak
   * die iemand net bevestigd heeft.
   *
   * Losmaken laat het uur staan: er verspringt niets onder je handen, het is
   * alleen geen afspraak meer.
   */
  async function togglePin(workOrderId: string) {
    setRefusal(null)
    const dateStr = dayOf[workOrderId]
    if (!dateStr) return

    const current = (byDate[dateStr] ?? []).find(i => i.id === workOrderId)
    if (!current) return

    if (current.startIsAppointment) {
      await changeHour(dateStr, workOrderId, { startIsAppointment: false })
      return
    }

    const shown = current.plannedStartMinutes ?? spanOf[workOrderId]?.startMinutes
    if (shown === undefined) return

    await changeHour(dateStr, workOrderId, {
      plannedStartMinutes: Math.round(shown),
      startIsAppointment: true,
    })
  }

  /** Het uur weghalen: vanaf nu weer berekend, zoals elke andere bon. */
  async function clearHour(workOrderId: string) {
    setRefusal(null)
    const dateStr = dayOf[workOrderId]
    if (!dateStr) return
    await changeHour(dateStr, workOrderId, {
      plannedStartMinutes: undefined,
      startIsAppointment: false,
    })
  }

  /**
   * De geschatte duur van een bon, uitgerekt met de vinger.
   *
   * Schrijft naar `estimatedMinutes` — hetzelfde veld als het duurbolletje op
   * de kaart, en via dezelfde wachtrij (`update_estimate`). Er komt dus niets
   * bij in het model; dit is een tweede manier om aan een bestaande schatting
   * te komen, met een gebaar in plaats van een getal.
   */
  async function resizeJob(workOrderId: string, next: number) {
    const dateStr = dayOf[workOrderId]
    if (!dateStr) return

    const previousDay = byDate[dateStr] ?? []
    const target = previousDay.find(i => i.id === workOrderId)
    if (!target) return

    if (next === target.estimatedMinutes) return

    const updated: Intervention = { ...target, estimatedMinutes: next }
    setByDate(current => ({
      ...current,
      [dateStr]: (current[dateStr] ?? []).map(i => (i.id === workOrderId ? updated : i)),
    }))

    try {
      await upsertIntervention(updated)
      await enqueuePendingWrite({
        type: 'update_estimate',
        createdAt: new Date().toISOString(),
        payload: { workOrderId, estimatedMinutes: next },
      })
      await flushQueue(dateStr)
    } catch {
      setByDate(current => ({ ...current, [dateStr]: previousDay }))
      setRefusal('De duur bewaren is niet gelukt. Probeer het opnieuw.')
    }
  }

  /** Van pixels naar minuten, met dezelfde schaal waarmee getekend is. */
  function toMinutes(pixels: number): number {
    return (pixels * 60) / pixelsPerHour
  }

  /**
   * De vinger komt neer: leg vast waar alles stond.
   *
   * Alles wat hierna gebeurt wordt tegen deze momentopname afgemeten. Zie de
   * toelichting bij DragPreview voor waarom dat moet.
   */
  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id)
    const resizing = activeId.startsWith(RESIZE_PREFIX)
    const id = resizing ? activeId.slice(RESIZE_PREFIX.length) : activeId

    const date = dayOf[id]
    if (!date) return          // uit de pool gesleept: er is nog geen uur om te tonen

    if (resizing) {
      const minutes = (byDate[date] ?? []).find(i => i.id === id)?.estimatedMinutes ?? 0
      setDrag({ kind: 'resize', id, date, fromMinutes: minutes, minutes })
      return
    }

    const from = spanOf[id]?.startMinutes
    if (from === undefined) return

    setDrag({ kind: 'move', id, date, fromMinutes: from, startMinutes: from, baseline: { ...spanOf } })
  }

  /**
   * De vinger beweegt.
   *
   * De toestand wordt alleen bijgewerkt wanneer het ingeklikte kwartier écht
   * verandert — zo'n 13 px op de standaardhoogte. Daardoor tekent het scherm
   * een handvol keer per sleep opnieuw in plaats van bij elke pixel, en dat is
   * wat dit op een telefoon bruikbaar houdt. Het prototype leerde die les op de
   * harde manier: de eerste versie bouwde bij elke beweging de hele kalender
   * opnieuw op en liep meteen vast.
   */
  function handleDragMove(event: DragMoveEvent) {
    setDrag(current => {
      if (!current) return current

      if (current.kind === 'resize') {
        const minutes = snapDuration(current.fromMinutes + toMinutes(event.delta.y))
        return minutes === current.minutes ? current : { ...current, minutes }
      }

      const startMinutes = snapToStep(current.fromMinutes + toMinutes(event.delta.y))
      return startMinutes === current.startMinutes ? current : { ...current, startMinutes }
    })
  }

  async function handleDragEnd(event: DragEndEvent) {
    setRefusal(null)
    const preview = drag
    setDrag(null)

    // Uitrekken eindigt in dezelfde afhandeling als verslepen, want het is
    // dezelfde sleepmotor. Het id zegt welk van de twee het was, en dit moet
    // vóór resolveWeekDrop staan: die kijkt naar waar je losliet, en bij
    // uitrekken zegt dat niets.
    const activeId = String(event.active.id)
    if (activeId.startsWith(RESIZE_PREFIX)) {
      // Bewaar precies wat er onder de vinger stond. Opnieuw uitrekenen uit de
      // sleepafstand zou hetzelfde getal moeten geven, maar "zou moeten" is hoe
      // een scherm en een database uit elkaar gaan lopen.
      if (preview?.kind === 'resize') await resizeJob(preview.id, preview.minutes)
      return
    }

    const intent = resolveWeekDrop({
      activeId: String(event.active.id),
      overId: event.over ? String(event.over.id) : null,
      dayOf,
      poolIds: pool.map(i => i.id),
      statusById,
      // De momentopname van bij het begin van de sleep, niet wat er nú staat.
      // `spanOf` beweegt tijdens het slepen mee met het voorbeeld, en daartegen
      // afmeten zou de verplaatsing dubbel tellen: het blok zou bij het
      // loslaten verder springen dan waar het onder je vinger stond.
      startMinutesOf: Object.fromEntries(
        Object.entries(preview?.kind === 'move' ? preview.baseline : spanOf)
          .map(([id, span]) => [id, span?.startMinutes]),
      ),
      // Van pixels naar minuten met dezelfde schaal waarmee getekend is. Zonder
      // dit zou een sleep van een centimeter iets anders betekenen bij elke
      // stand van de hoogteschuif.
      deltaMinutes: toMinutes(event.delta.y),
    })

    if (intent.kind === 'none') {
      if (intent.reason === 'het werk is al begonnen') {
        setRefusal('Deze werkbon is al gestart — zijn uur ligt vast en hij blijft op de dag staan.')
      }
      return
    }

    // Op zijn eigen dag losgelaten: geen verplaatsing, maar een uur. Waar je
    // hem neerzet, daar staat hij — ook als dat niet kan. Dan komt er arcering
    // over het onmogelijke stuk en blijft het aan de gebruiker.
    if (intent.kind === 'set_hour') {
      await changeHour(intent.date, intent.workOrderId, {
        plannedStartMinutes: intent.startMinutes,
        // Slepen zet een uur, geen afspraak. Het speldje is een aparte
        // handeling, en dat onderscheid is de hele reden dat het bestaat.
        startIsAppointment: Boolean(
          (byDate[intent.date] ?? []).find(i => i.id === intent.workOrderId)?.startIsAppointment,
        ),
      })
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
        // Een uur zonder dag betekent niets. savePlanningSnapshot wist het aan
        // de serverkant; hier moet het scherm hetzelfde zeggen, anders toont de
        // pool een uur dat nergens meer bestaat.
        plannedStartMinutes: undefined,
        startIsAppointment: false,
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
        plannedStartMinutes: undefined,
        startIsAppointment: false,
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
    // Een uur hoort bij een dag: 09:00 op dinsdag is niet 09:00 op woensdag,
    // want de rit ernaartoe vertrekt van een andere plaats in een andere
    // planning. Naar een andere dag slepen laat het uur dus los — aan beide
    // kanten, hier en in savePlanningSnapshot.
    const scheduled: Intervention = {
      ...moving,
      plannedDate: `${intent.toDate}T00:00:00.000Z`,
      plannedStartMinutes: undefined,
      startIsAppointment: false,
    }

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
      const released: Intervention = {
        ...moving,
        plannedDate: undefined,
        plannedStartMinutes: undefined,
        startIsAppointment: false,
      }
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

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          // Blijf de dagkolommen opmeten terwijl er gesleept wordt.
          //
          // Standaard meet dnd-kit ze één keer op, bij het begin van de sleep.
          // Dat ging goed zolang er tijdens een sleep niets opnieuw getekend
          // werd — maar nu rekent de dag mee onder de vinger, en dan raakt die
          // ene meting achterop: bij het loslaten vond dnd-kit geen kolom meer
          // (`over` was null), het uur werd nergens heen geschreven en het blok
          // sprong terug naar waar het stond. Nagemeten in de browser, want op
          // het scherm zag het slepen er intussen perfect uit.
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDrag(null)}
        >
          {refusal && (
            <div className="mb-3 rounded-xl border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-xs text-ink">
              {refusal}
            </div>
          )}

          {/*
            De botsingen. Ze blijven staan tot de gebruiker ze oplost — de app
            schuift niets vanzelf op, want dan glijdt een bon weg onder je
            vinger en lijkt alles aan elkaar te hangen. Elke melding noemt alle
            drie de uitwegen, en de derde staat er ook als knop bij: die is
            anders nergens te vinden zonder de bon aan te raken.
          */}
          {conflicts.map(conflict => (
            <div
              key={`${conflict.date}-${conflict.interventionId}`}
              role="alert"
              className="mb-3 rounded-xl border-l-4 border-brand-red bg-brand-red/10 px-3 py-2 text-xs text-ink"
            >
              <p>{conflictMessage(conflict.customerName)}</p>
              <p className="mt-1 tabular-nums text-ink-soft">
                {dayLabel(conflict.date)} · ten vroegste {hhmm(conflict.earliestMinutes)}
              </p>
              <button
                type="button"
                onClick={() => clearHour(conflict.interventionId)}
                className="mt-2 min-h-11 rounded-lg border border-brand-red/40 px-3 text-xs font-semibold text-brand-red active:bg-brand-red/10"
              >
                Vast uur weghalen
              </button>
            </div>
          ))}

          {earlyDepartures.map(({ day, depart }) => (
            <div
              key={toLocalDateStr(day)}
              className="mb-3 rounded-xl border-l-4 border-brand-orange bg-brand-orange/10 px-3 py-2 text-xs text-ink"
            >
              <b>Vertrek om {hhmm(depart)}</b> op {dayLabel(toLocalDateStr(day))} — vroeger dan het
              ingestelde startuur. Om die eerste klant op zijn uur te halen, moet er eerder
              vertrokken worden.
            </div>
          ))}

          <WeekGrid
            days={days}
            schedules={schedules}
            interventionsById={interventionsById}
            pixelsPerHour={pixelsPerHour}
            selectedDate={new Date()}
            onOpenIntervention={id => router.push(`/interventions/${id}`)}
            onTogglePin={id => { void togglePin(id) }}
            onClearHour={id => { void clearHour(id) }}
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

function hhmm(minutes: number): string {
  const rounded = Math.round(minutes)
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`
}

/** "ma 14 sep" — genoeg om te weten welke dag de melding bedoelt. */
function dayLabel(dateStr: string): string {
  return new Intl.DateTimeFormat('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(`${dateStr}T12:00:00`))
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
