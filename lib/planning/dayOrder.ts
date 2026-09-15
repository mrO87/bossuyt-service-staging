/**
 * De volgorde van een dag volgt de klok.
 *
 * Tot nu toe waren de volgorde en het uur twee losse gegevens die niemand met
 * elkaar vergeleek. De volgorde zat in `planned_order`, het vastgezette uur in
 * `planned_start_minutes`, en `computeDaySchedule` plakte dat uur op de plek
 * waar de bon toevallig stond. Gevolg, letterlijk op het scherm gemeten:
 *
 *     START → RESTAURANT LEANDER 14:00 → ☕ PAUZE → TRIANON BVBA 08:30 → EINDE
 *
 * Een dag die je van boven naar onder afrijdt, kan niet achteruit lopen. Dus
 * bepaalt het uur voortaan de plaats: wie een uur heeft, staat waar dat uur
 * valt, en wie er geen heeft houdt zijn onderlinge volgorde en schuift
 * eromheen.
 *
 * **Waarom dit een lus is.** De uren van bonnen zónder vast uur volgen uit de
 * volgorde — rijden, werken, rijden — maar de volgorde volgt nu uit de uren.
 * Die twee wijzen naar elkaar, dus rekenen we net zo lang door tot er niets
 * meer verandert. In de praktijk is dat één doorgang, hooguit twee: alleen een
 * vastgezette bon kan de volgorde breken, en zodra die op zijn plek staat ligt
 * de rest vanzelf goed. `MAX_PASSES` is de noodrem voor het geval twee vaste
 * uren elkaar tegenspreken — dan stopt de berekening met het laatste resultaat
 * in plaats van eeuwig te blijven draaien.
 *
 * **De pauze hoort hier ook thuis.** Die stond vroeger altijd in het midden van
 * de lijst (`Math.floor(jobs.length / 2)`), op twee plaatsen los berekend, en
 * verschoof dus zodra er een job bij kwam. Een middagpauze hoort niet in het
 * midden van een lijst maar rond de middag, en daarmee heeft ze eindelijk een
 * échte plaats: het eerste moment tússen twee jobs dat op of na het pauze-uur
 * valt. Een job onderbreken doen we niet.
 */
import type { Coordinates } from '@/lib/routing/IRoutingService'
import { computeDaySchedule, type ScheduleJob, type TravelLookup } from './daySchedule'
import { clockToMinutes } from './workSchedule'

/** Wanneer de middagpauze ten vroegste valt. */
export const BREAK_TARGET_MINUTES = clockToMinutes('12:00')

/**
 * Hoeveel keer we opnieuw rekenen voor we het opgeven.
 *
 * Vier is ruim: één doorgang om de vaste uren op hun plek te zetten, één om te
 * bevestigen dat er niets meer beweegt. De rest is marge voor een dag waarin
 * twee vaste uren niet allebei kunnen.
 */
const MAX_PASSES = 4

/**
 * Vóór welke job de pauze valt.
 *
 * `startMinutes` zijn de begintijden van de jobs, in de volgorde waarin ze
 * staan. We zoeken de eerste grens tússen twee jobs die op of na het pauze-uur
 * ligt — index 0 kan dus nooit, want vóór de eerste job van de dag pauzeren is
 * geen pauze maar later beginnen.
 *
 * Vindt hij die grens niet, dan komt de pauze achter de laatste job te staan:
 * het antwoord is dan `startMinutes.length`. **De middagpauze telt altijd
 * mee**, ook op een dag waarvan het werk om elf uur op is — je bent pas thuis
 * na de pauze en de rit. Alleen een dag zonder jobs heeft geen pauze, en die
 * geeft -1.
 */
export function breakBeforeIndexFor(
  startMinutes: readonly number[],
  target: number = BREAK_TARGET_MINUTES,
): number {
  if (startMinutes.length === 0) return -1
  for (let index = 1; index < startMinutes.length; index++) {
    if (startMinutes[index] >= target) return index
  }
  return startMinutes.length
}

/** Dezelfde volgorde? Vergelijkt op id, want de objecten worden hergebruikt. */
function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

/** Wat de motor nodig heeft om een kandidaat-volgorde door te rekenen. */
interface Rekenwerk {
  departureMinutes: number
  origin: Coordinates | undefined
  travelBetween: TravelLookup
  breakMinutes: number
  breakBefore: number
}

/**
 * Hoeveel uren deze volgorde niet haalt.
 *
 * Twee soorten schade, allebei één punt waard. Een botsing: een afgesproken
 * uur dat niet gehaald kan worden, waar de motor een arcering voor tekent. En
 * een uur dat wél verschoven is: een bon zonder afspraak die later moest
 * beginnen dan waar hij stond.
 *
 * Het getal zelf zegt niets; het verschil tussen twee volgordes zegt alles.
 * Een dag die al een botsing had, mag er niet aan kapot dat er daarna nergens
 * meer iets "past" — vandaar vergelijken en niet toetsen aan nul.
 */
