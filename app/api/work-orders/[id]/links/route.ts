import { NextRequest, NextResponse } from 'next/server'
import { inArray, or, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workOrderLinks, workOrders } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

// ── GET /api/work-orders/[id]/links ───────────────────────────────────────────
// Returns all links where this work order is the source OR the target.
// Each link includes a `linked_work_order` property with info about the other end.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  try {
    const links = await db
      .select()
      .from(workOrderLinks)
      .where(
        or(
          eq(workOrderLinks.fromWorkOrderId, id),
          eq(workOrderLinks.toWorkOrderId, id),
        ),
      )

    // Collect the IDs of the "other" work order in each link
    const otherIds = [...new Set(links.map(l =>
      l.fromWorkOrderId === id ? l.toWorkOrderId : l.fromWorkOrderId,
    ))]

    const relatedOrders = otherIds.length
      ? await db
          .select({
            id: workOrders.id,
            status: workOrders.status,
            type: workOrders.type,
            plannedDate: workOrders.plannedDate,
          })
          .from(workOrders)
          .where(inArray(workOrders.id, otherIds))
      : []

    const orderMap = new Map(relatedOrders.map(o => [o.id, o]))

    const result = links.map(link => ({
      ...link,
      createdAt: link.createdAt instanceof Date ? link.createdAt.toISOString() : link.createdAt,
      linked_work_order: orderMap.get(
        link.fromWorkOrderId === id ? link.toWorkOrderId : link.fromWorkOrderId,
      ) ?? null,
    }))

    return NextResponse.json({ links: result })
  } catch (error) {
    console.error('[api/work-orders/[id]/links GET]', error)
    return NextResponse.json({ error: 'Kon links niet laden' }, { status: 500 })
  }
}
