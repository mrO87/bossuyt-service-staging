/**
 * Van een geordende dag naar kloktijden.
 *
 * De regel, zoals de technieker hem gaf: het ingestelde vertrekuur plus de
 * rijtijd naar de eerste klant is de aankomst, en de aankomst is de start van
 * de eerste job. Daarna telkens hetzelfde — einde job, rijden, volgende job.
 * De dag loopt van de ingestelde startlocatie tot diezelfde locatie terug.
 *
 * Niets hiervan wordt opgeslagen. Een werkbon kent een dag en een volgorde; het
 * uur bestaat alleen zolang deze functie draait. Dat is met opzet: loopt een job
 * uit, dan schuift alles erachter mee, en een bon naar de pool slepen laat zijn
 * uur verdwijnen zonder dat er iets gewist hoeft te worden.
 *
 * Apart van de weergave gehouden omdat de Gantt-weergave er straks op draait —
 * techniekers als rijen is deze functie, één keer per technieker.
 */
import type { Coordinates } from '@/lib/routing/IRoutingService'

export interface ScheduleBlock {
  kind: 'anchor' | 'travel' | 'job' | 'break'
  /** Uniek binnen de dag, bruikbaar als React-key en als sleep-id. */
  id: string
  startMinutes: number
  endMinutes: number
  /** Alleen op job-blokken. */
  interventionId?: string
  /** Alleen op travel-blokken. Null wanneer de rit niet te meten was. */
  minutes?: number | null
}

export interface DayScheduleResult {
  blocks: ScheduleBlock[]
  /** Wanneer je terug bent op de startlocatie, of null bij een lege dag. */
  backAtOriginMinutes: number | null
  workMinutes: number
  travelMinutes: number
  /** Ritten die niemand kon meten, meestal een adres dat nooit geocodeerd is. */
  unknownLegs: number
}

/** Minuten tussen twee punten, of null wanneer dat niet te bepalen is. */
export type TravelLookup = (
  from: Coordinates | undefined,
  to: Coordinates | undefined,
) => number | null

export interface ScheduleJob {
  id: string
  estimatedMinutes?: number
  at?: Coordinates
}

export function computeDaySchedule(input: {
  departureMinutes: number
  origin: Coordinates | undefined
  jobs: ScheduleJob[]
  travelBetween: TravelLookup
  breakMinutes: number
}): DayScheduleResult {
  const { departureMinutes, origin, jobs, travelBetween, breakMinutes } = input

  const blocks: ScheduleBlock[] = []
  let workMinutes = 0
  let travelMinutes = 0
  let unknownLegs = 0

  if (jobs.length === 0) {
    return { blocks, backAtOriginMinutes: null, workMinutes, travelMinutes, unknownLegs }
  }

  let cursor = departureMinutes

  // Het vertrekpunt krijgt een klein blok, zodat de kolom laat zien waar de dag
  // begint in plaats van in het niets te openen.
  blocks.push({ kind: 'anchor', id: 'origin-start', startMinutes: cursor - 10, endMinutes: cursor })

  // Eén pauze, en pas vanaf drie jobs: bij twee is er geen midden.
  const breakBefore = jobs.length >= 3 ? Math.floor(jobs.length / 2) : -1

  let previous: Coordinates | undefined = origin

  /** Zet één rit in de tijdlijn en schuift de klok op. Null blijft nul minuten. */
  function pushTravelLeg(id: string, legMinutes: number | null) {
    if (legMinutes === null) {
      // Onbekend duurt nul. Een verzonnen duur zou de hele dag erachter
      // verschuiven, en dat is erger dan een gat dat zichzelf aanwijst.
      unknownLegs++
      blocks.push({
        kind: 'travel',
        id,
        startMinutes: cursor,
        endMinutes: cursor,
        minutes: null,
      })
    } else if (legMinutes > 0) {
      blocks.push({
        kind: 'travel',
        id,
        startMinutes: cursor,
        endMinutes: cursor + legMinutes,
        minutes: legMinutes,
      })
      cursor += legMinutes
      travelMinutes += legMinutes
    }
  }

  jobs.forEach((job, index) => {
    const legMinutes = travelBetween(previous, job.at)
    pushTravelLeg(`travel-${index}`, legMinutes)

    if (index === breakBefore) {
      blocks.push({
        kind: 'break',
        id: 'break',
        startMinutes: cursor,
        endMinutes: cursor + breakMinutes,
      })
      cursor += breakMinutes
    }

    const length = job.estimatedMinutes ?? 0
    blocks.push({
      kind: 'job',
      id: `job-${job.id}`,
      interventionId: job.id,
      startMinutes: cursor,
      endMinutes: cursor + length,
    })
    cursor += length
    workMinutes += length

    previous = job.at
  })

  const homeLeg = travelBetween(previous, origin)
  pushTravelLeg('travel-home', homeLeg)

  blocks.push({ kind: 'anchor', id: 'origin-end', startMinutes: cursor, endMinutes: cursor + 10 })

  return { blocks, backAtOriginMinutes: cursor, workMinutes, travelMinutes, unknownLegs }
}
