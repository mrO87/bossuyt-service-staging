/**
 * DaySummary — what this day adds up to.
 *
 * Three numbers, plus a warning when the day no longer fits the roster. It
 * warns and never blocks: overbooking a day is sometimes the right call, and
 * the screen's job is to stop that happening by accident, not to forbid it.
 *
 * The one thing it must not do is assert a precise overrun built on numbers it
 * cannot stand behind. When the routing service has not answered, the travel
 * times are estimates worked out from coordinates, and the warning says
 * "ongeveer" rather than pretending to a figure.
 */
'use client'

import { formatHours } from '@/components/planning/interventionLabels'
import { dayCapacityMinutes, overrunMinutes } from '@/lib/planning/workSchedule'

/**
 * The overrun warning is switched off for now, at the user's request.
 *
 * Deliberately a flag rather than deleted code: the calculation is right and
 * covered by tests, and what is uncertain is whether the warning is useful
 * before the timeline can stretch a running job past its estimate. Once
 * statusOnderwegAt / workStart are actually written, a day's remaining time
 * means something it does not mean yet.
 *
 * Flip to true to bring it back. Nothing else needs changing.
 */
const SHOW_OVERRUN_WARNING = false

export function DaySummary({
  date,
  jobCount,
  workMinutes,
  travelMinutes,
  breakMinutes,
  unknownLegs = 0,
  routeLoading,
  travelIsEstimated,
}: {
  date: Date
  jobCount: number
  workMinutes: number
  travelMinutes: number
  breakMinutes: number
  unknownLegs?: number
  routeLoading?: boolean
  travelIsEstimated?: boolean
}) {
  // The unpaid break is already taken off the roster capacity, so the load
  // measured against it is work plus travel — the break is not counted twice.
  const loadMinutes = workMinutes + travelMinutes
  const capacity = dayCapacityMinutes(date)
  const overrun = overrunMinutes(date, loadMinutes)

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 bg-white border border-stroke rounded-xl overflow-hidden divide-x divide-stroke">
        <Stat label="Jobs" value={String(jobCount)} accent="text-brand-orange" />
        <Stat label="Werk" value={formatHours(workMinutes)} />
        <Stat label="Rijden" value={formatHours(travelMinutes)} loading={routeLoading} />
      </div>

      {SHOW_OVERRUN_WARNING && overrun > 0 && (
        <div className="rounded-xl border border-brand-red/40 bg-brand-red/10 px-3 py-2">
          <p className="text-xs font-bold text-brand-red">
            {travelIsEstimated
              ? `Deze dag loopt waarschijnlijk over — ongeveer ${formatHours(overrun)} te veel`
              : `Deze dag loopt ${formatHours(overrun)} over`}
          </p>
          <p className="text-[11px] text-ink-soft mt-0.5">
            {formatHours(loadMinutes)} werk en rijden op {formatHours(capacity ?? 0)} beschikbaar
            {breakMinutes > 0 && `, pauze niet meegerekend`}
            {travelIsEstimated && ' · rijtijden nog geschat'}
          </p>
        </div>
      )}

      {SHOW_OVERRUN_WARNING && overrun === 0 && capacity !== null && travelIsEstimated && loadMinutes > capacity * 0.9 && (
        <p className="text-[11px] text-ink-soft px-1">
          Rijtijden nog geschat — de dag zit dicht bij vol.
        </p>
      )}

      {unknownLegs > 0 && (
        // These legs count as zero, so the day looks shorter than it is. Saying
        // so beats a total that is quietly too low.
        <p className="text-[11px] text-brand-orange px-1">
          {unknownLegs === 1
            ? 'Van één rit is de duur onbekend — er ontbreekt een adres.'
            : `Van ${unknownLegs} ritten is de duur onbekend — er ontbreken adressen.`}
        </p>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  accent = 'text-ink',
  loading,
}: {
  label: string
  value: string
  accent?: string
  loading?: boolean
}) {
  return (
    <div className="px-3 py-2 text-center">
      <p className="text-[10px] uppercase tracking-widest font-bold text-ink-soft">{label}</p>
      <p className={`text-lg font-black leading-tight ${accent} ${loading ? 'animate-pulse' : ''}`}>
        {value}
      </p>
    </div>
  )
}
