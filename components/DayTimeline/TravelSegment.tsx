/**
 * TravelSegment — the dashed connector between two anchors.
 *
 * Deliberately NOT a card, so it stays visually secondary to the job cards
 * while still treating travel as a first-class row of the day.
 *
 * It can also say that it does not know. A work order whose address never
 * geocoded has no coordinates to measure from, and showing "? min" is the
 * honest answer — the previous version reached for a hash of the two ids and
 * produced a confident number nobody could check.
 */
'use client'

import { TimelineRail, RailLine } from './TimelineRail'

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}u` : `${h}u${m}`
}

export function TravelSegment({
  minutes,
  km,
  provider,
}: {
  minutes: number | null
  km: number | null
  provider?: 'ors' | 'estimate' | 'unknown'
}) {
  const unknown = minutes === null || provider === 'unknown'

  return (
    <TimelineRail className="py-1" railContent={<RailLine variant="full" />}>
      <div className="flex items-center gap-2 py-2 pl-3 text-ink-soft">
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden
        >
          <path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm14 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z" />
          <path d="M3 17v-5l2-5h14l2 5v5" />
        </svg>

        <span className="text-[11px] uppercase tracking-wide font-semibold text-ink-soft">
          Reistijd
        </span>

        {unknown ? (
          <>
            <span className="text-sm font-bold text-ink">? min</span>
            <span className="text-xs text-brand-orange">· adres ontbreekt</span>
          </>
        ) : (
          <>
            <span className="text-sm font-bold text-ink">{formatMinutes(minutes)}</span>
            {km !== null && <span className="text-xs text-ink-soft">· {km} km</span>}
            {provider === 'estimate' && (
              <span className="text-[11px] text-ink-soft italic">· geschat</span>
            )}
          </>
        )}
      </div>
    </TimelineRail>
  )
}
