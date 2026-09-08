import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getInterventionById } from '@/lib/server/interventions'
import type { CleanupIds } from './setup'
import { cleanup, createTestWorkOrder, createTestWorkOrderWithoutDevice } from './setup'

describe('interventions with an optional device', () => {
  let ids: CleanupIds

  beforeEach(() => { ids = { work_order_ids: [] } })
  afterEach(async () => { await cleanup(ids) })

  it('returns a work order that has no device with deviceId null', async () => {
    const workOrderId = await createTestWorkOrderWithoutDevice()
    ids.work_order_ids?.push(workOrderId)

    const intervention = await getInterventionById(workOrderId)

    expect(intervention).not.toBeNull()
    expect(intervention?.deviceId).toBeNull()
    expect(intervention?.deviceBrand).toBeUndefined()
    expect(intervention?.deviceModel).toBeUndefined()
  })

  it('still returns brand and model when a device is present', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)

    const intervention = await getInterventionById(workOrderId)

    expect(intervention?.deviceId).toMatch(/^device-/)
    expect(intervention?.deviceBrand).toBe('Bossuyt')
    expect(intervention?.deviceModel).toBe('Service Unit')
  })

  it('exposes the Service Bon header fields', async () => {
    const workOrderId = await createTestWorkOrder()
    ids.work_order_ids?.push(workOrderId)
    const { workOrders, customers, sites, contacts, devices } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const { randomUUID } = await import('crypto')
    const { testDb } = await import('./setup')

    const [wo] = await testDb.select().from(workOrders).where(eq(workOrders.id, workOrderId))
    await testDb.update(workOrders).set({ ticketNumber: `TKT-${randomUUID().slice(0, 6)}`, ticketDate: new Date('2026-09-04T00:00:00Z') }).where(eq(workOrders.id, workOrderId))
    await testDb.update(customers).set({ customerNumber: 'K-HDR', invoiceCustomerNumber: 'K-INV' }).where(eq(customers.id, wo!.customerId))
    await testDb.update(sites).set({ phonePrimary: '056 12 34 56', phoneSecondary: '0470 12 34 56', closingDay: 'zondag' }).where(eq(sites.id, wo!.siteId))
    await testDb.insert(contacts).values({ id: `contact-${randomUUID()}`, siteId: wo!.siteId, name: 'Piet Contact', phone: '0499 00 11 22' })
    await testDb.update(devices).set({ unitNumber: 'U-9', deliveryDate: '2023-05-01', warrantyUntil: '2025-05-01' }).where(eq(devices.id, wo!.deviceId!))

    const intervention = await getInterventionById(workOrderId)

    expect(intervention?.ticketNumber).toMatch(/^TKT-/)
    expect(intervention?.ticketDate?.slice(0, 10)).toBe('2026-09-04')
    expect(intervention?.createdAt).toBeTruthy()
    expect(intervention?.customerNumber).toBe('K-HDR')
    expect(intervention?.invoiceCustomerNumber).toBe('K-INV')
    expect(intervention?.sitePhones).toEqual(['056 12 34 56', '0470 12 34 56'])
    expect(intervention?.closingDay).toBe('zondag')
    expect(intervention?.contactName).toBe('Piet Contact')
    expect(intervention?.contactPhone).toBe('0499 00 11 22')
    expect(intervention?.deviceUnitNumber).toBe('U-9')
    expect(intervention?.deviceSerial).toMatch(/^SN-/)
    expect(intervention?.deviceDeliveryDate).toBe('2023-05-01')
    expect(intervention?.deviceWarrantyUntil).toBe('2025-05-01')
  })
})
