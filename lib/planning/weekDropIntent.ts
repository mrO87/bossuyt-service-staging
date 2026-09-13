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
import type { InterventionStatus } from '@/types'

const DAY_PREFIX = 'weekday:'

export function dayDroppableId(dateStr: string): string {
  return `${DAY_PREFIX}${dateStr}`
}

function dateFromDroppable(id: string): string | null {
  return id.startsWith(DAY_PREFIX) ? id.slice(DAY_PREFIX.length) : null
}

export type WeekDropIntent =
  | { kind: 'schedule'; workOrderId: string; toDate: string }
  | { kind: 'unschedule'; workOrderId: string; fromDate: string }
  | { kind: 'move'; workOrderId: string; fromDate: string; toDate: string }
  /** Blijft op zijn dag staan, maar krijgt een uur: waar je hem neerzet. */
  | { kind: 'set_hour'; workOrderId: string; date: string; startMinutes: number }
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

export function resolveWeekDrop(context: WeekDropContext): WeekDropIntent {
  const { activeId, overId, dayOf, poolIds, statusById, startMinutesOf, deltaMinutes } = context

  if (!overId) return { kind: 'none', reason: 'losgelaten naast de lijst' }

  const fromDate = dayOf[activeId]
  const toDate = dateFromDroppable(overId)

  // De grendel geldt overal waar een bon zijn dag zou verlaten — hem verbergen
  // is comfort, dit is de regel.
  const mustStay = Boolean(fromDate) && !canLeaveTheDay(statusById[activeId])

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
