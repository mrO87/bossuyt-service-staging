import { randomUUID } from 'crypto'
import { and, eq, inArray, or } from 'drizzle-orm'

if (!process.env.DATABASE_URL_TEST) {
  throw new Error('DATABASE_URL_TEST is required for the integration test suite')
}

const env = process.env as Record<string, string | undefined>
env.NODE_ENV = 'test'
env.TZ = 'UTC'
env.DATABASE_URL = process.env.DATABASE_URL_TEST
env.ERP_API_KEY ??= 'test-erp-key'

const dbModule = await import('@/lib/db/index')
const schema = await import('@/lib/db/schema')

export const testDb = dbModule.db
export const testSql = dbModule.sql

const {
  customers,
  devices,
  taskDependencies,
  tasks,
  technicians,
  werkbonnen,
  workOrderEvents,
  workOrderLinks,
  workOrders,
  sites,
} = schema

export type CleanupIds = {
  work_order_ids?: string[]
  task_ids?: string[]
  technician_ids?: string[]
  customer_ids?: string[]
  site_ids?: string[]
  device_ids?: string[]
}

export async function createTestWorkOrder(): Promise<string> {
  const suffix = randomUUID()
  const customerId = `customer-${suffix}`
  const siteId = `site-${suffix}`
  const deviceId = `device-${suffix}`
  const workOrderId = `wo-${suffix}`

  await testDb.insert(customers).values({
    id: customerId,
    name: `Test Customer ${suffix.slice(0, 8)}`,
    phone: '0123456789',
    address: 'Teststraat 1',
    city: 'Gent',
  })

  await testDb.insert(sites).values({
    id: siteId,
    customerId,
    name: `Test Site ${suffix.slice(0, 8)}`,
    address: 'Teststraat 1',
    city: 'Gent',
  })

  await testDb.insert(devices).values({
    id: deviceId,
    siteId,
    brand: 'Bossuyt',
    model: 'Service Unit',
    serialNumber: `SN-${suffix.slice(0, 8)}`,
  })

  await testDb.insert(workOrders).values({
    id: workOrderId,
    customerId,
    siteId,
    deviceId,
    plannedDate: new Date('2026-04-17T09:00:00.000Z'),
    status: 'gepland',
    type: 'warm',
    source: 'planned',
    isUrgent: false,
    planningVersion: 1,
  })

  return workOrderId
}

export async function createTestTechnician(): Promise<string> {
  const technicianId = `tech-${randomUUID()}`

  await testDb.insert(technicians).values({
    id: technicianId,
    name: `Test Technician ${technicianId.slice(-6)}`,
    initials: 'TT',
    email: `${technicianId}@example.com`,
    role: 'technician',
    active: true,
  })

  return technicianId
}

