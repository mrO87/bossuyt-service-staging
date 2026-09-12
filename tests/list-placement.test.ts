/**
 * isOnADay / isInThePool — which list a work order belongs in.
 *
 * These exist because the rule was written twice and the two copies drifted.
 * The server was moved onto `plannedDate`; the browser cache kept splitting on
 * `source` through an IndexedDB index. The consequence was invisible in every
 * unit test and obvious on screen: a work order dragged onto the day, the
 * server stored it correctly, and after a reload it sat back in the pool.
 */
import { describe, expect, it } from 'vitest'
import { isInThePool, isOnADay, isOnDate } from '@/lib/planning/listPlacement'
import type { Intervention, InterventionStatus } from '@/types'

function bon(fields: Partial<Intervention>): Intervention {
  return {
    plannedDate: undefined,
    visibleInPool: true,
    status: 'aangemaakt',
    ...fields,
  } as Intervention
}

describe('isOnADay', () => {
  it('is true once a day has been picked', () => {
    expect(isOnADay(bon({ plannedDate: '2026-09-14T00:00:00.000Z' }))).toBe(true)
  })

  it('is false without one', () => {
    expect(isOnADay(bon({}))).toBe(false)
  })

  it('ignores where the work came from', () => {
    // A call that has been given a day is as planned as anything else. Splitting
    // on `source` instead of this is exactly the bug these tests are about.
    const reactive = bon({ plannedDate: '2026-09-14T00:00:00.000Z', source: 'reactive' })
    const planned = bon({ plannedDate: '2026-09-14T00:00:00.000Z', source: 'planned' })

    expect(isOnADay(reactive)).toBe(true)
    expect(isOnADay(planned)).toBe(true)
  })
})

describe('isInThePool', () => {
  it('holds work with no day yet', () => {
    expect(isInThePool(bon({}))).toBe(true)
  })

  it('does not hold work that has a day', () => {
    expect(isInThePool(bon({ plannedDate: '2026-09-14T00:00:00.000Z' }))).toBe(false)
  })

  it('respects the manual hide switch', () => {
    expect(isInThePool(bon({ visibleInPool: false }))).toBe(false)
  })

  it.each(['afgewerkt', 'geannuleerd'] as InterventionStatus[])(
    'does not offer a %s work order to pick up',
    status => {
      expect(isInThePool(bon({ status }))).toBe(false)
    },
  )

  it.each(['aangemaakt', 'gepland', 'onderweg', 'bezig', 'wacht_onderdelen'] as InterventionStatus[])(
    'still holds a %s work order that has no day',
    status => {
      expect(isInThePool(bon({ status }))).toBe(true)
    },
  )

  it('is the exact complement of isOnADay for everyday work', () => {
    // Nothing may fall between the two lists, which is how a work order went
    // missing from both before.
    const everyday = [
      bon({}),
      bon({ plannedDate: '2026-09-14T00:00:00.000Z' }),
      bon({ source: 'reactive' }),
      bon({ source: 'planned', plannedDate: '2026-09-14T00:00:00.000Z' }),
    ]

    for (const item of everyday) {
      expect(isOnADay(item)).toBe(!isInThePool(item))
    }
  })
})

describe('isOnDate', () => {
  // The bug this guards against: the week view can write a job for ANY day of
  // the week into the same IndexedDB cache the day view reads (WeekView's
  // persistDay calls upsertIntervention on a `plannedDate` that may be any day
  // — see lib/idb.ts's getPlannedInterventions). isOnADay alone cannot tell
  // today's record from Thursday's; isOnDate has to.

  it('includes a work order planned on the asked-for day', () => {
    expect(isOnDate(bon({ plannedDate: '2026-09-17T00:00:00.000Z' }), '2026-09-17')).toBe(true)
  })

  it('excludes a work order planned on another day', () => {
    expect(isOnDate(bon({ plannedDate: '2026-09-18T00:00:00.000Z' }), '2026-09-17')).toBe(false)
  })

  it('excludes a work order with no day at all', () => {
    expect(isOnDate(bon({}), '2026-09-17')).toBe(false)
  })

  it('matches regardless of the time of day the instant carries', () => {
    // plannedDate is not always exact midnight (mock data carries real times of
    // day) — only the UTC calendar day should decide the match.
    expect(isOnDate(bon({ plannedDate: '2026-09-17T08:30:00.000Z' }), '2026-09-17')).toBe(true)
    expect(isOnDate(bon({ plannedDate: '2026-09-17T23:30:00.000Z' }), '2026-09-17')).toBe(true)
  })

  it('does not spill into the neighbouring UTC day at the boundary', () => {
    // The last instant still inside 17 September UTC must not match the 18th,
    // and the first instant of the 18th must not match the 17th — the same
    // exclusive upper bound getDayBounds uses on the server.
    expect(isOnDate(bon({ plannedDate: '2026-09-17T23:59:59.999Z' }), '2026-09-18')).toBe(false)
    expect(isOnDate(bon({ plannedDate: '2026-09-18T00:00:00.000Z' }), '2026-09-17')).toBe(false)
  })
})
