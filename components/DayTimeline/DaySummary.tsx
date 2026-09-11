/**
 * DaySummary — what this day adds up to.
 *
 * Three numbers, plus a warning when the day no longer fits the roster. It
 * warns and never blocks: overbooking a day is sometimes the right call, and
 * the screen's job is to stop that happening by accident, not to forbid it.
 *
 * The one thing it must not do is assert a precise overrun built on invented
 * travel times. When the routing service has not answered, the numbers come
 * from mockTravel, and the warning says so rather than pretending.
 */
'use client'

import { formatHours } from '@/components/planning/interventionLabels'
import { dayCapacityMinutes, overrunMinutes } from '@/lib/planning/workSchedule'

export function DaySummary({
  date,
  jobCount,
  workMinutes,
  travelMinutes,
  breakMinutes,
  routeLoading,
  travelIsEstimated,
}: {
  date: Date
  jobCount: number
  workMinutes: number
  travelMinutes: number
  breakMinutes: number
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

      {overrun > 0 && (
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

      {overrun === 0 && capacity !== null && travelIsEstimated && loadMinutes > capacity * 0.9 && (
        <p className="text-[11px] text-ink-soft px-1">
          Rijtijden nog geschat — de dag zit dicht bij vol.
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
