/**
 * OpenPool — work orders with no day yet.
 *
 * Not "unassigned work": a technician may already be attached. What puts a work
 * order here is the absence of a planned date, and dragging one onto the day is
 * what gives it one. Dragging it back only clears the date again — the
 * technician stays on the bon.
 *
 * The whole section is a droppable, not just the cards, so a work order can be
 * returned to an empty pool. Cards carry the same hold-to-drag handle the day
 * timeline uses: without it, scrolling a long pool would fling bons around.
 */
'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'

import AlertNoteBadge from '@/components/AlertNoteBadge'
import { POOL_DROPPABLE_ID } from '@/lib/planning/dropIntent'
import type { Intervention } from '@/types'
import {
  statusClass,
  statusLabel,
  typeBorderClass,
  typeClass,
  typeLabel,
} from '@/components/planning/interventionLabels'
import { EstimateBadge } from '@/components/planning/EstimateBadge'
import { PoolCard } from './PoolCard'

function Badge({ className, label }: { className: string; label: string }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${className}`}>
      {label}
    </span>
  )
}

export function OpenPool({
  interventions,
  visible,
  onToggleVisible,
  onOpen,
}: {
  interventions: Intervention[]
  visible: boolean
  onToggleVisible: () => void
  onOpen: (id: string) => void
}) {
  // Registered even while the list is hidden would be wrong — you cannot drop
  // onto something you cannot see — so the droppable follows `visible`.
  const { setNodeRef, isOver } = useDroppable({
    id: POOL_DROPPABLE_ID,
    disabled: !visible,
  })

  return (
    <>
      {/* Anchored so adding a bon can land here rather than at the top of the
          day: the pool is where the new work order actually turns up. */}
      <div id="open-pool" className="flex items-center justify-between mt-8 mb-2 scroll-mt-4">
        <h2 className="text-sm font-bold tracking-wide text-ink uppercase">Open pool</h2>
        <button
          onClick={onToggleVisible}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-stroke text-ink-soft text-[11px] font-semibold active:opacity-70 transition-opacity"
        >
          {visible ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
              Verbergen
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {interventions.length} tonen
            </>
          )}
        </button>
      </div>

      {visible && (
        <>
          <p className="text-xs text-ink-soft mb-3">
            Flexibele jobs zonder dag. Sleep er eentje in de planning om hem in
            te plannen, of sleep een job hierheen om hem terug vrij te geven.
          </p>

          <div
            ref={setNodeRef}
            className={[
              'flex flex-col gap-3 rounded-xl transition-colors',
              // A visible landing zone matters most when the pool is empty:
              // otherwise there is nothing to aim at.
              isOver ? 'outline-2 outline-dashed outline-brand-orange bg-brand-orange/5 p-2 -m-2' : '',
              interventions.length === 0 ? 'min-h-24' : '',
            ].join(' ')}
          >
            <SortableContext
              items={interventions.map(i => i.id)}
              strategy={verticalListSortingStrategy}
            >
              {interventions.map(intervention => (
                <PoolCard
                  key={intervention.id}
                  intervention={intervention}
                  onOpen={() => onOpen(intervention.id)}
                  renderBadges={() => (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge className={typeClass(intervention.type)} label={typeLabel(intervention.type)} />
                      <Badge className={statusClass(intervention.status)} label={statusLabel(intervention.status)} />
                      <EstimateBadge
                        interventionId={intervention.id}
                        minutes={intervention.estimatedMinutes}
                      />

                      {intervention.isUrgent && <Badge className="bg-brand-red text-white" label="Dringend" />}
                    </div>
                  )}
                  accentClass={typeBorderClass(intervention.type, intervention.isUrgent)}
                  alertNote={
                    intervention.alertNote ? <AlertNoteBadge note={intervention.alertNote} /> : null
                  }
                />
              ))}
            </SortableContext>

            {interventions.length === 0 && (
              <p className="text-center py-6 text-ink-soft text-sm">
                {isOver ? 'Laat los om vrij te geven' : 'Geen jobs in de pool'}
              </p>
            )}
          </div>
        </>
      )}
    </>
  )
}
