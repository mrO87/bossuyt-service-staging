'use client'

/**
 * Wisselen tussen de planningsweergaven, via de titel.
 *
 * Er waren twee weergaven en er komt er een derde (de Gantt over alle
 * techniekers). Het woord "Week" dat in de datumbalk geduwd stond werkte voor
 * twee en heeft geen plaats voor een derde.
 *
 * Van de vier onderzochte plaatsen koos de gebruiker deze: de titel krijgt een
 * pijltje en is zelf de knop. Ze kost geen enkele pixel hoogte — en dat telt,
 * want de dagweergave is wat een technieker de hele dag voor zich heeft, en die
 * heeft aan één weergave genoeg. Een schakelbalk zou hem elke dag ruimte kosten
 * voor een keuze die hij nooit maakt.
 *
 * De prijs is een tik extra en een pijltje dat over het hoofd gezien kan
 * worden. Dat is bewust aanvaard.
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export type PlanningView = 'dag' | 'week'

const VIEWS: Array<{ id: PlanningView; label: string; hint: string; href: string }> = [
  { id: 'dag',  label: 'Dagplanning',  hint: 'één dag, met de volgorde', href: '/' },
  { id: 'week', label: 'Weekplanning', hint: 'zeven dagen naast elkaar', href: '/planning/week' },
]

export function ViewSwitcher({ current }: { current: PlanningView }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Buiten de lijst tikken sluit hem. Een open menu dat blijft hangen omdat je
  // ernaast mikte is op een telefoon erger dan op een scherm met een muis.
  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = VIEWS.find(view => view.id === current) ?? VIEWS[0]

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex items-center gap-1 text-xs leading-tight text-ink-soft active:opacity-70"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {active.label}
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
          className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-brand-mid bg-brand-dark shadow-xl"
        >
          {VIEWS.map(view => {
            const isCurrent = view.id === current
            return (
              <button
                key={view.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  if (!isCurrent) router.push(view.href)
                }}
                className={`flex w-full min-h-11 flex-col items-start px-3 py-2 text-left active:bg-brand-mid/60 ${
                  isCurrent ? 'bg-brand-mid/40' : ''
                }`}
              >
                <span className={`text-sm font-semibold ${isCurrent ? 'text-brand-orange' : 'text-white'}`}>
                  {view.label}
                </span>
                <span className="text-[11px] leading-tight text-ink-faint">{view.hint}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
