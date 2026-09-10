/**
 * lib/server/work-orders.ts — create a work order from a "Service Bon" ticket.
 *
 * One function, two callers: the inbound ERP route and the manual wizard.
 * Everything runs in one transaction so a half-created customer can never
 * exist without its work order.
 */
import { randomUUID } from 'crypto'
import { and, eq, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { customers, contacts, devices, sites, workOrderAssignments, workOrders } from '@/lib/db/schema'
import { withAudit, type Tx } from '@/lib/db/with-audit'
import { geocodeAddress } from '@/lib/routing/NominatimGeocoder'
import type { InterventionSource, InterventionStatus, InterventionType } from '@/types'

// ── Errors ────────────────────────────────────────────────────────────────────

export class ValidationError extends Error {
  field: string
  constructor(field: string, message: string) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

export class DuplicateTicketError extends Error {
  existingId: string
  constructor(ticketNumber: string, existingId: string) {
    super(`Ticket ${ticketNumber} bestaat al`)
    this.name = 'DuplicateTicketError'
    this.existingId = existingId
  }
}

// ── Input shape (camelCase, validated) ───────────────────────────────────────

export interface CreateWorkOrderCustomer {
  /**
   * Existing customer, picked from a list. Authoritative when present, and the
   * descriptive fields below are then optional — we are referencing, not
   * creating. This is what stops a legacy row (customer_number IS NULL) being
   * cloned when the wizard has nothing but a UUID to identify it by.
   */
  id?: string
  number?: string
  invoiceNumber?: string
  name?: string
  address?: string
  postalCode?: string
  city?: string
  phone?: string
  phoneSecondary?: string
  contact?: string
  contactPhone?: string
  closingDay?: string
}

export interface CreateWorkOrderSite {
  /** Existing site, picked from a list. Authoritative when present. */
  id?: string
  name?: string
  address?: string
  postalCode?: string
  city?: string
}

export interface CreateWorkOrderDevice {
  /** Existing device, picked from a list. Authoritative when present. */
  id?: string
  unitNumber?: string
  brand?: string
  model?: string
  serialNumber?: string
  deliveryDate?: string
  warrantyUntil?: string
}

export interface CreateWorkOrderInput {
  ticketNumber: string
  ticketDate?: string          // ISO date
  plannedDate: string          // ISO date or datetime
  description: string
  isUrgent?: boolean
  type?: InterventionType      // default 'warm'
  customer: CreateWorkOrderCustomer
  site?: CreateWorkOrderSite   // defaults to the customer address
  device?: CreateWorkOrderDevice | null
  technicianIds?: string[]     // first one becomes lead
  createdBy?: string
  /**
   * A warning for whoever picks this up: "klant eerst bellen op ...". Written
   * once, when the work order is created; changing it afterwards goes through
   * PATCH /api/work-orders/[id]/alert-note, which only its author may call.
   */
  alertNote?: string

  // Where the work order came from, and therefore where it shows up. The
  // defaults ('planned' / 'gepland') are what the ERP route and the wizard have
  // always produced. An uploaded paper bon passes 'reactive' / 'aangemaakt'
  // instead, because that pair is what getDayInterventions looks for when it
  // fills the open pool — see lib/server/interventions.ts.
  source?: InterventionSource  // default 'planned'
  status?: InterventionStatus  // default 'gepland'
}

// ── Parsing the snake_case wire format ───────────────────────────────────────

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Trim a string field; empty strings count as absent. */
function optionalString(obj: Json, key: string): string | undefined {
  const value = obj[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new ValidationError(key, `${key} moet tekst zijn`)
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function requiredString(obj: Json, key: string, label: string): string {
  const value = optionalString(obj, key)
  if (!value) throw new ValidationError(key, `${label} is verplicht`)
  return value
}

function optionalDate(obj: Json, key: string): string | undefined {
  const value = optionalString(obj, key)
  if (value === undefined) return undefined
  if (Number.isNaN(new Date(value).getTime())) throw new ValidationError(key, `${key} is geen geldige datum`)
  return value
}

const INTERVENTION_TYPES: InterventionType[] = ['warm', 'montage', 'preventief']

export function parseCreateWorkOrderBody(json: unknown): CreateWorkOrderInput {
  if (!isObject(json)) throw new ValidationError('body', 'Body moet een JSON-object zijn')

  const ticketNumber = requiredString(json, 'ticket_number', 'ticket_number')
  const plannedDate  = optionalDate(json, 'planned_date')
  if (!plannedDate) throw new ValidationError('planned_date', 'planned_date is verplicht')
  const description  = requiredString(json, 'description', 'description')
  const ticketDate   = optionalDate(json, 'ticket_date')

  const typeRaw = optionalString(json, 'type')
  if (typeRaw && !INTERVENTION_TYPES.includes(typeRaw as InterventionType)) {
    throw new ValidationError('type', `type moet één van ${INTERVENTION_TYPES.join(', ')} zijn`)
  }

  if (!isObject(json.customer)) throw new ValidationError('customer', 'customer is verplicht')
  const c = json.customer
  // An existing customer is referenced by id; only a new one must describe itself.
  const customerId = optionalString(c, 'id')
  const customer: CreateWorkOrderCustomer = {
    id:             customerId,
    number:         customerId ? optionalString(c, 'number') : requiredString(c, 'number', 'customer.number'),
    invoiceNumber:  optionalString(c, 'invoice_number'),
    name:           customerId ? optionalString(c, 'name') : requiredString(c, 'name', 'customer.name'),
    address:        customerId ? optionalString(c, 'address') : requiredString(c, 'address', 'customer.address'),
    postalCode:     optionalString(c, 'postal_code'),
    city:           customerId ? optionalString(c, 'city') : requiredString(c, 'city', 'customer.city'),
    phone:          optionalString(c, 'phone'),
    phoneSecondary: optionalString(c, 'phone_secondary'),
    contact:        optionalString(c, 'contact'),
    contactPhone:   optionalString(c, 'contact_phone'),
    closingDay:     optionalString(c, 'closing_day'),
  }

  let site: CreateWorkOrderSite | undefined
  if (isObject(json.site)) {
    site = {
      id:         optionalString(json.site, 'id'),
      name:       optionalString(json.site, 'name'),
      address:    optionalString(json.site, 'address'),
      postalCode: optionalString(json.site, 'postal_code'),
      city:       optionalString(json.site, 'city'),
    }
  }

  let device: CreateWorkOrderDevice | null = null
  if (isObject(json.device)) {
    const deviceId = optionalString(json.device, 'id')
    device = {
      id:            deviceId,
      unitNumber:    optionalString(json.device, 'unit_number'),
      brand:         deviceId ? optionalString(json.device, 'brand') : requiredString(json.device, 'brand', 'device.brand'),
      model:         deviceId ? optionalString(json.device, 'model') : requiredString(json.device, 'model', 'device.model'),
      serialNumber:  optionalString(json.device, 'serial_number'),
      deliveryDate:  optionalDate(json.device, 'delivery_date'),
      warrantyUntil: optionalDate(json.device, 'warranty_until'),
    }
  }

  let technicianIds: string[] | undefined
  if (json.technician_ids !== undefined) {
    if (!Array.isArray(json.technician_ids) || json.technician_ids.some(id => typeof id !== 'string')) {
      throw new ValidationError('technician_ids', 'technician_ids moet een lijst van ids zijn')
    }
    technicianIds = json.technician_ids as string[]
  }

  return {
    ticketNumber,
    ticketDate,
    plannedDate,
    description,
    isUrgent: json.is_urgent === true,
    type: (typeRaw as InterventionType | undefined) ?? 'warm',
    customer,
    site,
    device,
    technicianIds,
    createdBy: optionalString(json, 'created_by'),
    alertNote: optionalString(json, 'alert_note'),
  }
}

// ── Find-or-create helpers (all inside the caller's transaction) ─────────────

/**
 * Postgres SQLSTATE for a unique-index violation. Drizzle wraps driver errors in
 * a DrizzleQueryError, so the PostgresError carrying the code sits on `cause`.
 * We match on the code, never on the message text.
 */
const UNIQUE_VIOLATION = '23505'

function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current != null && depth < 5; depth++) {
    if (typeof current === 'object' && (current as { code?: unknown }).code === UNIQUE_VIOLATION) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/**
 * Run an INSERT inside a SAVEPOINT so a unique violation rolls back only that
 * statement. Without the savepoint the whole transaction would be aborted and the
 * recovery SELECT would fail with "current transaction is aborted".
 * Returns true when the insert succeeded, false when it lost a unique race.
 */
async function insertUnlessRaced(tx: Tx, insert: (sp: Tx) => PromiseLike<unknown>): Promise<boolean> {
  try {
    await tx.transaction(async (sp) => { await insert(sp) })
    return true
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    return false
  }
}

function cityLine(postalCode: string | undefined, city: string | undefined): string {
  return [postalCode, city].filter(Boolean).join(' ')
}

async function findOrCreateCustomer(tx: Tx, input: CreateWorkOrderCustomer): Promise<string> {
  // Only overwrite what the caller actually supplied. A caller referencing an
  // existing customer by id sends no descriptive fields at all, and must not
  // blank the row it is pointing at.
  const updates = {
    ...(input.name          ? { name: input.name }                           : {}),
    ...(input.address       ? { address: input.address }                     : {}),
    ...(input.city          ? { city: cityLine(input.postalCode, input.city) } : {}),
    ...(input.phone         ? { phone: input.phone }                         : {}),
    ...(input.invoiceNumber ? { invoiceCustomerNumber: input.invoiceNumber } : {}),
  }

  // An id is authoritative: the caller picked this customer from a list.
  if (input.id) {
    const [byId] = await tx
      .select({ id: customers.id, customerNumber: customers.customerNumber })
      .from(customers)
      .where(eq(customers.id, input.id))
    if (!byId) throw new ValidationError('customer.id', `Klant ${input.id} bestaat niet`)

    // Adopt the number onto a legacy row that has none, so it is indexed from now on.
    const adopt = !byId.customerNumber && input.number ? { customerNumber: input.number } : {}
    if (Object.keys(updates).length > 0 || Object.keys(adopt).length > 0) {
      await tx.update(customers).set({ ...updates, ...adopt }).where(eq(customers.id, byId.id))
    }
    return byId.id
  }

  if (!input.number) throw new ValidationError('customer.number', 'customer.number is verplicht')

  const [existing] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerNumber, input.number))

  if (existing) {
    await tx.update(customers).set(updates).where(eq(customers.id, existing.id))
    return existing.id
  }

  // Creating rather than referencing: the descriptive fields are mandatory here.
  // The parser enforces this for a body with no id; the guard makes it explicit
  // to the type checker and gives a clear error if a caller ever bypasses it.
  if (!input.name || !input.address || !input.city) {
    throw new ValidationError('customer.name', 'Naam, adres en gemeente zijn verplicht voor een nieuwe klant')
  }

  // Bound to locals: the guard above narrows these, but that narrowing does not
  // survive into the closure below, because `input` is a mutable binding.
  const name = input.name
  const address = input.address
  const city = cityLine(input.postalCode, input.city)

  const id = `customer-${randomUUID()}`
  const inserted = await insertUnlessRaced(tx, sp => sp.insert(customers).values({
    id,
    customerNumber: input.number,
    name,
    address,
    city,
    phone: input.phone ?? '',        // column is notNull
    invoiceCustomerNumber: input.invoiceNumber ?? null,
  }))
  if (inserted) return id

  // A concurrent request created this customer number between our SELECT and our
  // INSERT. That is a benign race, not a duplicate ticket: adopt the row that won
  // and apply our updates to it.
  const [raced] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerNumber, input.number))
  if (!raced) throw new Error(`Klant ${input.number} kon niet worden aangemaakt of teruggevonden`)
  await tx.update(customers).set(updates).where(eq(customers.id, raced.id))
  return raced.id
}

