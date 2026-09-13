/**
 * Wat er met een dag gebeurt die voorbij is.
 *
 * Twee regels, één doel: geen werkbon verliezen.
 *
 * 1. **Een vergeten bon keert terug naar de pool.** Staat een bon op een dag
 *    die voorbij is en is er nooit aan gewerkt, dan is hij niet gedaan — hij
 *    hoort dus weer bij het werk dat nog te plannen valt. Bleef hij staan, dan
 *    zag niemand hem ooit terug: de dagplanning toont vandaag, de weekplanning
 *    toont deze week, en de pool toont alleen bonnen zonder dag.
 * 2. **Een bon kan niet in het verleden geplaatst worden.** Een datum van
 *    gisteren is nooit een plan; het is een tikfout of een verkeerd gemikte
 *    sleep. En dankzij regel 1 zou hij bij de eerstvolgende opkuis meteen weer
 *    naar de pool springen — dus kan hij er net zo goed nooit terechtkomen.
 *
 * De regels staan hier los van de database, zodat ze te testen zijn zonder er
 * een aan te spreken, en zodat server en scherm dezelfde grens gebruiken.
 */
import type { InterventionStatus } from '@/types'

/**
 * De statussen die terugkeren naar de pool.
 *
 * Dezelfde lijst als de bonnen die een dag mogen verlaten (`canLeaveTheDay`),
 * en dat is geen toeval: dat zijn precies de bonnen waaraan nog niet gewerkt
 * is. Onderweg hoort erbij — onderweg zijn is nog geen begonnen werk, en wie
 * gisteren vertrok maar vandaag geen afgewerkte bon heeft, heeft hem niet
 * gedaan.
 *
 * Een status die er later bijkomt blijft staan tot iemand beslist dat hij weg
 * mag. Dat is de veilige kant: liever een bon die blijft staan waar je hem
 * zoekt dan een die verdwijnt.
 */
export const RETURNS_TO_POOL: readonly InterventionStatus[] = [
  'aangemaakt',
  'gepland',
  'onderweg',
]

/**
 * De dag van vandaag in België, als `YYYY-MM-DD`.
 *
 * Uitdrukkelijk met een tijdzone erbij en niet met de klok van de server: die
 * draait in een container op UTC. In september loopt België twee uur voor, dus
 * tussen middernacht en twee uur zou de server nog gisteren zeggen — en dan
 * zou een bon van vandaag als "verleden" gelden en 's nachts uit de planning
 * verdwijnen. `en-CA` is de kortste weg naar `YYYY-MM-DD`.
 */
export function todayInBelgium(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Ligt deze dag vóór vandaag?
 *
 * Vandaag telt niet als verleden: een bon op vandaag zetten om acht uur
 * terwijl het twee uur is, blijft gewoon toegestaan — dat is een dag die nog
 * bezig is, en het uur wordt toch berekend uit de rit.
 *
 * Een vergelijking tussen twee `YYYY-MM-DD`-teksten, want die sorteren
 * alfabetisch net zoals ze chronologisch sorteren. Geen `Date` en dus geen
 * tijdzone die halverwege een dag verspringt.
 */
export function isPastDay(dateStr: string, today: string = todayInBelgium()): boolean {
  return dateStr < today
}

/** Hoort deze bon terug naar de pool? Voorbije dag én nooit aan gewerkt. */
export function returnsToPool(
  status: InterventionStatus | undefined,
  dateStr: string | null | undefined,
  today: string = todayInBelgium(),
): boolean {
  if (!dateStr || !status) return false
  return isPastDay(dateStr, today) && RETURNS_TO_POOL.includes(status)
}

/** Wat het scherm zegt als je een dag kiest die voorbij is. */
export function pastDayMessage(dateStr: string): string {
  const dag = new Intl.DateTimeFormat('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(`${dateStr}T12:00:00`))
  return `${dag} is voorbij. Een werkbon kan alleen vandaag of later staan.`
}
