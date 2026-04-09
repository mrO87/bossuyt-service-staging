/**
 * DayTimeline types
 *
 * A timeline describes the technician's route for one day:
 *   start → travel → job → travel → job → break → travel → job → travel → end
 *
 * Only jobs and the break are movable. Start and end are fixed anchors.
 * Travel segments are DERIVED — never stored — so reordering is trivial.
 */

import type { Intervention } from '@/types'

export interface StartItem  { kind: 'start';  id: 'start';  address: string }
export interface EndItem    { kind: 'end';    id: 'end';    address: string }
export interface JobItem    { kind: 'job';    id: string;   intervention: Intervention }
export interface BreakItem  { kind: 'break';  id: 'break';  minutes: number; label: string }
export interface TravelItem {
  kind: 'travel'
  id: string          // `travel:<fromId>:<toId>`
  fromId: string
  toId: string
  minutes: number
  km: number
}

/** Items that can be dragged to reorder the day (jobs and the break). */
export type MovableItem = JobItem | BreakItem

/** Everything that appears on the timeline, including derived travel rows. */
export type TimelineItem = StartItem | EndItem | TravelItem | JobItem | BreakItem

export interface RouteState {
  startAddress: string
  endAddress: string
  sameAsStart: boolean
  movableItems: MovableItem[]   // ordered list, interleaved jobs + break
}

export interface RouteTotals {
  jobCount: number
  workMinutes: number
  travelMinutes: number
}
