/**
 * GET /api/work-orders/[id]/devices — de toestellen waar dit bezoek over gaat.
 *
 * Een servicebon noemt er in zijn UNIT-tabel gerust drie. Die stonden al in de
 * database — `work_order_devices` — maar de werkbon toonde er één, want het
 * scherm kende alleen `device_id`, het hoofdtoestel waar het verslag aan hangt.
 *
 * In de volgorde van het formulier, want zo staan ze op het papier dat de
 * technieker ernaast houdt.
 */
import { NextRequest, NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { devices, workOrderDevices, workOrders } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

export interface BonDevice {
  id: string
  brand: string
  model: string
  unitNumber?: string
  sourceLabel?: string
  deliveryDate?: string
  warrantyUntil?: string
  /** Het toestel waar het verslag en de onderdelen aan hangen. */
  isMain: boolean
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  try {
    const [order] = await db
      .select({ deviceId: workOrders.deviceId })
      .from(workOrders)
      .where(eq(workOrders.id, id))

    if (!order) return NextResponse.json({ error: 'Werkbon bestaat niet' }, { status: 404 })

    const rows = await db
      .select({ device: devices, position: workOrderDevices.position })
      .from(workOrderDevices)
      .innerJoin(devices, eq(devices.id, workOrderDevices.deviceId))
      .where(eq(workOrderDevices.workOrderId, id))
      .orderBy(asc(workOrderDevices.position))

    const list: BonDevice[] = rows.map(row => ({
      id: row.device.id,
      brand: row.device.brand,
      model: row.device.model,
      unitNumber: row.device.unitNumber ?? undefined,
      sourceLabel: row.device.sourceLabel ?? undefined,
      deliveryDate: row.device.deliveryDate ?? undefined,
      warrantyUntil: row.device.warrantyUntil ?? undefined,
      isMain: row.device.id === order.deviceId,
    }))

    return NextResponse.json({ devices: list })
  } catch (error) {
    console.error('[api/work-orders/[id]/devices GET]', error)
    return NextResponse.json({ error: 'Toestellen konden niet geladen worden' }, { status: 500 })
  }
}
