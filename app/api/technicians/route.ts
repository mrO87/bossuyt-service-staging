import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { technicians } from '@/lib/db/schema'

// GET /api/technicians — active users, ordered by name (used by the wizard's technician picker)
export async function GET() {
  try {
    const rows = await db
      .select({ id: technicians.id, name: technicians.name, initials: technicians.initials, role: technicians.role })
      .from(technicians)
      .where(eq(technicians.active, true))
      .orderBy(asc(technicians.name))
    return NextResponse.json({ technicians: rows })
  } catch (error) {
    console.error('[api/technicians GET]', error)
    return NextResponse.json({ error: 'Techniekers konden niet geladen worden' }, { status: 500 })
  }
}
