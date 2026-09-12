/**
 * Wat een drop in de weekweergave betekent.
 *
 * De dagweergave kent één dag, dus daar is een drop altijd "deze dag". Over een
 * week heen komt er een richting bij die de dagweergave niet heeft: van dag
 * naar dag. Dat is geen verplaatsing maar twee momentopnames — één per dag —
 * en de volgorde waarin ze wegschrijven bepaalt wat er gebeurt als de tweede
 * mislukt.
 */
import { describe, expect, it } from 'vitest'
import { dayDroppableId, resolveWeekDrop } from '@/lib/planning/weekDropIntent'
import { POOL_DROPPABLE_ID } from '@/lib/planning/dropIntent'

const MON = '2026-09-14'
const TUE = '2026-09-15'

const context = {
  activeId: 'wo-1',
  overId: dayDroppableId(TUE),
  dayOf: { 'wo-1': MON } as Record<string, string | undefined>,
  statusById: { 'wo-1': 'gepland' as const },
}

describe('dayDroppableId', () => {
  it('round-trips a date', () => {
    expect(dayDroppableId(MON)).toContain(MON)
    expect(dayDroppableId(MON)).not.toBe(dayDroppableId(TUE))
  })
})

describe('resolveWeekDrop', () => {
  it('moves a work order from one day to another', () => {
    expect(resolveWeekDrop(context)).toEqual({
      kind: 'move',
      workOrderId: 'wo-1',
      fromDate: MON,
      toDate: TUE,
    })
  })

  it('does nothing when dropped on the day it already sits on', () => {
    expect(resolveWeekDrop({ ...context, overId: dayDroppableId(MON) }).kind).toBe('none')
  })

  it('schedules a pool work order onto a day', () => {
    expect(resolveWeekDrop({
      ...context,
      dayOf: { 'wo-1': undefined },
    })).toEqual({ kind: 'schedule', workOrderId: 'wo-1', toDate: TUE })
  })

  it('releases a work order dropped on the pool', () => {
    expect(resolveWeekDrop({ ...context, overId: POOL_DROPPABLE_ID })).toEqual({
      kind: 'unschedule', workOrderId: 'wo-1', fromDate: MON,
    })
  })

  it('does nothing when a pool work order is dropped back on the pool', () => {
    expect(resolveWeekDrop({
      ...context,
      overId: POOL_DROPPABLE_ID,
      dayOf: { 'wo-1': undefined },
    }).kind).toBe('none')
  })

  it('refuses to move work that has already been started', () => {
    // Dezelfde grens als in de dagweergave: vanaf 'bezig' blijft de bon staan.
    const result = resolveWeekDrop({ ...context, statusById: { 'wo-1': 'bezig' } })
    expect(result.kind).toBe('none')
    expect(result).toHaveProperty('reason')
  })

  it('still refuses when that work is dropped on the pool', () => {
    const result = resolveWeekDrop({
      ...context,
      overId: POOL_DROPPABLE_ID,
      statusById: { 'wo-1': 'afgewerkt' },
    })
    expect(result.kind).toBe('none')
  })

  it('does nothing when let go outside any list', () => {
    expect(resolveWeekDrop({ ...context, overId: null }).kind).toBe('none')
  })

  it('treats a card it has never placed as coming from the pool', () => {
    // Niet in dayOf betekent: staat op geen enkele dag. Dat is precies wat de
    // pool is, dus er is niets bijzonders aan de hand — de bon wordt ingepland.
    // De caller kent alleen kaarten die hij zelf getekend heeft, dus een
    // werkelijk onbekend id bestaat hier niet.
    expect(resolveWeekDrop({ ...context, activeId: 'wo-nieuw', dayOf: {} })).toEqual({
      kind: 'schedule', workOrderId: 'wo-nieuw', toDate: TUE,
    })
  })
})
