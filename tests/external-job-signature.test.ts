/**
 * Noticing that the day changed from outside.
 *
 * The bug this pins down: the last work order could not be dragged out of the
 * planning. It was released on the server and it appeared in the pool, but the
 * timeline went on drawing it — so the day showed a job that was no longer on
 * it, and dragging it again did nothing.
 *
 * The guard read `if (!nextSignature) return`, meant to skip the first render
 * before any data has arrived. An empty day has an empty signature, so emptying
 * a day looked exactly like having no data yet, and the new (empty) list was
 * never taken.
 *
 * Nothing in the unit tests could see it: every piece was individually right.
 */
import { describe, expect, it } from 'vitest'
import {
  externalJobSignature,
  shouldTakeExternalOrder,
} from '@/components/DayTimeline/useRouteTimeline'
import type { Intervention } from '@/types'

function bon(id: string, plannedOrder = 1): Intervention {
  return {
    id,
    technicians: [{ technicianId: 'u1', isLead: true, plannedOrder }],
  } as unknown as Intervention
}

describe('externalJobSignature', () => {
  it('changes when a work order is added', () => {
    expect(externalJobSignature([bon('a')]))
      .not.toBe(externalJobSignature([bon('a'), bon('b', 2)]))
  })

  it('changes when the order changes', () => {
    expect(externalJobSignature([bon('a', 1), bon('b', 2)]))
      .not.toBe(externalJobSignature([bon('a', 2), bon('b', 1)]))
  })

  it('is stable for the same day', () => {
    expect(externalJobSignature([bon('a'), bon('b', 2)]))
      .toBe(externalJobSignature([bon('a'), bon('b', 2)]))
  })

  it('is empty for a day with nothing on it', () => {
    expect(externalJobSignature([])).toBe('')
  })
})

describe('shouldTakeExternalOrder', () => {
  it('takes the first list that arrives', () => {
    expect(shouldTakeExternalOrder(null, externalJobSignature([bon('a')]))).toBe(true)
  })

  it('ignores the same list arriving again', () => {
    const signature = externalJobSignature([bon('a')])
    expect(shouldTakeExternalOrder(signature, signature)).toBe(false)
  })

  it('takes a day that has become empty', () => {
    // The regression. Dragging the last work order to the pool empties the day,
    // and the timeline has to follow — otherwise it keeps drawing a job that is
    // no longer there and the job can never be moved again.
    const hadOne = externalJobSignature([bon('a')])
    expect(shouldTakeExternalOrder(hadOne, externalJobSignature([]))).toBe(true)
  })

  it('still ignores a day that was already empty', () => {
    expect(shouldTakeExternalOrder('', '')).toBe(false)
  })

  it('takes work arriving on a day that was empty', () => {
    expect(shouldTakeExternalOrder('', externalJobSignature([bon('a')]))).toBe(true)
  })

  it('does not confuse "nothing yet" with "nothing on it"', () => {
    // null and '' are different states and the whole bug was treating them as
    // one. An empty day is real; no data yet is not.
    expect(shouldTakeExternalOrder(null, '')).toBe(true)
    expect(shouldTakeExternalOrder('', '')).toBe(false)
  })
})
