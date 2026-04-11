import { NextRequest, NextResponse } from 'next/server'
import { getInterventionById } from '@/lib/server/interventions'

type RouteContext = {
  params: Promise<{
    id: string
  }>
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params

  try {
    const intervention = await getInterventionById(id)

    if (!intervention) {
      return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
    }

    return NextResponse.json({ intervention })
  } catch (error) {
    console.error('[api/interventions/[id]] kon interventie niet laden:', error)
    return NextResponse.json(
      { error: 'Interventie kon niet geladen worden' },
      { status: 500 },
    )
  }
}
