import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workOrders } from '@/lib/db/schema'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const body = await req.json()

  if (typeof body.visibleInPool !== 'boolean') {
    return NextResponse.json(
      { error: 'visibleInPool (boolean) is verplicht' },
      { status: 400 },
    )
  }

  const [updated] = await db
    .update(workOrders)
    .set({ visibleInPool: body.visibleInPool })
    .where(eq(workOrders.id, id))
    .returning({ id: workOrders.id, visibleInPool: workOrders.visibleInPool })

  if (!updated) {
    return NextResponse.json({ error: 'Werkbon niet gevonden' }, { status: 404 })
  }

  return NextResponse.json(updated)
}
