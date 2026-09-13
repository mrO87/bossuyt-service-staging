/**
 * De planning van één dag, plus de open pool.
 *
 * Hier stond een terugval op mock-data: was een dag leeg, dan stuurde deze
 * route verzonnen bonnen terug. Dat was bedoeld als demo-comfort en werd een
 * echte bug zodra er twee weergaven op dezelfde route zaten. Een bon uit een
 * dag slepen maakte die dag leeg, waarna de volgende oproep hem vulde met
 * verzinsels — de gebruiker zag zijn wijziging "terugspringen", en in de
 * weekweergave stonden lege dagen vol met bonnen die niet bestaan.
 *
 * Een lege dag is nu leeg. Dat is minder gezellig en het is waar.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getTodayInterventions, releaseForgottenWorkOrders } from '@/lib/server/interventions'

export async function GET(req: NextRequest) {
  const technicianId = req.nextUrl.searchParams.get('technicianId')
  const date = req.nextUrl.searchParams.get('date')

  if (!technicianId || !date) {
    return NextResponse.json(
      { error: 'technicianId en date zijn verplicht' },
      { status: 400 },
    )
  }

  try {
    // Eerst de vergeten bonnen terugzetten, dan pas lezen — anders toont deze
    // oproep nog de oude toestand en ziet de gebruiker de opkuis pas de
    // volgende keer. Doet niets wanneer er niets te doen valt.
    await releaseForgottenWorkOrders()

    const data = await getTodayInterventions(technicianId, date)
    return NextResponse.json(data)
  } catch (error) {
    console.error('[sync/today] kon interventies niet laden:', error)
    return NextResponse.json(
      { error: 'Interventies konden niet geladen worden' },
      { status: 500 },
    )
  }
}
