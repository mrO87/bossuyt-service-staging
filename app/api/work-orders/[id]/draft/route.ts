/**
 * The half-filled werkbon, kept somewhere other than one phone.
 *
 *   GET    — what the server holds, or null
 *   PUT    — store this version, unless the server has a newer one
 *   DELETE — the bon was submitted; the draft has served its purpose
 *
 * A draft lived only in the browser until now, which meant an afternoon of
 * typing was one cleared cache away from gone — and nothing said so, because
 * nothing had been submitted. This is the other copy.
 *
 * Newest wins, decided by the timestamp the editing device puts on it. A PUT
 * that is older than what is stored is refused and told what is there instead,
 * so a phone coming back online after a week cannot flatten work done since.
 */
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workOrderDrafts } from '@/lib/db/schema'
import { mayOverwrite } from '@/lib/werkbon/draftMerge'

type RouteContext = { params: Promise<{ id: string }> }

async function readDraft(workOrderId: string) {
  const [row] = await db
    .select()
    .from(workOrderDrafts)
    .where(eq(workOrderDrafts.workOrderId, workOrderId))
  return row ?? null
}

function asPayload(row: Awaited<ReturnType<typeof readDraft>>) {
  if (!row) return null
  return {
    form: row.form,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy ?? undefined,
  }
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params

  try {
    return NextResponse.json({ draft: asPayload(await readDraft(id)) })
  } catch (error) {
    console.error('[api/work-orders/[id]/draft GET]', error)
    return NextResponse.json({ error: 'Kon concept niet laden' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const { id } = await context.params

  let body: { form?: unknown; updatedAt?: unknown; updatedBy?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  if (!body.form || typeof body.form !== 'object') {
    return NextResponse.json({ error: 'form is verplicht' }, { status: 400 })
  }
  const updatedAt = typeof body.updatedAt === 'string' ? body.updatedAt : null
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) {
    return NextResponse.json({ error: 'updatedAt moet een ISO-tijdstip zijn' }, { status: 400 })
  }

  try {
    const stored = await readDraft(id)

    if (!mayOverwrite({ updatedAt }, stored ? { updatedAt: stored.updatedAt.toISOString() } : null)) {
      // Not an error the technician did anything about — the server simply has
      // something newer. Hand it back so the screen can say so and show it.
      return NextResponse.json(
        { error: 'Er is een nieuwere versie', code: 'DRAFT_STALE', draft: asPayload(stored) },
        { status: 409 },
      )
    }

    const updatedBy = typeof body.updatedBy === 'string' ? body.updatedBy : null

    await db
      .insert(workOrderDrafts)
      .values({ workOrderId: id, form: body.form, updatedAt: new Date(updatedAt), updatedBy })
      .onConflictDoUpdate({
        target: workOrderDrafts.workOrderId,
        set: { form: body.form, updatedAt: new Date(updatedAt), updatedBy },
      })

    return NextResponse.json({ ok: true, updatedAt })
  } catch (error) {
    console.error('[api/work-orders/[id]/draft PUT]', error)
    return NextResponse.json({ error: 'Kon concept niet bewaren' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params

  try {
    await db.delete(workOrderDrafts).where(eq(workOrderDrafts.workOrderId, id))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/work-orders/[id]/draft DELETE]', error)
    return NextResponse.json({ error: 'Kon concept niet verwijderen' }, { status: 500 })
  }
}
