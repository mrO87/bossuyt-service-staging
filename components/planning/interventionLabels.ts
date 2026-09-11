/**
 * Labels and colours for a work order card.
 *
 * These lived twice in full — once in JobTimelineCard for the day, once inside
 * DayView for the pool — which meant a new status had to be added in two places
 * and quietly rendered blank in whichever one was forgotten. Now that the same
 * card can be dragged between both lists, having them agree is not tidiness but
 * correctness: the card must look the same on both sides of the drag.
 */
import type { InterventionStatus, InterventionType } from '@/types'

export function formatMinutes(minutes?: number): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}u`
  return `${h}u${m}`
}

/** Hours for a day total, where zero is worth showing. */
export function formatHours(minutes: number): string {
  if (minutes === 0) return '0u'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}u`
  return `${h}u${m.toString().padStart(2, '0')}`
}

export function typeBorderClass(type: InterventionType, urgent: boolean): string {
  if (urgent) return 'bg-brand-red'
  switch (type) {
    case 'warm':       return 'bg-brand-orange'
    case 'montage':    return 'bg-brand-blue'
    case 'preventief': return 'bg-brand-green'
  }
}

export function typeClass(type: InterventionType): string {
  switch (type) {
    case 'warm':       return 'bg-brand-orange text-white'
    case 'montage':    return 'bg-brand-blue text-white'
    case 'preventief': return 'bg-brand-green text-white'
  }
}

export function typeLabel(type: InterventionType): string {
  switch (type) {
    case 'warm':       return 'Warm'
    case 'montage':    return 'Montage'
    case 'preventief': return 'Preventief'
  }
}

export function statusClass(status: InterventionStatus): string {
  switch (status) {
    case 'onderweg':    return 'bg-brand-orange text-white'
    case 'bezig':       return 'bg-brand-blue text-white'
    case 'afgewerkt':   return 'bg-brand-green text-white'
    case 'geannuleerd': return 'bg-brand-red text-white'
    default:            return 'bg-stroke text-ink-soft'
  }
}

export function statusLabel(status: InterventionStatus): string {
  switch (status) {
    case 'aangemaakt':       return 'Aangemaakt'
    case 'gepland':          return 'Gepland'
    case 'onderweg':         return 'Onderweg'
    case 'bezig':            return 'Bezig'
    case 'wacht_onderdelen': return 'Wacht onderdelen'
    case 'afgewerkt':        return 'Afgewerkt'
    case 'geannuleerd':      return 'Geannuleerd'
  }
}
