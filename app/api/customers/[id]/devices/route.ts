/**
 * GET /api/customers/[id]/devices — alle toestellen van één klant.
 *
 * De toestelkiezer op de werkbon toonde de toestellen van de **vestiging**. Een
 * klant met twee vestigingen zag die van de andere niet, terwijl je op een bon
 * geregeld een toestel zoekt dat bij dezelfde klant elders staat.
 *
 * Gegroepeerd per vestiging en niet als één lijst: een toestel staat érgens, en
 * twee identieke fornuizen op twee adressen zijn niet uitwisselbaar. De
 * groepering maakt zichtbaar welk toestel je kiest.
 *
 * Met `?site=` komt die vestiging bovenaan — dat is de vestiging van de bon
 * waar je vandaan komt, en daar staat het gezochte toestel meestal.
 */
import { NextRequest, NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { devices, sites } from '@/lib/db/schema'
import type { Device } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

export interface DevicesAtSite {
  siteId: string
  siteName: string
  siteCity: string
  devices: Device[]
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const preferred = req.nextUrl.searchParams.get('site')

  try {
    const rows = await db
      .select({
        device: devices,
        siteId: sites.id,
        siteName: sites.name,
        siteCity: sites.city,
      })
      .from(devices)
      .innerJoin(sites, eq(devices.siteId, sites.id))
      .where(eq(sites.customerId, id))
      .orderBy(asc(sites.name), asc(devices.brand), asc(devices.model))

    const bySite = new Map<string, DevicesAtSite>()
    for (const row of rows) {
      let group = bySite.get(row.siteId)
      if (!group) {
        group = {
          siteId: row.siteId,
          siteName: row.siteName ?? '',
          siteCity: row.siteCity ?? '',
          devices: [],
        }
        bySite.set(row.siteId, group)
      }
      group.devices.push({
        id: row.device.id,
        siteId: row.device.siteId,
        brand: row.device.brand,
        model: row.device.model,
        serialNumber: row.device.serialNumber ?? undefined,
        installDate: row.device.installDate ?? undefined,
        notes: row.device.notes ?? undefined,
        unitNumber: row.device.unitNumber ?? undefined,
        deliveryDate: row.device.deliveryDate ?? undefined,
        warrantyUntil: row.device.warrantyUntil ?? undefined,
      })
    }

    // De vestiging waar je vandaan komt eerst, de rest op naam.
    const groups = [...bySite.values()].sort((a, b) => {
      if (a.siteId === preferred) return -1
      if (b.siteId === preferred) return 1
      return a.siteName.localeCompare(b.siteName, 'nl-BE')
    })

    return NextResponse.json({ sites: groups })
  } catch (error) {
    console.error('[api/customers/[id]/devices GET]', error)
    return NextResponse.json({ error: 'Toestellen konden niet geladen worden' }, { status: 500 })
  }
}
