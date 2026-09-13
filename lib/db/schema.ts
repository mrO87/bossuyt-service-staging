import { relations } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type {
  DbTaskStatus,
  DbTaskType,
  DependencyType,
  InterventionKind,
  InterventionSource,
  InterventionStatus,
  InterventionType,
  ReasonCode,
  TaskRole,
  User,
  WorkOrderIntakeStatus,
  WorkOrderLinkType,
} from '@/types'
import type { PdfFollowUp, PdfPart } from '@/lib/pdf'

export const technicians = pgTable('technicians', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  email: text('email'),
  role: text('role').$type<User['role']>().notNull().default('technician'),
  active: boolean('active').notNull().default(true),
})

export const customers = pgTable(
  'customers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    address: text('address').notNull(),
    city: text('city').notNull(),
    vatNumber: text('vat_number'),
    customerNumber: text('customer_number'),                // KLANT N° L  (e.g. K04647)
    invoiceCustomerNumber: text('invoice_customer_number'), // KLANT N° F  (invoice customer, optional)
  },
  (tbl) => ({
    byCustomerNumber: uniqueIndex('customers_customer_number_unique').on(tbl.customerNumber),
  }),
)

export const sites = pgTable('sites', {
  id: text('id').primaryKey(),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  address: text('address').notNull(),
  // What the scan actually said, kept only when `address` was corrected against
  // OpenStreetMap. A street read wrong by OCR is repaired so a technician can be
  // routed there, but the paper is still the record — and somebody comparing the
  // two has to be able to see what was changed, and undo it.
  addressScanned: text('address_scanned'),
  city: text('city').notNull(),
  phonePrimary: text('phone_primary'),
  phoneSecondary: text('phone_secondary'),
  lat: doublePrecision('lat'),
  lon: doublePrecision('lon'),
  closingDay: text('closing_day'),                          // SLUITINGSDAG | FERMÉ
})

/**
 * A werkbon that is being filled in but not finished.
 *
 * It was only ever kept in the browser, which meant a half-filled bon lived on
 * exactly one phone: change device, clear site data, or simply fill the storage
 * with photos until the browser evicts something, and an afternoon's typing was
 * gone. Nothing told anybody, because as far as the app was concerned nothing
 * had been submitted.
 *
 * One row per work order — a draft is the current state of the form, not a
 * history — deleted when the bon is actually submitted.
 */
export const workOrderDrafts = pgTable('work_order_drafts', {
  workOrderId: text('work_order_id')
    .primaryKey()
    .references(() => workOrders.id, { onDelete: 'cascade' }),
  form: jsonb('form').notNull(),
  /** When the form last changed, decided by the device that changed it. This is
   *  what "newest wins" compares, so it travels with the draft. */
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  updatedBy: text('updated_by'),
})

export const contacts = pgTable('contacts', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  role: text('role'),
})

export const devices = pgTable('devices', {
  id: text('id').primaryKey(),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  brand: text('brand').notNull(),
  model: text('model').notNull(),
  serialNumber: text('serial_number'),
  installDate: text('install_date'),
  notes: text('notes'),
  unitNumber: text('unit_number'),                         // UNIT N°
  deliveryDate: text('delivery_date'),                     // LEVERDATUM, ISO date
  warrantyUntil: text('warranty_until'),                   // GARANTIE, ISO date
})

