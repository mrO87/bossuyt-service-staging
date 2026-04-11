import { NextRequest, NextResponse } from 'next/server'
import { getTodayInterventions } from '@/lib/server/interventions'

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
