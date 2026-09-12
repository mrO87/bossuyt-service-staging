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
