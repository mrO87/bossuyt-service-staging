/**
 * De dagklok: wanneer een technieker echt vertrok en weer thuis was.
 *
 * `GET` geeft een reeks dagen terug en geen enkele dag, ook al vraagt de
 * dagweergave er maar één. De weekweergave heeft er zeven nodig, en als die
 * ergens anders vandaan zouden komen, kunnen dag en week een ander uur tonen
 * voor dezelfde ochtend. Dat is precies het soort tweede waarheid dat we net
 * uit de planning gehaald hebben.
 *
 * `PUT` schrijft één dag. Het uur komt van de telefoon en niet van de server:
 * wie offline op het knopje tikt, moet het uur van dát moment bewaard zien, niet
 * het uur waarop de wachtrij toevallig leeggemaakt werd.
 */
import { NextRequest, NextResponse } from 'next/server'
import { and, eq, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { technicianDays } from '@/lib/db/schema'

export interface DayClock {
  /** `YYYY-MM-DD`. */
  day: string
  /** ISO-tijdstip, of null zolang er niet vertrokken is. */
  startedAt: string | null
  /** ISO-tijdstip, of null zolang de dag niet afgesloten is. */
  endedAt: string | null
}

const DAG = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const technicianId = params.get('technicianId')
  const from = params.get('from') ?? params.get('date')
  const to = params.get('to') ?? from

  if (!technicianId || !from || !to || !DAG.test(from) || !DAG.test(to)) {
    return NextResponse.json({ error: 'technicianId en een datum zijn verplicht' }, { status: 400 })
  }

  try {
    const rows = await db
      .select()
      .from(technicianDays)
      .where(and(
        eq(technicianDays.technicianId, technicianId),
        gte(technicianDays.day, from),
        lte(technicianDays.day, to),
      ))

    const days: DayClock[] = rows.map(row => ({
      day: row.day,
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
    }))

    return NextResponse.json({ days })
  } catch (error) {
    console.error('[api/day-clock GET]', error)
    return NextResponse.json({ error: 'Dagklok kon niet geladen worden' }, { status: 500 })
  }
}

/** Een ISO-tijdstip, of null. Een onleesbare waarde is null en geen fout. */
function tijdstip(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export async function PUT(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const technicianId = typeof body.technicianId === 'string' ? body.technicianId : ''
  const day = typeof body.day === 'string' ? body.day : ''

  if (!technicianId || !DAG.test(day)) {
    return NextResponse.json({ error: 'technicianId en day zijn verplicht' }, { status: 400 })
  }

  // Alleen wat meegestuurd is verandert. Een telefoon die enkel het vertrek
  // meldt, mag de thuiskomst van een andere telefoon niet wissen — en
  // `undefined` en `null` betekenen hier dus niet hetzelfde: het eerste is
  // "niets gezegd", het tweede is "haal weg".
  const raakt = (sleutel: string) => Object.prototype.hasOwnProperty.call(body, sleutel)
  const wijziging: { startedAt?: Date | null; endedAt?: Date | null } = {}
  if (raakt('startedAt')) wijziging.startedAt = tijdstip(body.startedAt)
  if (raakt('endedAt')) wijziging.endedAt = tijdstip(body.endedAt)

  if (Object.keys(wijziging).length === 0) {
    return NextResponse.json({ error: 'Niets om te bewaren' }, { status: 400 })
  }

  try {
    const [row] = await db
      .insert(technicianDays)
      .values({ technicianId, day, ...wijziging })
      .onConflictDoUpdate({
        target: [technicianDays.technicianId, technicianDays.day],
        set: { ...wijziging, updatedAt: new Date() },
      })
      .returning()

    const clock: DayClock = {
      day: row.day,
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
    }
    return NextResponse.json(clock)
  } catch (error) {
    console.error('[api/day-clock PUT]', error)
    return NextResponse.json({ error: 'Dagklok kon niet bewaard worden' }, { status: 500 })
  }
}
