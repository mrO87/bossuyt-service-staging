/**
 * De dagplanning.
 *
 * Leest `?date=` hier en niet pas in de browser — precies zoals de weekpagina,
 * en om dezelfde reden. Deed de server dat niet, dan tekende hij vandaag
 * terwijl de browser de gevraagde dag tekende, en gooide React de hele
 * dagweergave weg om opnieuw te beginnen. Op een telefoon een zichtbare hik bij
 * elke sprong vanuit de weekplanning.
 *
 * De prijs is dat deze route niet meer statisch gebouwd wordt. Ze haalt toch
 * geen gegevens op — die komen uit IndexedDB — dus dat kost niets.
 */
import DayView from '@/components/DayView/DayView'

export default async function Home(
  { searchParams }: { searchParams: Promise<{ date?: string }> },
) {
  const { date } = await searchParams
  return <DayView initialDate={date ?? null} />
}
