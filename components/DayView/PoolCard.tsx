/**
 * PoolCard — one work order waiting in the open pool.
 *
 * Same drag mechanics as JobTimelineCard: a dedicated handle carrying
 * `touch-none`, so a hold on the handle drags while a drag anywhere else still
 * scrolls the page. On a phone that distinction is the difference between a
 * usable list and one that throws bons around while you scroll past them.
 */
'use client'

import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Intervention } from '@/types'

export function PoolCard({
  intervention,
  onOpen,
  renderBadges,
  accentClass,
  alertNote,
}: {
  intervention: Intervention
  onOpen: () => void
  renderBadges: () => ReactNode
  accentClass: string
  alertNote: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: intervention.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 20 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl flex overflow-hidden bg-white/70 border border-dashed border-stroke"
    >
      <div className={`w-1 shrink-0 ${accentClass}`} />

      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Sleep ${intervention.customerName} naar de planning`}
        className="w-8 shrink-0 flex items-center justify-center bg-stroke/50 active:bg-stroke cursor-grab touch-none"
      >
        <span className="text-ink-soft text-lg select-none">⋮⋮</span>
      </button>

      <div
        onClick={onOpen}
        className="flex-1 p-3 cursor-pointer transition-opacity active:opacity-70"
      >
        <div className="mb-1 flex items-start gap-2">
          {alertNote}
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight text-ink">{intervention.customerName}</p>
            <p className="text-xs text-ink-soft">{intervention.siteCity}</p>
          </div>
        </div>

        {intervention.deviceBrand && (
          <p className="text-xs font-medium mt-1 text-ink">
            {intervention.deviceBrand} {intervention.deviceModel}
          </p>
        )}

        {intervention.description && (
          <p className="text-xs mt-0.5 mb-2 text-ink-soft">{intervention.description}</p>
        )}

        {renderBadges()}
      </div>
    </div>
  )
}
