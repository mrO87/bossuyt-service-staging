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

/**
 * On THIS day, not merely on some day.
 *
 * `isOnADay` only ever had to ask "does it have a day at all" — the IndexedDB
 * cache used to hold exactly one day's worth of records, so having a day meant
 * having this one. The week view broke that assumption: it writes a job for
 * any day of the week into that same cache (`WeekView.persistDay` →
 * `upsertIntervention`), so a Thursday job can now sit right next to today's
 * record. A reader asking "is this today's?" has to check which day, or it
 * reads a foreign day's work order back as today's the moment both happen to
 * share the cache.
 *
 * `plannedDate` is an ISO instant (e.g. `2026-09-17T00:00:00.000Z`); `dateStr`
 * is a local `YYYY-MM-DD`. Asking whether they match means asking which UTC
 * calendar day the instant falls in — the same day bucket the server builds
 * with `gte`/`lt` against `${date}T00:00:00.000Z` / `${date}T23:59:59.999Z` in
 * `getDayBounds`. `toISOString().slice(0, 10)` names that same UTC day, so this
 * mirrors the server's rule rather than inventing a new one.
 */
export function isOnDate(
  intervention: Pick<Intervention, 'plannedDate'>,
  dateStr: string,
): boolean {
  if (!isOnADay(intervention)) return false
  return new Date(intervention.plannedDate as string).toISOString().slice(0, 10) === dateStr
}
