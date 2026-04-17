import { NextRequest, NextResponse } from 'next/server'
import { or, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workOrderLinks } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

// ── GET /api/work-orders/[id]/links ───────────────────────────────────────────
// Returns all links where this work order is the source OR the target.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  try {
    const links = await db
      .select()
      .from(workOrderLinks)
      .where(
        or(
          eq(workOrderLinks.fromWorkOrderId, id),
          eq(workOrderLinks.toWorkOrderId, id),
        ),
      )

    const result = links.map(link => ({
      ...link,
      createdAt: link.createdAt instanceof Date ? link.createdAt.toISOString() : link.createdAt,
    }))

    return NextResponse.json({ links: result })
  } catch (error) {
    console.error('[api/work-orders/[id]/links GET]', error)
    return NextResponse.json({ error: 'Kon links niet laden' }, { status: 500 })
  }
}
