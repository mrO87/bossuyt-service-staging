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
}: {
  title: string
  children: React.ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  badge?: string
  id?: string
  actionLabel?: string
  onActionClick?: () => void
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
        <div className="flex items-center gap-2 px-4 py-3 bg-brand-dark">
          <div className="w-1 h-4 rounded-full bg-brand-orange" />
          <p className="font-bold text-sm tracking-wide text-white">{title}</p>
        </div>
      )}

      {(!collapsible || open) && (
        <div className="p-4">{children}</div>
      )}
    </div>
  )
}
