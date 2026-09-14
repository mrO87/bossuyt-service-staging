/**
 * DayTimeline — the technician's day laid out as a vertical route.
 *
 * Start → travel → job → travel → job → break → travel → job → travel → end.
 * Travel segments are derived, never stored, so reordering is trivial.
 *
 * Presentation only. The drag context and the state it changes live one level
 * up in PlanningBoard, because a drag has to be able to cross into the open
 * pool and a context cannot see cards outside itself.
 */
'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'

import { PLANNING_DROPPABLE_ID } from '@/lib/planning/dropIntent'
import { formatClock } from '@/components/planning/interventionLabels'
import { isoForTimeOn, minutesOfDay, type DayClock } from '@/lib/planning/useDayClock'
import { DayClockButton } from './DayClockButton'
import type { useRouteTimeline } from './useRouteTimeline'
import { DaySummary } from './DaySummary'
import { StartEndAddressControls } from './StartEndAddressControls'
import { TimelineNode } from './TimelineNode'
import { TravelSegment } from './TravelSegment'
import { JobTimelineCard } from './JobTimelineCard'
import { BreakTimelineCard } from './BreakTimelineCard'

export function DayTimeline({
  timeline,
  selectedDate,
  onOpenIntervention,
  dayClock,
}: {
  timeline: ReturnType<typeof useRouteTimeline>
  selectedDate: Date
  onOpenIntervention: (id: string) => void
  /** De dagklok van deze dag. Ontbreekt hij, dan staan de knopjes er niet. */
  dayClock?: {
    day: string
    clock: DayClock
    zet: (welk: 'startedAt' | 'endedAt', iso: string | null) => void
  }
}) {
  const {
    state,
    fullSequence,
    totals,
    startByIntervention,
    routeLoading,
    travelIsEstimated,
    departFromOriginMinutes,
    backAtOriginMinutes,
    plannedDepartureMinutes,
    setStartAddress,
    setEndAddress,
    setSameAsStart,
  } = timeline

  /**
   * Hoeveel later of vroeger je vertrokken bent dan gepland.
   *
   * Alleen als het iets voorstelt: een minuut verschil is ruis, en een regel
   * die elke dag "1 min later dan gepland" zegt, leest niemand nog.
   */
  const afwijking = (() => {
    const echt = minutesOfDay(dayClock?.clock.startedAt ?? null)
    if (echt === null) return undefined
    const verschil = echt - plannedDepartureMinutes
    if (Math.abs(verschil) < 5) return 'Vertrokken op het geplande uur'
    return verschil > 0
      ? `Vertrokken · ${verschil} min later dan gepland`
      : `Vertrokken · ${-verschil} min vroeger dan gepland`
  })()

  // The whole column is a target, so a work order can be dropped onto a day
  // that has no jobs in it yet.
  const { setNodeRef, isOver } = useDroppable({ id: PLANNING_DROPPABLE_ID })

  const sortableIds = state.movableItems.map(item => item.id)

  return (
    <section className="flex flex-col gap-3">
      <DaySummary
        date={selectedDate}
        jobCount={totals.jobCount}
        workMinutes={totals.workMinutes}
        travelMinutes={totals.travelMinutes}
        breakMinutes={totals.breakMinutes}
        unknownLegs={totals.unknownLegs}
        routeLoading={routeLoading}
        travelIsEstimated={travelIsEstimated}
      />

      <StartEndAddressControls
        startAddress={state.startAddress}
        endAddress={state.sameAsStart ? state.startAddress : state.endAddress}
        sameAsStart={state.sameAsStart}
        onChangeStart={setStartAddress}
        onChangeEnd={setEndAddress}
        onToggleSame={setSameAsStart}
      />

      <div
        ref={setNodeRef}
        className={[
          'mt-1 rounded-xl transition-colors',
          isOver ? 'outline-2 outline-dashed outline-brand-orange bg-brand-orange/5' : '',
        ].join(' ')}
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
                      note={afwijking}
                      extra={dayClock && (
                        <DayClockButton
                          kind="start"
                          actualMinutes={minutesOfDay(dayClock.clock.startedAt)}
                          plannedMinutes={departFromOriginMinutes}
                          onSet={m => dayClock.zet('startedAt', isoForTimeOn(dayClock.day, formatClock(m)))}
                          onClear={() => dayClock.zet('startedAt', null)}
                        />
                      )}
                    />
                  )
                case 'end':
                  return (
                    <TimelineNode
                      key={item.id}
                      position="end"
                      label="Einde"
                      address={item.address}
                      extra={dayClock && (
                        <DayClockButton
                          kind="end"
                          actualMinutes={minutesOfDay(dayClock.clock.endedAt)}
                          plannedMinutes={backAtOriginMinutes}
                          onSet={m => dayClock.zet('endedAt', isoForTimeOn(dayClock.day, formatClock(m)))}
                          onClear={() => dayClock.zet('endedAt', null)}
                        />
                      )}
                    />
                  )
                case 'travel':
                  return (
                    <TravelSegment
                      key={item.id}
                      minutes={item.minutes}
                      km={item.km}
                      provider={item.provider}
                    />
                  )
                case 'job':
                  return (
                    <JobTimelineCard
                      key={item.id}
                      id={item.id}
                      intervention={item.intervention}
                      startMinutes={startByIntervention[item.intervention.id]}
                      onClick={() => onOpenIntervention(item.intervention.id)}
                    />
                  )
                case 'break':
                  return (
                    <BreakTimelineCard key={item.id} id={item.id} minutes={item.minutes} label={item.label} />
                  )
              }
            })}
          </div>
        </SortableContext>

        {totals.jobCount === 0 && (
          <p className="text-center py-6 text-ink-soft text-sm">
            {isOver ? 'Laat los om in te plannen' : 'Nog niets ingepland — sleep een job uit de pool'}
          </p>
        )}
      </div>
    </section>
  )
}
