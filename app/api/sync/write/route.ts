import { NextRequest, NextResponse } from 'next/server'
import { saveTechnicianPlanningOrder } from '@/lib/server/interventions'

type UpdateSequencePayload = {
  technicianId: string
  date: string
  planningVersion: number
  orderedWorkOrderIds: string[]
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    type?: string
    payload?: UpdateSequencePayload
  }

  if (body.type !== 'update_sequence' || !body.payload) {
    return NextResponse.json({ error: 'Unsupported write type' }, { status: 400 })
  }

  const { technicianId, date, planningVersion, orderedWorkOrderIds } = body.payload

  if (!technicianId || !date || !Array.isArray(orderedWorkOrderIds)) {
    return NextResponse.json({ error: 'Invalid reorder payload' }, { status: 400 })
  }

  try {
    const result = await saveTechnicianPlanningOrder({
      technicianId,
      date,
      planningVersion,
      orderedWorkOrderIds,
    })

    if (!result.ok) {
      return NextResponse.json(
        {
          error: 'Planning conflict',
          code: 'PLANNING_CONFLICT',
          planningVersion: result.planningVersion,
          planned: result.planned,
          open: result.open,
        },
        { status: 409 },
      )
    }

    return NextResponse.json({
      success: true,
      planningVersion: result.planningVersion,
      planned: result.planned,
      open: result.open,
    })
  } catch (error) {
    console.error('[sync/write] reorder persistence failed:', error)
    return NextResponse.json({ error: 'Write failed' }, { status: 500 })
  }
}
