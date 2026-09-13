/**
 * De weekplanning.
 *
 * Leest `?date=` hier en niet pas in de browser. Deed de server dat niet, dan
 * tekende hij de week van vandaag terwijl de browser de gevraagde week tekende
 * — twee verschillende roosters op dezelfde plek, en React gooide dan de héle
 * weekweergave weg om ze opnieuw op te bouwen. Op een telefoon een zichtbare
 * hik bij elke keer dat je vanuit de dagplanning naar de week springt.
 *
 * De prijs is dat deze route niet meer statisch gebouwd wordt. Ze haalt toch
 * geen gegevens op — die komen uit IndexedDB — dus dat kost niets.
 */
import WeekView from '@/components/WeekView/WeekView'

export default async function WeekPlanningPage(
  { searchParams }: { searchParams: Promise<{ date?: string }> },
) {
  const { date } = await searchParams
  return <WeekView initialDate={date ?? null} />
}
