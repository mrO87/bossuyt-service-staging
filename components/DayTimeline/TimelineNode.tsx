/**
 * TimelineNode — the start or end anchor of the day.
 *
 * Visually a filled circle with a small label ("Start" / "Einde") and
 * the address beneath it. The start node has a dashed line continuing
 * DOWN from its center; the end node has one continuing UP into it.
 * Together with the rails in the rows between, this creates one visually
 * continuous vertical line from start to end.
 */
'use client'

import { TimelineRail, RailLine } from './TimelineRail'

export function TimelineNode({
  label,
  address,
  position,
}: {
  label: string
  address: string
  position: 'start' | 'end'
}) {
  return (
    <TimelineRail
      className="py-2"
      railContent={
        <>
          {/* Continue the rail past the circle so it connects to the next row */}
          <RailLine variant={position === 'start' ? 'bottom-half' : 'top-half'} />
          <div className="my-auto w-6 h-6 rounded-full bg-brand-orange ring-4 ring-surface relative z-10 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white" />
          </div>
        </>
      }
    >
      <div className="pl-3 py-2">
        <p className="text-[10px] uppercase tracking-widest font-bold text-brand-orange">
          {label}
        </p>
        <p className="text-sm font-bold text-ink leading-snug">{address}</p>
      </div>
    </TimelineRail>
  )
}
