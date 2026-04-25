import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workOrders } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

function requireErpKey(req: NextRequest): Response | null {
  const key = req.headers.get('x-erp-key')
  if (!process.env.ERP_API_KEY || key !== process.env.ERP_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// ── POST /api/erp/work-orders/[id]/external-ref ───────────────────────────────
// Body: { external_ref: string }
// Navision/Odoo stamps its own reference back onto the work order.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const authError = requireErpKey(req)
  if (authError) return authError

  const { id } = await params

  try {
    const { external_ref } = await req.json()

    if (!external_ref || typeof external_ref !== 'string') {
      return NextResponse.json({ error: 'external_ref is verplicht' }, { status: 400 })
    }

    const [wo] = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.id, id))
    if (!wo) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

    await db
      .update(workOrders)
      .set({ externalRef: external_ref })
      .where(eq(workOrders.id, id))

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/erp/work-orders/[id]/external-ref POST]', error)
    return NextResponse.json({ error: 'Intern serverfout' }, { status: 500 })
  }
}
