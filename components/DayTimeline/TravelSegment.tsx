/**
 * TravelSegment — the dashed connector between two anchors.
 *
 * Shows a small lighter-weight chip with the estimated minutes and km.
 * This is deliberately NOT a card so it stays visually secondary to the
 * job cards, while still treating travel as a first-class row of the day.
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
}: {
  minutes: number
  km: number
}) {
  return (
    <TimelineRail
      className="py-1"
      railContent={<RailLine variant="full" />}
    >
      <div className="flex items-center gap-2 py-2 pl-3 text-ink-soft">
        {/* small car icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm14 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z" />
          <path d="M3 17v-5l2-5h14l2 5v5" />
        </svg>
        <span className="text-[11px] uppercase tracking-wide font-semibold text-ink-soft">
          Reistijd
        </span>
        <span className="text-sm font-bold text-ink">{formatMinutes(minutes)}</span>
        <span className="text-xs text-ink-soft">· {km} km</span>
      </div>
    </TimelineRail>
  )
}