async function findOrCreateSite(
  tx: Tx,
  customerId: string,
  customer: CreateWorkOrderCustomer,
  site: CreateWorkOrderSite | undefined,
): Promise<string> {
  const optional = {
    ...(customer.phone          ? { phonePrimary: customer.phone }            : {}),
    ...(customer.phoneSecondary ? { phoneSecondary: customer.phoneSecondary } : {}),
    ...(customer.closingDay     ? { closingDay: customer.closingDay }         : {}),
  }

  // An id is authoritative: the caller picked this site from a list.
  if (site?.id) {
    const [byId] = await tx
      .select({ id: sites.id, customerId: sites.customerId })
      .from(sites)
      .where(eq(sites.id, site.id))
    if (!byId) throw new ValidationError('site.id', `Locatie ${site.id} bestaat niet`)
    if (byId.customerId !== customerId) {
      throw new ValidationError('site.id', 'Locatie hoort niet bij deze klant')
    }
    if (Object.keys(optional).length > 0) {
      await tx.update(sites).set(optional).where(eq(sites.id, byId.id))
    }
    return byId.id
  }

  let address = site?.address ?? customer.address
  let city    = cityLine(site?.postalCode ?? customer.postalCode, site?.city ?? customer.city)
  let name    = site?.name ?? customer.name

  // A caller referencing a customer by id sends no address of its own. Fall back
  // to the address already stored on that customer rather than refusing.
  if (!address || !city) {
    const [row] = await tx
      .select({ name: customers.name, address: customers.address, city: customers.city })
      .from(customers)
      .where(eq(customers.id, customerId))
    address = address || row?.address
    city    = city    || row?.city
    name    = name    || row?.name
  }

  if (!address || !city) {
    throw new ValidationError('customer.address', 'Adres en gemeente zijn verplicht voor een nieuwe locatie')
  }

  const [existing] = await tx
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.customerId, customerId), eq(sites.address, address), eq(sites.city, city)))

  if (existing) {
    if (Object.keys(optional).length > 0) {
      await tx.update(sites).set(optional).where(eq(sites.id, existing.id))
    }
    return existing.id
  }

  const id = `site-${randomUUID()}`
  await tx.insert(sites).values({ id, customerId, name: name ?? address, address, city, ...optional })
  return id
}

