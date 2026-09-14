/**
 * De gegevens van een bon rechtzetten.
 *
 * Een servicebon komt binnen zoals hij op papier stond, en soms stond er iets
 * niet op — de bon van Villa Lorraine had geen klantnaam. Rechtzetten moet
 * kunnen, en het moet gebeuren waar je het ziet.
 *
 * **Niet alles op een bon hoort bij die bon.** Het ticketnummer en de
 * omschrijving wel; de naam, het adres en het telefoonnummer horen bij de klant
 * en de vestiging, en die deelt hij met elke andere bon van datzelfde huis. Die
 * scheiding is geen implementatiedetail maar het hele onderwerp van dit scherm,
 * en daarom staat ze ook in het antwoord: GET zegt hoeveel bonnen er meehangen,
 * zodat de gebruiker het weet vóór hij tikt.
 */
import { NextRequest, NextResponse } from 'next/server'
import { and, eq, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { customers, sites, workOrders } from '@/lib/db/schema'
import { withAudit } from '@/lib/db/with-audit'
import { canLeaveTheDay } from '@/lib/planning/dropIntent'

type RouteContext = { params: Promise<{ id: string }> }

export interface BonDetails {
  /** Alleen deze bon. */
  ticketNumber: string
  description: string
  isUrgent: boolean
  alertNote: string
  /** De klant — gedeeld. */
  customerName: string
  customerNumber: string
  /** De vestiging — gedeeld. */
  address: string
  city: string
  phone: string
  /** Hoeveel bonnen er nog aan deze klant hangen, deze meegerekend. */
  sharedWithCustomer: number
  /** Hoeveel bonnen er nog aan deze vestiging hangen, deze meegerekend. */
  sharedWithSite: number
  /** Of er nog aan gewijzigd mag worden. */
  editable: boolean
}

async function loadDetails(id: string): Promise<BonDetails | null> {
  const [row] = await db
    .select({
      order: workOrders,
      customer: customers,
      site: sites,
    })
    .from(workOrders)
    .innerJoin(customers, eq(customers.id, workOrders.customerId))
    .innerJoin(sites, eq(sites.id, workOrders.siteId))
    .where(eq(workOrders.id, id))

  if (!row) return null

  const [{ count: klantBonnen }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workOrders)
    .where(eq(workOrders.customerId, row.customer.id))

  const [{ count: vestigingBonnen }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workOrders)
    .where(eq(workOrders.siteId, row.site.id))

  return {
    ticketNumber: row.order.ticketNumber ?? '',
    description: row.order.description ?? '',
    isUrgent: row.order.isUrgent,
    alertNote: row.order.alertNote ?? '',
    customerName: row.customer.name ?? '',
    customerNumber: row.customer.customerNumber ?? '',
    address: row.site.address ?? '',
    city: row.site.city ?? '',
    phone: row.site.phonePrimary ?? '',
    sharedWithCustomer: klantBonnen,
    sharedWithSite: vestigingBonnen,
    // Dezelfde grens als in de planning: aan een bon waaraan gewerkt wordt,
    // verandert niemand meer de gegevens.
    editable: canLeaveTheDay(row.order.status),
  }
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  try {
    const details = await loadDetails(id)
    if (!details) return NextResponse.json({ error: 'Werkbon bestaat niet' }, { status: 404 })
    return NextResponse.json(details)
  } catch (error) {
    console.error('[api/work-orders/[id]/details GET]', error)
    return NextResponse.json({ error: 'Gegevens konden niet geladen worden' }, { status: 500 })
  }
}

function schoon(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const [row] = await db
      .select({
        status: workOrders.status,
        customerId: workOrders.customerId,
        siteId: workOrders.siteId,
      })
      .from(workOrders)
      .where(eq(workOrders.id, id))

    if (!row) return NextResponse.json({ error: 'Werkbon bestaat niet' }, { status: 404 })

    if (!canLeaveTheDay(row.status)) {
      return NextResponse.json(
        { error: 'Aan deze bon wordt al gewerkt; de gegevens liggen vast', code: 'WORK_ORDER_LOCKED' },
        { status: 409 },
      )
    }

    const ticketNumber = schoon(body.ticket_number)
    const address = schoon(body.address)
    const city = schoon(body.city)

    // Adres en gemeente mogen niet leeg worden gemaakt: zonder die twee kan
    // niemand ergens naartoe rijden. De naam mag wél leeg blijven — op een
    // papieren bon staat hij soms gewoon niet.
    if (address === '' || city === '') {
      return NextResponse.json(
        { error: 'Adres en gemeente zijn verplicht', field: 'address' },
        { status: 400 },
      )
    }

    if (ticketNumber === '') {
      return NextResponse.json(
        { error: 'Ticketnummer is verplicht', field: 'ticket_number' },
        { status: 400 },
      )
    }

    // Een ticketnummer dat al bij een andere bon hoort, zou twee bonnen
    // onderling verwisselbaar maken.
    if (ticketNumber) {
      const [botsing] = await db
        .select({ id: workOrders.id })
        .from(workOrders)
        .where(and(eq(workOrders.ticketNumber, ticketNumber), ne(workOrders.id, id)))

      if (botsing) {
        return NextResponse.json(
          { error: 'Dit ticketnummer hoort al bij een andere bon', field: 'ticket_number', existingId: botsing.id },
          { status: 409 },
        )
      }
    }

    const changedBy = schoon(body.changed_by) || null

    await withAudit(changedBy, async (tx) => {
      const bon: Record<string, unknown> = {}
      if (ticketNumber !== undefined) bon.ticketNumber = ticketNumber
      if (schoon(body.description) !== undefined) bon.description = schoon(body.description)
      if (typeof body.is_urgent === 'boolean') bon.isUrgent = body.is_urgent
      if (schoon(body.alert_note) !== undefined) bon.alertNote = schoon(body.alert_note) || null
      if (Object.keys(bon).length > 0) {
        await tx.update(workOrders).set(bon).where(eq(workOrders.id, id))
      }

      const klant: Record<string, unknown> = {}
      if (schoon(body.customer_name) !== undefined) klant.name = schoon(body.customer_name)
      if (schoon(body.customer_number) !== undefined) klant.customerNumber = schoon(body.customer_number)
      if (Object.keys(klant).length > 0) {
        await tx.update(customers).set(klant).where(eq(customers.id, row.customerId))
      }

      const vestiging: Record<string, unknown> = {}
      if (address !== undefined) vestiging.address = address
      if (city !== undefined) vestiging.city = city
      if (schoon(body.phone) !== undefined) vestiging.phonePrimary = schoon(body.phone) || null
      if (Object.keys(vestiging).length > 0) {
        await tx.update(sites).set(vestiging).where(eq(sites.id, row.siteId))
      }
    })

    const details = await loadDetails(id)
    return NextResponse.json(details)
  } catch (error) {
    console.error('[api/work-orders/[id]/details PATCH]', error)
    return NextResponse.json({ error: 'Opslaan is niet gelukt' }, { status: 500 })
  }
}
