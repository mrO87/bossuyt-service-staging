/**
 * De week waarin een datum valt, maandag eerst.
 *
 * JavaScript nummert zondag als 0, dus een week die op maandag begint vraagt een
 * correctie. Zonder die correctie valt zondag in de week erna, wat pas opvalt
 * wanneer er op zondag gewerkt wordt — en dan is de planning al fout.
 */
export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Dezelfde dag, een aantal dagen verder of terug.
 *
 * Werkt op de kalenderdag als tekst, want dat is wat de app rondstuurt —
 * `planned_date` is een dag, geen moment. `Date` doet de overloop over maand-
 * en jaargrenzen zelf; de enige valstrik is de zomertijd, en die wordt hier
 * ontweken door op de middag te rekenen in plaats van op middernacht. Een
 * datum op middernacht kan bij het verzetten van de klok in de vórige dag
 * vallen, en dan schuift een week van zeven dagen er zes op.
 */
export function shiftDateStr(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const moment = new Date(year, month - 1, day, 12, 0, 0, 0)
  moment.setDate(moment.getDate() + days)
  return toLocalDateStr(moment)
}

export function weekDaysAround(date: Date): Date[] {
  const weekday = date.getDay()              // 0 = zondag
  const sinceMonday = (weekday + 6) % 7      // maandag = 0, zondag = 6

  const monday = new Date(date)
  monday.setHours(12, 0, 0, 0)               // middag: geen zomertijdsprongen
  monday.setDate(monday.getDate() - sinceMonday)

  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + offset)
    return day
  })
}
