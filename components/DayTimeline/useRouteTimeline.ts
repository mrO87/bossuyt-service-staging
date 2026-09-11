/**
 * useRouteTimeline — state hook for the DayTimeline.
 *
 * Holds the ordered list of movable items (jobs + one midday break), the
 * start/end addresses, and derives both the visible sequence and the day's
 * totals from them.
 *
 * Travel times are looked up by **coordinates**, in four layers, cheapest and
 * most trustworthy first:
 *
 *   1. the travel cache — what the routing service already told us, good for
 *      seven days
 *   2. a pinned route — a road somebody has actually measured
 *   3. an estimate from the distance between the two points
 *   4. nothing, admitted as "? min", when an address never geocoded
 *
 * The request that fills layer 1 fires only when the **set** of locations
 * changes — never when their order does. A matrix answers for every pair of
 * stops it is given, so one request covers every possible order of them, and
 * dragging a day into shape costs nothing. That matters: the previous version
 * asked again on every reorder and emptied the daily quota in an afternoon.
 */
'use client'

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import type { Intervention } from '@/types'
import {
  getStartAddressFromSettings,
  getStartCoordinatesFromSettings,
  type Settings,
} from '@/lib/hooks/useSettings'
import type { Coordinates } from '@/lib/routing/IRoutingService'
import { estimateTravel } from '@/lib/routing/estimateTravel'
import { knownRoute } from '@/lib/routing/knownRoutes'
import {
  mergeIntoCache,
  pruneCache,
  readFresh,
  type CachedLeg,
  type TravelCache,
} from '@/lib/routing/travelCache'
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

const DEFAULT_BREAK_MINUTES = 30
const ROUTE_REFRESH_DEBOUNCE_MS = 350

/**
 * Shared by every mount in this tab. Switching days, opening a work order and
 * coming back, dragging for ten minutes — none of it throws away what we
 * already know about the roads.
 */
const travelCache: TravelCache = new Map()

type ResolvedLeg = {
  minutes: number | null
  km: number | null
  provider: 'ors' | 'estimate' | 'unknown'
}

const UNKNOWN_LEG: ResolvedLeg = { minutes: null, km: null, provider: 'unknown' }
const NO_TRAVEL: ResolvedLeg = { minutes: 0, km: 0, provider: 'ors' }

function jobCoordinates(intervention: Intervention): Coordinates | undefined {
  if (typeof intervention.siteLat !== 'number') return undefined
  if (typeof intervention.siteLon !== 'number') return undefined
  return { lat: intervention.siteLat, lon: intervention.siteLon }
}

/** The four layers, in order. */
function resolveLeg(cache: TravelCache, from?: Coordinates, to?: Coordinates): ResolvedLeg {
  if (!from || !to) return UNKNOWN_LEG

  const cached = readFresh(cache, from, to)
  if (cached) return { minutes: cached.minutes, km: cached.km, provider: cached.provider }

  const pinned = knownRoute(from, to)
  if (pinned) return { minutes: pinned.minutes, km: pinned.km, provider: 'estimate' }

  const estimated = estimateTravel(from, to)
  if (estimated) return { minutes: estimated.minutes, km: estimated.km, provider: 'estimate' }

  return UNKNOWN_LEG
}

/**
 * A fingerprint of the day as the server sees it: which work orders, in which
 * order. Used to notice that the day changed from outside — a sync, or a drag
 * that has been written — and take the new list.
 */
export function externalJobSignature(interventions: Intervention[]): string {
  return interventions
    .map(intervention =>
      `${intervention.id}:${intervention.technicians.find(t => t.isLead)?.plannedOrder ?? 0}`)
    .join('|')
}

/**
 * Whether to replace the working order with what arrived from outside.
 *
 * `null` means nothing has arrived yet. An **empty string** does not: it is a
 * day with no work orders on it, which is a real state and the one this got
 * wrong. The guard used to be `if (!nextSignature) return`, so emptying a day
 * was ignored — drag the last job to the pool and it was released on the server
 * and in the pool list, while the timeline went on drawing it. It could not be
 * moved again, because as far as the day was concerned it had never left.
 */
export function shouldTakeExternalOrder(previous: string | null, next: string): boolean {
  return previous !== next
}

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

