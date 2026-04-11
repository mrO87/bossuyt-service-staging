/**
 * useRouteTimeline — state hook for the DayTimeline.
 *
 * Responsibilities:
 *  - Holds the current ordered list of movable items (jobs + break).
 *  - Holds start/end addresses + "same as start" toggle.
 *  - Derives the full visual sequence (start, travel, jobs/breaks, travel, end).
 *  - Derives day totals (job count, work minutes, travel minutes).
 *  - Exposes a `reorder` action used by dnd-kit on drag-end.
 *  - Fetches real travel times from /api/route/daily (ORS) when available,
 *    falling back to mockTravel for instant feedback.
 */
'use client'

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
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

// Bossuyt Depot — Industriepark-Noord 7, Sint-Niklaas
const DEPOT_LAT = 51.1480
const DEPOT_LON = 4.1709
const DEFAULT_START_ADDRESS = 'Bossuyt Depot · Sint-Niklaas'
const DEFAULT_BREAK_MINUTES = 30
const ROUTE_REFRESH_DEBOUNCE_MS = 350

type RouteRefreshInputs = Pick<RouteState, 'movableItems' | 'startAddress' | 'endAddress' | 'sameAsStart'>

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

/** Build the list of GPS stops for the route API, skipping breaks. */
function buildRouteStops(
  movableItems: MovableItem[],
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
): { lat: number; lon: number }[] {
  const stops: { lat: number; lon: number }[] = [
    { lat: startLat, lon: startLon },
  ]
  for (const item of movableItems) {
    if (item.kind === 'job' && item.intervention.siteLat && item.intervention.siteLon) {
      stops.push({ lat: item.intervention.siteLat, lon: item.intervention.siteLon })
    }
  }
  stops.push({ lat: endLat, lon: endLon })
  return stops
}

function buildRouteRequest(
  movableItems: MovableItem[],
  startAddress: string,
  endAddress: string,
  sameAsStart: boolean,
) {
  return {
    stops: buildRouteStops(
      movableItems,
      DEPOT_LAT, DEPOT_LON,
      DEPOT_LAT, DEPOT_LON,
    ),
    startAddress,
    endAddress,
    sameAsStart,
  }
}

/**
 * Route refresh reproduction seam.
 *
 * Repro: open the day timeline, change the start or end address, and note
 * that travel times only update once the order changes. Keeping the refresh
 * inputs in one explicit object makes that trigger easy to inspect in tests.
 */
function buildRouteRefreshRequest({
  movableItems,
  startAddress,
  endAddress,
  sameAsStart,
}: RouteRefreshInputs) {
  return buildRouteRequest(movableItems, startAddress, endAddress, sameAsStart)
}

function getRouteRefreshKey({
  movableItems,
  startAddress,
  endAddress,
  sameAsStart,
}: RouteRefreshInputs) {
  return JSON.stringify({
    itemIds: movableItems.map(item => item.id),
    startAddress,
    endAddress,
    sameAsStart,
  })
}

/**
 * Map ORS travel results back onto the full anchor sequence.
 *
 * The API returns segments between coordinate-bearing stops only (no breaks).
 * We assign: travel → break = 0, travel break → next job = real segment.
 */
function mapTravelOverrides(
  movableItems: MovableItem[],
  orsSegments: { distanceKm: number; travelMinutes: number }[],
): Map<string, { minutes: number; km: number }> {
  const map = new Map<string, { minutes: number; km: number }>()

  // Build anchors with their IDs: [start, ...jobs (skip breaks), end]
  const anchorIds: string[] = ['start']
  for (const item of movableItems) {
    if (item.kind === 'job') anchorIds.push(item.id)
  }
  anchorIds.push('end')

  // Map ORS segments to anchor pairs
  for (let i = 0; i < orsSegments.length && i < anchorIds.length - 1; i++) {
    const key = `${anchorIds[i]}:${anchorIds[i + 1]}`
    map.set(key, {
      minutes: orsSegments[i].travelMinutes,
      km: orsSegments[i].distanceKm,
    })
  }

  return map
}

/**
 * Find the nearest coordinate-bearing anchor ID before/after a given index.
 * Used to look up the real travel segment that spans across a break.
 */
function findCoordAnchorBefore(anchors: Array<{ kind: string; id: string }>, index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    if (anchors[i].kind !== 'break') return anchors[i].id
  }
  return 'start'
}

function findCoordAnchorAfter(anchors: Array<{ kind: string; id: string }>, index: number): string {
  for (let i = index + 1; i < anchors.length; i++) {
    if (anchors[i].kind !== 'break') return anchors[i].id
  }
  return 'end'
}

