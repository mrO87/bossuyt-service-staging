/**
 * Welke vergeten bonnen om middernacht terugkeren naar de pool — en vooral:
 * welke niet.
 *
 * De opkuis keek eerst alleen naar de status. Maar een technieker die ter
 * plaatse geweest is en zijn aankomst- en vertrekuur ingevuld heeft zonder de
 * bon in te dienen, staat nog altijd op 'gepland'. Die bon verdween dus om
 * middernacht naar de pool terwijl het werk gedaan was. De gebruiker, kort:
 * "enkel de bonnen die niet gestart zijn gaan om 00u naar de pool".
 */
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { cleanup, createTestWorkOrder, testDb } from './setup'
import { werkbonnen, workOrderDrafts, workOrders } from '@/lib/db/schema'
import { releaseForgottenWorkOrders } from '@/lib/server/interventions'

/**
 * Deze tests spelen zich af in een eigen hoekje van de kalender.
 *
 * `releaseForgottenWorkOrders` kuist **alle** voorbije bonnen op, ook die van
 * andere tests — de fixtures staan standaard op 17 april 2026. Door hier ver
 * terug te gaan en "vandaag" één dag na die datum te leggen, raakt deze opkuis
 * alleen de bonnen van deze test. Zonder dat verhuisden de bonnen van twee
 * andere testbestanden mee naar de pool, en die vielen dan om.
 */
const DAG_VAN_DE_BON = new Date('2020-01-01T09:00:00.000Z')
const VANDAAG = '2020-01-02'

const opgeruimd: string[] = []

afterEach(async () => {
  while (opgeruimd.length > 0) {
    const workOrderId = opgeruimd.pop()!
    await testDb.delete(werkbonnen).where(eq(werkbonnen.workOrderId, workOrderId))
    await testDb.delete(workOrderDrafts).where(eq(workOrderDrafts.workOrderId, workOrderId))
    await cleanup({ work_order_ids: [workOrderId] })
  }
})

/** Een bon op een voorbije dag, status 'gepland'. */
async function vergetenBon(): Promise<string> {
  const id = await createTestWorkOrder()
  opgeruimd.push(id)
  await testDb
    .update(workOrders)
    .set({ plannedDate: DAG_VAN_DE_BON })
    .where(eq(workOrders.id, id))
  return id
}

async function staatNogOpZijnDag(workOrderId: string): Promise<boolean> {
  const [row] = await testDb
    .select({ plannedDate: workOrders.plannedDate })
    .from(workOrders)
    .where(eq(workOrders.id, workOrderId))
  return row?.plannedDate !== null
}

describe('releaseForgottenWorkOrders', () => {
  it('haalt een bon weg waar nooit aan gewerkt is', async () => {
    const id = await vergetenBon()

    await releaseForgottenWorkOrders(VANDAAG)

    expect(await staatNogOpZijnDag(id)).toBe(false)
  })

  it('laat een bon staan waarvan het aankomstuur ingevuld is', async () => {
    const id = await vergetenBon()
    await testDb.insert(werkbonnen).values({
      id: `wb-${id}`,
      workOrderId: id,
      arrivalTime: new Date('2020-01-01T08:30:00.000Z'),
      departureTime: new Date('2020-01-01T10:00:00.000Z'),
    })

    await releaseForgottenWorkOrders(VANDAAG)

    expect(await staatNogOpZijnDag(id)).toBe(true)
  })

  it('laat een bon staan die alleen een aankomstuur heeft en nog geen vertrek', async () => {
    // Nog bezig, of vergeten af te sluiten. Beide zijn een reden om hem te
    // laten staan waar de technieker hem zoekt, niet om hem weg te halen.
    const id = await vergetenBon()
    await testDb.insert(werkbonnen).values({
      id: `wb-${id}`,
      workOrderId: id,
      arrivalTime: new Date('2020-01-01T08:30:00.000Z'),
    })

    await releaseForgottenWorkOrders(VANDAAG)

    expect(await staatNogOpZijnDag(id)).toBe(true)
  })

  it('laat een bon staan waarvan het uur enkel in het half ingevulde concept staat', async () => {
    // Dit is het geval dat de gebruiker meldde: ingevuld, nog niet ingediend.
    const id = await vergetenBon()
    await testDb.insert(workOrderDrafts).values({
      workOrderId: id,
      form: { arrivalTime: '2020-01-01T08:30:00.000Z', departureTime: '' },
      updatedAt: new Date('2020-01-01T10:05:00.000Z'),
    })

    await releaseForgottenWorkOrders(VANDAAG)

    expect(await staatNogOpZijnDag(id)).toBe(true)
  })

  it('haalt een bon met een leeg concept wél weg', async () => {
    // Een concept waarin nog geen uur staat, is geen bewijs dat er gewerkt is.
    const id = await vergetenBon()
    await testDb.insert(workOrderDrafts).values({
      workOrderId: id,
      form: { arrivalTime: '', departureTime: '' },
      updatedAt: new Date('2020-01-01T10:05:00.000Z'),
    })

    await releaseForgottenWorkOrders(VANDAAG)

    expect(await staatNogOpZijnDag(id)).toBe(false)
  })
})
