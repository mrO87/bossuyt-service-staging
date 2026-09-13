/**
 * Wat een drop in de weekweergave betekent.
 *
 * De dagweergave kent maar één dag, dus daar is een drop altijd "deze dag".
 * Over een week heen komt er een richting bij: van dag naar dag. Die is geen
 * enkele schrijfbeweging — savePlanningSnapshot beschrijft één dag — maar twee
 * momentopnames, en welke eerst gaat bepaalt wat er gebeurt als de tweede
 * mislukt. Zie de opmerking bij 'move'.
 */
import { canLeaveTheDay, POOL_DROPPABLE_ID } from './dropIntent'
import { snapToStep } from './pinnedHour'
import { shiftDateStr } from './weekDays'
import { isPastDay, todayInBelgium } from './pastDays'
import type { InterventionStatus } from '@/types'

const DAY_PREFIX = 'weekday:'
const EDGE_PREFIX = 'weekedge:'

export function dayDroppableId(dateStr: string): string {
  return `${DAY_PREFIX}${dateStr}`
}

/**
 * De stroken links en rechts van het rooster.
 *
 * Ze bestaan alleen tijdens het slepen, want anders nemen ze plaats in voor
 * iets wat zelden gebeurt. Het zijn de enige doelwitten die een dag opleveren
 * die niet op het scherm staat.
 */
export function weekEdgeDroppableId(edge: 'prev' | 'next'): string {
  return `${EDGE_PREFIX}${edge}`
}

function dateFromDroppable(id: string): string | null {
  return id.startsWith(DAY_PREFIX) ? id.slice(DAY_PREFIX.length) : null
}

function edgeFromDroppable(id: string): 'prev' | 'next' | null {
  if (!id.startsWith(EDGE_PREFIX)) return null
  const edge = id.slice(EDGE_PREFIX.length)
  return edge === 'prev' || edge === 'next' ? edge : null
}

export type WeekDropIntent =
  | { kind: 'schedule'; workOrderId: string; toDate: string }
  | { kind: 'unschedule'; workOrderId: string; fromDate: string }
  | { kind: 'move'; workOrderId: string; fromDate: string; toDate: string }
  /** Blijft op zijn dag staan, maar krijgt een uur: waar je hem neerzet. */
  | { kind: 'set_hour'; workOrderId: string; date: string; startMinutes: number }
  /**
   * Zeven dagen vroeger of later — een dag die niet op het scherm staat.
   *
   * Daarom draagt deze uitkomst een volledige datum en geen richting: wie hem
   * wegschrijft, kent die dag niet en kan er dus geen momentopname van maken.
   */
  | { kind: 'shift_week'; workOrderId: string; fromDate: string; toDate: string }
  | { kind: 'none'; reason: string }

/**
 * Minder dan dit is geen sleep maar een onvaste vinger.
 *
 * Zonder deze drempel zou elke tik op een blok een uur vastzetten — op het uur
 * dat er toch al berekend stond, en dus zonder zichtbaar gevolg tot er iets
 * vóór die bon verandert en hij als enige blijft staan.
 */
const MIN_DRAG_MINUTES = 5

export interface WeekDropContext {
  /**
   * Vandaag, als `YYYY-MM-DD`. Meegegeven en niet zelf opgezocht, zodat een
   * test een dag kan kiezen zonder de klok te verzetten. Blijft hij weg, dan
   * is het gewoon vandaag in België.
   */
  today?: string
  activeId: string
  overId: string | null
  /** De dag waarop elke werkbon nu staat; ontbreekt hij, dan zit hij in de pool. */
  dayOf: Record<string, string | undefined>
  /**
   * De werkbonnen die nu in de pool liggen.
   *
   * Nodig omdat de pool niet één doelwit is maar evenveel doelwitten als er
   * kaarten in liggen: die kaarten zijn sortable en dus zelf ook loslaatdoel.
   * Laat je een bon boven een kaart los, dan is dát het `overId` en niet de
   * pool — precies waardoor terugslepen op staging niets deed. De dagweergave
   * kent deze regel al (`resolveDropIntent`); hier ontbrak ze.
   */
  poolIds: string[]
  statusById: Record<string, InterventionStatus | undefined>
  /**
   * Het uur waarop elke bon nú getekend staat, uit computeDaySchedule.
   *
   * Slepen verschuift ten opzichte van waar het blok stond, niet ten opzichte
   * van de bovenkant van de kolom — dat is wat "waar je hem neerzet, daar staat
   * hij" betekent wanneer het blok al een berekend uur had.
   */
  startMinutesOf?: Record<string, number | undefined>
  /** Hoeveel minuten de vinger verticaal afgelegd heeft. */
  deltaMinutes?: number
}

