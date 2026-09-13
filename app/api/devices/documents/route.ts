import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { deviceDocuments, devices } from '@/lib/db/schema'

/**
 * GET /api/devices/documents?device=<id> — of, als terugval, ?brand=X&model=Y
 *
 * Twee wegen, in deze volgorde.
 *
 * **Het aangeduide toesteltype.** Staat er een `device_type_id` op het toestel,
 * dan gelden díe documenten. Eén verwijzing, en dus bestand tegen een spatie
 * verschil of een hernoemd type.
 *
 * **Anders merk en model**, letterlijk vergeleken. Dat was vroeger de enige
 * weg; hij blijft bestaan voor toestellen die er al stonden, en omdat een
 * toestel dat exact overeenkomt meteen zijn documenten hoort te hebben. Het is
 * de terugval, niet de hoofdweg.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('device')
  const brand = searchParams.get('brand')
  const model = searchParams.get('model')

  if (!deviceId && (!brand || !model)) {
    return NextResponse.json({ error: 'device of brand+model is verplicht' }, { status: 400 })
  }

  let doc: typeof deviceDocuments.$inferSelect | null = null

  if (deviceId) {
    const [row] = await db
      .select({ document: deviceDocuments })
      .from(devices)
      .innerJoin(deviceDocuments, eq(devices.deviceTypeId, deviceDocuments.id))
      .where(eq(devices.id, deviceId))
      .limit(1)
    doc = row?.document ?? null
  }

  if (!doc && brand && model) {
    const [row] = await db
      .select()
      .from(deviceDocuments)
      .where(and(eq(deviceDocuments.brand, brand), eq(deviceDocuments.model, model)))
      .limit(1)
    doc = row ?? null
  }

  if (!doc) return NextResponse.json(null)

  return NextResponse.json({
    schematic: doc.schematicPath,
    exploded: doc.explodedViewPath,
    manual: doc.serviceManualPath,
  })
}

// POST /api/devices/documents — multipart: brand, model, type, file
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const brand = (formData.get('brand') as string | null)?.trim()
  const model = (formData.get('model') as string | null)?.trim()
  const type  = (formData.get('type')  as string | null)?.trim()
  const file  = formData.get('file') as File | null

  if (!brand || !model || !type || !file) {
    return NextResponse.json({ error: 'brand, model, type and file are required' }, { status: 400 })
  }

  if (!['schematic', 'exploded', 'manual'].includes(type)) {
    return NextResponse.json({ error: 'type must be schematic | exploded | manual' }, { status: 400 })
  }

  const safeBrand = brand.replace(/\s+/g, '-').toLowerCase()
  const safeModel = model.replace(/\s+/g, '-').toLowerCase()
  const fileName  = `${safeBrand}-${safeModel}-${type}.pdf`
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'device-docs')
  const destPath  = path.join(uploadDir, fileName)

  await fs.mkdir(uploadDir, { recursive: true })
  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(destPath, buffer)

  const relativePath = `/uploads/device-docs/${fileName}`

  const existing = await db
    .select()
    .from(deviceDocuments)
    .where(and(eq(deviceDocuments.brand, brand), eq(deviceDocuments.model, model)))
    .limit(1)

  if (existing.length) {
    const upd: Partial<typeof deviceDocuments.$inferInsert> = { updatedAt: new Date() }
    if (type === 'schematic') upd.schematicPath    = relativePath
    if (type === 'exploded')  upd.explodedViewPath  = relativePath
    if (type === 'manual')    upd.serviceManualPath = relativePath
    await db.update(deviceDocuments).set(upd).where(eq(deviceDocuments.id, existing[0].id))
  } else {
    await db.insert(deviceDocuments).values({
      id: randomUUID(),
      brand,
      model,
      schematicPath:    type === 'schematic' ? relativePath : null,
      explodedViewPath: type === 'exploded'  ? relativePath : null,
      serviceManualPath: type === 'manual'   ? relativePath : null,
    })
  }

  return NextResponse.json({ success: true, path: relativePath })
}
