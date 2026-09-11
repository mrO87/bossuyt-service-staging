/**
 * The work roster — one table, every reader gets its number from here.
 *
 * It used to live in two places that disagreed: OvertimeWidget assumed a flat
 * 7u45 every day, and the planning had no notion of a day ending at all. The
 * actual roster is 07:00–16:00 Monday through Thursday and 07:00–13:30 on
 * Friday, each with 30 unpaid minutes of break.
 *
 * The break is unpaid but the clock keeps running during it, so it comes off
 * the span to give the time genuinely available for work and travel. That is
 * 8u30 on a long day, 6u00 on Friday, 40u00 across the week.
 */

/** Start and end of a rostered day, as "HH:MM" on a 24-hour clock. */
export interface DaySchedule {
  start: string
  end: string
}

export const UNPAID_BREAK_MINUTES = 30

const LONG_DAY: DaySchedule = { start: '07:00', end: '16:00' }
const FRIDAY: DaySchedule = { start: '07:00', end: '13:30' }

/** Keyed by `Date.getDay()`: 0 is Sunday, 6 is Saturday. */
const ROSTER: Readonly<Record<number, DaySchedule | null>> = {
  0: null,      // zondag
  1: LONG_DAY,  // maandag
  2: LONG_DAY,
  3: LONG_DAY,
  4: LONG_DAY,  // donderdag
  5: FRIDAY,    // vrijdag
  6: null,      // zaterdag
}

/** Minutes since midnight for a "HH:MM" string. */
export function clockToMinutes(hhmm: string): number {
  const match = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return 0
  return Number(match[1]) * 60 + Number(match[2])
}

/** The roster for this date, or null on a day that has none. */
export function scheduleForDate(date: Date): DaySchedule | null {
  return ROSTER[date.getDay()] ?? null
}

export function isWorkingDay(date: Date): boolean {
  return scheduleForDate(date) !== null
}

/**
 * Minutes available for work and travel on this date, or null when the day has
 * no roster. Weekend work is allowed — there is simply nothing to measure it
 * against, so nothing to warn about.
 */
export function dayCapacityMinutes(date: Date): number | null {
  const schedule = scheduleForDate(date)
  if (!schedule) return null

  const span = clockToMinutes(schedule.end) - clockToMinutes(schedule.start)
  return span - UNPAID_BREAK_MINUTES
}

/** 40u00 — the sum of the rostered days. */
export const WEEK_CAPACITY_MINUTES = Object.keys(ROSTER)
  .map(Number)
  .reduce((total, weekday) => {
    const schedule = ROSTER[weekday]
    if (!schedule) return total
    const span = clockToMinutes(schedule.end) - clockToMinutes(schedule.start)
    return total + span - UNPAID_BREAK_MINUTES
  }, 0)

/**
 * How far past the roster this day runs, in minutes. Zero when it still fits,
 * and zero on a day without a roster.
 *
 * `loadMinutes` is work plus travel — the break is already accounted for by
 * having been subtracted from the capacity.
 */
export function overrunMinutes(date: Date, loadMinutes: number): number {
  const capacity = dayCapacityMinutes(date)
  if (capacity === null) return 0

  return Math.max(0, loadMinutes - capacity)
}
