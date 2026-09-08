import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, werkbonnen, workOrders } from '@/lib/db/schema'
import { handleCreateWorkOrderRequest } from '@/lib/server/work-orders'
import type { InterventionStatus } from '@/types'

function requireErpKey(req: NextRequest): Response | null {
  const key = req.headers.get('x-erp-key')
  if (!process.env.ERP_API_KEY || key !== process.env.ERP_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// ── GET /api/erp/work-orders ──────────────────────────────────────────────────
// Query params: since=ISO (default: last 30 days), status=, site_id=
export async function GET(req: NextRequest) {
  const authError = requireErpKey(req)
  if (authError) return authError

  try {
    const url    = new URL(req.url)
    const since  = url.searchParams.get('since')
    const status = url.searchParams.get('status')
    const siteId = url.searchParams.get('site_id')

    const defaultSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const sinceDate    = since ? new Date(since) : defaultSince

    const conditions = [gte(workOrders.plannedDate, sinceDate)]
    if (status) conditions.push(eq(workOrders.status, status as InterventionStatus))
    if (siteId) conditions.push(eq(workOrders.siteId, siteId))

    const orders = await db
      .select()
      .from(workOrders)
      .where(and(...conditions))

    // For each work order, fetch its tasks and latest werkbon
    const result = await Promise.all(orders.map(async wo => {
      const woTasks = await db
        .select({
          id:      tasks.id,
          type:    tasks.type,
          role:    tasks.role,
          status:  tasks.status,
          payload: tasks.payload,
        })
        .from(tasks)
        .where(eq(tasks.workOrderId, wo.id))

      const [latestWerkbon] = await db
        .select()
        .from(werkbonnen)
        .where(eq(werkbonnen.workOrderId, wo.id))
        .orderBy(werkbonnen.completedAt)
        .limit(1)

      return {
        id:           wo.id,
        external_ref: wo.externalRef,
        site_id:      wo.siteId,
        status:       wo.status,
        type:         wo.type,
        planned_date: wo.plannedDate instanceof Date ? wo.plannedDate.toISOString() : wo.plannedDate,
        completed_at: wo.completedAt instanceof Date ? wo.completedAt.toISOString() : wo.completedAt,
        is_urgent:    wo.isUrgent,
        tasks:        woTasks,
        werkbon:      latestWerkbon
          ? { parts: latestWerkbon.parts, notes: latestWerkbon.notes, work_start: latestWerkbon.workStart, work_end: latestWerkbon.workEnd }
          : null,
      }
    }))

    return NextResponse.json({ work_orders: result })
  } catch (error) {
    console.error('[api/erp/work-orders GET]', error)
    return NextResponse.json({ error: 'Intern serverfout' }, { status: 500 })
  }
}

// ── POST /api/erp/work-orders ─────────────────────────────────────────────────
// The ERP pushes a new ticket ("Service Bon" header). Body is snake_case JSON,
// see tests/fixtures/sauna-molenhoeve.json. 201 on success, 409 on duplicate
// ticket_number, 400 with the offending field on validation errors.
export async function POST(req: NextRequest) {
  const authError = requireErpKey(req)
  if (authError) return authError

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON', field: 'body' }, { status: 400 })
  }

  const result = await handleCreateWorkOrderRequest(rawBody, 'erp')
  return NextResponse.json(result.body, { status: result.status })
}
