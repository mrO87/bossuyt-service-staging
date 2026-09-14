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
  DndContext, MeasuringStrategy, PointerSensor, TouchSensor, closestCenter, pointerWithin,
  useDroppable, useSensor, useSensors,
  type CollisionDetection,
  type DragEndEvent, type DragMoveEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { useSettings, getStartCoordinatesFromSettings } from '@/lib/hooks/useSettings'
import { useTasks } from '@/lib/task-store'
import { clockToMinutes, UNPAID_BREAK_MINUTES } from '@/lib/planning/workSchedule'
import { computeDaySchedule, type DayScheduleResult, type TravelLookup } from '@/lib/planning/daySchedule'
import { orderDayByClock } from '@/lib/planning/dayOrder'
import { actualVisitSpan } from '@/lib/planning/visitSpan'
import { toLocalDateStr, weekDaysAround } from '@/lib/planning/weekDays'
import { todayInBelgium } from '@/lib/planning/pastDays'
import { resolveLeg, sharedTravelCache } from '@/lib/routing/travelCache'
import { dayDroppableId, isWeekEdge, PAST_DAY_REASON, resolveWeekDrop } from '@/lib/planning/weekDropIntent'
import { conflictMessage, orderByHour, snapDuration, snapToStep } from '@/lib/planning/pinnedHour'
import { buildPlanningWrite } from '@/lib/planning/planningWrite'
import {
  enqueuePendingWrite,
  enqueuePlanningWrite,
  getPlannedInterventions,
  updateInterventionSequence,
  upsertIntervention,
  cacheDay,
  getOpenInterventions,
} from '@/lib/idb'
import { syncPendingWrites } from '@/lib/sync'
import { ViewSwitcher, dateFromSearch } from '@/components/planning/ViewSwitcher'
import { PoolBar } from '@/components/planning/PoolBar'
import { WeekEdges } from './WeekEdges'
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
      /**
       * Of de vinger nog boven de eigen dag hangt.
       *
       * Een uur zetten en naar een andere dag verhuizen zijn twee verschillende
       * bewegingen die met hetzelfde gebaar beginnen; welke het wordt, weet je
       * pas als je ziet waar de vinger uitkomt. Zolang hij boven de eigen dag
       * blijft, is het een uur en rekent die dag mee. Gaat hij naar een andere
       * kolom of naar de pool, dan is het een verhuizing en heeft dat uur geen
       * betekenis meer — dan hoort de oude dag stil te blijven staan.
       *
       * Zonder dit onderscheid herschikte de oude dag zich zodra je zijwaarts
       * begon te slepen: het uur klikte in op het kwartier, dat gold als een
       * vastgezet uur, en alle andere bonnen van die dag schoven mee voor een
       * bon die net aan het vertrekken was.
       */
      overOwnDay: boolean
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

/**
 * Welk doelwit er onder de sleep ligt.
 *
 * `closestCenter` alleen deugde hier niet, en het waarom is de moeite waard.
 * Die regel vergelijkt het middelpunt van het blok in je hand met het
 * middelpunt van elk doelwit — in beide richtingen. De weekranden lopen over de
 * volle hoogte en hun midden ligt dertig pixels hoger dan dat van een
 * dagkolom. Sleep je een blok bovenaan het rooster, dan is dat verticale
 * verschil groter dan het horizontale, en won de rand van maandag terwijl je
 * vinger gewoon op maandag stond. Gevolg: een bon naar maandag verplaatsen of
 * er een uur op zetten was onmogelijk — hij sprong een week terug.
 *
 * Nu beslist de vinger over de randen: een rand wint alleen wanneer je er
 * werkelijk op staat, en die strook is twintig pixels breed. Ligt de vinger er
 * niet op, dan spelen de randen niet mee en kiest `closestCenter` tussen de
 * dagen en de pool — precies zoals vóór de randen bestonden.
 */
const weekCollisionDetection: CollisionDetection = args => {
  const edges = args.droppableContainers.filter(c => isWeekEdge(String(c.id)))
  const rest = args.droppableContainers.filter(c => !isWeekEdge(String(c.id)))

  const onEdge = pointerWithin({ ...args, droppableContainers: edges })
  if (onEdge.length > 0) return onEdge

  return closestCenter({ ...args, droppableContainers: rest })
}

