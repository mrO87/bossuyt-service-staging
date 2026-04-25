import { NextRequest, NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { werkbonnen, workOrders } from '@/lib/db/schema'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: deviceId } = await params

  // Return all werkbon submissions for this device, newest first.
  // Each row represents one completed werkbon (multiple allowed per work order).
  const rows = await db
    .select({
      id:          werkbonnen.id,
      workOrderId: werkbonnen.workOrderId,
      type:        workOrders.type,
      plannedDate: workOrders.plannedDate,
      description: workOrders.description,   // original problem reported
      isUrgent:    workOrders.isUrgent,
      workStart:   werkbonnen.workStart,
      workEnd:     werkbonnen.workEnd,
      notes:       werkbonnen.notes,         // technician's work description
      parts:       werkbonnen.parts,         // JSON: PdfPart[]
      pdfPath:     werkbonnen.pdfPath,
      completedAt: werkbonnen.completedAt,
      changedBy:   werkbonnen.changedBy,
    })
    .from(werkbonnen)
    .innerJoin(workOrders, eq(werkbonnen.workOrderId, workOrders.id))
    .where(eq(workOrders.deviceId, deviceId))
    .orderBy(desc(werkbonnen.completedAt))

  return NextResponse.json(rows)
}
