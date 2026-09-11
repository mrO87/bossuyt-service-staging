import type { RouteResult } from './IRoutingService'

const MIN_MARGIN_RATIO = 0.08
const MAX_MARGIN_RATIO = 0.20
const RAMP_MINUTES = 45
const RAMP_KM = 35

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

export function getTravelMarginRatio(travelMinutes: number, distanceKm: number): number {
  const minuteSeverity = clamp01(travelMinutes / RAMP_MINUTES)
  const distanceSeverity = clamp01(distanceKm / RAMP_KM)
  const severity = Math.max(minuteSeverity, distanceSeverity)

  return MIN_MARGIN_RATIO + ((MAX_MARGIN_RATIO - MIN_MARGIN_RATIO) * severity)
}

export function applyTravelMargin(result: RouteResult): RouteResult {
  // Two jobs at one address are not a drive, so there is nothing to pad. The
  // `+ 1` below would otherwise turn every same-site pair into a minute of
  // travel that never happens.
  if (result.travelMinutes <= 0 && result.distanceKm <= 0) return result

  const ratio = getTravelMarginRatio(result.travelMinutes, result.distanceKm)
  const adjustedMinutes = Math.max(
    result.travelMinutes + 1,
    Math.round(result.travelMinutes * (1 + ratio)),
  )

  return {
    ...result,
    travelMinutes: adjustedMinutes,
  }
}
