/**
 * PATCH /api/work-orders/[id]/alert-note — change or remove the warning note.
 *
 * Only the person who wrote it may touch it. That rule lives here rather than
 * in the button that calls it: hiding a button stops a mistake, not a request.
 *
 * Sending an empty note removes it, which is what the delete button does — one
 * rule to reason about instead of two routes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workOrders } from '@/lib/db/schema'
import { withAudit } from '@/lib/db/with-audit'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params

  let body: { note?: unknown; changedBy?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const changedBy = typeof body.changedBy === 'string' ? body.changedBy.trim() : ''
  if (!changedBy) {
    return NextResponse.json({ error: 'changedBy is verplicht' }, { status: 400 })
  }

  const note = typeof body.note === 'string' ? body.note.trim() : ''

  const [existing] = await db
    .select({
      id: workOrders.id,
      alertNote: workOrders.alertNote,
      alertNoteBy: workOrders.alertNoteBy,
    })
    .from(workOrders)
    .where(eq(workOrders.id, id))
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Werkbon niet gevonden' }, { status: 404 })
  }

  // A work order with no note yet has no author to check against, so the note
  // cannot be added here — it is written when the work order is created.
  if (!existing.alertNote) {
    return NextResponse.json(
      { error: 'Deze werkbon heeft geen melding' },
      { status: 404 },
    )
  }

  if (existing.alertNoteBy !== changedBy) {
    return NextResponse.json(
      { error: 'Enkel wie de melding schreef kan ze aanpassen of verwijderen' },
      { status: 403 },
    )
  }

  const [updated] = await withAudit(changedBy, async (tx) =>
    tx
      .update(workOrders)
      .set(
        note
          ? { alertNote: note, alertNoteAt: new Date() }
          // Removing it clears the author too, so nobody inherits the right to
          // edit a note that is no longer there.
          : { alertNote: null, alertNoteBy: null, alertNoteAt: null },
      )
      .where(eq(workOrders.id, id))
      .returning({
        id: workOrders.id,
        alertNote: workOrders.alertNote,
        alertNoteBy: workOrders.alertNoteBy,
        alertNoteAt: workOrders.alertNoteAt,
      }),
  )

  return NextResponse.json({
    id: updated.id,
    alertNote: updated.alertNote,
    alertNoteBy: updated.alertNoteBy,
    alertNoteAt: updated.alertNoteAt?.toISOString() ?? null,
  })
}
