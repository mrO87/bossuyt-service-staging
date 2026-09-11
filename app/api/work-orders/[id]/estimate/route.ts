/**
 * PATCH /api/work-orders/[id]/estimate — change how long a job is expected to take.
 *
 * The estimate existed since v1.57 but could only ever be set at creation, with
 * DEFAULT_ESTIMATED_MINUTES standing in. Since the day's overrun warning is
 * built on these numbers, a technician who cannot correct one is being warned
 * about a figure they are not allowed to fix.
 *
 * Null is a valid answer: no field in this app is mandatory, and a half legible
 * paper bon still has to be storable.
 */
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workOrders } from '@/lib/db/schema'

type RouteContext = {
  params: Promise<{ id: string }>
}

/** A working day is the ceiling; beyond that it is two jobs, not one. */
const MAX_ESTIMATED_MINUTES = 24 * 60

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params

  let body: { estimatedMinutes?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const raw = body.estimatedMinutes
  const clearing = raw === null || raw === ''

  if (!clearing) {
    const valid =
      typeof raw === 'number' &&
      Number.isInteger(raw) &&
      raw > 0 &&
      raw <= MAX_ESTIMATED_MINUTES

    if (!valid) {
      return NextResponse.json(
        { error: 'estimatedMinutes moet een geheel aantal minuten zijn tussen 1 en 1440, of leeg' },
        { status: 400 },
      )
    }
  }

  const [updated] = await db
    .update(workOrders)
    .set({ estimatedMinutes: clearing ? null : (raw as number) })
    .where(eq(workOrders.id, id))
    .returning({ id: workOrders.id, estimatedMinutes: workOrders.estimatedMinutes })

  if (!updated) {
    return NextResponse.json({ error: 'Werkbon niet gevonden' }, { status: 404 })
  }

  return NextResponse.json(updated)
}
