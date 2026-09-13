/**
 * savePlanningSnapshot — moving work orders between the open pool and a day.
 *
 * The call states a result ("this is my day, in this order") rather than a
 * change, which is what lets the offline queue keep a single pending write no
 * matter how much dragging happened. These tests hold that property, plus the
 * two guards that replaced the old set-equality check: the planningVersion
 * conflict, and the refusal to release work someone has already started.
 */
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { customers, sites, technicians, workOrderAssignments, workOrders } from '@/lib/db/schema'
import {
  getPlanningVersion,
  getTodayInterventions,
  savePlanningSnapshot,
  updatePlacement,
} from '@/lib/server/interventions'
import type { InterventionStatus } from '@/types'
import type { CleanupIds } from './setup'
import { cleanup, testDb } from './setup'

const DATE = '2026-09-14'          // a Monday
const DAY_START = new Date(`${DATE}T00:00:00.000Z`)

const actor = { id: 'u1', role: 'technician' as const }

describe('savePlanningSnapshot', () => {
  let ids: CleanupIds
  let technicianId: string
  /** A second technician, for the case where a pool bon already has one. */
  let otherTechnicianId: string

  /** A work order on the technician's day, at the given position. */
  async function onTheDay(plannedOrder: number, status: InterventionStatus = 'gepland') {
    const id = await insertWorkOrder({ plannedDate: DAY_START, status })
    await testDb.insert(workOrderAssignments).values({
      workOrderId: id,
      technicianId,
      isLead: true,
      accepted: false,
      plannedOrder,
    })
    return id
  }

  /** A work order waiting in the open pool — no day, so no date. */
  async function inThePool(status: InterventionStatus = 'aangemaakt') {
    return insertWorkOrder({ plannedDate: null, status })
  }

  async function insertWorkOrder(fields: {
    plannedDate: Date | null
    status: InterventionStatus
  }) {
    const id = `wo-${randomUUID()}`
    await testDb.insert(workOrders).values({
      id,
      customerId: customerId,
      siteId: siteId,
      deviceId: null,
      plannedDate: fields.plannedDate,
      status: fields.status,
      type: 'warm',
      source: 'reactive',
      description: `Testbon ${id.slice(3, 11)}`,
      estimatedMinutes: 90,
      isUrgent: false,
      visibleInPool: true,
      createdBy: 'test',
    })
    ids.work_order_ids!.push(id)
    return id
  }

  let customerId: string
  let siteId: string

  beforeEach(async () => {
    ids = { work_order_ids: [], technician_ids: [], customer_ids: [], site_ids: [] }

    technicianId = `tech-${randomUUID()}`
    await testDb.insert(technicians).values({
      id: technicianId,
      name: 'Planningtechnieker',
      initials: 'PT',
      email: `${technicianId}@example.test`,
      role: 'technician',
      active: true,
    })
    ids.technician_ids!.push(technicianId)

    otherTechnicianId = `tech-${randomUUID()}`
    await testDb.insert(technicians).values({
      id: otherTechnicianId,
      name: 'Andere technieker',
      initials: 'AT',
      email: `${otherTechnicianId}@example.test`,
      role: 'technician',
      active: true,
    })
    ids.technician_ids!.push(otherTechnicianId)

    const suffix = randomUUID()
    customerId = `customer-${suffix}`
    siteId = `site-${suffix}`

    await testDb.insert(customers).values({
      id: customerId,
      name: `Testklant ${suffix.slice(0, 8)}`,
      phone: '0123456789',
      address: 'Teststraat 1',
      city: 'Kuurne',
    })
    ids.customer_ids!.push(customerId)

    await testDb.insert(sites).values({
      id: siteId,
      customerId,
      name: `Testvestiging ${suffix.slice(0, 8)}`,
      address: 'Teststraat 1',
      city: 'Kuurne',
    })
    ids.site_ids!.push(siteId)
  })

  afterEach(async () => {
    await cleanup(ids)
  })

  async function snapshot(
    orderedWorkOrderIds: string[],
    version?: number,
    startTimes?: Array<{ workOrderId: string; startMinutes: number | null; appointment: boolean }>,
  ) {
    return savePlanningSnapshot({
      actor,
      technicianId,
      date: DATE,
      planningVersion: version ?? (await getPlanningVersion(technicianId, DATE)),
      orderedWorkOrderIds,
      startTimes,
    })
  }

  /** Wat er van een werkbon in de database staat, ongefilterd door de lijsten. */
  async function storedHour(workOrderId: string) {
    const [row] = await testDb
      .select({
        minutes: workOrders.plannedStartMinutes,
        appointment: workOrders.startIsAppointment,
      })
      .from(workOrders)
      .where(eq(workOrders.id, workOrderId))
    return row
  }

  it('reorders a day without changing what is on it', async () => {
    const first = await onTheDay(1)
    const second = await onTheDay(2)

    const result = await snapshot([second, first])

    expect(result.ok).toBe(true)
    const { planned } = await getTodayInterventions(technicianId, DATE)
    expect(planned.map(p => p.id)).toEqual([second, first])
  })

  it('pulls a work order out of the pool onto the day', async () => {
    const existing = await onTheDay(1)
    const waiting = await inThePool()

    const result = await snapshot([existing, waiting])
    expect(result.ok).toBe(true)

    const { planned, open } = await getTodayInterventions(technicianId, DATE)
    expect(planned.map(p => p.id)).toEqual([existing, waiting])
    expect(open.map(o => o.id)).not.toContain(waiting)

    const [row] = await testDb.select().from(workOrders).where(eq(workOrders.id, waiting))
    expect(row.plannedDate).not.toBeNull()
    expect(row.status).toBe('gepland')      // 'aangemaakt' follows the date
    expect(row.plannedByRole).toBe('technician')
  })

  it('puts a work order back in the pool and keeps the technician attached', async () => {
    // The whole point of the reverse direction: releasing a day is not undoing
    // the assignment, it only drops the date.
    const staying = await onTheDay(1)
    const leaving = await onTheDay(2)

    const result = await snapshot([staying])
    expect(result.ok).toBe(true)

    const { planned, open } = await getTodayInterventions(technicianId, DATE)
    expect(planned.map(p => p.id)).toEqual([staying])
    expect(open.map(o => o.id)).toContain(leaving)

    const [row] = await testDb.select().from(workOrders).where(eq(workOrders.id, leaving))
    expect(row.plannedDate).toBeNull()
    expect(row.status).toBe('aangemaakt')

    const assignments = await testDb
      .select()
      .from(workOrderAssignments)
      .where(eq(workOrderAssignments.workOrderId, leaving))
    expect(assignments.map(a => a.technicianId)).toContain(technicianId)
  })

  it('takes a pool work order that is assigned to somebody else', async () => {
    // The pool is not "unassigned work". A bon can be sitting there with
    // another technician already on it — planning pre-assigned it and never
    // picked a day. Whoever drags it onto their day has to end up on it too,
    // and the existing assignment must not get in the way of that.
    const waiting = await inThePool()
    await testDb.insert(workOrderAssignments).values({
      workOrderId: waiting,
      technicianId: otherTechnicianId,
      isLead: true,
      accepted: false,
      plannedOrder: 0,
    })

    const result = await snapshot([waiting])
    expect(result.ok).toBe(true)

    const { planned } = await getTodayInterventions(technicianId, DATE)
    expect(planned.map(p => p.id)).toEqual([waiting])

    const [row] = await testDb.select().from(workOrders).where(eq(workOrders.id, waiting))
    expect(row.plannedDate).not.toBeNull()

    const assignments = await testDb
      .select()
      .from(workOrderAssignments)
      .where(eq(workOrderAssignments.workOrderId, waiting))
    expect(assignments.map(a => a.technicianId).sort())
      .toEqual([otherTechnicianId, technicianId].sort())
  })

  it('moves in both directions in a single write', async () => {
    const leaving = await onTheDay(1)
    const staying = await onTheDay(2)
    const arriving = await inThePool()

    const result = await snapshot([arriving, staying])
    expect(result.ok).toBe(true)

    const { planned, open } = await getTodayInterventions(technicianId, DATE)
    expect(planned.map(p => p.id)).toEqual([arriving, staying])
    expect(open.map(o => o.id)).toContain(leaving)
  })

  describe('guards', () => {
    it('refuses a stale planningVersion and hands back the truth', async () => {
      const first = await onTheDay(1)
      const second = await onTheDay(2)

      const current = await getPlanningVersion(technicianId, DATE)
      const result = await snapshot([second, first], current - 1)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('conflict')
      expect(result.planningVersion).toBe(current)
      expect(result.planned.map(p => p.id)).toEqual([first, second])
    })

    it.each([
      'bezig',
      'wacht_onderdelen',
      'afgewerkt',
      'geannuleerd',
    ] as InterventionStatus[])('refuses to release a %s work order', async status => {
      const locked = await onTheDay(1, status)

      const result = await snapshot([])

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('locked')
      expect(result.lockedWorkOrderIds).toEqual([locked])

      // And it really is still there.
      const [row] = await testDb.select().from(workOrders).where(eq(workOrders.id, locked))
      expect(row.plannedDate).not.toBeNull()
    })

    it.each(['gepland', 'onderweg'] as InterventionStatus[])(
      'still releases a %s work order',
      async status => {
        const releasable = await onTheDay(1, status)

        const result = await snapshot([])

        expect(result.ok).toBe(true)
        const [row] = await testDb.select().from(workOrders).where(eq(workOrders.id, releasable))
        expect(row.plannedDate).toBeNull()
      },
    )

    it('refuses a work order that is in neither the day nor the pool', async () => {
      const onDay = await onTheDay(1)
      const hidden = await insertWorkOrder({ plannedDate: null, status: 'aangemaakt' })
      await testDb.update(workOrders).set({ visibleInPool: false }).where(eq(workOrders.id, hidden))

      const result = await snapshot([onDay, hidden])

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.reason).toBe('conflict')
    })
  })

  /**
   * Het vastgezette uur.
   *
   * Dit is het eerste uur dat de app onthoudt in plaats van berekent, en het
   * reist door dezelfde deur als de volgorde: één momentopname van een hele
   * dag. Daarom gelden hier dezelfde twee eigenschappen — wat er niet in staat
   * wordt gewist, en tweemaal toepassen verandert niets meer.
   */
  describe('het uur waarop een bon staat', () => {
    it('stores the hour and the pin that came with the day', async () => {
      const bon = await onTheDay(1)

      const result = await snapshot([bon], undefined, [
        { workOrderId: bon, startMinutes: 9 * 60 + 15, appointment: true },
      ])

      expect(result.ok).toBe(true)
      expect(await storedHour(bon)).toEqual({ minutes: 9 * 60 + 15, appointment: true })
      const day = await getTodayInterventions(technicianId, DATE)
      expect(day.planned[0].plannedStartMinutes).toBe(9 * 60 + 15)
      expect(day.planned[0].startIsAppointment).toBe(true)
    })

    it('clears the hour of a work order the list no longer mentions', async () => {
      // De lijst beschrijft de hele dag. Een uur weghalen is dus: hem niet meer
      // noemen. Zonder deze regel kon een weggehaald uur nooit vertrekken.
      const bon = await onTheDay(1)
      const first = await snapshot([bon], undefined, [
        { workOrderId: bon, startMinutes: 10 * 60, appointment: true },
      ])
      expect(first.ok).toBe(true)
      if (!first.ok) return

      await snapshot([bon], first.planningVersion, [])

      expect(await storedHour(bon)).toEqual({ minutes: null, appointment: false })
    })

    it('leaves the hours alone for a write that says nothing about them', async () => {
      // Een telefoon die een week offline stond stuurt schrijfacties van vóór
      // v1.61. Die weten niets van uren en mogen er dus ook niets aan wijzigen.
      const bon = await onTheDay(1)
      const first = await snapshot([bon], undefined, [
        { workOrderId: bon, startMinutes: 10 * 60, appointment: true },
      ])
      expect(first.ok).toBe(true)
      if (!first.ok) return

      await snapshot([bon], first.planningVersion)

      expect(await storedHour(bon)).toEqual({ minutes: 10 * 60, appointment: true })
    })

    it('drops the hour when a work order goes back to the pool', async () => {
      const bon = await onTheDay(1)
      const first = await snapshot([bon], undefined, [
        { workOrderId: bon, startMinutes: 8 * 60 + 30, appointment: true },
      ])
      expect(first.ok).toBe(true)
      if (!first.ok) return

      await snapshot([], first.planningVersion, [])

      // Een uur zonder dag betekent niets, dus het gaat mee met de dag. Dit is
      // ook wat een verplaatsing naar een andere dag het uur laat vergeten:
      // die verplaatsing is een vertrek hier en een aankomst daar.
      expect(await storedHour(bon)).toEqual({ minutes: null, appointment: false })
    })

    it('gives an arriving work order no hour, whatever it carried', async () => {
      const arriving = await inThePool()
      // Zoals een bon die van een andere dag komt: hij draagt daar nog een uur.
      await testDb
        .update(workOrders)
        .set({ plannedStartMinutes: 14 * 60, startIsAppointment: true })
        .where(eq(workOrders.id, arriving))

      await snapshot([arriving], undefined, [])

      expect(await storedHour(arriving)).toEqual({ minutes: null, appointment: false })
    })

    it('refuses a pin on a work order with no hour', async () => {
      // Een speldje zonder uur zou een afspraak op geen enkel tijdstip beweren.
      const bon = await onTheDay(1)

      await snapshot([bon], undefined, [
        { workOrderId: bon, startMinutes: null, appointment: true },
      ])

      expect(await storedHour(bon)).toEqual({ minutes: null, appointment: false })
    })

    it('stores nothing for an hour that is not an hour', async () => {
      // De rand van de app: een herspeelde schrijfactie, een oude tab, curl.
      const bon = await onTheDay(1)

      await snapshot([bon], undefined, [
        { workOrderId: bon, startMinutes: 99 * 60, appointment: true },
      ])

      expect(await storedHour(bon)).toEqual({ minutes: null, appointment: false })
    })

    it('is idempotent for hours too', async () => {
      const bon = await onTheDay(1)
      const first = await snapshot([bon], undefined, [
        { workOrderId: bon, startMinutes: 9 * 60, appointment: false },
      ])
      expect(first.ok).toBe(true)
      if (!first.ok) return

      await snapshot([bon], first.planningVersion, [
        { workOrderId: bon, startMinutes: 9 * 60, appointment: false },
      ])

      expect(await storedHour(bon)).toEqual({ minutes: 9 * 60, appointment: false })
    })
  })

  it('is idempotent — replaying the same snapshot lands in the same place', async () => {
    // This is what lets the offline queue collapse a morning of dragging into
    // one pending write, and what makes a retried sync harmless.
    const staying = await onTheDay(1)
    const leaving = await onTheDay(2)
    const arriving = await inThePool()

    const first = await snapshot([arriving, staying])
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const after = await getTodayInterventions(technicianId, DATE)

    const second = await savePlanningSnapshot({
      actor,
      technicianId,
      date: DATE,
      planningVersion: first.planningVersion,
      orderedWorkOrderIds: [arriving, staying],
    })

    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.planned.map(p => p.id)).toEqual(after.planned.map(p => p.id))
    expect(second.open.map(o => o.id)).toContain(leaving)
  })
})

