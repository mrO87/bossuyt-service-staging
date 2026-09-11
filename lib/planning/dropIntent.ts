/**
 * What a drag between the open pool and the day planning actually means.
 *
 * Kept free of dnd-kit on purpose: the drag handler needs a browser and a real
 * touch gesture to exercise, while this needs an array and two strings. The
 * branches that would otherwise fail silently live here — dropping the midday
 * break into the pool, releasing a job someone has already started, letting go
 * beside the list.
 */
import type { InterventionStatus } from '@/types'

/** Droppable ids for the two containers, so an empty list is still a target. */
export const POOL_DROPPABLE_ID = 'pool'
export const PLANNING_DROPPABLE_ID = 'planning'

/** The midday break rides along in the planning order but is not a work order. */
export const BREAK_ID = 'break'

/**
 * A work order may go back to the pool up to and including being en route.
 *
 * The line is the start of the work, not setting off: being en route is no
 * customer contact yet, so turning around has to stay possible. Once work has
 * begun the bon stays on the day, and an interruption is handled by closing it
 * with a note rather than by making the hours disappear.
 *
 * An allowlist rather than a blocklist: a status added later is locked until
 * someone decides otherwise, which is the safe direction.
 */
const RELEASABLE_STATUSES: readonly InterventionStatus[] = [
  'aangemaakt',
  'gepland',
  'onderweg',
]

export type DropIntent =
  | { kind: 'reorder'; orderedIds: string[] }
  | { kind: 'schedule'; workOrderId: string; position: number }
  | { kind: 'unschedule'; workOrderId: string }
  | { kind: 'none'; reason: string }

export interface DropContext {
  activeId: string
  /** null when the card was released outside any droppable. */
  overId: string | null
  /** The day in its current order, the break included. */
  plannedIds: string[]
  poolIds: string[]
  statusById: Record<string, InterventionStatus | undefined>
}

function none(reason: string): DropIntent {
  return { kind: 'none', reason }
}

export function resolveDropIntent(context: DropContext): DropIntent {
  const { activeId, overId, plannedIds, poolIds, statusById } = context

  if (!overId) return none('losgelaten naast de lijst')
  if (activeId === overId) return none('niet verplaatst')

  const fromPlanning = plannedIds.includes(activeId)
  const fromPool = poolIds.includes(activeId)
  if (!fromPlanning && !fromPool) return none('onbekende kaart')

  const ontoPlanning = overId === PLANNING_DROPPABLE_ID || plannedIds.includes(overId)
  const ontoPool = overId === POOL_DROPPABLE_ID || poolIds.includes(overId)

  // ── herordenen binnen de dag ──────────────────────────────────────────────
  if (fromPlanning && ontoPlanning) {
    const from = plannedIds.indexOf(activeId)
    const to =
      overId === PLANNING_DROPPABLE_ID ? plannedIds.length - 1 : plannedIds.indexOf(overId)

    const orderedIds = [...plannedIds]
    orderedIds.splice(from, 1)
    orderedIds.splice(to, 0, activeId)

    return { kind: 'reorder', orderedIds }
  }

  // ── uit de pool de dag in ─────────────────────────────────────────────────
  if (fromPool && ontoPlanning) {
    const position =
      overId === PLANNING_DROPPABLE_ID ? plannedIds.length : plannedIds.indexOf(overId)

    return { kind: 'schedule', workOrderId: activeId, position }
  }

  // ── uit de dag terug naar de pool ─────────────────────────────────────────
  if (fromPlanning && ontoPool) {
    if (activeId === BREAK_ID) return none('de middagpauze is geen werkbon')

    const status = statusById[activeId]
    if (!status || !RELEASABLE_STATUSES.includes(status)) {
      return none('het werk is al begonnen')
    }

    return { kind: 'unschedule', workOrderId: activeId }
  }

  // Binnen de pool schuiven verandert niets: de server sorteert de pool op
  // dringendheid, dus een lokale volgorde zou een leugen zijn.
  if (fromPool && ontoPool) return none('de poolvolgorde wordt niet bewaard')

  return none('geen geldig doel')
}

/** Whether the drag handle should be shown at all. Comfort, not the guard —
 *  the server refuses a locked release regardless of what the client sends. */
export function canLeaveTheDay(status: InterventionStatus | undefined): boolean {
  return Boolean(status && RELEASABLE_STATUSES.includes(status))
}
