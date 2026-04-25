import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { devices } from '@/lib/db/schema'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const result = await db.select().from(devices).where(eq(devices.id, id)).limit(1)
  if (!result[0]) return NextResponse.json(null, { status: 404 })
  return NextResponse.json(result[0])
}
