import { NextRequest, NextResponse } from 'next/server'
import { handleCreateWorkOrderRequest } from '@/lib/server/work-orders'

// ── POST /api/work-orders ─────────────────────────────────────────────────────
// Used by the "nieuwe werkbon" wizard. Same body and responses as the ERP
// route, without the ERP key. When auth is enforced (PLANNING.md phase 5)
// this route gets the office/planner role check.
export async function POST(req: NextRequest) {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON', field: 'body' }, { status: 400 })
  }

  const result = await handleCreateWorkOrderRequest(rawBody)
  return NextResponse.json(result.body, { status: result.status })
}