export const workOrders = pgTable(
  'work_orders',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'restrict' }),
    // Optional: a ticket can arrive before the technician knows which unit is broken.
    deviceId: text('device_id')
      .references(() => devices.id, { onDelete: 'restrict' }),
    // Null means the work order sits in the open pool: assigned work without a
    // day yet. This is the single field deciding which of the two lists a work
    // order appears in — see getTodayInterventions.
    plannedDate: timestamp('planned_date', { withTimezone: true }),
    // The hour the work order was put on, in minutes since local midnight —
    // null means the hour is derived, which is how every work order started out
    // and how most stay. This is the first hour this app remembers rather than
    // recomputes: everything else in the day follows from the departure time
    // and the driving between customers. Minutes, not a timestamp, because the
    // day it belongs to is already `planned_date`, and storing the same day
    // twice is storing a way for the two to disagree.
    plannedStartMinutes: integer('planned_start_minutes'),
    // Whether that hour is an appointment. It changes nothing about how the
    // work order behaves when dragged — both kinds move freely and clash the
    // same way. It says one thing only: "shortest order" may reorder a derived
    // hour, and must leave an appointment where it stands.
    startIsAppointment: boolean('start_is_appointment').notNull().default(false),
    // Which role last moved this work order on or off a day. Written by
    // savePlanningSnapshot and read by nobody yet: it is the record the change
    // notice and the planner's lock will be built on once roles arrive.
    plannedByRole: text('planned_by_role').$type<User['role']>(),
    status: text('status').$type<InterventionStatus>().notNull(),
    type: text('type').$type<InterventionType>().notNull(),
    source: text('source').$type<InterventionSource>().notNull(),
    description: text('description'),
    estimatedMinutes: integer('estimated_minutes'),
    isUrgent: boolean('is_urgent').notNull().default(false),
    planningVersion: integer('planning_version').notNull().default(1),
    statusOnderwegAt: timestamp('status_onderweg_at', { withTimezone: true }),
    statusArrivedAt: timestamp('status_arrived_at', { withTimezone: true }),
    statusOnderwegBy: text('status_onderweg_by'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    ticketNumber: text('ticket_number'),                   // TICKET N° — owned by the ERP
    ticketDate: timestamp('ticket_date', { withTimezone: true }), // DATUM TICKET
    // Completion data — written when technician saves the werkbon
    workStart:         timestamp('work_start', { withTimezone: true }),
    workEnd:           timestamp('work_end',   { withTimezone: true }),
    completionNotes:   text('completion_notes'),
    completionParts:   jsonb('completion_parts').$type<PdfPart[]>(),
    completionPdfPath: text('completion_pdf_path'), // /uploads/werkbonnen/{id}.pdf
    completedAt:       timestamp('completed_at', { withTimezone: true }),
    externalRef:       text('external_ref'),    // stamped back by Navision/Odoo via ERP API
    prefillParts:      jsonb('prefill_parts').$type<PdfPart[]>(),
    visibleInPool:     boolean('visible_in_pool').notNull().default(true),

    // ── Alert note ───────────────────────────────────────────────────────────
    // Something the technician has to know before setting off: "klant eerst
    // bellen op 0477/93 15 70", "kan enkel op voormiddag". Shown as a red
    // exclamation mark in the list and at the top of the werkbon — never on the
    // printed PDF, which is a document the customer signs.
    //
    // alertNoteBy is who wrote it, and is the only person allowed to change or
    // remove it.
    alertNote:   text('alert_note'),
    alertNoteBy: text('alert_note_by'),
    alertNoteAt: timestamp('alert_note_at', { withTimezone: true }),
  },
  (tbl) => ({
    byTicketNumber: uniqueIndex('work_orders_ticket_number_unique').on(tbl.ticketNumber),
  }),
)

export const workOrderAssignments = pgTable(
  'work_order_assignments',
  {
    workOrderId: text('work_order_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    technicianId: text('technician_id')
      .notNull()
      .references(() => technicians.id, { onDelete: 'cascade' }),
    isLead: boolean('is_lead').notNull().default(false),
    accepted: boolean('accepted').notNull().default(false),
    plannedOrder: integer('planned_order').notNull().default(0),
  },
  table => ({
    pk: primaryKey({ columns: [table.workOrderId, table.technicianId] }),
  }),
)

export const customerRelations = relations(customers, ({ many }) => ({
  sites: many(sites),
  workOrders: many(workOrders),
}))

export const siteRelations = relations(sites, ({ one, many }) => ({
  customer: one(customers, {
    fields: [sites.customerId],
    references: [customers.id],
  }),
  contacts: many(contacts),
  devices: many(devices),
  workOrders: many(workOrders),
}))

export const deviceRelations = relations(devices, ({ one, many }) => ({
  site: one(sites, {
    fields: [devices.siteId],
    references: [sites.id],
  }),
  workOrders: many(workOrders),
}))

export const workOrderRelations = relations(workOrders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [workOrders.customerId],
    references: [customers.id],
  }),
  site: one(sites, {
    fields: [workOrders.siteId],
    references: [sites.id],
  }),
  device: one(devices, {
    fields: [workOrders.deviceId],
    references: [devices.id],
  }),
  assignments: many(workOrderAssignments),
  werkbonnen:  many(werkbonnen),
}))

