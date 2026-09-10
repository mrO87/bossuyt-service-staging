'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  note: string
}

/**
 * The red exclamation mark on a work order card, with the note in a balloon.
 *
 * Opens on tap, not on hover. A technician reads this on a phone in a machine
 * room; there is no pointer to hover with, so a hover-only balloon would make
 * the note unreadable exactly where it matters. Hovering still works on a
 * desktop, on top of the tap.
 */
export default function AlertNoteBadge({ note }: Props) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLSpanElement>(null)

  // Close when the next tap lands anywhere else. Registered only while open, so
  // a list of twenty cards is not twenty idle listeners.
  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  return (
    <span ref={wrapper} className="relative inline-flex group">
      <button
        type="button"
        aria-label={`Melding: ${note}`}
        aria-expanded={open}
        onClick={event => {
          // The whole card is a link to the work order; opening the balloon
          // must not navigate away from the list.
          event.stopPropagation()
          setOpen(previous => !previous)
        }}
        className="w-6 h-6 shrink-0 rounded-full bg-brand-red text-white text-sm font-bold leading-none flex items-center justify-center shadow-sm"
      >
        !
      </button>

      <span
        role="tooltip"
        className={[
          'absolute left-0 top-8 z-30 w-56 rounded-xl px-3 py-2',
          'bg-brand-dark text-white text-xs font-medium leading-snug shadow-xl',
          'transition-opacity duration-150',
          open
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:opacity-100',
        ].join(' ')}
      >
        {/* Little arrow pointing back at the exclamation mark. */}
        <span className="absolute -top-1 left-2 w-2 h-2 rotate-45 bg-brand-dark" />
        {note}
      </span>
    </span>
  )
}
