/**
 * DayTimeline — the technician's day laid out as a vertical route.
 *
 * Reads planned interventions, keeps them in a mutable ordered list of
 * "movable items" (jobs + one midday break), and renders the full
 * sequence including derived travel segments between every anchor.
 *
 * The DndContext + SortableContext wraps only the movable items, so the
 * user can drag to reorder jobs and the break freely, but not the start
 * and end anchors.
 *
 * Travel minutes/km are derived by `useRouteTimeline`, which refreshes
 * the route automatically when the order or start/end inputs change.
 * This component stays focused on rendering and drag/drop interaction.
 */
'use client'

import { useRouter } from 'next/navigation'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

import type { Intervention } from '@/types'
import { useRouteTimeline } from './useRouteTimeline'
import { DaySummary } from './DaySummary'
import { StartEndAddressControls } from './StartEndAddressControls'
import { TimelineNode } from './TimelineNode'
import { TravelSegment } from './TravelSegment'
import { JobTimelineCard } from './JobTimelineCard'
import { BreakTimelineCard } from './BreakTimelineCard'

export function DayTimeline({
  plannedInterventions,
}: {
  plannedInterventions: Intervention[]
}) {
  const router = useRouter()
  const {
    state,
    fullSequence,
    totals,
    routeLoading,
    reorder,
    setStartAddress,
    setEndAddress,
    setSameAsStart,
  } = useRouteTimeline(plannedInterventions)

  // dnd-kit sensors. Touch sensor needs a deliberate hold before activating
  // so the rest of the card stays scrollable.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    reorder(String(active.id), String(over.id))
    // Route refresh is handled inside useRouteTimeline; this only updates order.
  }

  const sortableIds = state.movableItems.map(i => i.id)

  return (
    <section className="flex flex-col gap-3">
      <DaySummary
        jobCount={totals.jobCount}
        workMinutes={totals.workMinutes}
        travelMinutes={totals.travelMinutes}
        routeLoading={routeLoading}
      />

      <StartEndAddressControls
        startAddress={state.startAddress}
        endAddress={state.sameAsStart ? state.startAddress : state.endAddress}
        sameAsStart={state.sameAsStart}
        onChangeStart={setStartAddress}
        onChangeEnd={setEndAddress}
        onToggleSame={setSameAsStart}
      />

      <div className="mt-1">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col">
              {fullSequence.map(item => {
                switch (item.kind) {
                  case 'start':
                    return (
                      <TimelineNode
                        key={item.id}
                        position="start"
                        label="Start"
                        address={item.address}
                      />
                    )
                  case 'end':
                    return (
                      <TimelineNode
                        key={item.id}
                        position="end"
                        label="Einde"
                        address={item.address}
                      />
                    )
                  case 'travel':
                    return (
                      <TravelSegment
                        key={item.id}
                        minutes={item.minutes}
                        km={item.km}
                      />
                    )
                  case 'job':
                    return (
                      <JobTimelineCard
                        key={item.id}
                        id={item.id}
                        intervention={item.intervention}
                        onClick={() =>
                          router.push(`/interventions/${item.intervention.id}`)
                        }
                      />
                    )
                  case 'break':
                    return (
                      <BreakTimelineCard
                        key={item.id}
                        id={item.id}
                        minutes={item.minutes}
                        label={item.label}
                      />
                    )
                }
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </section>
  )
}