function uurSchade(
  ids: readonly string[],
  byId: Map<string, ScheduleJob>,
  rekenwerk: Rekenwerk,
): number {
  const jobs = ids.map(id => byId.get(id)!)
  const schedule = computeDaySchedule({ ...rekenwerk, jobs })

  const startById = new Map<string, number>()
  for (const block of schedule.blocks) {
    if (block.kind === 'job' && block.interventionId) {
      startById.set(block.interventionId, block.startMinutes)
    }
  }

  let schade = schedule.conflicts.length
  for (const job of jobs) {
    if (job.startMinutes == null) continue
    const start = startById.get(job.id)
    if (start != null && start > job.startMinutes) schade++
  }
  return schade
}

/**
 * De dag schikken: de uren vormen het skelet, de rest vult de gaten.
 *
 * Hier stond iets anders: alles werd gesorteerd op het **berekende** startuur.
 * Dat gaf een bon zonder uur automatisch de eerste plaats, want zonder uur
 * rekent de motor je zo vroeg mogelijk in — en dus duwde één bon waar nog geen
 * uur van bekend was, alle afspraken van die dag naar achteren. Op dinsdag
 * 15 september schoof daardoor een bon van 08:45 op naar 10:58.
 *
 * Nu bepalen de uren de dag. Bonnen mét een uur staan op volgorde van dat uur;
 * dat is het skelet en daar wordt niet aan getornd. Elke bon zónder uur zoekt
 * daarna zijn plaats: van voor naar achter, en hij gaat staan op de eerste
 * plek waar hij geen enkel uur slechter maakt. Past hij nergens tussen, dan
 * achteraan — want achteraan kan hij per definitie niets meer verschuiven.
 *
 * Onderling houden de bonnen zonder uur hun volgorde: ze worden één voor één
 * geplaatst in de volgorde waarin ze binnenkwamen.
 */
function schikVolgensDeUren(
  huidig: readonly string[],
  byId: Map<string, ScheduleJob>,
  rekenwerk: Rekenwerk,
): string[] {
  const metUur = huidig
    .map((id, index) => ({ id, index, uur: byId.get(id)?.startMinutes ?? null }))
    .filter(entry => entry.uur !== null)
    // Stabiel: twee bonnen op hetzelfde uur houden hun onderlinge volgorde.
    .sort((a, b) => a.uur! - b.uur! || a.index - b.index)
    .map(entry => entry.id)

  const zonderUur = huidig.filter(id => byId.get(id)?.startMinutes == null)

  let order = metUur

  /**
   * Waar de zoektocht mag beginnen.
   *
   * Zonder dit ging elke bon zonder uur op plaats nul staan, want op een dag
   * zonder vaste uren richt hij daar evenveel schade aan als overal elders —
   * namelijk geen — en dus kwam de laatste bon vooraan terecht. De lijst
   * draaide om. Door de zoektocht te laten beginnen waar de vorige bon zonder
   * uur beland is, houden ze onderling de volgorde waarin ze binnenkwamen.
   */
  let vanaf = 0

  for (const id of zonderUur) {
    const drempel = uurSchade(order, byId, rekenwerk)

    let plaats = order.length
    for (let k = vanaf; k <= order.length; k++) {
      const kandidaat = [...order.slice(0, k), id, ...order.slice(k)]
      if (uurSchade(kandidaat, byId, rekenwerk) <= drempel) {
        plaats = k
        break
      }
    }
    order = [...order.slice(0, plaats), id, ...order.slice(plaats)]
    vanaf = plaats + 1
  }

  return order
}

/**
 * De jobs van een dag op volgorde van de klok, plus de plaats van de pauze.
 *
 * Geeft ids terug en geen jobs, zodat wie dit aanroept zelf bepaalt wat hij
 * met die volgorde doet — de dagweergave heeft `JobItem`s, de weekweergave
 * heeft iets anders, en allebei moeten ze op dezelfde volgorde uitkomen.
 */
export function orderDayByClock(input: {
  jobs: readonly ScheduleJob[]
  departureMinutes: number
  origin: Coordinates | undefined
  travelBetween: TravelLookup
  breakMinutes: number
  breakTargetMinutes?: number
}): { order: string[]; breakBefore: number } {
  const byId = new Map(input.jobs.map(job => [job.id, job]))
  let order = input.jobs.map(job => job.id)
  let breakBefore = -1

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const jobs = order.map(id => byId.get(id)!)

    const schedule = computeDaySchedule({
      departureMinutes: input.departureMinutes,
      origin: input.origin,
      jobs,
      travelBetween: input.travelBetween,
      breakMinutes: input.breakMinutes,
      breakBefore,
    })

    const startById = new Map<string, number>()
    for (const block of schedule.blocks) {
      if (block.kind === 'job' && block.interventionId) {
        startById.set(block.interventionId, block.startMinutes)
      }
    }

    const nextOrder = schikVolgensDeUren(order, byId, {
      departureMinutes: input.departureMinutes,
      origin: input.origin,
      travelBetween: input.travelBetween,
      breakMinutes: input.breakMinutes,
      breakBefore,
    })

    const starts = nextOrder.map(id => startById.get(id) ?? Number.MAX_SAFE_INTEGER)
    const nextBreakBefore = breakBeforeIndexFor(
      starts,
      input.breakTargetMinutes ?? BREAK_TARGET_MINUTES,
    )

    const stabiel = sameOrder(nextOrder, order) && nextBreakBefore === breakBefore
    order = nextOrder
    breakBefore = nextBreakBefore
    if (stabiel) break
  }

  return { order, breakBefore }
}