export function useRouteTimeline(plannedInterventions: Intervention[]) {
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
  const [travelOverrides, setTravelOverrides] = useState<Map<string, { minutes: number; km: number }> | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const fetchIdRef = useRef(0)
  const { movableItems, startAddress, endAddress, sameAsStart } = state
  const routeRefreshRequest = useMemo(
    () => buildRouteRefreshRequest({
      movableItems,
      startAddress,
      endAddress,
      sameAsStart,
    }),
    [movableItems, startAddress, endAddress, sameAsStart],
  )
  const routeRefreshKey = useMemo(
    () => getRouteRefreshKey({
      movableItems,
      startAddress,
      endAddress,
      sameAsStart,
    }),
    [movableItems, startAddress, endAddress, sameAsStart],
  )
  const lastSuccessfulRouteKeyRef = useRef<string | null>(null)

  // Fetch real travel times from ORS whenever the route inputs change.
  useEffect(() => {
    const id = ++fetchIdRef.current
    const { stops } = routeRefreshRequest

    if (stops.length < 2) return

    let cancelled = false

    if (routeRefreshKey !== lastSuccessfulRouteKeyRef.current) {
      setTravelOverrides(null)
    }

    const refreshRoute = async () => {
      setRouteLoading(true)

      try {
        const response = await fetch('/api/route/daily', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(routeRefreshRequest),
        })
        const data = await response.json()

        if (cancelled || id !== fetchIdRef.current) return

        if (data.steps && data.steps[0]?.provider !== 'mock') {
          const overrides = mapTravelOverrides(movableItems, data.steps)
          setTravelOverrides(overrides)
          lastSuccessfulRouteKeyRef.current = routeRefreshKey
        }
      } catch {
        // ORS unavailable — keep the last successful values usable.
      } finally {
        if (!cancelled && id === fetchIdRef.current) setRouteLoading(false)
      }
    }

    const timeoutId = window.setTimeout(() => {
      void refreshRoute()
    }, ROUTE_REFRESH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [movableItems, routeRefreshKey, routeRefreshRequest])

  // Derived: the full visual sequence + totals.
  const { fullSequence, totals } = useMemo(() => {
    const startItem: StartItem = { kind: 'start', id: 'start', address: state.startAddress }
    const endItem: EndItem = {
      kind: 'end',
      id: 'end',
      address: state.sameAsStart ? state.startAddress : state.endAddress,
    }

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

      if (i < anchors.length - 1) {
        const next = anchors[i + 1]
        let minutes: number
        let km: number

        // Try real ORS data first
        if (travelOverrides) {
          if (current.kind === 'break') {
            // Break doesn't change location — travel after break = real segment
            // from the job before break to the job after break
            const beforeId = findCoordAnchorBefore(anchors, i)
            const afterId = findCoordAnchorAfter(anchors, i)
            const real = travelOverrides.get(`${beforeId}:${afterId}`)
            // All travel goes on the "break → next" segment, so this one is 0
            // unless this IS the "break → next" segment
            if (next.kind !== 'break' && (next.kind === 'job' || next.kind === 'end')) {
              minutes = real?.minutes ?? mockTravel(current.id, next.id).minutes
              km = real?.km ?? mockTravel(current.id, next.id).km
            } else {
              minutes = 0
              km = 0
            }
          } else if (next.kind === 'break') {
            // Travel to a break = 0 (you're still at the current location)
            minutes = 0
            km = 0
          } else {
            // Normal coordinate-bearing pair
            const real = travelOverrides.get(`${current.id}:${next.id}`)
            minutes = real?.minutes ?? mockTravel(current.id, next.id).minutes
            km = real?.km ?? mockTravel(current.id, next.id).km
          }
        } else {
          // No ORS data yet — use mock (but also handle break logic)
          if (current.kind === 'break' || next.kind === 'break') {
            if (next.kind === 'break') {
              minutes = 0
              km = 0
            } else {
              // After break: estimate from previous real job
              const beforeId = findCoordAnchorBefore(anchors, i)
              const mock = mockTravel(beforeId, next.id)
              minutes = mock.minutes
              km = mock.km
            }
          } else {
            const mock = mockTravel(current.id, next.id)
            minutes = mock.minutes
            km = mock.km
          }
        }

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
  }, [state, travelOverrides])

  const reorder = useCallback((activeId: string, overId: string) => {
    setState(prev => {
      const oldIndex = prev.movableItems.findIndex(i => i.id === activeId)
      const newIndex = prev.movableItems.findIndex(i => i.id === overId)
      if (oldIndex === -1 || newIndex === -1) return prev
      return { ...prev, movableItems: arrayMove(prev.movableItems, oldIndex, newIndex) }
    })
    // Clear overrides so mock values show instantly; useEffect will refetch
    setTravelOverrides(null)
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
    routeLoading,
    reorder,
    setStartAddress,
    setEndAddress,
    setSameAsStart,
  }
}
