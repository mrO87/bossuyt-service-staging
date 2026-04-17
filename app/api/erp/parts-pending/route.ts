import { NextRequest, NextResponse } from 'next/server'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks } from '@/lib/db/schema'
import { toDbTask } from '@/lib/tasks/queue'

function requireErpKey(req: NextRequest): Response | null {
  const key = req.headers.get('x-erp-key')
  if (!process.env.ERP_API_KEY || key !== process.env.ERP_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// ── GET /api/erp/parts-pending ────────────────────────────────────────────────
// Returns all order_part tasks that are not yet done.
// ERP reads this to know which parts the warehouse needs to order.
export async function GET(req: NextRequest) {
  const authError = requireErpKey(req)
  if (authError) return authError

  try {
    const rows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.type, 'order_part'),
          ne(tasks.status, 'done'),
          ne(tasks.status, 'cancelled'),
        ),
      )

    return NextResponse.json({ parts_pending: rows.map(toDbTask) })
  } catch (error) {
    console.error('[api/erp/parts-pending GET]', error)
    return NextResponse.json({ error: 'Intern serverfout' }, { status: 500 })
  }
}
