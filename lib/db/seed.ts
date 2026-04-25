import { sql } from 'drizzle-orm'
import {
  contacts as mockContacts,
  customers as mockCustomers,
  devices as mockDevices,
  interventions as mockInterventions,
  sites as mockSites,
} from '../mock-data'
import { db, sql as client } from './client'
import {
  contacts,
  customers,
  devices,
  sites,
  technicians,
  workOrderAssignments,
  workOrders,
} from './schema'

async function resetTables() {
  await db.execute(sql`
    TRUNCATE TABLE
      work_order_assignments,
      work_orders,
      contacts,
      devices,
      sites,
      customers,
      technicians
    RESTART IDENTITY CASCADE
  `)
}

async function seed() {
  await resetTables()

  await db.insert(technicians).values([
    {
      id: 'u1',
      name: 'Olivier Pierrard',
      initials: 'OP',
      email: 'olivier@fixassistant.com',
      role: 'technician',
      active: true,
    },
    {
      id: 'u2',
      name: 'Jonas Declercq',
      initials: 'JD',
      email: 'jonas@fixassistant.com',
      role: 'technician',
      active: true,
    },
  ])

  await db.insert(customers).values(mockCustomers)

  await db.insert(sites).values(
    mockSites.map(site => ({
      id: site.id,
      customerId: site.customerId,
      name: site.name,
      address: site.address,
      city: site.city,
      phonePrimary: site.phones[0] ?? null,
      phoneSecondary: site.phones[1] ?? null,
      lat: site.lat ?? null,
      lon: site.lon ?? null,
    })),
  )

  await db.insert(contacts).values(mockContacts)
  await db.insert(devices).values(mockDevices)

  await db.insert(workOrders).values(
    mockInterventions.map(intervention => ({
      id: intervention.id,
      customerId: intervention.customerId,
      siteId: intervention.siteId,
      deviceId: intervention.deviceId,
      plannedDate: new Date(intervention.plannedDate),
      status: intervention.status,
      type: intervention.type,
      source: intervention.source,
      description: intervention.description ?? null,
      estimatedMinutes: intervention.estimatedMinutes ?? null,
      isUrgent: intervention.isUrgent,
      planningVersion: intervention.planningVersion ?? 1,
      statusOnderwegAt: intervention.statusOnderwegAt ? new Date(intervention.statusOnderwegAt) : null,
      statusArrivedAt: intervention.statusArrivedAt ? new Date(intervention.statusArrivedAt) : null,
      statusOnderwegBy: intervention.statusOnderwegBy ?? null,
      createdBy: intervention.createdBy ?? null,
    })),
  )

  await db.insert(workOrderAssignments).values(
    mockInterventions.flatMap(intervention =>
      intervention.technicians.map(technician => ({
        workOrderId: intervention.id,
        technicianId: technician.technicianId,
        isLead: technician.isLead,
        accepted: technician.accepted,
        plannedOrder: technician.plannedOrder,
      })),
    ),
  )

  const countRows = await db.select({ count: sql<number>`count(*)::int` }).from(workOrders)
  console.log(`Seeded ${countRows[0]?.count ?? 0} work orders`)
  await client.end({ timeout: 1 })
}

void seed().catch(async error => {
  console.error('Seed failed:', error)
  await client.end({ timeout: 1 })
  process.exit(1)
})
