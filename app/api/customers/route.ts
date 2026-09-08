import { NextRequest, NextResponse } from 'next/server'
import { asc, ilike, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers } from '@/lib/db/schema'
import type { Customer } from '@/types'

// GET /api/customers?q=  — name or customer number contains q (case-insensitive), max 50
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  const pattern = `%${q}%`

  try {
    const rows = await db
      .select()
      .from(customers)
      .where(q ? or(ilike(customers.name, pattern), ilike(customers.customerNumber, pattern)) : undefined)
      .orderBy(asc(customers.name))
      .limit(50)

    const result: Customer[] = rows.map(row => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      address: row.address,
      city: row.city,
      vatNumber: row.vatNumber ?? undefined,
      customerNumber: row.customerNumber ?? undefined,
      invoiceCustomerNumber: row.invoiceCustomerNumber ?? undefined,
    }))

    return NextResponse.json({ customers: result })
  } catch (error) {
    console.error('[api/customers GET]', error)
    return NextResponse.json({ error: 'Klanten konden niet geladen worden' }, { status: 500 })
  }
}
