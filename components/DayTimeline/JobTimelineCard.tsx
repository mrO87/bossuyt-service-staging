/**
 * JobTimelineCard — a sortable job on the timeline.
 *
 * Visually: small dot on the rail + rich job card to the right.
 * Draggable via its left handle only, so vertical scrolling stays free.
 */
'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Intervention, InterventionStatus, InterventionType } from '@/types'
import { TimelineRail, RailLine } from './TimelineRail'

// ---------- small presentation helpers ----------

function formatMinutes(minutes?: number): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}u`
  return `${h}u${m}`
}

function typeBorderClass(type: InterventionType, urgent: boolean): string {
  if (urgent) return 'bg-brand-red'
  switch (type) {
    case 'warm':       return 'bg-brand-orange'
    case 'montage':    return 'bg-brand-blue'
    case 'preventief': return 'bg-brand-green'
  }
}

function typeClass(type: InterventionType): string {
  switch (type) {
    case 'warm':       return 'bg-brand-orange text-white'
    case 'montage':    return 'bg-brand-blue text-white'
    case 'preventief': return 'bg-brand-green text-white'
  }
}
function typeLabel(type: InterventionType): string {
  switch (type) {
    case 'warm':       return 'Warm'
    case 'montage':    return 'Montage'
    case 'preventief': return 'Preventief'
  }
}

function statusClass(status: InterventionStatus): string {
  switch (status) {
    case 'onderweg':         return 'bg-brand-orange text-white'
    case 'bezig':            return 'bg-brand-blue text-white'
    case 'afgewerkt':        return 'bg-brand-green text-white'
    case 'geannuleerd':      return 'bg-brand-red text-white'
    default:                 return 'bg-stroke text-ink-soft'
  }
}
function statusLabel(status: InterventionStatus): string {
  switch (status) {
    case 'gepland':          return 'Gepland'
    case 'onderweg':         return 'Onderweg'
    case 'bezig':            return 'Bezig'
    case 'wacht_onderdelen': return 'Wacht onderdelen'
    case 'afgewerkt':        return 'Afgewerkt'
    case 'geannuleerd':      return 'Geannuleerd'
  }
}

function Chip({ className, label }: { className: string; label: string }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${className}`}>
      {label}
    </span>
  )
}

// ---------- component ----------

export function JobTimelineCard({
  id,
  intervention,
  onClick,
}: {
  id: string
  intervention: Intervention
  onClick: () => void
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
            {/* centered dot that sits on the rail line */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-brand-orange ring-4 ring-surface" />
          </>
        }
      >
        <div className="my-1 ml-3 flex rounded-xl overflow-hidden bg-white border border-stroke shadow-sm">
          {/* type / urgency color strip */}
          <div
            className={`w-1 shrink-0 ${typeBorderClass(
              intervention.type,
              intervention.isUrgent,
            )}`}
          />

          {/* drag handle — only this element blocks touch scrolling */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Sleep om te herschikken"
            className="w-8 shrink-0 flex items-center justify-center bg-stroke/50 active:bg-stroke cursor-grab touch-none"
          >
            <span className="text-ink-soft text-lg select-none">⋮⋮</span>
          </button>

          {/* clickable content area */}
          <div
            onClick={onClick}
            className="flex-1 p-3 cursor-pointer active:opacity-70"
          >
            <div className="flex items-start justify-between mb-1">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm leading-tight text-ink">
                  {intervention.customerName}
                </p>
                <p className="text-xs text-ink-soft">{intervention.siteCity}</p>
              </div>
              <div className="flex -space-x-2 ml-2 shrink-0">
                {intervention.technicians.map((tech, i) => (
                  <div
                    key={tech.technicianId}
                    className={`w-7 h-7 rounded-full flex items-center justify-center border-2 border-white ${
                      i === 0 ? 'bg-brand-mid' : 'bg-gray-600'
                    }`}
                    title={tech.name}
                  >
                    <span className="text-white text-[11px] font-bold">
                      {tech.initials}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {intervention.deviceBrand && (
              <p className="text-xs font-medium mt-1 text-ink">
                {intervention.deviceBrand} {intervention.deviceModel}
              </p>
            )}

            {intervention.description && (
              <p className="text-xs mt-0.5 mb-2 text-ink-soft line-clamp-2">
                {intervention.description}
              </p>
            )}

            <div className="flex items-center gap-1.5 flex-wrap">
              <Chip
                className={typeClass(intervention.type)}
                label={typeLabel(intervention.type)}
              />
              <Chip
                className={statusClass(intervention.status)}
                label={statusLabel(intervention.status)}
              />
              {intervention.estimatedMinutes && (
                <Chip
                  className="bg-stroke text-ink-soft"
                  label={formatMinutes(intervention.estimatedMinutes)}
                />
              )}
              {intervention.isUrgent && (
                <Chip className="bg-brand-red text-white" label="Dringend" />
              )}
            </div>
          </div>
        </div>
      </TimelineRail>
    </div>
  )
}
