/**
 * useRouteTimeline — state hook for the DayTimeline.
 *
 * Responsibilities:
 *  - Holds the current ordered list of movable items (jobs + break).
 *  - Holds start/end addresses + "same as start" toggle.
 *  - Derives the full visual sequence (start, travel, jobs/breaks, travel, end).
 *  - Derives day totals (job count, work minutes, travel minutes).
 *  - Exposes a `reorder` action used by dnd-kit on drag-end.
 *
 * The hook is intentionally local state only. When the real sync layer
 * is wired in, a useEffect can push `state.movableItems` to IndexedDB
 * via `updateInterventionSequence` in lib/idb.ts.
 */
'use client'

import { useMemo, useState, useCallback } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import type { Intervention } from '@/types'
import { mockTravel } from './mockRouting'
import type {
  RouteState,
  RouteTotals,
  MovableItem,
  JobItem,
  BreakItem,
  TimelineItem,
  StartItem,
  EndItem,
  TravelItem,
} from './types'

const DEFAULT_START_ADDRESS = 'Bossuyt Depot · Sint-Niklaas'
const DEFAULT_BREAK_MINUTES = 30

/** Insert a 30-minute midday break in the middle of the job list. */
function insertMiddayBreak(jobs: JobItem[]): MovableItem[] {
  if (jobs.length < 2) return [...jobs]
  const midIndex = Math.floor(jobs.length / 2)
  const breakItem: BreakItem = {
    kind: 'break',
    id: 'break',
    minutes: DEFAULT_BREAK_MINUTES,
    label: 'Middagpauze',
  }
  return [...jobs.slice(0, midIndex), breakItem, ...jobs.slice(midIndex)]
}

export function useRouteTimeline(plannedInterventions: Intervention[]) {
  // Build the initial state ONCE per set of interventions.
  const initialState = useMemo<RouteState>(() => {
    const jobs: JobItem[] = plannedInterventions.map(intervention => ({
      kind: 'job',
      id: intervention.id,
      intervention,
    }))
    return {
      startAddress: DEFAULT_START_ADDRESS,
      endAddress: DEFAULT_START_ADDRESS,
      sameAsStart: true,
      movableItems: insertMiddayBreak(jobs),
    }
  }, [plannedInterventions])

  const [state, setState] = useState<RouteState>(initialState)

  // Derived: the full visual sequence + totals.
  const { fullSequence, totals } = useMemo(() => {
    const startItem: StartItem = { kind: 'start', id: 'start', address: state.startAddress }
    const endItem: EndItem = {
      kind: 'end',
      id: 'end',
      address: state.sameAsStart ? state.startAddress : state.endAddress,
    }

    // Anchors = [start, ...movables, end] — the points between which we draw travel rows.
    const anchors: Array<StartItem | EndItem | MovableItem> = [
      startItem,
      ...state.movableItems,
      endItem,
    ]

    const sequence: TimelineItem[] = []
    const tally: RouteTotals = { jobCount: 0, workMinutes: 0, travelMinutes: 0 }

    for (let i = 0; i < anchors.length; i++) {
      const current = anchors[i]

      if (current.kind === 'job') {
        tally.jobCount++
        tally.workMinutes += current.intervention.estimatedMinutes ?? 0
      }

      sequence.push(current)

      // Insert a derived travel row between each pair of anchors.
      if (i < anchors.length - 1) {
        const next = anchors[i + 1]
        const { minutes, km } = mockTravel(current.id, next.id)
        tally.travelMinutes += minutes
        const travel: TravelItem = {
          kind: 'travel',
          id: `travel:${current.id}:${next.id}`,
          fromId: current.id,
          toId: next.id,
          minutes,
          km,
        }
        sequence.push(travel)
      }
    }

    return { fullSequence: sequence, totals: tally }
  }, [state])

  const reorder = useCallback((activeId: string, overId: string) => {
    setState(prev => {
      const oldIndex = prev.movableItems.findIndex(i => i.id === activeId)
      const newIndex = prev.movableItems.findIndex(i => i.id === overId)
      if (oldIndex === -1 || newIndex === -1) return prev
      return { ...prev, movableItems: arrayMove(prev.movableItems, oldIndex, newIndex) }
    })
  }, [])

  const setStartAddress = useCallback((address: string) => {
    setState(prev => ({
      ...prev,
      startAddress: address,
      endAddress: prev.sameAsStart ? address : prev.endAddress,
    }))
  }, [])

  const setEndAddress = useCallback((address: string) => {
    setState(prev => ({ ...prev, endAddress: address, sameAsStart: false }))
  }, [])

  const setSameAsStart = useCallback((same: boolean) => {
    setState(prev => ({
      ...prev,
      sameAsStart: same,
      endAddress: same ? prev.startAddress : prev.endAddress,
    }))
  }, [])

  return {
    state,
    fullSequence,
    totals,
    reorder,
    setStartAddress,
    setEndAddress,
    setSameAsStart,
  }
}
