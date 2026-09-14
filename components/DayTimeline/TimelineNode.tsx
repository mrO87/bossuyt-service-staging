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
  extra,
  note,
}: {
  label: string
  address: string
  position: 'start' | 'end'
  /** Staat rechts naast het opschrift — het play- of stopknopje van de dag. */
  extra?: React.ReactNode
  /** Eén regel onder het adres, bijvoorbeeld hoeveel later je vertrok. */
  note?: string
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
        {/*
          Het opschrift en het dagknopje delen één regel. Het knopje staat dus
          in iets wat er al was, in plaats van in een eigen balk — daar begint
          en eindigt de dag op het scherm al.
        */}
        <div className="flex items-center gap-2">
          <p className="text-[10px] uppercase tracking-widest font-bold text-brand-orange">
            {label}
          </p>
          {extra}
        </div>
        <p className="text-sm font-bold text-ink leading-snug">{address}</p>
        {note && <p className="mt-0.5 text-[10.5px] text-ink-soft">{note}</p>}
      </div>
    </TimelineRail>
  )
}
