/**
 * Week of weekend: afgeleid uit de bezoekdatum, tenzij iemand het omzet.
 *
 * Dit stond als losse keuze in het formulier, los van de bezoekdatum, en die
 * twee konden elkaar dus tegenspreken. In de database stonden concepten met een
 * **zondagse** bezoekdatum en toch `week`. De gebruiker zag het omgekeerde: de
 * knop stond "altijd op weekend", omdat de bezoekdatum was blijven hangen op de
 * zondag waarop hij de bon voor het eerst opende, en de keuze braaf die datum
 * volgde.
 *
 * Dus: de datum beslist. Zet iemand de knop zelf om — een feestdag, nachtwerk,
 * een afspraak die als weekend afgerekend wordt — dan blijft die keuze staan,
 * maar alleen tot de bezoekdatum verandert. Want dan gaat het over een andere
 * dag, en heeft de oude keuze niets meer te betekenen.
 */
import type { InterventionKind } from '@/types'

/**
 * Wat een datum zegt over week of weekend.
 *
 * Middag en niet middernacht in de `Date`: op middernacht kan een uurverschil
 * of een zomertijdsprong de dag in de vorige laten vallen, en dan zou een
 * maandag als zondag gelden.
 */
export function kindForDate(isoDate: string): InterventionKind {
  const day = new Date(`${isoDate}T12:00:00`).getDay()
  return day === 0 || day === 6 ? 'weekend' : 'week'
}

/**
 * De keuze zoals ze getoond moet worden.
 *
 * `manual` is of iemand de knop zelf omgezet heeft voor déze bezoekdatum. Zo
 * niet, dan wint de datum — ook wanneer er iets anders opgeslagen stond, want
 * dan is dat opgeslagene achterhaald.
 */
export function resolveInterventionKind(input: {
  visitDate: string
  stored: InterventionKind
  manual: boolean
}): InterventionKind {
  return input.manual ? input.stored : kindForDate(input.visitDate)
}
