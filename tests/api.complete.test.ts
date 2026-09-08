import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { POST as postComplete } from '@/app/api/work-orders/[id]/complete/route'
import { werkbonnen, workOrders } from '@/lib/db/schema'
import type { CleanupIds } from './setup'
import { cleanup, createTestTechnician, createTestWorkOrder, createTestWorkOrderWithoutDevice, testDb } from './setup'

function ctx(id: string) { return { params: Promise.resolve({ id }) } }

function formReq(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return new NextRequest('http://localhost/api/work-orders/x/complete', { method: 'POST', body: fd })
}

const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('POST /api/work-orders/[id]/complete', () => {
  let ids: CleanupIds
  beforeEach(() => { ids = { work_order_ids: [], technician_ids: [] } })
  afterEach(async () => { await cleanup(ids) })

  it('stores every Service Bon field and generates bon numbers -01 then -02', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)
    const techId = await createTestTechnician()
    ids.technician_ids?.push(techId)
    await testDb.update(workOrders).set({ ticketNumber: `TKT-${workOrderId.slice(-6)}` }).where(eq(workOrders.id, workOrderId))

    const fields = {
      changedBy: techId,
      technicianId: techId,
      completionNotes: 'Dichting vervangen',
      remarks: 'Volgende keer filter meenemen',
      completionParts: JSON.stringify([{ id: 'p1', code: 'A-1', description: 'Dichting', quantity: 2, toOrder: false, urgent: false }]),
      followUp: '[]',
      visitDate: '2026-09-05T00:00:00.000Z',
      arrivalTime: '2026-09-05T08:30:00.000Z',
      departureTime: '2026-09-05T10:15:00.000Z',
      workStart: '2026-09-05T08:40:00.000Z',
      workEnd: '2026-09-05T10:05:00.000Z',
      interventionKind: 'week',
      tripCount: '1',
      personCount: '2',
      signature: SIGNATURE,
    }

    const first = await postComplete(formReq(fields), ctx(workOrderId))
    const firstJson = await first.json() as { ok: boolean; werkbonId: string; bonNumber: string }
    expect(first.status).toBe(200)
    expect(firstJson.bonNumber).toBe(`TKT-${workOrderId.slice(-6)}-01`)

    const [row] = await testDb.select().from(werkbonnen).where(eq(werkbonnen.id, firstJson.werkbonId))
    expect(row).toMatchObject({
      bonNumber: firstJson.bonNumber,
      technicianId: techId,
      notes: 'Dichting vervangen',
      remarks: 'Volgende keer filter meenemen',
      interventionKind: 'week',
      tripCount: 1,
      personCount: 2,
      signatureData: SIGNATURE,
    })
    expect(row?.arrivalTime?.toISOString()).toBe('2026-09-05T08:30:00.000Z')
    expect(row?.departureTime?.toISOString()).toBe('2026-09-05T10:15:00.000Z')
    expect(row?.visitDate?.toISOString().slice(0, 10)).toBe('2026-09-05')
    expect(row?.parts).toHaveLength(1)

    const second = await postComplete(formReq(fields), ctx(workOrderId))
    const secondJson = await second.json() as { bonNumber: string }
    expect(secondJson.bonNumber).toBe(`TKT-${workOrderId.slice(-6)}-02`)

    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))
    expect(wo?.status).toBe('afgewerkt')
  })

  it('falls back to the work order id as bon prefix when there is no ticket number', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)
    const res = await postComplete(formReq({ completionNotes: 'x' }), ctx(workOrderId))
    const json = await res.json() as { bonNumber: string }
    expect(json.bonNumber).toBe(`${workOrderId}-01`)
  })

  it('fills the work order device when the werkbon names one and the work order had none', async () => {
    const workOrderId = await createTestWorkOrderWithoutDevice()
    ids.work_order_ids?.push(workOrderId)
    const donor = await createTestWorkOrder()
    ids.work_order_ids?.push(donor)
    const [donorRow] = await testDb.select().from(workOrders).where(eq(workOrders.id, donor))

    const res = await postComplete(formReq({ deviceId: donorRow!.deviceId! }), ctx(workOrderId))
    expect(res.status).toBe(200)
    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))
    expect(wo?.deviceId).toBe(donorRow!.deviceId)
  })

  it('returns 400 on malformed parts or follow-up JSON instead of storing null', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const badParts = await postComplete(formReq({ completionParts: 'GEEN_JSON' }), ctx(workOrderId))
    expect(badParts.status).toBe(400)
    expect(await badParts.json()).toMatchObject({ error: 'Ongeldige onderdelenlijst' })

    const badFollowUp = await postComplete(formReq({ followUp: '{oops' }), ctx(workOrderId))
    expect(badFollowUp.status).toBe(400)

    const rows = await testDb.select().from(werkbonnen).where(eq(werkbonnen.workOrderId, workOrderId))
    expect(rows).toHaveLength(0)
  })

  it('returns 404 for an unknown work order', async () => {
    const res = await postComplete(formReq({ completionNotes: 'x' }), ctx('wo-does-not-exist'))
    expect(res.status).toBe(404)
  })
})
