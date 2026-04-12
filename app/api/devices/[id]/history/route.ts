import { NextRequest, NextResponse } from 'next/server'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workOrders } from '@/lib/db/schema'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const excludeId = searchParams.get('exclude') // exclude the current open work order

  const rows = await db
    .select({
      id:                workOrders.id,
      status:            workOrders.status,
      type:              workOrders.type,
      plannedDate:       workOrders.plannedDate,
      description:       workOrders.description,
      isUrgent:          workOrders.isUrgent,
      completionNotes:   workOrders.completionNotes,
      completionParts:   workOrders.completionParts,
      completionPdfPath: workOrders.completionPdfPath,
      completedAt:       workOrders.completedAt,
    })
    .from(workOrders)
    .where(
      and(
        eq(workOrders.deviceId, id),
        eq(workOrders.status, 'afgewerkt'),
        excludeId ? ne(workOrders.id, excludeId) : undefined,
      ),
    )
    .orderBy(workOrders.plannedDate)

  return NextResponse.json(rows)
}
