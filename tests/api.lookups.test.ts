import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET as getCustomers } from '@/app/api/customers/route'
import { GET as getCustomerSites } from '@/app/api/customers/[id]/sites/route'
import { GET as getSiteDevices, POST as postSiteDevice } from '@/app/api/sites/[id]/devices/route'
import { GET as getTechnicians } from '@/app/api/technicians/route'
import { contacts, customers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { CleanupIds } from './setup'
import { cleanup, createTestTechnician, createTestWorkOrder, testDb } from './setup'
import { workOrders } from '@/lib/db/schema'

function ctx(id: string) { return { params: Promise.resolve({ id }) } }

describe('wizard lookup routes', () => {
  let ids: CleanupIds
  beforeEach(() => { ids = { work_order_ids: [], technician_ids: [], device_ids: [] } })
  afterEach(async () => { await cleanup(ids) })

  it('GET /api/customers filters on name or customer number, case-insensitive', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)
    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))
    const number = `K-${randomUUID().slice(0, 6)}`
    await testDb.update(customers).set({ customerNumber: number, name: 'Molenhoeve Lookup Test' }).where(eq(customers.id, wo!.customerId))

    const byName = await getCustomers(new NextRequest('http://localhost/api/customers?q=molenhoeve%20lookup'))
    const byNameJson = await byName.json() as { customers: Array<{ id: string; customerNumber?: string }> }
    expect(byName.status).toBe(200)
    expect(byNameJson.customers.some(c => c.id === wo!.customerId)).toBe(true)

    const byNumber = await getCustomers(new NextRequest(`http://localhost/api/customers?q=${number.toLowerCase()}`))
    const byNumberJson = await byNumber.json() as { customers: Array<{ id: string; customerNumber?: string }> }
    expect(byNumberJson.customers).toHaveLength(1)
    expect(byNumberJson.customers[0]?.customerNumber).toBe(number)
  })

  it('GET /api/customers/[id]/sites returns sites with their contacts and phones array', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)
    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))
    await testDb.insert(contacts).values({ id: `contact-${randomUUID()}`, siteId: wo!.siteId, name: 'An Contact', phone: '0470 00 00 00' })

    const res = await getCustomerSites(new NextRequest('http://localhost/x'), ctx(wo!.customerId))
    const json = await res.json() as { sites: Array<{ id: string; phones: string[]; contacts: Array<{ name: string }> }> }
    expect(res.status).toBe(200)
    expect(json.sites).toHaveLength(1)
    expect(json.sites[0]?.id).toBe(wo!.siteId)
    expect(Array.isArray(json.sites[0]?.phones)).toBe(true)
    expect(json.sites[0]?.contacts[0]?.name).toBe('An Contact')
  })

  it('GET and POST /api/sites/[id]/devices list and create devices', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)
    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))

    const before = await (await getSiteDevices(new NextRequest('http://localhost/x'), ctx(wo!.siteId))).json() as { devices: unknown[] }
    expect(before.devices).toHaveLength(1)

    const created = await postSiteDevice(new NextRequest('http://localhost/x', {
      method: 'POST',
      body: JSON.stringify({ brand: 'Berner', model: 'Friteuse', unit_number: 'U-1', warranty_until: '2027-01-01' }),
      headers: { 'content-type': 'application/json' },
    }), ctx(wo!.siteId))
    const createdJson = await created.json() as { device: { id: string; brand: string; unitNumber?: string; warrantyUntil?: string } }
    ids.device_ids?.push(createdJson.device.id)
    expect(created.status).toBe(201)
    expect(createdJson.device).toMatchObject({ brand: 'Berner', unitNumber: 'U-1', warrantyUntil: '2027-01-01' })

    const after = await (await getSiteDevices(new NextRequest('http://localhost/x'), ctx(wo!.siteId))).json() as { devices: unknown[] }
    expect(after.devices).toHaveLength(2)

    const bad = await postSiteDevice(new NextRequest('http://localhost/x', {
      method: 'POST', body: JSON.stringify({ brand: 'Berner' }), headers: { 'content-type': 'application/json' },
    }), ctx(wo!.siteId))
    expect(bad.status).toBe(400)
  })

  it('GET /api/technicians returns active technicians ordered by name', async () => {
    const techId = await createTestTechnician()
    ids.technician_ids?.push(techId)

    const res = await getTechnicians()
    const json = await res.json() as { technicians: Array<{ id: string; name: string }> }
    expect(res.status).toBe(200)
    expect(json.technicians.some(t => t.id === techId)).toBe(true)
    const names = json.technicians.map(t => t.name)
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names)
  })
})
