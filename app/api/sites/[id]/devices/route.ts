import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { devices, sites } from '@/lib/db/schema'
import type { Device } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

function toDevice(row: typeof devices.$inferSelect): Device {
  return {
    id: row.id,
    siteId: row.siteId,
    brand: row.brand,
    model: row.model,
    serialNumber: row.serialNumber ?? undefined,
    installDate: row.installDate ?? undefined,
    notes: row.notes ?? undefined,
    unitNumber: row.unitNumber ?? undefined,
    deliveryDate: row.deliveryDate ?? undefined,
    warrantyUntil: row.warrantyUntil ?? undefined,
  }
}

// GET /api/sites/[id]/devices
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const rows = await db.select().from(devices).where(eq(devices.siteId, id)).orderBy(asc(devices.brand), asc(devices.model))
    return NextResponse.json({ devices: rows.map(toDevice) })
  } catch (error) {
    console.error('[api/sites/[id]/devices GET]', error)
    return NextResponse.json({ error: 'Toestellen konden niet geladen worden' }, { status: 500 })
  }
}

// POST /api/sites/[id]/devices — body: { brand, model, unit_number?, serial_number?, delivery_date?, warranty_until? }
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const str = (key: string) => (typeof body[key] === 'string' && (body[key] as string).trim()) || null
  const brand = str('brand')
  const model = str('model')
  if (!brand || !model) return NextResponse.json({ error: 'brand en model zijn verplicht' }, { status: 400 })

  try {
    const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, id))
    if (!site) return NextResponse.json({ error: 'Locatie niet gevonden' }, { status: 404 })

    const [row] = await db.insert(devices).values({
      id: `device-${randomUUID()}`,
      siteId: id,
      brand,
      model,
      serialNumber:  str('serial_number'),
      unitNumber:    str('unit_number'),
      deliveryDate:  str('delivery_date'),
      warrantyUntil: str('warranty_until'),
    }).returning()

    return NextResponse.json({ device: toDevice(row!) }, { status: 201 })
  } catch (error) {
    console.error('[api/sites/[id]/devices POST]', error)
    return NextResponse.json({ error: 'Toestel kon niet aangemaakt worden' }, { status: 500 })
  }
}