export async function cleanup(ids: CleanupIds): Promise<void> {
  const workOrderIds = ids.work_order_ids ?? []
  const explicitTaskIds = ids.task_ids ?? []
  const technicianIds = ids.technician_ids ?? []
  const workOrderRows = workOrderIds.length
    ? await testDb
        .select({
          id: workOrders.id,
          customerId: workOrders.customerId,
          siteId: workOrders.siteId,
          deviceId: workOrders.deviceId,
        })
        .from(workOrders)
        .where(inArray(workOrders.id, workOrderIds))
    : []
  const customerIds = [...new Set([...(ids.customer_ids ?? []), ...workOrderRows.map(row => row.customerId)])]
  const siteIds = [...new Set([...(ids.site_ids ?? []), ...workOrderRows.map(row => row.siteId)])]
  const deviceIds = [...new Set([...(ids.device_ids ?? []), ...workOrderRows.map(row => row.deviceId)])]

  const relatedTaskIds = workOrderIds.length
    ? await testDb
        .select({ id: tasks.id })
        .from(tasks)
        .where(inArray(tasks.workOrderId, workOrderIds))
    : []

  const taskIds = [...new Set([...explicitTaskIds, ...relatedTaskIds.map(row => row.id)])]

  if (taskIds.length) {
    await testDb
      .delete(taskDependencies)
      .where(
        or(
          inArray(taskDependencies.predecessorId, taskIds),
          inArray(taskDependencies.successorId, taskIds),
        ),
      )

    await testDb.delete(workOrderEvents).where(inArray(workOrderEvents.taskId, taskIds))
  }

  if (workOrderIds.length) {
    await testDb
      .delete(workOrderLinks)
      .where(
        or(
          inArray(workOrderLinks.fromWorkOrderId, workOrderIds),
          inArray(workOrderLinks.toWorkOrderId, workOrderIds),
        ),
      )

    await testDb.delete(workOrderEvents).where(inArray(workOrderEvents.workOrderId, workOrderIds))
  }

  if (taskIds.length) {
    await testDb.delete(tasks).where(inArray(tasks.id, taskIds))
  }

  if (workOrderIds.length) {
    await testDb.delete(werkbonnen).where(inArray(werkbonnen.workOrderId, workOrderIds))
    await testDb.delete(workOrders).where(inArray(workOrders.id, workOrderIds))
  }

  if (deviceIds.length) {
    await testDb.delete(devices).where(inArray(devices.id, deviceIds))
  }

  if (siteIds.length) {
    await testDb.delete(sites).where(inArray(sites.id, siteIds))
  }

  if (customerIds.length) {
    await testDb.delete(customers).where(inArray(customers.id, customerIds))
  }

  if (technicianIds.length) {
    await testDb.delete(technicians).where(inArray(technicians.id, technicianIds))
  }
}

export async function fetchTask(taskId: string) {
  const [task] = await testDb.select().from(tasks).where(eq(tasks.id, taskId))
  return task ?? null
}

export async function insertTask(values: typeof tasks.$inferInsert) {
  await testDb.insert(tasks).values(values)
}

export async function insertDependency(values: typeof taskDependencies.$inferInsert) {
  await testDb.insert(taskDependencies).values(values)
}

export async function findEventsForWorkOrder(workOrderId: string) {
  return testDb
    .select()
    .from(workOrderEvents)
    .where(eq(workOrderEvents.workOrderId, workOrderId))
}

export async function findEventsForTask(taskId: string) {
  return testDb
    .select()
    .from(workOrderEvents)
    .where(eq(workOrderEvents.taskId, taskId))
}

export async function deleteTaskById(taskId: string) {
  await cleanup({ task_ids: [taskId] })
}

export async function deleteWorkOrderById(workOrderId: string) {
  const [workOrder] = await testDb
    .select({
      customerId: workOrders.customerId,
      siteId: workOrders.siteId,
      deviceId: workOrders.deviceId,
    })
    .from(workOrders)
    .where(eq(workOrders.id, workOrderId))

  await cleanup({
    work_order_ids: [workOrderId],
    customer_ids: workOrder ? [workOrder.customerId] : [],
    site_ids: workOrder ? [workOrder.siteId] : [],
    device_ids: workOrder ? [workOrder.deviceId] : [],
  })
}

export async function workOrderExists(workOrderId: string): Promise<boolean> {
  const [row] = await testDb
    .select({ id: workOrders.id })
    .from(workOrders)
    .where(eq(workOrders.id, workOrderId))
  return Boolean(row)
}

export async function taskExists(taskId: string): Promise<boolean> {
  const [row] = await testDb
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.id, taskId))
  return Boolean(row)
}

export async function hasDependency(predecessorId: string, successorId: string): Promise<boolean> {
  const [row] = await testDb
    .select({ id: taskDependencies.id })
    .from(taskDependencies)
    .where(
      and(
        eq(taskDependencies.predecessorId, predecessorId),
        eq(taskDependencies.successorId, successorId),
      ),
    )
  return Boolean(row)
}
