import { NextRequest, NextResponse } from 'next/server'
import { getMonthInterventionDays } from '@/lib/server/interventions'
import { interventions } from '@/lib/mock-data'

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function GET(req: NextRequest) {
  const technicianId = req.nextUrl.searchParams.get('technicianId')
  const year = Number(req.nextUrl.searchParams.get('year'))
  const month = Number(req.nextUrl.searchParams.get('month'))

  if (!technicianId || !year || !month || month < 1 || month > 12) {
    return NextResponse.json(
      { error: 'technicianId, year en month zijn verplicht' },
      { status: 400 },
    )
  }

  try {
    const dbDays = await getMonthInterventionDays(technicianId, year, month)

    // Overlay with mock data so the calendar shows demo days on staging
    const mockDays = interventions
      .filter(i =>
        i.status === 'gepland' &&
        i.technicians.some(t => t.technicianId === technicianId),
      )
      .map(i => {
        const d = new Date(i.plannedDate)
        return toLocalDateStr(d)
      })
      .filter(d => {
        const [y, m] = d.split('-').map(Number)
        return y === year && m === month
      })

    const allDays = new Set([...dbDays, ...mockDays])
    return NextResponse.json({ days: [...allDays].sort() })
  } catch (error) {
    console.error('[sync/month]', error)
    return NextResponse.json({ error: 'Kon maanddata niet laden' }, { status: 500 })
  }
}
