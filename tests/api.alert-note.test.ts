import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PATCH as patchAlertNote } from '@/app/api/work-orders/[id]/alert-note/route'
import { POST as postComplete } from '@/app/api/work-orders/[id]/complete/route'
import { werkbonnen, workOrders } from '@/lib/db/schema'
import type { CleanupIds } from './setup'
import { cleanup, createTestTechnician, createTestWorkOrder, testDb } from './setup'

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function jsonReq(body: unknown) {
  return new NextRequest('http://localhost/api/work-orders/x/alert-note', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const AUTHOR = 'author-u1'
const SOMEONE_ELSE = 'other-u2'

describe('PATCH /api/work-orders/[id]/alert-note', () => {
  let ids: CleanupIds
  let workOrderId: string

  beforeEach(async () => {
    ids = { work_order_ids: [], technician_ids: [] }
    workOrderId = await createTestWorkOrder()
    ids.work_order_ids!.push(workOrderId)

    await testDb
      .update(workOrders)
      .set({ alertNote: 'Klant eerst bellen', alertNoteBy: AUTHOR, alertNoteAt: new Date() })
      .where(eq(workOrders.id, workOrderId))
  })

  afterEach(async () => {
    await cleanup(ids)
  })

  it('lets the author change the note', async () => {
    const res = await patchAlertNote(jsonReq({ note: 'Kan enkel op voormiddag', changedBy: AUTHOR }), ctx(workOrderId))

    expect(res.status).toBe(200)
    const [row] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))
    expect(row.alertNote).toBe('Kan enkel op voormiddag')
    expect(row.alertNoteBy).toBe(AUTHOR)
  })

  it('refuses anyone else, and leaves the note untouched', async () => {
    // The rule lives on the server: hiding the button stops a mistake, not a
    // request.
    const res = await patchAlertNote(jsonReq({ note: 'Gekaapt', changedBy: SOMEONE_ELSE }), ctx(workOrderId))

    expect(res.status).toBe(403)
    const [row] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))
    expect(row.alertNote).toBe('Klant eerst bellen')
  })

  it('removes the note, and its author with it, on an empty note', async () => {
    const res = await patchAlertNote(jsonReq({ note: '', changedBy: AUTHOR }), ctx(workOrderId))

    expect(res.status).toBe(200)
    const [row] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))
    expect(row.alertNote).toBeNull()
    // Clearing the author too stops the next person from inheriting the right
    // to edit a note that no longer exists.
    expect(row.alertNoteBy).toBeNull()
    expect(row.alertNoteAt).toBeNull()
  })

  it('will not add a note to a work order that has none', async () => {
    const bare = await createTestWorkOrder()
    ids.work_order_ids!.push(bare)

    const res = await patchAlertNote(jsonReq({ note: 'Achteraf toegevoegd', changedBy: AUTHOR }), ctx(bare))
    expect(res.status).toBe(404)
  })

  it('needs to know who is asking', async () => {
    const res = await patchAlertNote(jsonReq({ note: 'Iets' }), ctx(workOrderId))
    expect(res.status).toBe(400)
  })

  it('answers 404 for a work order that does not exist', async () => {
    const res = await patchAlertNote(jsonReq({ note: 'Iets', changedBy: AUTHOR }), ctx(`wo-${randomUUID()}`))
    expect(res.status).toBe(404)
  })
})

describe('multiple technicians on a werkbon', () => {
  let ids: CleanupIds

  beforeEach(() => {
    ids = { work_order_ids: [], technician_ids: [] }
  })

  afterEach(async () => {
    await cleanup(ids)
  })

  function completeReq(fields: Record<string, string>) {
    const fd = new FormData()
    for (const [key, value] of Object.entries(fields)) fd.append(key, value)
    return new NextRequest('http://localhost/api/work-orders/x/complete', { method: 'POST', body: fd })
  }

  it('stores everyone who worked the visit, with the first as lead', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids!.push(workOrderId)

    const sam = await createTestTechnician()
    const bob = await createTestTechnician()
    ids.technician_ids!.push(sam, bob)

    const res = await postComplete(
      completeReq({
        changedBy: sam,
        // Deliberately disagrees with the list: the list wins, so the column the
        // PDF and the audit trail read can never contradict it.
        technicianId: bob,
        technicianIds: JSON.stringify([sam, bob]),
        completionNotes: 'Samen de friteuse gelicht',
        visitDate: new Date().toISOString(),
        personCount: '2',
      }),
      ctx(workOrderId),
    )

    expect(res.status).toBe(200)

    const [bon] = await testDb.select().from(werkbonnen).where(eq(werkbonnen.workOrderId, workOrderId))
    expect(bon.technicianIds).toEqual([sam, bob])
    expect(bon.technicianId).toBe(sam)
  })

  it('still accepts a bon with one technician and no list', async () => {
    // Bons submitted before this column existed, and any client that has not
    // caught up, must keep working.
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids!.push(workOrderId)
    const sam = await createTestTechnician()
    ids.technician_ids!.push(sam)

    const res = await postComplete(
      completeReq({
        changedBy: sam,
        technicianId: sam,
        completionNotes: 'Alleen gegaan',
        visitDate: new Date().toISOString(),
      }),
      ctx(workOrderId),
    )

    expect(res.status).toBe(200)
    const [bon] = await testDb.select().from(werkbonnen).where(eq(werkbonnen.workOrderId, workOrderId))
    expect(bon.technicianId).toBe(sam)
    expect(bon.technicianIds).toBeNull()
  })

  it('rejects a technician list that is not a list', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids!.push(workOrderId)
    const sam = await createTestTechnician()
    ids.technician_ids!.push(sam)

    const res = await postComplete(
      completeReq({
        changedBy: sam,
        technicianId: sam,
        technicianIds: '{"niet":"een lijst"}',
        visitDate: new Date().toISOString(),
      }),
      ctx(workOrderId),
    )

    expect(res.status).toBe(400)
  })
})
