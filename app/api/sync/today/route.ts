import { NextRequest, NextResponse } from 'next/server'
import { getTodayInterventions } from '@/lib/server/interventions'
import { interventions as mockInterventions } from '@/lib/mock-data'

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

    // When the DB has no data for this date, fall back to mock data so
    // navigating to demo days actually shows work orders.
    if (data.planned.length === 0 && data.open.length === 0) {
      const start = new Date(`${date}T00:00:00.000Z`)
      const end = new Date(`${date}T23:59:59.999Z`)

      const mockForDay = mockInterventions.filter(i => {
        const d = new Date(i.plannedDate)
        return d >= start && d <= end && i.status === 'gepland'
      })

      const planned = mockForDay
        .filter(i => i.technicians.some(t => t.technicianId === technicianId && t.accepted))
        .sort((a, b) => {
          const ao = a.technicians.find(t => t.technicianId === technicianId)?.plannedOrder ?? 99
          const bo = b.technicians.find(t => t.technicianId === technicianId)?.plannedOrder ?? 99
          return ao - bo
        })

      return NextResponse.json({ planned, open: [] })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[sync/today] kon interventies niet laden:', error)
    return NextResponse.json(
      { error: 'Interventies konden niet geladen worden' },
      { status: 500 },
    )
  }
}
