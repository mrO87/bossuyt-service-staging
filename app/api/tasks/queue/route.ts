import { NextRequest, NextResponse } from 'next/server'
import { getAllQueueItems, getQueueForRole, getQueueForTechnician } from '@/lib/tasks/queue'
import type { TaskRole } from '@/types'

// ── GET /api/tasks/queue ───────────────────────────────────────────────────────
// Query params (provide one):
//   all=true                    → all tasks, all roles (activity log)
//   role=warehouse              → role queue
//   technician_id=tech-001      → personal technician queue
export async function GET(req: NextRequest) {
  const url          = new URL(req.url)
  const all          = url.searchParams.get('all')
  const role         = url.searchParams.get('role')
  const technicianId = url.searchParams.get('technician_id')

  try {
    if (all === 'true') {
      const items = await getAllQueueItems()
      return NextResponse.json({ tasks: items, count: items.length })
    }

    if (technicianId) {
      const items = await getQueueForTechnician(technicianId)
      return NextResponse.json({ tasks: items, count: items.length })
    }

    if (role) {
      const items = await getQueueForRole(role as TaskRole)
      return NextResponse.json({ tasks: items, count: items.length })
    }

    return NextResponse.json(
      { error: 'Geef role, technician_id of all=true op als query parameter' },
      { status: 400 },
    )
  } catch (error) {
    console.error('[api/tasks/queue GET]', error)
    return NextResponse.json({ error: 'Kon wachtrij niet laden' }, { status: 500 })
  }
}