/** Wat er in de uitkomst staat als je op een dag mikt die voorbij is. */
export const PAST_DAY_REASON = 'die dag is voorbij'

/**
 * De dag waarop deze uitkomst een bon zou neerzetten, of `null` wanneer ze dat
 * niet doet. Terug naar de pool heeft geen dag, en dat is precies de uitweg die
 * wél moet blijven werken.
 */
function landingDay(intent: WeekDropIntent): string | null {
  switch (intent.kind) {
    case 'schedule':
    case 'move':
    case 'shift_week':
      return intent.toDate
    case 'set_hour':
      return intent.date
    default:
      return null
  }
}

/**
 * Waar je een bon loslaat, en wat dat betekent.
 *
 * Twee lagen: `decideWeekDrop` beslist wat de sleep betekent, en deze laag
 * weigert het wanneer het op een voorbije dag zou landen. Gescheiden omdat de
 * eerste laag al zes uitkomsten heeft en de grens van "voorbij" op vier ervan
 * tegelijk slaat — die vier keer los afvangen is vier kansen om er één te
 * vergeten. Naar de pool slepen blijft altijd toegestaan: dat is de uitweg.
 */
export function resolveWeekDrop(context: WeekDropContext): WeekDropIntent {
  const intent = decideWeekDrop(context)
  const day = landingDay(intent)

  if (day !== null && isPastDay(day, context.today ?? todayInBelgium())) {
    return { kind: 'none', reason: PAST_DAY_REASON }
  }

  return intent
}

function decideWeekDrop(context: WeekDropContext): WeekDropIntent {
  const { activeId, overId, dayOf, poolIds, statusById, startMinutesOf, deltaMinutes } = context

  if (!overId) return { kind: 'none', reason: 'losgelaten naast de lijst' }

  const fromDate = dayOf[activeId]
  const toDate = dateFromDroppable(overId)

  // De grendel geldt overal waar een bon zijn dag zou verlaten — hem verbergen
  // is comfort, dit is de regel.
  const mustStay = Boolean(fromDate) && !canLeaveTheDay(statusById[activeId])

  const edge = edgeFromDroppable(overId)
  if (edge) {
    // Een bon zonder dag heeft geen week om van weg te schuiven; hem op vandaag
    // plus zeven zetten zou een datum verzinnen die niemand gekozen heeft.
    if (!fromDate) return { kind: 'none', reason: 'staat nog op geen enkele dag' }
    if (mustStay) return { kind: 'none', reason: 'het werk is al begonnen' }

    return {
      kind: 'shift_week',
      workOrderId: activeId,
      fromDate,
      toDate: shiftDateStr(fromDate, edge === 'next' ? 7 : -7),
    }
  }

  if (overId === POOL_DROPPABLE_ID || poolIds.includes(overId)) {
    if (!fromDate) return { kind: 'none', reason: 'staat al in de pool' }
    if (mustStay) return { kind: 'none', reason: 'het werk is al begonnen' }
    return { kind: 'unschedule', workOrderId: activeId, fromDate }
  }

  if (!toDate) return { kind: 'none', reason: 'geen geldig doel' }

  if (fromDate === toDate) {
    // Op zijn eigen dag losgelaten: geen verplaatsing, maar een uur. Slepen
    // moet altijd iets herrekenen — alleen de volgorde verzetten laat de
    // vertrektijd en de rijtijden staan, en dan voelt slepen stuk.
    const current = startMinutesOf?.[activeId]
    const moved = deltaMinutes ?? 0

    if (current === undefined) return { kind: 'none', reason: 'geen uur om van te vertrekken' }
    if (Math.abs(moved) < MIN_DRAG_MINUTES) return { kind: 'none', reason: 'staat al op die dag' }
    // Een gestarte job heeft geen gepland uur meer maar een echt uur. Dezelfde
    // grendel die hem op de dag houdt, houdt ook dat uur tegen.
    if (mustStay) return { kind: 'none', reason: 'het werk is al begonnen' }

    return {
      kind: 'set_hour',
      workOrderId: activeId,
      date: toDate,
      startMinutes: snapToStep(current + moved),
    }
  }

  if (mustStay) return { kind: 'none', reason: 'het werk is al begonnen' }

  if (!fromDate) return { kind: 'schedule', workOrderId: activeId, toDate }

  return { kind: 'move', workOrderId: activeId, fromDate, toDate }
}
