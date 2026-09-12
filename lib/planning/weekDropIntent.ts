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
  | { kind: 'none'; reason: string }

export interface WeekDropContext {
  activeId: string
  overId: string | null
  /** De dag waarop elke werkbon nu staat; ontbreekt hij, dan zit hij in de pool. */
  dayOf: Record<string, string | undefined>
  statusById: Record<string, InterventionStatus | undefined>
}

export function resolveWeekDrop(context: WeekDropContext): WeekDropIntent {
  const { activeId, overId, dayOf, statusById } = context

  if (!overId) return { kind: 'none', reason: 'losgelaten naast de lijst' }

  const fromDate = dayOf[activeId]
  const toDate = dateFromDroppable(overId)

  // De grendel geldt overal waar een bon zijn dag zou verlaten — hem verbergen
  // is comfort, dit is de regel.
  const mustStay = Boolean(fromDate) && !canLeaveTheDay(statusById[activeId])

  if (overId === POOL_DROPPABLE_ID) {
    if (!fromDate) return { kind: 'none', reason: 'staat al in de pool' }
    if (mustStay) return { kind: 'none', reason: 'het werk is al begonnen' }
    return { kind: 'unschedule', workOrderId: activeId, fromDate }
  }

  if (!toDate) return { kind: 'none', reason: 'geen geldig doel' }
  if (fromDate === toDate) return { kind: 'none', reason: 'staat al op die dag' }
  if (mustStay) return { kind: 'none', reason: 'het werk is al begonnen' }

  if (!fromDate) return { kind: 'schedule', workOrderId: activeId, toDate }

  return { kind: 'move', workOrderId: activeId, fromDate, toDate }
}