/**
 * updatePlacement — één bon, waar hij staat.
 *
 * De tweede deur naast savePlanningSnapshot. Ze bestaat omdat die eerste een
 * hele dag nodig heeft, en de werkbonpagina en een sleep naar volgende week die
 * dag niet kennen.
 */
describe('updatePlacement', () => {
  let ids: CleanupIds
  let technicianId: string
  let customerId: string
  let siteId: string

  const actor = { id: 'u1', role: 'technician' as const }
  const DAY_A = '2026-09-14'
  const DAY_B = '2026-09-28'      // twee weken later: nooit samen op één scherm

  async function insert(fields: { plannedDate: Date | null; status: InterventionStatus }) {
    const id = `wo-${randomUUID()}`
    await testDb.insert(workOrders).values({
      id, customerId, siteId, deviceId: null,
      plannedDate: fields.plannedDate,
      status: fields.status,
      type: 'warm', source: 'reactive',
      description: `Testbon ${id.slice(3, 11)}`,
      estimatedMinutes: 90, isUrgent: false, visibleInPool: true, createdBy: 'test',
    })
    await testDb.insert(workOrderAssignments).values({
      workOrderId: id, technicianId, isLead: true, accepted: false, plannedOrder: 1,
    })
    ids.work_order_ids!.push(id)
    return id
  }

  async function stored(workOrderId: string) {
    const [row] = await testDb
      .select({
        plannedDate: workOrders.plannedDate,
        minutes: workOrders.plannedStartMinutes,
        appointment: workOrders.startIsAppointment,
        status: workOrders.status,
        version: workOrders.planningVersion,
      })
      .from(workOrders)
      .where(eq(workOrders.id, workOrderId))
    return row
  }

  beforeEach(async () => {
    ids = { work_order_ids: [], technician_ids: [], customer_ids: [], site_ids: [] }
    technicianId = `tech-${randomUUID()}`
    await testDb.insert(technicians).values({
      id: technicianId, name: 'Plaatsingstechnieker', initials: 'PT',
      email: `${technicianId}@example.test`, role: 'technician', active: true,
    })
    ids.technician_ids!.push(technicianId)

    const suffix = randomUUID()
    customerId = `customer-${suffix}`
    siteId = `site-${suffix}`
    await testDb.insert(customers).values({
      id: customerId, name: `Testklant ${suffix.slice(0, 8)}`,
      phone: '0123456789', address: 'Teststraat 1', city: 'Kuurne',
    })
    ids.customer_ids!.push(customerId)
    await testDb.insert(sites).values({
      id: siteId, customerId, name: `Testvestiging ${suffix.slice(0, 8)}`,
      address: 'Teststraat 1', city: 'Kuurne',
    })
    ids.site_ids!.push(siteId)
  })

  afterEach(async () => { await cleanup(ids) })

  it('zet een bon op een dag die nergens geladen is', async () => {
    const bon = await insert({ plannedDate: new Date(`${DAY_A}T00:00:00.000Z`), status: 'gepland' })

    const result = await updatePlacement({
      actor, workOrderId: bon, date: DAY_B, startMinutes: null, appointment: false,
    })

    expect(result.ok).toBe(true)
    const row = await stored(bon)
    expect(row.plannedDate?.toISOString().slice(0, 10)).toBe(DAY_B)
  })

  it('neemt uur en speldje mee in dezelfde schrijfactie', async () => {
    // "Klant vraagt donderdag om 14u" is één invulling, geen twee.
    const bon = await insert({ plannedDate: null, status: 'aangemaakt' })

    await updatePlacement({
      actor, workOrderId: bon, date: DAY_B, startMinutes: 14 * 60, appointment: true,
    })

    expect(await stored(bon)).toMatchObject({ minutes: 14 * 60, appointment: true, status: 'gepland' })
  })

  it('laat het uur los bij een bon die naar de pool gaat', async () => {
    const bon = await insert({ plannedDate: new Date(`${DAY_A}T00:00:00.000Z`), status: 'gepland' })
    await updatePlacement({ actor, workOrderId: bon, date: DAY_A, startMinutes: 9 * 60, appointment: true })

    await updatePlacement({ actor, workOrderId: bon, date: null, startMinutes: null, appointment: false })

    expect(await stored(bon)).toMatchObject({
      plannedDate: null, minutes: null, appointment: false, status: 'aangemaakt',
    })
  })

  it('weigert een bon waaraan al gewerkt wordt', async () => {
    // De versiegrendel gaat hier omheen, de statusgrendel niet — uitdrukkelijk
    // zo gevraagd. Wie bezig is, blijft staan waar hij staat.
    const bon = await insert({ plannedDate: new Date(`${DAY_A}T00:00:00.000Z`), status: 'bezig' })

    const result = await updatePlacement({
      actor, workOrderId: bon, date: DAY_B, startMinutes: null, appointment: false,
    })

    expect(result).toEqual({ ok: false, reason: 'locked' })
    const row = await stored(bon)
    expect(row.plannedDate?.toISOString().slice(0, 10)).toBe(DAY_A)
  })

  it('kent een bon die niet bestaat niet toe aan een dag', async () => {
    const result = await updatePlacement({
      actor, workOrderId: 'wo-bestaat-niet', date: DAY_B, startMinutes: null, appointment: false,
    })
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('hangt de nieuwkomer achteraan en geeft hem een hoger versienummer', async () => {
    // Het versienummer is wat een momentopname die onderweg was voor die dag
    // laat afketsen. Zonder dat zou zo'n schrijfactie de nieuwkomer stilletjes
    // weer uit de planning gooien.
    const zittend = await insert({ plannedDate: new Date(`${DAY_B}T00:00:00.000Z`), status: 'gepland' })
    await testDb.update(workOrders).set({ planningVersion: 7 }).where(eq(workOrders.id, zittend))

    const nieuw = await insert({ plannedDate: null, status: 'aangemaakt' })
    await updatePlacement({ actor, workOrderId: nieuw, date: DAY_B, startMinutes: null, appointment: false })

    const row = await stored(nieuw)
    expect(row.version).toBeGreaterThan(7)

    const day = await getTodayInterventions(technicianId, DAY_B)
    expect(day.planned.map(p => p.id)).toEqual([zittend, nieuw])
  })

  it('weigert een uur dat geen uur is', async () => {
    const bon = await insert({ plannedDate: new Date(`${DAY_A}T00:00:00.000Z`), status: 'gepland' })

    await updatePlacement({
      actor, workOrderId: bon, date: DAY_A, startMinutes: 99 * 60, appointment: true,
    })

    expect(await stored(bon)).toMatchObject({ minutes: null, appointment: false })
  })
})
