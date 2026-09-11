/**
 * resolveDropIntent — what a drag actually means.
 *
 * Pulled out of the drag handler on purpose. The handler needs a browser and a
 * real touch gesture to exercise; this needs an array and two strings. The
 * branches that would otherwise fail silently — dropping the midday break into
 * the pool, releasing a job someone is already working on, letting go beside
 * the list — are exactly the ones worth pinning down here.
 */
import { describe, expect, it } from 'vitest'
import { POOL_DROPPABLE_ID, PLANNING_DROPPABLE_ID, resolveDropIntent } from '@/lib/planning/dropIntent'
import type { InterventionStatus } from '@/types'

const PLANNED = ['wo-1', 'break', 'wo-2']
const POOL = ['wo-8', 'wo-9']

function intent(
  activeId: string,
  overId: string | null,
  statusById: Record<string, InterventionStatus> = {},
) {
  return resolveDropIntent({
    activeId,
    overId,
    plannedIds: PLANNED,
    poolIds: POOL,
    statusById: {
      'wo-1': 'gepland',
      'wo-2': 'gepland',
      'wo-8': 'aangemaakt',
      'wo-9': 'aangemaakt',
      ...statusById,
    },
  })
}

describe('resolveDropIntent', () => {
  describe('within the planning', () => {
    it('reorders, keeping the break in the list', () => {
      expect(intent('wo-2', 'wo-1')).toEqual({
        kind: 'reorder',
        orderedIds: ['wo-2', 'wo-1', 'break'],
      })
    })

    it('lets the break move too', () => {
      expect(intent('break', 'wo-1')).toEqual({
        kind: 'reorder',
        orderedIds: ['break', 'wo-1', 'wo-2'],
      })
    })

    it('does nothing when dropped on itself', () => {
      expect(intent('wo-1', 'wo-1').kind).toBe('none')
    })
  })

  describe('pool → planning', () => {
    it('schedules at the position it was dropped on', () => {
      expect(intent('wo-8', 'wo-2')).toEqual({
        kind: 'schedule',
        workOrderId: 'wo-8',
        position: 2,
      })
    })

    it('schedules at the front when dropped on the first job', () => {
      expect(intent('wo-8', 'wo-1')).toEqual({
        kind: 'schedule',
        workOrderId: 'wo-8',
        position: 0,
      })
    })

    it('appends when dropped on the empty planning area', () => {
      expect(intent('wo-8', PLANNING_DROPPABLE_ID)).toEqual({
        kind: 'schedule',
        workOrderId: 'wo-8',
        position: PLANNED.length,
      })
    })
  })

  describe('planning → pool', () => {
    it('releases the work order', () => {
      expect(intent('wo-1', POOL_DROPPABLE_ID)).toEqual({
        kind: 'unschedule',
        workOrderId: 'wo-1',
      })
    })

    it('also releases when dropped onto a card already in the pool', () => {
      expect(intent('wo-1', 'wo-9')).toEqual({
        kind: 'unschedule',
        workOrderId: 'wo-1',
      })
    })

    it('refuses to release the midday break — it is not a work order', () => {
      const result = intent('break', POOL_DROPPABLE_ID)
      expect(result.kind).toBe('none')
      expect(result).toHaveProperty('reason')
    })
  })

  describe('locked once the work has started', () => {
    // The technician draws the line at starting work, not at setting off:
    // being en route is no customer contact yet, so turning around must stay
    // possible. From 'bezig' onward the bon stays on the day.
    it.each(['aangemaakt', 'gepland', 'onderweg'] as InterventionStatus[])(
      'allows releasing a %s work order',
      status => {
        expect(intent('wo-1', POOL_DROPPABLE_ID, { 'wo-1': status }).kind).toBe('unschedule')
      },
    )

    it.each([
      'bezig',
      'wacht_onderdelen',
      'afgewerkt',
      'geannuleerd',
    ] as InterventionStatus[])('refuses to release a %s work order', status => {
      expect(intent('wo-1', POOL_DROPPABLE_ID, { 'wo-1': status }).kind).toBe('none')
    })

    it('treats an unknown status as locked', () => {
      // An allowlist, not a blocklist: a status added later is locked until
      // someone decides otherwise. That is the safe direction.
      const result = resolveDropIntent({
        activeId: 'wo-1',
        overId: POOL_DROPPABLE_ID,
        plannedIds: PLANNED,
        poolIds: POOL,
        statusById: {},
      })
      expect(result.kind).toBe('none')
    })

    it('still allows reordering a locked work order inside the day', () => {
      // Locking is about leaving the day, not about position within it.
      expect(intent('wo-1', 'wo-2', { 'wo-1': 'bezig' }).kind).toBe('reorder')
    })
  })

  describe('nothing to do', () => {
    it('ignores a drop beside the lists', () => {
      expect(intent('wo-1', null).kind).toBe('none')
    })

    it('ignores reordering inside the pool — that order is not stored', () => {
      // The server sorts the pool by urgency, so a local order would be a lie.
      expect(intent('wo-8', 'wo-9').kind).toBe('none')
    })

    it('ignores a drag from neither list', () => {
      expect(intent('wo-onbekend', 'wo-1').kind).toBe('none')
    })
  })
})
