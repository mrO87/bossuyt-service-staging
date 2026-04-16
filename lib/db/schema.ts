import { relations } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import type {
  InterventionSource,
  InterventionStatus,
  InterventionType,
  User,
} from '@/types'

export const technicians = pgTable('technicians', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  email: text('email'),
  role: text('role').$type<User['role']>().notNull().default('technician'),
  active: boolean('active').notNull().default(true),
})

export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  vatNumber: text('vat_number'),
})

export const sites = pgTable('sites', {
  id: text('id').primaryKey(),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  phonePrimary: text('phone_primary'),
  phoneSecondary: text('phone_secondary'),
  lat: doublePrecision('lat'),
  lon: doublePrecision('lon'),
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
})

export const workOrders = pgTable('work_orders', {
  id: text('id').primaryKey(),
  customerId: text('customer_id')
    .notNull()
    .references(() => customers.id, { onDelete: 'restrict' }),
  siteId: text('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'restrict' }),
  deviceId: text('device_id')
    .notNull()
    .references(() => devices.id, { onDelete: 'restrict' }),
  plannedDate: timestamp('planned_date', { withTimezone: true }).notNull(),
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
  // Completion data — written when technician saves the werkbon
  workStart:         timestamp('work_start', { withTimezone: true }),
  workEnd:           timestamp('work_end',   { withTimezone: true }),
  completionNotes:   text('completion_notes'),
  completionParts:   text('completion_parts'),    // JSON string: PdfPart[]
  completionPdfPath: text('completion_pdf_path'), // /uploads/werkbonnen/{id}.pdf
  completedAt:       timestamp('completed_at', { withTimezone: true }),
})

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
  workStart:   timestamp('work_start',  { withTimezone: true }),
  workEnd:     timestamp('work_end',    { withTimezone: true }),
  notes:       text('notes'),                              // omschrijving werkzaamheden
  parts:       text('parts'),                              // JSON: PdfPart[]
  followUp:    text('follow_up'),                          // JSON: PdfFollowUp[]
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
