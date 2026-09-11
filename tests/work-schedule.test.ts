/**
 * Work schedule — the one place the roster lives.
 *
 * Before this module the day length existed twice and disagreed with itself:
 * OvertimeWidget assumed 7u45 every day, and the planning had no notion of a
 * day ending at all. The real roster is 07:00–16:00 Monday to Thursday and
 * 07:00–13:30 on Friday, each with 30 unpaid minutes of break.
 *
 * The break is unpaid but the clock still runs during it, so it comes off the
 * span to give the time actually available for work and travel.
 */
import { describe, expect, it } from 'vitest'
import {
  UNPAID_BREAK_MINUTES,
  WEEK_CAPACITY_MINUTES,
  dayCapacityMinutes,
  isWorkingDay,
  overrunMinutes,
  scheduleForDate,
} from '@/lib/planning/workSchedule'

// September 2026: the 7th is a Monday.
const MONDAY    = new Date(2026, 8, 7)
const THURSDAY  = new Date(2026, 8, 10)
const FRIDAY    = new Date(2026, 8, 11)
const SATURDAY  = new Date(2026, 8, 12)
const SUNDAY    = new Date(2026, 8, 13)

describe('work schedule', () => {
  it('runs 07:00–16:00 from Monday through Thursday', () => {
    for (const day of [MONDAY, THURSDAY]) {
      expect(scheduleForDate(day)).toEqual({ start: '07:00', end: '16:00' })
    }
  })

  it('stops at 13:30 on Friday', () => {
    expect(scheduleForDate(FRIDAY)).toEqual({ start: '07:00', end: '13:30' })
  })

  it('has no roster in the weekend', () => {
    expect(scheduleForDate(SATURDAY)).toBeNull()
    expect(scheduleForDate(SUNDAY)).toBeNull()
    expect(isWorkingDay(SATURDAY)).toBe(false)
    expect(isWorkingDay(MONDAY)).toBe(true)
  })

  describe('capacity — span minus the unpaid break', () => {
    it('gives 8u30 on a long day', () => {
      // 07:00 → 16:00 is 540 minutes, minus 30 unpaid = 510.
      expect(dayCapacityMinutes(MONDAY)).toBe(510)
      expect(dayCapacityMinutes(MONDAY)).toBe(8 * 60 + 30)
    })

    it('gives 6u00 on Friday', () => {
      // 07:00 → 13:30 is 390 minutes, minus 30 unpaid = 360.
      expect(dayCapacityMinutes(FRIDAY)).toBe(360)
      expect(dayCapacityMinutes(FRIDAY)).toBe(6 * 60)
    })

    it('gives nothing in the weekend', () => {
      expect(dayCapacityMinutes(SATURDAY)).toBeNull()
    })

    it('adds up to a 40-hour week', () => {
      const week = [0, 1, 2, 3, 4]
        .map(offset => new Date(2026, 8, 7 + offset))
        .reduce((total, day) => total + (dayCapacityMinutes(day) ?? 0), 0)

      expect(week).toBe(40 * 60)
      expect(WEEK_CAPACITY_MINUTES).toBe(40 * 60)
    })

    it('uses a 30 minute unpaid break', () => {
      expect(UNPAID_BREAK_MINUTES).toBe(30)
    })
  })

  describe('overrun', () => {
    it('is zero when the day still fits', () => {
      expect(overrunMinutes(MONDAY, 400)).toBe(0)
    })

    it('is zero exactly at capacity', () => {
      expect(overrunMinutes(MONDAY, 510)).toBe(0)
    })

    it('reports how far past capacity the day runs', () => {
      expect(overrunMinutes(MONDAY, 555)).toBe(45)
      expect(overrunMinutes(FRIDAY, 400)).toBe(40)
    })

    it('never warns on a day that has no roster', () => {
      // Planning weekend work is allowed; there is just nothing to exceed.
      expect(overrunMinutes(SATURDAY, 999)).toBe(0)
    })
  })
})