export const deviceDocuments = pgTable(
  'device_documents',
  {
    id: text('id').primaryKey(),
    brand: text('brand').notNull(),
    model: text('model').notNull(),
    schematicPath: text('schematic_path'),
    explodedViewPath: text('exploded_view_path'),
    serviceManualPath: text('service_manual_path'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (tbl) => ({
    uniqueBrandModel: unique('device_documents_brand_model_unique').on(tbl.brand, tbl.model),
  }),
)

export const technicianRelations = relations(technicians, ({ many }) => ({
  assignments: many(workOrderAssignments),
}))

export const workOrderAssignmentRelations = relations(workOrderAssignments, ({ one }) => ({
  workOrder: one(workOrders, {
    fields: [workOrderAssignments.workOrderId],
    references: [workOrders.id],
  }),
  technician: one(technicians, {
    fields: [workOrderAssignments.technicianId],
    references: [technicians.id],
  }),
}))

// ── Werkbonnen ────────────────────────────────────────────────────────────────
// One record per completed werkbon submission. Multiple submissions are allowed
// per work order (re-submissions, admin corrections). Replaces the flat
// completion columns on work_orders.
export const werkbonnen = pgTable('werkbonnen', {
  id:          text('id').primaryKey(),                    // crypto.randomUUID()
  workOrderId: text('work_order_id')
    .notNull()
    .references(() => workOrders.id, { onDelete: 'cascade' }),
  bonNumber:   text('bon_number'),                         // SERVICE BON N°: `${ticket}-NN`
  // Everyone who worked this visit. `technicianId` stays as the lead — the one
  // whose name signs the bon and who counts as its author — and is always set
  // to the first entry of technicianIds when the bon is saved. One writer keeps
  // the two from drifting apart, and bons written before this column existed
  // keep working unchanged.
  technicianId: text('technician_id')
    .references(() => technicians.id, { onDelete: 'set null' }),
  technicianIds: jsonb('technician_ids').$type<string[]>(),
  deviceId:    text('device_id')
    .references(() => devices.id, { onDelete: 'set null' }),
  visitDate:     timestamp('visit_date',     { withTimezone: true }), // BEZOEKDATUM
  arrivalTime:   timestamp('arrival_time',   { withTimezone: true }), // AANKOMSTUUR
  departureTime: timestamp('departure_time', { withTimezone: true }), // VERTREKUUR
  workStart:   timestamp('work_start',  { withTimezone: true }),
  workEnd:     timestamp('work_end',    { withTimezone: true }),
  interventionKind: text('intervention_kind').$type<InterventionKind>(), // WEEK | WEEKEND
  tripCount:   integer('trip_count'),                      // AANTAL RITTEN
  personCount: integer('person_count'),                    // AANTAL PERSONEN
  notes:       text('notes'),                              // TECHNICUS RAPPORT
  remarks:     text('remarks'),                            // OPMERKINGEN
  parts:       jsonb('parts').$type<PdfPart[]>(),          // MATERIALEN
  followUp:    jsonb('follow_up').$type<PdfFollowUp[]>(),
  signatureData: text('signature_data'),                   // AKKOORD VAN KLANT, base64 PNG data URL
  pdfPath:     text('pdf_path'),                           // /api/uploads/werkbonnen/{id}.pdf
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  changedBy:   text('changed_by'),
})

export const werkbonnenRelations = relations(werkbonnen, ({ one }) => ({
  workOrder: one(workOrders, {
    fields: [werkbonnen.workOrderId],
    references: [workOrders.id],
  }),
}))

export const workOrderPhotos = pgTable('work_order_photos', {
  id: text('id').primaryKey(),
  workOrderId: text('work_order_id')
    .notNull()
    .references(() => workOrders.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  storagePath: text('storage_path').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  changedBy: text('changed_by'),
})

export const workOrderPhotosRelations = relations(workOrderPhotos, ({ one }) => ({
  workOrder: one(workOrders, {
    fields: [workOrderPhotos.workOrderId],
    references: [workOrders.id],
  }),
}))

// ── Uploaded paper bons ───────────────────────────────────────────────────────
// A work order that arrives on paper or as a PDF is parked here first: the file
// is stored, docling reads the fields out of it, and a human confirms them
// before it becomes a real work order. Until that confirmation happens there is
// no work order to hang the file on, which is why this is its own table rather
// than a row in work_order_photos.
export const workOrderIntakes = pgTable('work_order_intakes', {
  id: text('id').primaryKey(),
  // The id the phone generated before it had a network connection. Re-sending
  // the same upload finds this row instead of creating a second one.
  clientId: text('client_id').notNull().unique(),

  originalPath: text('original_path').notNull(),
  // The deskewed A4 the browser produced from a photo. Null for a PDF, which
  // needs no straightening.
  normalizedPath: text('normalized_path'),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),

  status: text('status').$type<WorkOrderIntakeStatus>().notNull().default('nieuw'),
  // The proposed field values, and per field where each one came from.
  extracted: jsonb('extracted').$type<Record<string, string>>(),
  fieldSources: jsonb('field_sources').$type<Record<string, string>>(),
  // docling's own grade of the conversion — worth showing when it says 'poor'.
  ocrGrade: text('ocr_grade'),
  errorMessage: text('error_message'),

  // Set when the human confirms; null while the intake is still a proposal.
  workOrderId: text('work_order_id').references(() => workOrders.id, { onDelete: 'set null' }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  changedBy: text('changed_by'),
})

export const workOrderIntakesRelations = relations(workOrderIntakes, ({ one }) => ({
  workOrder: one(workOrders, {
    fields: [workOrderIntakes.workOrderId],
    references: [workOrders.id],
  }),
}))

// ── Audit log ─────────────────────────────────────────────────────────────────
// Every INSERT / UPDATE / DELETE on any table is captured here via a PostgreSQL
// trigger (see lib/db/audit-triggers.sql). Application code should set the
// session variable `app.current_user` before writes so the trigger can record
// who made the change.
export const auditLog = pgTable('audit_log', {
  id:        bigserial('id', { mode: 'number' }).primaryKey(),
  tableName: text('table_name').notNull(),
  recordId:  text('record_id'),           // null for composite-PK tables
  operation: text('operation').notNull(), // INSERT | UPDATE | DELETE
  changedBy: text('changed_by'),          // technician id, 'admin', or null
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  oldData:   jsonb('old_data'),
  newData:   jsonb('new_data'),
})

// ── Task system ───────────────────────────────────────────────────────────────
// task_templates is declared first because tasks has a FK → task_templates.id.

export const taskTemplates = pgTable('task_templates', {
  id:                text('id').primaryKey(),
  name:              text('name').notNull(),
  description:       text('description'),
  defaultRole:       text('default_role').$type<TaskRole>().notNull(),
  defaultType:       text('default_type').$type<DbTaskType>().notNull(),
  triggerOnComplete: boolean('trigger_on_complete').notNull().default(false),
  autoCreate:        boolean('auto_create').notNull().default(false),
  delayMinutes:      integer('delay_minutes').notNull().default(0),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  active:            boolean('active').notNull().default(true),
})

export const tasks = pgTable(
  'tasks',
  {
    id:          text('id').primaryKey(),
    workOrderId: text('work_order_id').notNull()
      .references(() => workOrders.id, { onDelete: 'restrict' }),
    werkbonId:   text('werkbon_id')
      .references(() => werkbonnen.id, { onDelete: 'set null' }),
    templateId:  text('template_id')
      .references(() => taskTemplates.id, { onDelete: 'set null' }),
    type:        text('type').$type<DbTaskType>().notNull(),
    role:        text('role').$type<TaskRole>().notNull(),
    status:      text('status').$type<DbTaskStatus>().notNull().default('pending'),
    title:       text('title').notNull(),
    description: text('description'),
    assigneeId:  text('assignee_id')
      .references(() => technicians.id, { onDelete: 'set null' }),
    seq:         integer('seq').notNull().default(0),
    dueDate:     timestamp('due_date', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: text('completed_by'),
    skipReason:  text('skip_reason'),
    reasonCode:  text('reason_code').$type<ReasonCode>(),
    payload:     jsonb('payload'),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy:   text('created_by'),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (tbl) => ({
    byWorkOrder:      index('tasks_work_order_id_idx').on(tbl.workOrderId),
    byRoleStatus:     index('tasks_role_status_idx').on(tbl.role, tbl.status),
    byAssigneeStatus: index('tasks_assignee_status_idx').on(tbl.assigneeId, tbl.status),
  }),
)

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    id:            text('id').primaryKey(),
    predecessorId: text('predecessor_id').notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    successorId:   text('successor_id').notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    depType:       text('dep_type').$type<DependencyType>().notNull().default('finish_to_start'),
    lagMinutes:    integer('lag_minutes').notNull().default(0),
  },
  (tbl) => ({
    uniquePair: unique('task_dep_pair_unique').on(tbl.predecessorId, tbl.successorId),
  }),
)

export const taskTemplateEdges = pgTable(
  'task_template_edges',
  {
    id:             text('id').primaryKey(),
    fromTemplateId: text('from_template_id').notNull()
      .references(() => taskTemplates.id, { onDelete: 'cascade' }),
    toTemplateId:   text('to_template_id').notNull()
      .references(() => taskTemplates.id, { onDelete: 'cascade' }),
    depType:        text('dep_type').$type<DependencyType>().notNull().default('finish_to_start'),
    autoCreate:     boolean('auto_create').notNull().default(false),
  },
  (tbl) => ({
    uniqueEdge: unique('task_template_edge_unique').on(tbl.fromTemplateId, tbl.toTemplateId),
  }),
)

export const workOrderLinks = pgTable(
  'work_order_links',
  {
    id:              text('id').primaryKey(),
    fromWorkOrderId: text('from_work_order_id').notNull()
      .references(() => workOrders.id, { onDelete: 'restrict' }),
    toWorkOrderId:   text('to_work_order_id').notNull()
      .references(() => workOrders.id, { onDelete: 'restrict' }),
    linkType:        text('link_type').$type<WorkOrderLinkType>().notNull(),
    reasonCode:      text('reason_code').$type<ReasonCode>(),
    note:            text('note'),
    createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy:       text('created_by'),
  },
  (tbl) => ({
    uniqueLink: unique('work_order_link_unique').on(
      tbl.fromWorkOrderId, tbl.toWorkOrderId, tbl.linkType,
    ),
  }),
)

export const workOrderEvents = pgTable(
  'work_order_events',
  {
    id:          bigserial('id', { mode: 'number' }).primaryKey(),
    occurredAt:  timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    recordedAt:  timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    workOrderId: text('work_order_id').notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    taskId:      text('task_id')
      .references(() => tasks.id, { onDelete: 'set null' }),
    actorId:     text('actor_id'),
    eventType:   text('event_type').notNull(),
    payload:     jsonb('payload').notNull().default({}),
    clientId:    text('client_id'),
  },
  (tbl) => ({
    byWorkOrderTime: index('woe_work_order_occurred_at_idx').on(tbl.workOrderId, tbl.occurredAt),
    byTaskId:        index('woe_task_id_idx').on(tbl.taskId),
  }),
)
