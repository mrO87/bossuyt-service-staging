export function buildIdempotencyKey(...parts: Array<string | number | undefined | null>): string {
  return parts
    .filter((part): part is string | number => part !== undefined && part !== null && part !== '')
    .map(part => String(part).trim().replace(/\s+/g, '_'))
    .join(':')
}

export function toLocalVersion(date = new Date()): number {
  return Math.floor(date.getTime() / 1000)
}

export function calculateDurationMinutes(startAt?: string, endAt?: string): number | undefined {
  if (!startAt || !endAt) {
    return undefined
  }

  const start = new Date(startAt)
  const end = new Date(endAt)
  const diffMs = end.getTime() - start.getTime()

  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return undefined
  }

  return Math.round(diffMs / 60000)
}
