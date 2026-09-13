/**
 * PoolBar — de open pool als balk, vastgeplakt aan de onderrand van het scherm.
 *
 * De pool hing onder het rooster. Dat werkte zolang de pagina mocht scrollen
 * tijdens het slepen; sinds die scroll vaststaat (v1.64, omdat het venster
 * wegsprong onder de vinger) was ze met een blok in je hand onbereikbaar.
 *
 * Een doelwit waar je naartoe moet scrollen is geen doelwit. Deze balk staat er
 * altijd, ook met een vinger op een blok, en dat is het hele punt.
 *
 * In rust is ze een smalle strook met een teller. Tik erop en ze schuift open
 * met de bonnen erin, om er eentje uit te slepen. Tijdens het slepen zegt ze wat
 * loslaten betekent — want een balk die er altijd staat, moet ook zeggen waarom.
 */
'use client'

import { useDraggable, useDroppable } from '@dnd-kit/core'
import { POOL_DROPPABLE_ID } from '@/lib/planning/dropIntent'
import { formatMinutes, typeBorderClass } from '@/components/planning/interventionLabels'
import type { Intervention } from '@/types'

export function PoolBar({
  interventions,
  open,
  onToggle,
  dragging,
  onOpenIntervention,
}: {
  interventions: Intervention[]
  open: boolean
  onToggle: () => void
  /** Er wordt een blok vastgehouden: de balk zegt dan wat loslaten doet. */
  dragging: boolean
  onOpenIntervention: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: POOL_DROPPABLE_ID })

  return (
    <div
      ref={setNodeRef}
      className={[
        'fixed inset-x-0 bottom-0 z-40 text-white shadow-[0_-6px_20px_-8px_rgba(0,0,0,0.45)]',
        isOver ? 'bg-brand-orange' : 'bg-brand-blue',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-4 text-left"
      >
        <span className="font-mono text-[11px] font-semibold uppercase tracking-widest">Pool</span>
        <span className="rounded-full bg-white/20 px-2 font-mono text-[11px] font-semibold tabular-nums">
          {interventions.length}
        </span>
        <span className="ml-auto truncate text-[11px] text-white/75">
          {dragging
            ? 'laat hier los om hem uit de planning te halen'
            : open ? 'sleep er eentje naar een dag' : 'tik om te openen'}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
          className={open ? 'rotate-180 shrink-0 transition-transform' : 'shrink-0 transition-transform'}
          aria-hidden
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      {open && (
        <div className="flex gap-2 overflow-x-auto px-3 pb-3">
          {interventions.length === 0 && (
            <p className="py-2 text-[11px] text-white/70">Niets in de pool.</p>
          )}
          {interventions.map(intervention => (
            <PoolCard
              key={intervention.id}
              intervention={intervention}
              onOpen={onOpenIntervention}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Eén kaartje in de opengeschoven balk.
 *
 * Smal genoeg dat er drie naast elkaar staan, met een eigen greep — dezelfde
 * afspraak als op het rooster: het strookje sleept, de rest opent de bon.
 */
function PoolCard({
  intervention,
  onOpen,
}: {
  intervention: Intervention
  onOpen: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: intervention.id })
  const noSelect = { WebkitTouchCallout: 'none', WebkitUserSelect: 'none' } as const

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className={[
        'flex w-36 shrink-0 gap-1.5 rounded-lg border border-white/20 bg-white/10 p-1.5',
        typeBorderClass(intervention.type, intervention.isUrgent),
        isDragging ? 'opacity-50' : '',
      ].join(' ')}
      style={noSelect}
    >
      <span
        {...listeners}
        aria-label={`${intervention.customerName} verslepen`}
        className="flex w-3 shrink-0 touch-none cursor-grab items-center justify-center rounded bg-black/25 active:cursor-grabbing"
        style={noSelect}
      >
        <span className="block h-4 w-0.5 rounded-full bg-white/70" />
      </span>

      <button
        type="button"
        onClick={() => onOpen(intervention.id)}
        className="min-w-0 flex-1 text-left"
        style={noSelect}
      >
        <span className="block truncate text-[11px] font-bold leading-tight">
          {intervention.customerName}
        </span>
        <span className="block truncate font-mono text-[9.5px] text-white/70">
          {intervention.siteCity}
          {intervention.estimatedMinutes ? ` · ${formatMinutes(intervention.estimatedMinutes)}` : ''}
        </span>
      </button>
    </div>
  )
}
