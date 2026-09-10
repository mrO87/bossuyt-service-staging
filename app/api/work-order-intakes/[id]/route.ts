/**
 * GET   /api/work-order-intakes/[id] — fetch one upload and its proposed fields.
 * PATCH /api/work-order-intakes/[id] — read the stored file again.
 *
 * The PATCH is the "opnieuw proberen" button: when docling was unreachable at
 * upload time the bon is still on the server, so re-reading it costs nothing
 * but a second conversion.
 */
import { NextRequest, NextResponse } from 'next/server'
import { readIntake, reReadIntake, serializeIntake } from '@/lib/server/work-order-intakes'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const intake = await readIntake({ id })

  if (!intake) {
    return NextResponse.json({ error: 'Upload niet gevonden' }, { status: 404 })
  }

  return NextResponse.json({ intake: serializeIntake(intake) })
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params

  let changedBy: string | null = null
  try {
    const body = (await req.json()) as { changedBy?: string }
    changedBy = body.changedBy?.trim() || null
  } catch {
    // No body is fine — a retry needs nothing but the id.
  }

  const result = await reReadIntake(id, changedBy)
  if (!result) {
    return NextResponse.json({ error: 'Upload niet gevonden' }, { status: 404 })
  }

  return NextResponse.json({
    intake: serializeIntake(result.intake),
    ...(result.warning ? { warning: result.warning } : {}),
  })
}
