import { NextRequest, NextResponse } from 'next/server'
import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contacts, sites } from '@/lib/db/schema'
import type { Contact, Site } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

// GET /api/customers/[id]/sites — sites of a customer, each with its contacts
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  try {
    const siteRows = await db.select().from(sites).where(eq(sites.customerId, id)).orderBy(asc(sites.name))
    const siteIds = siteRows.map(s => s.id)
    const contactRows = siteIds.length
      ? await db.select().from(contacts).where(inArray(contacts.siteId, siteIds)).orderBy(asc(contacts.name))
      : []

    const result: Array<Site & { contacts: Contact[] }> = siteRows.map(row => ({
      id: row.id,
      customerId: row.customerId,
      name: row.name,
      address: row.address,
      city: row.city,
      phones: [row.phonePrimary, row.phoneSecondary].filter((p): p is string => Boolean(p)),
      lat: row.lat ?? undefined,
      lon: row.lon ?? undefined,
      closingDay: row.closingDay ?? undefined,
      contacts: contactRows
        .filter(c => c.siteId === row.id)
        .map(c => ({ id: c.id, siteId: c.siteId, name: c.name, phone: c.phone, email: c.email ?? undefined, role: c.role ?? undefined })),
    }))

    return NextResponse.json({ sites: result })
  } catch (error) {
    console.error('[api/customers/[id]/sites GET]', error)
    return NextResponse.json({ error: 'Locaties konden niet geladen worden' }, { status: 500 })
  }
}