export function useRouteTimeline(plannedInterventions: Intervention[], settings: Settings) {
  const configuredStartAddress = useMemo(() => getStartAddressFromSettings(settings), [settings])
  const configuredStartCoordinates = useMemo(
    () => getStartCoordinatesFromSettings(settings),
    [settings],
  )

  const initialState = useMemo<RouteState>(() => {
    const jobs: JobItem[] = plannedInterventions.map(intervention => ({
      kind: 'job',
      id: intervention.id,
      intervention,
    }))
    return {
      startAddress: configuredStartAddress,
      endAddress: configuredStartAddress,
      sameAsStart: true,
      movableItems: insertMiddayBreak(jobs),
    }
  }, [configuredStartAddress, plannedInterventions])

  const [state, setState] = useState<RouteState>(initialState)
  const [routeLoading, setRouteLoading] = useState(false)
  /**
   * A snapshot of the shared cache. The cache itself outlives this component so
   * that switching days or opening a work order does not throw away what we
   * know about the roads; the snapshot is what React can actually observe, so
   * the sequence redraws when new legs land.
   */
  const [cacheSnapshot, setCacheSnapshot] = useState<TravelCache>(() => new Map(travelCache))
  /**
   * Start and end are given as addresses and geocoded on the server, so their
   * coordinates only become known once it has answered. Until then the
   * configured ones stand in, which is right for the atelier and for home.
   */
  const [resolvedEndpoints, setResolvedEndpoints] = useState<{
    start?: Coordinates
    end?: Coordinates
  }>({})

  const fetchIdRef = useRef(0)
  // null, not '': an empty day has an empty signature, and the two must not be
  // confused — see shouldTakeExternalOrder.
  const lastExternalJobSignatureRef = useRef<string | null>(null)
  const { movableItems, startAddress, endAddress, sameAsStart } = state

  const usingConfiguredStart = startAddress === configuredStartAddress
  const startCoordinates = resolvedEndpoints.start
    ?? (usingConfiguredStart ? configuredStartCoordinates : undefined)
  const endCoordinates = sameAsStart
    ? startCoordinates
    : resolvedEndpoints.end
      ?? (endAddress === configuredStartAddress ? configuredStartCoordinates : undefined)

  /**
   * Identifies the set of places this day visits — sorted, so reordering the
   * very same stops produces the very same key and asks nothing.
   */
  const locationSetKey = useMemo(() => {
    const jobPoints = movableItems
      .filter((item): item is JobItem => item.kind === 'job')
      .map(item => {
        const coordinates = jobCoordinates(item.intervention)
        return coordinates ? `${coordinates.lat},${coordinates.lon}` : 'onbekend'
      })
      .sort()

    return JSON.stringify({
      jobPoints,
      startAddress,
      endAddress: sameAsStart ? startAddress : endAddress,
    })
  }, [movableItems, startAddress, endAddress, sameAsStart])

  // Reset the working order when the day's jobs change from outside (a sync).
  useEffect(() => {
    const nextSignature = externalJobSignature(plannedInterventions)
    if (!shouldTakeExternalOrder(lastExternalJobSignatureRef.current, nextSignature)) return

    lastExternalJobSignatureRef.current = nextSignature
    setState(current => ({ ...current, movableItems: initialState.movableItems }))
  }, [initialState.movableItems, plannedInterventions])

  useEffect(() => {
    setState(prev => ({
      ...prev,
      startAddress: configuredStartAddress,
      endAddress: prev.sameAsStart ? configuredStartAddress : prev.endAddress,
    }))
  }, [configuredStartAddress])

  // Fetch real travel times — only when the set of places changes.
  useEffect(() => {
    const id = ++fetchIdRef.current
    let cancelled = false

    const stops: Coordinates[] = [
      startCoordinates ?? configuredStartCoordinates,
      ...movableItems.flatMap(item => {
        if (item.kind !== 'job') return []
        const coordinates = jobCoordinates(item.intervention)
        return coordinates ? [coordinates] : []
      }),
      endCoordinates ?? startCoordinates ?? configuredStartCoordinates,
    ]

    if (stops.length < 2) return

    const refreshRoute = async () => {
      setRouteLoading(true)
      try {
        const response = await fetch('/api/route/daily', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stops,
            startAddress,
            endAddress: sameAsStart ? startAddress : endAddress,
            sameAsStart,
            startFallback: usingConfiguredStart ? configuredStartCoordinates : undefined,
            endFallback: sameAsStart && usingConfiguredStart ? configuredStartCoordinates : undefined,
          }),
        })
        if (!response.ok) return
        const data = await response.json() as {
          legs?: Array<{
            from: Coordinates
            to: Coordinates
            minutes: number
            km: number
            provider: 'ors' | 'estimate'
          }>
          stops?: Coordinates[]
        }

        if (cancelled || id !== fetchIdRef.current) return
        if (!data.legs?.length) return

        // Every pair the server answered, not just the ones on screen now —
        // which is what makes the next reorder free.
        const fresh: TravelCache = new Map()
        const now = Date.now()
        for (const leg of data.legs) {
          if (leg.provider !== 'ors') continue   // estimates are recomputed, never cached
          fresh.set(
            `${leg.from.lat.toFixed(5)},${leg.from.lon.toFixed(5)}>${leg.to.lat.toFixed(5)},${leg.to.lon.toFixed(5)}`,
            { minutes: leg.minutes, km: leg.km, provider: 'ors', fetchedAt: now } as CachedLeg,
          )
        }

        mergeIntoCache(travelCache, fresh)
        pruneCache(travelCache, now)

        if (data.stops?.length) {
          setResolvedEndpoints({
            start: data.stops[0],
            end: data.stops[data.stops.length - 1],
          })
        }
        setCacheSnapshot(new Map(travelCache))
      } catch {
        // Offline, or the service is down. The estimate layer covers it.
      } finally {
        if (!cancelled && id === fetchIdRef.current) setRouteLoading(false)
      }
    }

    const timeoutId = window.setTimeout(() => { void refreshRoute() }, ROUTE_REFRESH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
    // Deliberately keyed on the *set* of places, not their order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationSetKey])

  // Derived: the full visible sequence and the day's totals.
  const { fullSequence, totals, travelIsEstimated } = useMemo(() => {
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

    const coordinatesAt = (index: number): Coordinates | undefined => {
      const anchor = anchors[index]
      if (anchor.kind === 'start') return startCoordinates
      if (anchor.kind === 'end') return endCoordinates
      if (anchor.kind === 'job') return jobCoordinates(anchor.intervention)
      return undefined   // the break is not a place
    }

    /** Nearest anchor before `index` that actually sits somewhere. */
    const coordinatesBefore = (index: number): Coordinates | undefined => {
      for (let i = index - 1; i >= 0; i--) {
        if (anchors[i].kind !== 'break') return coordinatesAt(i)
      }
      return startCoordinates
    }

    const sequence: TimelineItem[] = []
    const tally: RouteTotals = {
      jobCount: 0,
      workMinutes: 0,
      travelMinutes: 0,
      breakMinutes: 0,
      unknownLegs: 0,
    }
    let anyEstimated = false

    for (let i = 0; i < anchors.length; i++) {
      const current = anchors[i]

      if (current.kind === 'job') {
        tally.jobCount++
        tally.workMinutes += current.intervention.estimatedMinutes ?? 0
      }
      if (current.kind === 'break') {
        tally.breakMinutes += current.minutes
      }

      sequence.push(current)
      if (i >= anchors.length - 1) continue

      const next = anchors[i + 1]

      // Stopping for lunch does not move you, so the drive that would have
      // happened here happens on the other side of the break instead.
      const leg: ResolvedLeg =
        next.kind === 'break'
          ? NO_TRAVEL
          : current.kind === 'break'
            ? resolveLeg(cacheSnapshot, coordinatesBefore(i), coordinatesAt(i + 1))
            : resolveLeg(cacheSnapshot, coordinatesAt(i), coordinatesAt(i + 1))

      if (leg.provider === 'unknown') tally.unknownLegs++
      else tally.travelMinutes += leg.minutes ?? 0
      if (leg.provider === 'estimate') anyEstimated = true

      const travel: TravelItem = {
        kind: 'travel',
        id: `travel:${current.id}:${next.id}`,
        fromId: current.id,
        toId: next.id,
        minutes: leg.minutes,
        km: leg.km,
        provider: leg.provider,
      }
      sequence.push(travel)
    }

    return {
      fullSequence: sequence,
      totals: tally,
      travelIsEstimated: anyEstimated || tally.unknownLegs > 0,
    }
  }, [state, startCoordinates, endCoordinates, cacheSnapshot])

  const reorder = useCallback((activeId: string, overId: string) => {
    const oldIndex = movableItems.findIndex(item => item.id === activeId)
    const newIndex = movableItems.findIndex(item => item.id === overId)
    if (oldIndex === -1 || newIndex === -1) return null

    const nextMovableItems = arrayMove(movableItems, oldIndex, newIndex)
    setState(prev => ({ ...prev, movableItems: nextMovableItems }))

    // No cache to clear and nothing to refetch: the new order uses the same
    // places, and those are already answered.
    return nextMovableItems
      .filter((item): item is JobItem => item.kind === 'job')
      .map(item => item.intervention)
  }, [movableItems])

  const setStartAddress = useCallback((address: string) => {
    setResolvedEndpoints(prev => ({ ...prev, start: undefined }))
    setState(prev => ({
      ...prev,
      startAddress: address,
      endAddress: prev.sameAsStart ? address : prev.endAddress,
    }))
  }, [])

  const setEndAddress = useCallback((address: string) => {
    setResolvedEndpoints(prev => ({ ...prev, end: undefined }))
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
    /**
     * True while any leg on screen is a guess rather than a routed answer.
     * The overrun warning is built on these numbers, so the day summary says
     * "ongeveer" instead of asserting a figure it cannot stand behind.
     */
    travelIsEstimated,
    reorder,
    setStartAddress,
    setEndAddress,
    setSameAsStart,
  }
}
