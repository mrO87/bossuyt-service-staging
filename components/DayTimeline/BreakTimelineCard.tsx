/**
 * BreakTimelineCard — the movable midday break on the timeline.
 *
 * Visually distinct from job cards:
 *   - smaller
 *   - muted gray/soft background
 *   - coffee icon instead of a customer avatar
 *   - still draggable (same handle pattern as a job card)
 */
'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TimelineRail, RailLine } from './TimelineRail'

export function BreakTimelineCard({
  id,
  minutes,
  label,
}: {
  id: string
  minutes: number
  label: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <TimelineRail
        className="py-1"
        railContent={
          <>
            <RailLine variant="full" />
            {/* soft gray dot so break clearly reads as "not a job" */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-stroke ring-4 ring-surface" />
          </>
        }
      >
        <div className="my-1 ml-3 flex rounded-xl overflow-hidden bg-stroke/40 border border-dashed border-stroke">
          {/* drag handle */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Verplaats de pauze"
            className="w-8 shrink-0 flex items-center justify-center active:bg-stroke/70 cursor-grab touch-none"
          >
            <span className="text-ink-soft text-lg select-none">⋮⋮</span>
          </button>

          <div className="flex-1 flex items-center gap-2 px-3 py-2.5">
            <span className="text-lg" aria-hidden>☕</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-bold text-ink-soft">
                Pauze
              </p>
              <p className="text-sm font-bold text-ink">{label}</p>
            </div>
            <span className="text-xs font-semibold text-ink-soft">{minutes} min</span>
          </div>
        </div>
      </TimelineRail>
    </div>
  )
}
