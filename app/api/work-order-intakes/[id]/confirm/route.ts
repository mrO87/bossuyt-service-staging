/**
 * POST /api/work-order-intakes/[id]/confirm — the human signed off on the
 * proposed fields; turn them into a work order in the open pool.
 *
 * The body is the same snake_case shape POST /api/work-orders accepts, because
 * the confirmation screen reuses the wizard's forms and therefore builds the
 * same object. Everything else — that this becomes a reactive, unscheduled work
 * order, and that the uploaded bon gets attached to it — is decided server-side
 * in confirmIntake.
 */
import { NextRequest, NextResponse } from 'next/server'
import { confirmIntake } from '@/lib/server/work-order-intakes'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, context: RouteContext) {
  const { id } = await context.params

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON', field: 'body' }, { status: 400 })
  }

  const changedBy =
    typeof rawBody === 'object' && rawBody !== null
      ? ((rawBody as Record<string, unknown>).created_by as string | undefined)
      : undefined

  const result = await confirmIntake(id, rawBody, changedBy)
  return NextResponse.json(result.body, { status: result.status })
}
