/**
 * Which of the two lists a work order belongs in.
 *
 * One rule, written down once. It exists because it was previously written
 * twice and the two copies disagreed: the server was changed to split the day
 * from the open pool on `plannedDate`, while the browser cache kept splitting
 * on `source` through an IndexedDB index. The data arriving was correct and the
 * screen still put a scheduled work order back in the pool.
 *
 * The database does the same split in SQL — `planned_date is null` plus
 * `visible_in_pool` in getTodayInterventions — because an index cannot be
 * queried through a TypeScript function. These two have to be read together.
 */
import type { Intervention } from '@/types'

/**
 * On a day, so it belongs in the planning.
 *
 * Having a day is the whole distinction. `source` says where the work came from
 * — planned maintenance or an incoming call — and a call that has been given a
 * day is every bit as planned as the rest.
 */
export function isOnADay(intervention: Pick<Intervention, 'plannedDate'>): boolean {
  return Boolean(intervention.plannedDate)
}

/**
 * Waiting in the open pool: no day yet, not hidden by hand, not closed.
 *
 * Not the same as "unassigned" — a technician may already be attached to it.
 * The pool is work nobody has put on a day, not work nobody owns.
 */
export function isInThePool(
  intervention: Pick<Intervention, 'plannedDate' | 'visibleInPool' | 'status'>,
): boolean {
  if (isOnADay(intervention)) return false
  if (intervention.visibleInPool === false) return false
  return intervention.status !== 'afgewerkt' && intervention.status !== 'geannuleerd'
}
