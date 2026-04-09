/**
 * TimelineRail — shared visual primitive for one row of the timeline.
 *
 * Each row of the timeline is rendered with a fixed-width "rail" column
 * on the left (where the dashed line + node dots live) and a free-form
 * content column on the right.
 *
 * All rows use this same grid so the dashed line stays perfectly aligned
 * across travel / job / break / anchor rows.
 */
'use client'

import type { ReactNode } from 'react'

export const RAIL_WIDTH_PX = 44

export function TimelineRail({
  children,
  railContent,
  className = '',
}: {
  /** Right column — the actual row content (card, label, chip, …). */
  children: ReactNode
  /** Left column — the rail fragment (line + dot / circle / icon). */
  railContent: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-stretch ${className}`}>
      <div
        className="shrink-0 relative flex justify-center"
        style={{ width: RAIL_WIDTH_PX }}
      >
        {railContent}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

/**
 * The dashed vertical line used inside a row's rail column.
 * Absolutely positioned so it stretches the row's full height.
 */
export function RailLine({
  variant = 'full',
}: {
  /** `full` = top to bottom. `bottom-half` = halfway down to bottom. `top-half` = top to halfway. */
  variant?: 'full' | 'bottom-half' | 'top-half'
}) {
  const inset =
    variant === 'full'
      ? 'inset-y-0'
      : variant === 'bottom-half'
        ? 'top-1/2 bottom-0'
        : 'top-0 bottom-1/2'
  return (
    <div
      aria-hidden
      className={`absolute ${inset} left-1/2 -translate-x-1/2 border-l-2 border-dashed border-stroke/70 pointer-events-none`}
    />
  )
}
