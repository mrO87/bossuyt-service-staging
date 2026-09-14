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

    // Stabiel sorteren: gelijke tijden houden hun onderlinge volgorde, en dat
    // is precies wat "bonnen zonder vast uur houden hun volgorde" betekent.
    //
    // Met één uitzondering, en die is de kern van de afspraak. Komt een bon
    // zónder vast uur op hetzelfde moment uit als een bon mét een vast uur,
    // dan gaat de vastgezette voor. Een vastgezet uur is een claim op dat
    // moment — meestal omdat het met de klant afgesproken is. Een berekend uur
    // is niet meer dan "hier kwam ik toevallig uit", en dat hoort te wijken.
    const nextOrder = order
      .map((id, index) => ({
        id,
        index,
        start: startById.get(id) ?? Number.MAX_SAFE_INTEGER,
        vast: byId.get(id)?.startMinutes != null ? 0 : 1,
      }))
      .sort((a, b) => a.start - b.start || a.vast - b.vast || a.index - b.index)
      .map(entry => entry.id)

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