/**
 * Give a site its coordinates, once.
 *
 * Runs outside the transaction on purpose: Nominatim allows one request per
 * second and can be slow or absent, and neither is a reason to hold a lock or to
 * refuse a work order. A site that stays unlocated is not broken — the daily
 * route geocodes on the fly as it always did, so this is a head start rather
 * than a dependency.
 */
async function locateSite(siteId: string): Promise<void> {
  // Off in the test env, where creating a work order is routine and the
  // addresses are invented. Also the switch to reach for if the service starts
  // costing more than the pin is worth.
  // VITEST is set by the runner itself, so the tests never reach the network
  // however anybody's local env files happen to be configured — .env.test is
  // git-ignored, so a switch there protects only the machine it sits on.
  if (process.env.VITEST || process.env.GEOCODE_ON_CREATE === 'false') return

  try {
    const [site] = await db
      .select({ address: sites.address, city: sites.city, lat: sites.lat })
      .from(sites)
      .where(eq(sites.id, siteId))

    // Already located, or nothing to go on. Re-asking would spend a request to
    // learn what we know, and an address we cannot read will not improve by
    // being sent anyway.
    if (!site || site.lat !== null || !site.address || !site.city) return

    const at = await geocodeAddress(site.address, site.city)
    if (!at) return

    await db.update(sites).set({ lat: at.lat, lon: at.lon }).where(eq(sites.id, siteId))
  } catch {
    // Deliberately silent. The work order is already committed and correct; a
    // missing pin is a smaller problem than an error the person cannot act on.
  }
}

