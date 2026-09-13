import { useState } from 'react'

export default function Section({
  title,
  children,
  collapsible = false,
  defaultOpen = true,
  badge,
  id,
  actionLabel,
  onActionClick,
  headerExtra,
}: {
  title: string
  children: React.ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  badge?: string
  id?: string
  actionLabel?: string
  onActionClick?: () => void
  /**
   * Iets rechts in het donkere kopbalkje, naast de titel.
   *
   * Voor knopjes die bij de kaart horen maar niet bij de inhoud — zoals de
   * originele bon openen. Een eigen regel eronder zou een hele balk kosten voor
   * iets waar je zelden op tikt.
   */
  headerExtra?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div id={id} className="rounded-xl overflow-hidden bg-white border border-stroke shadow-sm">
      {collapsible ? (
        <div className="flex items-center justify-between gap-2 bg-brand-dark px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen(prev => !prev)}
            className="flex flex-1 items-center justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 rounded-full bg-brand-orange" />
              <p className="font-bold text-sm tracking-wide text-white">{title}</p>
            </div>
            <div className="flex items-center gap-2">
              {badge && (
                <span className="rounded-full bg-brand-mid px-2 py-0.5 text-[11px] font-medium text-white">
                  {badge}
                </span>
              )}
              <span className="text-sm text-white">{open ? '▾' : '▸'}</span>
            </div>
          </button>
          {actionLabel && onActionClick && (
            <button
              type="button"
              onClick={() => {
                if (!open) setOpen(true)
                onActionClick()
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-orange text-lg font-bold text-white"
              aria-label={actionLabel}
            >
              +
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-brand-dark py-2 pl-4 pr-2.5">
          <div className="w-1 h-4 rounded-full bg-brand-orange shrink-0" />
          {/*
            De titel kort in, de knopjes niet. "SERVICE BON | BON DE SERVICE" is
            lang, en op een telefoon van 400 px zou hij de knopjes van het scherm
            duwen. Drie puntjes op de titel is goedkoper dan een knop die je
            niet meer kan raken.
          */}
          <p className="min-w-0 flex-1 truncate font-bold text-sm tracking-wide text-white">{title}</p>
          {headerExtra}
        </div>
      )}

      {(!collapsible || open) && (
        <div className="p-4">{children}</div>
      )}
    </div>
  )
}
