import { NextRequest, NextResponse } from 'next/server'
import { savePlanningSnapshot } from '@/lib/server/interventions'
import type { User } from '@/types'

/**
 * The replay door for the offline queue.
 *
 * One payload describes a technician's whole day: these work orders, in this
 * order. Anything missing from the list goes back to the open pool. Because it
 * states a result rather than a change, the client can throw away an older
 * pending write and keep only the newest — a morning of dragging with no signal
 * arrives here as a single call.
 */
type UpdatePlanningPayload = {
  technicianId: string
  date: string
  planningVersion: number
  orderedWorkOrderIds: string[]
  actorId?: string
  actorRole?: User['role']
}

/**
 * 'update_sequence' is the name this write had before it could also move work
 * orders between the pool and the day. The payload never changed shape, so old
 * writes still queued on a technician's phone are accepted as-is — rejecting
 * them would wedge that queue behind a write that can never succeed.
 */
const ACCEPTED_TYPES = ['update_planning', 'update_sequence']

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    type?: string
    payload?: UpdatePlanningPayload
  }

  if (!body.type || !ACCEPTED_TYPES.includes(body.type) || !body.payload) {
    return NextResponse.json({ error: 'Unsupported write type' }, { status: 400 })
  }

  const {
    technicianId,
    date,
    planningVersion,
    orderedWorkOrderIds,
    actorId,
    actorRole,
  } = body.payload

  if (!technicianId || !date || !Array.isArray(orderedWorkOrderIds)) {
    return NextResponse.json({ error: 'Invalid planning payload' }, { status: 400 })
  }

  try {
    const result = await savePlanningSnapshot({
      // Until Keycloak lands, a write without an actor is the technician acting
      // on their own day — which is the only case that exists today.
      actor: {
        id: actorId ?? technicianId,
        role: actorRole ?? 'technician',
      },
      technicianId,
      date,
      planningVersion,
      orderedWorkOrderIds,
    })

    if (!result.ok) {
      const locked = result.reason === 'locked'
      return NextResponse.json(
        {
          error: locked
            ? 'Werkbon is al gestart en blijft op de dag staan'
            : 'Planning conflict',
          code: locked ? 'WORK_ORDER_LOCKED' : 'PLANNING_CONFLICT',
          lockedWorkOrderIds: result.lockedWorkOrderIds,
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
    console.error('[sync/write] planning persistence failed:', error)
    return NextResponse.json({ error: 'Write failed' }, { status: 500 })
  }
}
