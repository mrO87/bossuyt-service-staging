/**
 * mockRouting.ts — stubbed travel time calculator.
 *
 * WHY a stub?
 * The real routing call lives in /api/route/daily (uses ORS under the hood).
 * That endpoint is server-side and async. We want the timeline to respond
 * *instantly* while the user is dragging items around, so for now we derive
 * travel times from a deterministic hash of the from/to ids.
 *
 * WHEN to replace:
 * After drag-end, DayTimeline can optionally fire off a real fetch to
 * `/api/route/daily` with the ordered coordinates and replace the mocked
 * minutes with the actual ORS/TomTom values. Until then, the UI shows the
 * stable mock output so reorders feel immediate.
 *
 * The hash is the same for the same pair of ids, so the same order always
 * produces the same travel numbers — no flicker.
 */

export interface MockTravel {
  minutes: number
  km: number
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function mockTravel(fromId: string, toId: string): MockTravel {
  const h = hashString(`${fromId}→${toId}`)
  // 10–44 minute drives — feels realistic for a regional service tech.
  const minutes = 10 + (h % 35)
  // Loose correlation with minutes so 30 min ≈ 15–25 km.
  const km = Math.max(3, Math.round(minutes * (0.4 + ((h >> 4) % 5) * 0.1)))
  return { minutes, km }
}
