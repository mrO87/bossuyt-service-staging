/**
 * DaySummary — compact header showing totals for the day.
 * Three numbers: jobs, work time, travel time.
 */
'use client'

function formatHours(minutes: number): string {
  if (minutes === 0) return '0u'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}u`
  return `${h}u${m.toString().padStart(2, '0')}`
}

export function DaySummary({
  jobCount,
  workMinutes,
  travelMinutes,
  routeLoading,
}: {
  jobCount: number
  workMinutes: number
  travelMinutes: number
  routeLoading?: boolean
}) {
  return (
    <div className="grid grid-cols-3 bg-white border border-stroke rounded-xl overflow-hidden divide-x divide-stroke">
      <Stat label="Jobs"     value={String(jobCount)} accent="text-brand-orange" />
      <Stat label="Werk"     value={formatHours(workMinutes)}   />
      <Stat label="Rijden"   value={formatHours(travelMinutes)} loading={routeLoading} />
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
      <p className="text-[10px] uppercase tracking-widest font-bold text-ink-soft">
        {label}
      </p>
      <p className={`text-lg font-black leading-tight ${accent} ${loading ? 'animate-pulse' : ''}`}>
        {value}
      </p>
    </div>
  )
}
