/**
 * Het bezoek zoals het werkelijk gelopen is.
 *
 * De planning tekent een job op zijn **geraamde** duur — dat is wat je weet
 * vóór je vertrekt. Zodra de bon afgewerkt is, weet je meer: er staat een
 * aankomst- en een vertrekuur op. Een job die anderhalf uur geraamd was en er
 * drie geduurd heeft, hoort dan ook drie uur breed te staan, anders klopt het
 * beeld van de week niet met wat er gebeurd is — en dan schat je de volgende
 * week weer verkeerd in.
 *
 * Los van de weergave gehouden zodat dag en week dezelfde regel gebruiken, en
 * zodat de regel te testen is zonder een scherm.
 */
import type { Intervention } from '@/types'

export interface VisitSpan {
  /** Het aankomstuur, in minuten sinds middernacht. */
  startMinutes: number
  /** Hoe lang het bezoek duurde, in minuten. */
  minutes: number
}

/** Minuten sinds middernacht van een ISO-tijdstip, op de klok van de kijker. */
function minutesOfDay(iso: string): number | null {
  const moment = new Date(iso)
  if (Number.isNaN(moment.getTime())) return null
  return moment.getHours() * 60 + moment.getMinutes()
}

/**
 * Het werkelijke bezoek, of null wanneer er nog niets te weten valt.
 *
 * Drie voorwaarden, en alle drie om dezelfde reden: liever de raming tonen dan
 * een verzonnen werkelijkheid.
 *
 *  1. **Afgewerkt.** Een bon die nog loopt heeft misschien wel een aankomstuur
 *     maar nog geen eindpunt; die tekenen we gewoon zoals gepland.
 *  2. **Allebei de uren.** Met alleen een aankomst is er geen duur.
 *  3. **Vertrek na aankomst.** Een bezoek dat over middernacht loopt of waarin
 *     iemand zich vertikt heeft, geeft een onbruikbare duur. Dan liever niets.
 */
export function actualVisitSpan(
  intervention: Pick<Intervention, 'status' | 'arrivalTime' | 'departureTime'>,
): VisitSpan | null {
  if (intervention.status !== 'afgewerkt') return null
  if (!intervention.arrivalTime || !intervention.departureTime) return null

  const start = minutesOfDay(intervention.arrivalTime)
  const end = minutesOfDay(intervention.departureTime)
  if (start === null || end === null) return null
  if (end <= start) return null

  return { startMinutes: start, minutes: end - start }
}
