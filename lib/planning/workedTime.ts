/**
 * Hoe lang er vandaag gewerkt is.
 *
 * Dit stond in de widget als een stopwatch: `nu − het ingestelde startuur`.
 * Daar kwam geen enkel gewerkt uur aan te pas. Wie 's avonds om elf uur nog
 * eens in de app keek, las dat hij zestien uur gewerkt had — en één minuut na
 * middernacht zeventien, want dan telde de berekening er een hele dag bij op om
 * "over middernacht" te kunnen rekenen.
 *
 * Nu er een echte dagklok is, kan dat weg. Gewerkte tijd is wat er tussen je
 * vertrek en je thuiskomst ligt, en anders niets.
 *
 * **De pauze komt eraf.** Ze is onbetaald, en het rooster waar dit tegen
 * afgezet wordt (`dayCapacityMinutes`) heeft ze er al afgetrokken: 07:00–16:00
 * is negen uur, en 8u30 capaciteit. Zou de gewerkte tijd de pauze wél bevatten,
 * dan telde elke dag een half uur overuren dat er niet is.
 *
 * Bij een lopende dag kan dat half uur nog niet genomen zijn. Daarom komt het
 * er pas af zodra de klok het pauze-uur voorbij is — vóór de middag heb je nog
 * niet geluncht, erna wel. Bij een afgesloten dag komt het er altijd af, ook
 * als het werk vóór de middag op was: de middagpauze telt altijd mee.
 */
import { BREAK_TARGET_MINUTES } from './dayOrder'

export interface WorkedToday {
  /** Gewerkte minuten, pauze er al af. */
  minutes: number
  /** Loopt de dag nog, of is hij afgesloten? */
  running: boolean
}

/** Minuten sinds middernacht, op de klok van de kijker. */
function minutesOfDay(moment: Date): number {
  return moment.getHours() * 60 + moment.getMinutes()
}

/**
 * De gewerkte tijd van vandaag, of `null` zolang er niet vertrokken is.
 *
 * `null` is een antwoord en geen gebrek: een dag die nog niet begonnen is,
 * heeft geen gewerkte tijd. Een nul tonen zou suggereren dat er gemeten is.
 */
export function workedToday(input: {
  /** ISO-tijdstip van het vertrek, of null. */
  startedAt: string | null
  /** ISO-tijdstip van de thuiskomst, of null zolang de dag loopt. */
  endedAt: string | null
  now?: Date
  breakMinutes: number
}): WorkedToday | null {
  if (!input.startedAt) return null

  const start = new Date(input.startedAt)
  if (Number.isNaN(start.getTime())) return null

  const now = input.now ?? new Date()
  const end = input.endedAt ? new Date(input.endedAt) : null
  const closed = end !== null && !Number.isNaN(end.getTime())

  const tot = closed ? end! : now
  const span = Math.round((tot.getTime() - start.getTime()) / 60_000)
  if (span <= 0) return { minutes: 0, running: !closed }

  // Afgesloten: de pauze telt altijd mee. Lopend: pas zodra het pauze-uur
  // voorbij is, want daarvoor is ze nog niet genomen.
  const pauzeGehad = closed || minutesOfDay(now) >= BREAK_TARGET_MINUTES
  const minutes = pauzeGehad ? Math.max(0, span - input.breakMinutes) : span

  return { minutes, running: !closed }
}
