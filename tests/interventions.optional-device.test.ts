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
})
