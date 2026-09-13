import { NextRequest, NextResponse } from 'next/server'
import { savePlanningSnapshot, updatePlacement } from '@/lib/server/interventions'
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
  /**
   * Absent in every write queued before v1.61. It has to stay optional all the
   * way down: a phone that has been offline for a week replays writes that know
   * nothing about hours, and those must not clear the hours someone else set.
   */
  startTimes?: Array<{ workOrderId: string; startMinutes: number | null; appointment: boolean }>
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

/**
 * Waar één werkbon staat. Zie updatePlacement voor waarom dit naast de
 * momentopname bestaat en niet in plaats ervan.
 */
type PlacementPayload = {
  workOrderId: string
  date: string | null
  startMinutes: number | null
  appointment?: boolean
  actorId?: string
  actorRole?: User['role']
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    type?: string
    payload?: UpdatePlanningPayload & PlacementPayload
  }

  if (body.type === 'update_placement') {
    const payload = body.payload as PlacementPayload | undefined
    if (!payload?.workOrderId || payload.date === undefined) {
      return NextResponse.json({ error: 'Invalid placement payload' }, { status: 400 })
    }

    const result = await updatePlacement({
      actor: { id: payload.actorId ?? 'unknown', role: payload.actorRole ?? 'technician' },
      workOrderId: payload.workOrderId,
      date: payload.date,
      startMinutes: payload.startMinutes ?? null,
      appointment: Boolean(payload.appointment),
    })

    if (!result.ok) {
      // 409 en niet 400: dit is geen fout in wat er gestuurd werd, maar een
      // weigering op grond van wat er intussen gebeurd is. De wachtrij gooit
      // een 409 weg in plaats van eeuwig opnieuw te proberen.
      return NextResponse.json(
        {
          error: result.reason === 'locked'
            ? 'Werkbon is al gestart en blijft staan waar hij staat'
            : 'Werkbon bestaat niet',
          code: result.reason === 'locked' ? 'WORK_ORDER_LOCKED' : 'WORK_ORDER_MISSING',
        },
        { status: 409 },
      )
    }

    return NextResponse.json({ success: true, planningVersion: result.planningVersion })
  }

  if (!body.type || !ACCEPTED_TYPES.includes(body.type) || !body.payload) {
    return NextResponse.json({ error: 'Unsupported write type' }, { status: 400 })
  }

  const {
    technicianId,
    date,
    planningVersion,
    orderedWorkOrderIds,
    startTimes,
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
      // Passed through as sent, including absent: savePlanningSnapshot reads
      // "no field" as "this client knows nothing about hours" and leaves them
      // alone. Only the shape is checked here; what counts as a real hour is
      // sanitizeStartMinutes' business, and lives in one place.
      startTimes: Array.isArray(startTimes) ? startTimes : undefined,
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
