/**
 * lib/server/work-orders.ts — create a work order from a "Service Bon" ticket.
 *
 * One function, two callers: the inbound ERP route and the manual wizard.
 * Everything runs in one transaction so a half-created customer can never
 * exist without its work order.
 */
import { randomUUID } from 'crypto'
import { and, eq, type SQL } from 'drizzle-orm'
import { customers, contacts, devices, sites, workOrderAssignments, workOrders } from '@/lib/db/schema'
import { withAudit, type Tx } from '@/lib/db/with-audit'
import type { InterventionType } from '@/types'

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
  number: string
  invoiceNumber?: string
  name: string
  address: string
  postalCode?: string
  city: string
  phone?: string
  phoneSecondary?: string
  contact?: string
  contactPhone?: string
  closingDay?: string
}

export interface CreateWorkOrderSite {
  name?: string
  address?: string
  postalCode?: string
  city?: string
}

export interface CreateWorkOrderDevice {
  unitNumber?: string
  brand: string
  model: string
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
  const customer: CreateWorkOrderCustomer = {
    number:         requiredString(c, 'number', 'customer.number'),
    invoiceNumber:  optionalString(c, 'invoice_number'),
    name:           requiredString(c, 'name', 'customer.name'),
    address:        requiredString(c, 'address', 'customer.address'),
    postalCode:     optionalString(c, 'postal_code'),
    city:           requiredString(c, 'city', 'customer.city'),
    phone:          optionalString(c, 'phone'),
    phoneSecondary: optionalString(c, 'phone_secondary'),
    contact:        optionalString(c, 'contact'),
    contactPhone:   optionalString(c, 'contact_phone'),
    closingDay:     optionalString(c, 'closing_day'),
  }

  let site: CreateWorkOrderSite | undefined
  if (isObject(json.site)) {
    site = {
      name:       optionalString(json.site, 'name'),
      address:    optionalString(json.site, 'address'),
      postalCode: optionalString(json.site, 'postal_code'),
      city:       optionalString(json.site, 'city'),
    }
  }

  let device: CreateWorkOrderDevice | null = null
  if (isObject(json.device)) {
    device = {
      unitNumber:    optionalString(json.device, 'unit_number'),
      brand:         requiredString(json.device, 'brand', 'device.brand'),
      model:         requiredString(json.device, 'model', 'device.model'),
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
  }
}

// ── Find-or-create helpers (all inside the caller's transaction) ─────────────

function cityLine(postalCode: string | undefined, city: string): string {
  return [postalCode, city].filter(Boolean).join(' ')
}

async function findOrCreateCustomer(tx: Tx, input: CreateWorkOrderCustomer): Promise<string> {
  const [existing] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerNumber, input.number))

  const values = {
    name: input.name,
    phone: input.phone ?? '',
    address: input.address,
    city: cityLine(input.postalCode, input.city),
    invoiceCustomerNumber: input.invoiceNumber ?? null,
  }

  if (existing) {
    await tx.update(customers).set(values).where(eq(customers.id, existing.id))
    return existing.id
  }

  const id = `customer-${randomUUID()}`
  await tx.insert(customers).values({ id, customerNumber: input.number, ...values })
  return id
}

async function findOrCreateSite(
  tx: Tx,
  customerId: string,
  customer: CreateWorkOrderCustomer,
  site: CreateWorkOrderSite | undefined,
): Promise<string> {
  const address = site?.address ?? customer.address
  const city    = cityLine(site?.postalCode ?? customer.postalCode, site?.city ?? customer.city)
  const name    = site?.name ?? customer.name

  const [existing] = await tx
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.customerId, customerId), eq(sites.address, address), eq(sites.city, city)))

  const optional = {
    ...(customer.phone          ? { phonePrimary: customer.phone }            : {}),
    ...(customer.phoneSecondary ? { phoneSecondary: customer.phoneSecondary } : {}),
    ...(customer.closingDay     ? { closingDay: customer.closingDay }         : {}),
  }

  if (existing) {
    if (Object.keys(optional).length > 0) {
      await tx.update(sites).set(optional).where(eq(sites.id, existing.id))
    }
    return existing.id
  }

  const id = `site-${randomUUID()}`
  await tx.insert(sites).values({ id, customerId, name, address, city, ...optional })
  return id
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
  return withAudit(input.createdBy ?? null, async (tx) => {
    const [duplicate] = await tx
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(eq(workOrders.ticketNumber, input.ticketNumber))
    if (duplicate) throw new DuplicateTicketError(input.ticketNumber, duplicate.id)

    const customerId = await findOrCreateCustomer(tx, input.customer)
    const siteId     = await findOrCreateSite(tx, customerId, input.customer, input.site)
    await ensureContact(tx, siteId, input.customer)
    const deviceId   = input.device ? await findOrCreateDevice(tx, siteId, input.device) : null

    const id = `wo-${randomUUID()}`
    await tx.insert(workOrders).values({
      id,
      customerId,
      siteId,
      deviceId,
      ticketNumber: input.ticketNumber,
      ticketDate: input.ticketDate ? new Date(input.ticketDate) : null,
      plannedDate: new Date(input.plannedDate),
      status: 'gepland',
      type: input.type ?? 'warm',
      source: 'planned',
      description: input.description,
      isUrgent: input.isUrgent ?? false,
      createdBy: input.createdBy ?? null,
      visibleInPool: true,
    })

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
}