/**
 * Een `?date=`-waarde naar een datum, of `null` als er niets bruikbaars staat.
 *
 * Middag en niet middernacht: op middernacht kan een uurverschil of een
 * zomertijdsprong de datum in de vorige dag laten vallen.
 */
function parseDateParam(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export default function WeekView({ initialDate = null }: { initialDate?: string | null }) {
  const router = useRouter()
  const { settings } = useSettings()
  const { currentUser } = useTasks()

  // De dag die de dagweergave meegaf, als die er is — zie ViewSwitcher. Zonder
  // dit begon de week altijd bij vandaag, welke dag je in de dagplanning ook
  // open had staan.
  // Van de server meegegeven, niet uit de adresbalk gelezen: dan tekenen
  // server en browser dezelfde week. `dateFromSearch` blijft de terugval voor
  // wie hier landt zonder dat de pagina die datum kon doorgeven.
  const [anchor, setAnchor] = useState(
    // Niet `new Date()`: de eerste versie van deze pagina wordt op de server
    // gemaakt en die draait op UTC, dus tussen middernacht en twee uur 's
    // nachts stond het anker nog op gisteren. De week zag er hetzelfde uit —
    // gisteren en vandaag zitten meestal in dezelfde week — maar het ánker
    // reist mee naar de dagweergave als je van weergave wisselt. Wie 's nachts
    // naar de dagplanning sprong, landde zo op gisteren.
    () => parseDateParam(initialDate) ?? dateFromSearch() ?? new Date(`${todayInBelgium()}T12:00:00`),
  )
  const [pixelsPerHour, setPixelsPerHour] = useState(54)
  const [byDate, setByDate] = useState<Record<string, Intervention[]>>({})
  const [pool, setPool] = useState<Intervention[]>([])
  const [poolVisible, setPoolVisible] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  /**
   * Iets is gelukt, maar je ziet het niet meer staan.
   *
   * Apart van `refusal`, dat rood is. Een bon die naar volgende week schuift
   * verdwijnt uit beeld; zonder een woord erover lijkt dat hetzelfde als kwijt.
   */
  const [notice, setNotice] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragPreview | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  const days = useMemo(() => weekDaysAround(anchor), [anchor])

  /**
   * De dag die meereist naar de dagplanning.
   *
   * Hier stond `days[0]`, de maandag van de getoonde week. Dat klopt zolang je
   * naar een àndere week kijkt: daar bestaat geen "vandaag", en dan is de
   * maandag het begin van wat je ziet. In de week van vandaag was het fout —
   * wie op dinsdag van week naar dag wisselde kreeg maandag, en die maandag
   * bleef plakken, want hij reist mee als `?date=`.
   *
   * Dus: zit vandaag in de getoonde week, dan gaat vandaag mee. Anders de
   * maandag.
   */
  const overdrachtsdag = useMemo(() => {
    const vandaag = todayInBelgium()
    return days.find(day => toLocalDateStr(day) === vandaag) ?? days[0]
  }, [days])

  useEffect(() => {
    let cancelled = false

    /**
     * Eerst uit de cache, dan pas bij de server.
     *
     * Dit was één `fetch` per dag en verder niets. In een kelder zonder bereik
     * — en dat is waar dit gereedschap gebruikt wordt — gaf dat zeven lege
     * kolommen zonder één woord uitleg, alsof de week leeg gepland stond. De
     * dagweergave deed het al goed en las eerst uit IndexedDB; de week niet.
     *
     * De volgorde is bewust: wat in de cache staat verschijnt meteen, de
     * server overschrijft het zodra hij antwoordt. Lukt dat niet, dan blijft
     * staan wat er stond en zegt een melding waaróm het misschien oud is.
     */
    async function load() {
      const uitCache = await Promise.all(
        days.map(async day => {
          const date = toLocalDateStr(day)
          return { date, planned: await getPlannedInterventions(date) }
        }),
      )
      if (cancelled) return

      const eerst: Record<string, Intervention[]> = {}
      for (const r of uitCache) eerst[r.date] = r.planned
      setByDate(eerst)
      setPool(await getOpenInterventions())
      if (cancelled) return

      const results = await Promise.all(
        days.map(async day => {
          const date = toLocalDateStr(day)
          try {
            const res = await fetch(`/api/sync/today?technicianId=${currentUser.id}&date=${date}`)
            if (!res.ok) return { date, ok: false, planned: [] as Intervention[], open: [] as Intervention[] }
            const data = await res.json() as { planned: Intervention[]; open: Intervention[] }
            return { date, ok: true, planned: data.planned, open: data.open }
          } catch {
            return { date, ok: false, planned: [] as Intervention[], open: [] as Intervention[] }
          }
        }),
      )
      if (cancelled) return

      const geslaagd = results.filter(r => r.ok)

      // Niets binnen: laat staan wat de cache gaf en zeg dat het oud kan zijn.
      if (geslaagd.length === 0) {
        setNotice(
          uitCache.some(r => r.planned.length > 0)
            ? 'Geen verbinding — dit is de planning zoals ze het laatst opgehaald werd.'
            : 'Geen verbinding, en er staat nog niets in het geheugen van dit toestel.',
        )
        return
      }

      const next: Record<string, Intervention[]> = {}
      for (const r of results) next[r.date] = r.ok ? r.planned : (eerst[r.date] ?? [])
      setByDate(next)
      setPool(geslaagd[0]?.open ?? [])
      setNotice(
        geslaagd.length < results.length
          ? 'Een deel van de week kon niet opgehaald worden; die dagen komen uit het geheugen van dit toestel.'
          : null,
      )

      // Wegschrijven wat er binnenkwam, zodat de volgende keer zonder bereik
      // niet leeg is. Per dag, want één dag mag de andere zes niet wissen.
      await Promise.all(geslaagd.map(r => cacheDay(r.date, r.planned).catch(() => undefined)))
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
      if (
        drag?.kind === 'move'
        && drag.overOwnDay
        && drag.date === dateStr
        && list.some(i => i.id === drag.id)
      ) {
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

      const jobs = list.map(i => {
        // Een afgewerkte bon staat op de week zoals hij werkelijk gelopen is:
        // van het aankomstuur tot het vertrekuur. De raming was een schatting
        // vooraf; hierna is er iets beters. Zie `actualVisitSpan`.
        const gelopen = actualVisitSpan(i)

        return {
          id: i.id,
          estimatedMinutes: gelopen
            ? gelopen.minutes
            : drag?.kind === 'resize' && drag.id === i.id
              ? drag.minutes
              : i.estimatedMinutes,
          at: typeof i.siteLat === 'number' && typeof i.siteLon === 'number'
            ? { lat: i.siteLat, lon: i.siteLon }
            : undefined,
          // Het enige uur dat deze app onthoudt. Ontbreekt het, dan rekent de
          // motor het uit zoals hij altijd deed. Tijdens een sleep telt het uur
          // waar de vinger nu staat, nog vóór er iets bewaard is.
          //
          // Een afgewerkte bon staat op zijn echte aankomstuur, en dat gaat
          // vóór het geplande: wat er gebeurd is, wint van wat er bedoeld was.
          startMinutes: gelopen
            ? gelopen.startMinutes
            : drag?.kind === 'move' && drag.overOwnDay && drag.id === i.id
              ? drag.startMinutes
              : i.plannedStartMinutes ?? null,
          /**
           * Alleen een afgesproken uur eist zijn plaats op.
           *
           * Een bon die al gelopen is telt ook als afspraak: zijn uur is geen
           * voorkeur meer maar een feit, en dat mag de motor niet wegschuiven.
           * Idem tijdens een sleep — daar staat de vinger, en wat er onder de
           * vinger gebeurt moet zijn wat je ziet.
           */
          isAppointment:
            Boolean(gelopen) ||
            (drag?.kind === 'move' && drag.id === i.id) ||
            Boolean(i.startIsAppointment),
        }
      })

      // Dezelfde volgorde en dezelfde pauze als de dagweergave. Week en dag
      // mogen nooit een ander uur tonen voor dezelfde bon, en dat lukt alleen
      // als ze het uit dezelfde functie halen.
      //
      // Tijdens een sleep nemen we alleen de pauze over en niet de volgorde:
      // die is hierboven al bepaald tegen de momentopname van bij het begin
      // van de sleep, met opzet, want anders vergelijkt een blok zich met een
      // positie die het zelf verschoven heeft en wisselen twee bonnen bij elke
      // vingerbeweging van plaats.
      const volgensDeKlok = orderDayByClock({
        jobs,
        departureMinutes,
        origin,
        travelBetween: lookupTravel,
        breakMinutes: UNPAID_BREAK_MINUTES,
      })
      const byJobId = new Map(jobs.map(job => [job.id, job]))

      return computeDaySchedule({
        departureMinutes,
        origin,
        jobs: drag
          ? jobs
          : volgensDeKlok.order.map(id => byJobId.get(id)!),
        travelBetween: lookupTravel,
        breakMinutes: UNPAID_BREAK_MINUTES,
        breakBefore: volgensDeKlok.breakBefore,
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
   *
   * De naam van die eerste job hoort erbij. Deze meldingen gaan over de hele
   * zichtbare week en staan boven het rooster, dus eentje die over dinsdag gaat
   * verschijnt even goed terwijl je aan donderdag aan het werk bent. Zonder dag
   * en klant erin las hij als een uitspraak over wat je zonet deed — en dan
   * beweert hij dat je vroeger moet vertrekken terwijl je dag juist later
   * begint. Gemeld door de gebruiker, en het was precies dat.
   */
  const earlyDepartures = useMemo(
    () =>
      days
        .map((day, index) => {
          const firstJob = schedules[index].blocks.find(block => block.kind === 'job')
          const dateStr = toLocalDateStr(day)
          return {
            day,
            depart: schedules[index].departFromOriginMinutes,
            customerName: (byDate[dateStr] ?? [])
              .find(i => i.id === firstJob?.interventionId)?.customerName,
          }
        })
        .filter((entry): entry is { day: Date; depart: number; customerName: string | undefined } =>
          entry.depart !== null && entry.depart < departureMinutes),
    [days, schedules, byDate, departureMinutes],
  )

  /**
   * De meldingen bevriezen zolang er gesleept wordt.
   *
   * Ze staan boven het rooster, dus eentje die verschijnt of verdwijnt duwt het
   * hele rooster omhoog of omlaag — onder je vinger, precies terwijl je aan het
   * mikken bent. Op een telefoon voelt dat alsof de pagina wegspringt.
   *
   * Wegnemen tijdens het slepen is geen oplossing: dan springt het rooster bij
   * het aanraken van een bon waar al een melding bij stond. Daarom blijft
   * staan wat er stond, tot je loslaat. Het live signaal gaat niet verloren —
   * de arcering op het rooster zelf verschijnt en verdwijnt wél mee, en die
   * verandert de indeling niet.
   */
  const [frozenAlerts, setFrozenAlerts] = useState<{
    conflicts: typeof conflicts
    earlyDepartures: typeof earlyDepartures
  } | null>(null)

  const shownConflicts = frozenAlerts?.conflicts ?? conflicts
  const shownEarlyDepartures = frozenAlerts?.earlyDepartures ?? earlyDepartures

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
  async function persistDay(
    dateStr: string,
    list: Intervention[],
    moved?: Intervention,
    /**
     * De dag zoals de server hem nog kent, wanneer die verschilt van `list`.
     *
     * Nodig bij het vrijgeven: `list` is de dag zónder de vertrekkende bon,
     * terwijl de server hem nog meetelt in zijn versienummer. Zie de
     * toelichting bij buildPlanningWrite.
     */
    serverDay?: Intervention[],
  ) {
    await Promise.all(list.map((i, index) => updateInterventionSequence(i.id, index + 1)))
    if (moved) await upsertIntervention(moved)
    await enqueuePlanningWrite(
      buildPlanningWrite({
        day: list,
        actor: currentUser,
        technicianId: currentUser.id,
        date: new Date(`${dateStr}T12:00:00`),
        // Alleen wie áánkomt telt als aankomend — zie de uitleg in
        // PlanningBoard. Een vertrekkende bon draagt juist het versienummer dat
        // de server nog van deze dag kent; die buitensluiten maakte van elke
        // vrijgave een schrijfactie met versie 1.
        arrivingIds: moved && serverDay ? undefined : (moved ? [moved.id] : undefined),
        serverDay,
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
    setNotice(null)
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
    setNotice(null)
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
    // Leg de meldingen vast zoals ze nú staan; zie frozenAlerts.
    setFrozenAlerts({ conflicts, earlyDepartures })

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

    setDrag({
      kind: 'move',
      id,
      date,
      fromMinutes: from,
      startMinutes: from,
      baseline: { ...spanOf },
      // Je begint per definitie boven je eigen dag: daar lag de bon.
      overOwnDay: true,
    })
  }

  /**
   * De vinger komt boven een andere kolom, of gaat terug.
   *
   * Alleen dit zegt of het een uur wordt of een verhuizing; de sleepafstand
   * zegt daar niets over. Zodra de vinger de eigen dag verlaat, houdt de oude
   * dag op met meerekenen en blijft hij staan zoals hij stond — de bon is
   * immers aan het vertrekken, en zijn uur betekent daar niets meer.
   */
  function handleDragOver(event: DragOverEvent) {
    setDrag(current => {
      if (current?.kind !== 'move') return current

      const own = event.over?.id === dayDroppableId(current.date)
      return own === current.overOwnDay ? current : { ...current, overOwnDay: own }
    })
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

  /**
   * Een bon naar een dag sturen die hier niet geladen is.
   *
   * Gaat door `update_placement` en niet door een momentopname: die beschrijft
   * een hele dag, en van volgende week weten we niet wat erop staat. De server
   * zoekt dat zelf uit en hangt hem achteraan.
   *
   * Op het scherm verdwijnt hij gewoon uit deze week — dat is ook wat er
   * gebeurt. De melding onderaan zegt waar hij naartoe is, want een bon die
   * zonder woord verdwijnt, is een bon die je kwijt bent.
   */
  async function moveToDate(workOrderId: string, fromDate: string, toDate: string) {
    const previousDay = byDate[fromDate] ?? []
    const moving = previousDay.find(i => i.id === workOrderId)
    if (!moving) return

    const rest = previousDay.filter(i => i.id !== workOrderId)
    setByDate(current => ({ ...current, [fromDate]: rest }))

    try {
      await upsertIntervention({
        ...moving,
        plannedDate: `${toDate}T00:00:00.000Z`,
        plannedStartMinutes: undefined,
        startIsAppointment: false,
      })
      await enqueuePendingWrite({
        type: 'update_placement',
        createdAt: new Date().toISOString(),
        payload: {
          workOrderId,
          date: toDate,
          startMinutes: null,
          appointment: false,
          actorId: currentUser.id,
          actorRole: currentUser.role,
          // Wiens week hier getoond wordt. Een bon uit de pool draagt nog geen
          // technieker; zonder dit zou hij een dag krijgen die niemand ziet.
          technicianId: currentUser.id,
        },
      })
      await flushQueue(fromDate)
      setNotice(`${moving.customerName} staat nu op ${dayLabel(toDate)}.`)
    } catch {
      setByDate(current => ({ ...current, [fromDate]: previousDay }))
      setRefusal('Verplaatsen is niet gelukt. Probeer het opnieuw.')
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setRefusal(null)
    setNotice(null)
    const preview = drag
    setDrag(null)
    setFrozenAlerts(null)

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
      if (intent.reason === PAST_DAY_REASON) {
        setRefusal(
          'Die dag is voorbij. Een werkbon kan alleen op vandaag of later staan — '
          + 'sleep hem naar de pool als hij nog gepland moet worden.',
        )
      }
      return
    }

    // Naar een week die niet op het scherm staat.
    //
    // Dit is de enige uitkomst die niet via een momentopname kan: die beschrijft
    // een hele dag, en de dag van volgende week is niet geladen. Vandaar de
    // tweede deur — zie updatePlacement.
    if (intent.kind === 'shift_week') {
      await moveToDate(intent.workOrderId, intent.fromDate, intent.toDate)
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
        await persistDay(intent.fromDate, rest, released, previousDay)
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
      await persistDay(intent.fromDate, without, undefined, fromList)
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
          <ViewSwitcher current="week" date={overdrachtsdag} />
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

      <main className="px-4 py-4 pb-32">
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
          collisionDetection={weekCollisionDetection}
          // Laat de pagina niet scrollen onder je vinger.
          //
          // Twee standaardgedragingen van dnd-kit werken hier tegen ons, en
          // allebei zijn ze bedacht voor lijsten die stilstaan tijdens een
          // sleep. `layoutShiftCompensation` scrollt de pagina wanneer de
          // inhoud verschuift, om het gesleepte ding onder de vinger te houden.
          // Bij ons verschuift de inhoud met opzet bij elke kwartierstap, dus
          // die compensatie stond voortdurend aan: het venster sprong weg
          // terwijl je aan het mikken was.
          //
          // `canScroll` laat alleen de horizontale strook met de dagkolommen
          // nog scrollen. Die moet blijven werken — anders is een dag die
          // buiten beeld valt niet meer te bereiken — maar het venster zelf
          // staat stil zolang je vasthoudt.
          autoScroll={{
            layoutShiftCompensation: false,
            canScroll: element =>
              element !== document.scrollingElement
              && element !== document.documentElement
              && element !== document.body,
          }}
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
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => { setDrag(null); setFrozenAlerts(null) }}
        >
          {refusal && (
            <div className="mb-3 rounded-xl border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-xs text-ink">
              {refusal}
            </div>
          )}

          {notice && (
            <div className="mb-3 rounded-xl border border-brand-blue/30 bg-brand-blue/10 px-3 py-2 text-xs text-ink">
              {notice}
            </div>
          )}

          {/*
            De botsingen. Ze blijven staan tot de gebruiker ze oplost — de app
            schuift niets vanzelf op, want dan glijdt een bon weg onder je
            vinger en lijkt alles aan elkaar te hangen. Elke melding noemt alle
            drie de uitwegen, en de derde staat er ook als knop bij: die is
            anders nergens te vinden zonder de bon aan te raken.
          */}
          {shownConflicts.map(conflict => (
            <div
              key={`${conflict.date}-${conflict.interventionId}`}
              role="alert"
              className="mb-3 rounded-xl border-l-4 border-brand-red bg-brand-red/10 px-3 py-2 text-xs text-ink"
            >
              {/* De dag eerst: deze meldingen gaan over de hele week, niet over
                  de dag waar je toevallig naar kijkt. */}
              <p className="font-bold">{dayLabel(conflict.date)}</p>
              <p className="mt-0.5">{conflictMessage(conflict.customerName)}</p>
              <p className="mt-1 tabular-nums text-ink-soft">
                Ten vroegste {hhmm(conflict.earliestMinutes)}
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

          {shownEarlyDepartures.map(({ day, depart, customerName }) => (
            <div
              key={toLocalDateStr(day)}
              className="mb-3 rounded-xl border-l-4 border-brand-orange bg-brand-orange/10 px-3 py-2 text-xs text-ink"
            >
              <p className="font-bold">{dayLabel(toLocalDateStr(day))}</p>
              <p className="mt-0.5">
                Om {customerName ?? 'de eerste klant'} op zijn vaste uur te halen, moet je die dag
                al om <span className="font-bold tabular-nums">{hhmm(depart)}</span> vertrekken —
                dat is {formatGap(departureMinutes - depart)} vóór het ingestelde startuur van{' '}
                <span className="tabular-nums">{hhmm(departureMinutes)}</span>.
              </p>
            </div>
          ))}

          {/* De randen liggen over het rooster, dus ze hebben er een
              positiepunt omheen nodig. */}
          <div className="relative">
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
            <WeekEdges visible={Boolean(drag)} />
          </div>

          <PoolBar
            interventions={pool}
            open={poolVisible}
            onToggle={() => setPoolVisible(v => !v)}
            dragging={Boolean(drag)}
            onOpenIntervention={id => router.push(`/interventions/${id}`)}
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

/** "1u39" of "45 min" — hoeveel vroeger, in woorden die een uur leesbaar maken. */
function formatGap(minutes: number): string {
  const whole = Math.round(minutes)
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours}u` : `${hours}u${String(rest).padStart(2, '0')}`
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