async function ensureContact(tx: Tx, siteId: string, customer: CreateWorkOrderCustomer): Promise<void> {
  if (!customer.contact) return
  const [existing] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.siteId, siteId), eq(contacts.name, customer.contact)))
  if (existing) return
  await tx.insert(contacts).values({
    id: `contact-${randomUUID()}`,
    siteId,
    name: customer.contact,
    phone: customer.contactPhone ?? customer.phone ?? '',
  })
}

async function findOrCreateDevice(tx: Tx, siteId: string, device: CreateWorkOrderDevice): Promise<string> {
  // An id is authoritative: the caller picked this device from a list.
  if (device.id) {
    const [byId] = await tx
      .select({ id: devices.id, siteId: devices.siteId })
      .from(devices)
      .where(eq(devices.id, device.id))
    if (!byId) throw new ValidationError('device.id', `Toestel ${device.id} bestaat niet`)
    if (byId.siteId !== siteId) {
      throw new ValidationError('device.id', 'Toestel hoort niet bij deze locatie')
    }
    return byId.id
  }

  if (!device.brand || !device.model) {
    throw new ValidationError('device.brand', 'Merk en model zijn verplicht voor een nieuw toestel')
  }

  const conds: SQL[] = [eq(devices.siteId, siteId)]
  if (device.unitNumber) {
    conds.push(eq(devices.unitNumber, device.unitNumber))
  } else {
    conds.push(eq(devices.brand, device.brand), eq(devices.model, device.model))
    if (device.serialNumber) conds.push(eq(devices.serialNumber, device.serialNumber))
  }

  const [existing] = await tx.select({ id: devices.id }).from(devices).where(and(...conds))
  if (existing) return existing.id

  const id = `device-${randomUUID()}`
  await tx.insert(devices).values({
    id,
    siteId,
    brand: device.brand,
    model: device.model,
    serialNumber: device.serialNumber ?? null,
    unitNumber: device.unitNumber ?? null,
    deliveryDate: device.deliveryDate ?? null,
    warrantyUntil: device.warrantyUntil ?? null,
  })
  return id
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function createWorkOrder(input: CreateWorkOrderInput): Promise<{ id: string; ticketNumber: string }> {
  let createdSiteId: string | null = null

  const created = await withAudit(input.createdBy ?? null, async (tx) => {
    const [duplicate] = await tx
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(eq(workOrders.ticketNumber, input.ticketNumber))
    if (duplicate) throw new DuplicateTicketError(input.ticketNumber, duplicate.id)

    const customerId = await findOrCreateCustomer(tx, input.customer)
    const siteId     = await findOrCreateSite(tx, customerId, input.customer, input.site)
    createdSiteId = siteId
    await ensureContact(tx, siteId, input.customer)
    const deviceId   = input.device ? await findOrCreateDevice(tx, siteId, input.device) : null

    const id = `wo-${randomUUID()}`
    const inserted = await insertUnlessRaced(tx, sp => sp.insert(workOrders).values({
      id,
      customerId,
      siteId,
      deviceId,
      ticketNumber: input.ticketNumber,
      ticketDate: input.ticketDate ? new Date(input.ticketDate) : null,
      plannedDate: new Date(input.plannedDate),
      status: input.status ?? 'gepland',
      type: input.type ?? 'warm',
      source: input.source ?? 'planned',
      description: input.description,
      isUrgent: input.isUrgent ?? false,
      createdBy: input.createdBy ?? null,
      visibleInPool: true,
      // The note's author is whoever created the work order — that is the only
      // person the edit route will later let change it.
      alertNote: input.alertNote ?? null,
      alertNoteBy: input.alertNote ? input.createdBy ?? null : null,
      alertNoteAt: input.alertNote ? new Date() : null,
    }))
    if (!inserted) {
      // A concurrent request committed the same ticket number between our SELECT
      // above and this INSERT — exactly what an ERP retry looks like. The unique
      // index kept the data correct; translate it into the error Task 4 maps to
      // HTTP 409 instead of letting a raw 23505 surface as a 500.
      const [raced] = await tx
        .select({ id: workOrders.id })
        .from(workOrders)
        .where(eq(workOrders.ticketNumber, input.ticketNumber))
      if (!raced) throw new Error(`Werkbon ${input.ticketNumber} kon niet worden aangemaakt`)
      throw new DuplicateTicketError(input.ticketNumber, raced.id)
    }

    const technicianIds = input.technicianIds ?? []
    if (technicianIds.length > 0) {
      await tx.insert(workOrderAssignments).values(
        technicianIds.map((technicianId, index) => ({
          workOrderId: id,
          technicianId,
          isLead: index === 0,
          accepted: true,
          plannedOrder: index + 1,
        })),
      )
    }

    return { id, ticketNumber: input.ticketNumber }
  })

  // After the commit, never during it. The work order is already safe; giving
  // its site a place on the map is a courtesy that must not be able to undo it.
  if (createdSiteId) await locateSite(createdSiteId)

  return created
}

// ── HTTP glue shared by both POST routes ─────────────────────────────────────
// Kept here so the ERP route and the internal route answer identically.

export type CreateWorkOrderHttpResult =
  | { status: 201; body: { id: string; ticket_number: string } }
  | { status: 400; body: { error: string; field: string } }
  | { status: 409; body: { error: string; id: string } }
  | { status: 500; body: { error: string } }

export async function handleCreateWorkOrderRequest(
  rawBody: unknown,
  createdBy?: string,
  /**
   * Fields the caller decides rather than the body. The upload flow uses this
   * to force a bon into the open pool; the ERP route and the wizard pass
   * nothing and keep the defaults. Kept out of the wire format on purpose —
   * where a work order shows up is not something a request should be able to
   * choose for itself.
   */
  overrides?: Pick<CreateWorkOrderInput, 'source' | 'status'>,
): Promise<CreateWorkOrderHttpResult> {
  try {
    const input = parseCreateWorkOrderBody(rawBody)
    const result = await createWorkOrder({ ...input, ...overrides, createdBy: input.createdBy ?? createdBy })
    return { status: 201, body: { id: result.id, ticket_number: result.ticketNumber } }
  } catch (err) {
    if (err instanceof ValidationError)      return { status: 400, body: { error: err.message, field: err.field } }
    if (err instanceof DuplicateTicketError) return { status: 409, body: { error: 'Ticket bestaat al', id: err.existingId } }
    console.error('[createWorkOrder]', err)
    return { status: 500, body: { error: 'Intern serverfout' } }
  }
}
