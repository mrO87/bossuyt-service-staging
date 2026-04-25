export type InterventionStatus =
  | 'aangemaakt'
  | 'gepland'
  | 'onderweg'
  | 'bezig'
  | 'wacht_onderdelen'
  | 'afgewerkt'
  | 'geannuleerd'

export type InterventionType = 'warm' | 'montage' | 'preventief'

export type InterventionSource = 'planned' | 'reactive'

export interface Customer {
  id: string
  name: string
  phone: string           // main company phone
  address: string         // billing address
  city: string            // billing city
  vatNumber?: string      // BTW nummer — optional for now
}

export interface Site {
  id: string
  customerId: string      // which customer this site belongs to
  name: string            // e.g. "Hoofdkantoor", "Vestiging Gent" — can be same as customer name
  address: string
  city: string
  phones: string[]        // one or more phone numbers for this location
  lat?: number            // GPS latitude (WGS84)
  lon?: number            // GPS longitude (WGS84)
}

export interface Contact {
  id: string
  siteId: string          // which site this contact belongs to
  name: string
  phone: string
  email?: string
  role?: string           // e.g. "Verantwoordelijke", "Technieker ter plaatse"
}

export interface Device {
  id: string
  siteId: string          // devices belong to a site, not directly to a customer
  brand: string
  model: string
  serialNumber?: string
  installDate?: string
  notes?: string
}

export interface DeviceDocument {
  id: string
  deviceId: string
  type: 'manual' | 'wiring' | 'explosion' | 'service'
  filename: string
  url: string
  fileSize?: number
}

export interface Article {
  id: string
  code: string
  description: string
  unitPrice: number
  compatibleDeviceIds: string[]
}

export interface InterventionTechnician {
  technicianId: string
  name: string
  initials: string
  isLead: boolean
  accepted: boolean
  plannedOrder: number
}

export interface Intervention {
  id: string
  customerId: string
  customerName: string    // denormalized for display in day view
  siteId: string
  siteName: string        // denormalized for display
  siteAddress: string     // denormalized for display
  siteCity: string        // denormalized for display
  siteLat?: number        // denormalized GPS latitude
  siteLon?: number        // denormalized GPS longitude
  deviceId: string
  deviceBrand?: string
  deviceModel?: string
  plannedDate: string
  status: InterventionStatus
  type: InterventionType
  description?: string    // reported problem
  estimatedMinutes?: number
  isUrgent: boolean
  source: InterventionSource
  technicians: InterventionTechnician[]
  statusOnderwegAt?: string
  statusArrivedAt?: string
  statusOnderwegBy?: string
  createdBy?: string
  planningVersion?: number
  visibleInPool?: boolean
}

export interface User {
  id: string
  name: string
  initials: string
  email: string
  role: 'technician' | 'office' | 'admin' | 'hr' | 'warehouse'
  active: boolean
}

export interface Werkbon {
  id: string
  interventionId: string
  createdBy: string
  arrivalTime?: string
  workStart?: string
  workEnd?: string
  description?: string
  status: 'concept' | 'ingediend' | 'goedgekeurd'
  signatureData?: string
  pdfUrl?: string
  submittedAt?: string
  syncedAt?: string
}

export type WorkOrderPhotoSyncStatus = 'pending' | 'uploaded' | 'failed' | 'deleting'

export interface WorkOrderPhotoDraft {
  id: string
  workOrderId: string
  fileName: string
  mimeType: string
  size: number
  localBlobKey: string
  createdAt: string
  syncStatus: WorkOrderPhotoSyncStatus
  serverPath?: string
  uploadedAt?: string
  errorMessage?: string
}

export interface WorkOrderPhotoRecord {
  id: string
  workOrderId: string
  fileName: string
  mimeType: string
  size: number
  storagePath: string
  createdAt: string
  uploadedAt: string
  changedBy?: string | null
}

export interface WerkbonArticle {
  id: string
  werkbonId: string
  articleCode: string
  description: string
  quantity: number
  toOrder: boolean
  needsQuote: boolean
}

export interface FollowUpAction {
  id: string
  werkbonId: string
  description: string
  priority: 'laag' | 'normaal' | 'hoog' | 'dringend'
  dueDate?: string
  done: boolean
  doneAt?: string
}

export type TaskPriority = 'laag' | 'normaal' | 'hoog' | 'dringend'

export type TaskStatus = 'open' | 'gepland' | 'bezig' | 'wacht_op_info' | 'klaar' | 'geannuleerd'

export type TaskType = 'email' | 'bellen' | 'bericht' | 'afspraak' | 'todo' | 'bestelling' | 'offerte'

export type TaskAssignmentType = 'user' | 'group'

export interface Task {
  id: string
  type: TaskType
  title: string
  description?: string
  assigneeType: TaskAssignmentType
  assigneeUserId?: string
  assigneeRole?: User['role']
  createdByUserId: string
  priority: TaskPriority
  status: TaskStatus
  werkbonId?: string
  interventionId?: string
  dueDate?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export interface Notification {
  id: string
  userId: string
  type: 'onderweg' | 'aangekomen' | 'werkbon_ingediend' | 'nieuwe_job'
  interventionId?: string
  message: string
  read: boolean
  createdAt: string
}

// ── DB-backed task system (Phase 1, 2026-04-17) ──────────────────────────────
// Existing TaskStatus / TaskType keep their Dutch values for lib/task-store.tsx.
// These new types use English values for the PostgreSQL task system.

export type DbTaskStatus =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'done'
  | 'skipped'
  | 'cancelled'
  | 'blocked'

export type DbTaskType =
  | 'order_part'
  | 'plan_revisit'
  | 'pick_parts'
  | 'load_parts'
  | 'contact_customer'
  | 'internal_note'
  | 'quality_check'
  | 'approval'
  | 'other'

export type TaskRole = 'technician' | 'warehouse' | 'office' | 'admin'

export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish'

export type WorkOrderLinkType =
  | 'revisit'
  | 'follow_up'
  | 'warranty_claim'
  | 'split'
  | 'related'

export type ReasonCode =
  | 'part_needed'
  | 'customer_unavailable'
  | 'additional_work_found'
  | 'warranty'
  | 'quality_issue'
  | 'cancelled_by_customer'
  | 'other'

/** Shape returned by the API for a DB-backed task. */
export interface DbTask {
  id: string
  workOrderId: string
  werkbonId: string | null
  templateId: string | null
  type: DbTaskType
  role: TaskRole
  status: DbTaskStatus
  title: string
  description: string | null
  assigneeId: string | null
  seq: number
  dueDate: string | null       // ISO 8601
  completedAt: string | null   // ISO 8601
  completedBy: string | null
  skipReason: string | null
  reasonCode: ReasonCode | null
  payload: Record<string, unknown> | null
  createdAt: string            // ISO 8601
  createdBy: string | null
  updatedAt: string            // ISO 8601
  // Populated by the query layer when requested:
  predecessorIds?: string[]
  successorIds?: string[]
  // Denormalized context fields — populated by queue queries:
  customerName?: string
  workOrderDescription?: string | null
}

export interface TaskTemplate {
  id: string
  name: string
  description: string | null
  defaultRole: TaskRole
  defaultType: DbTaskType
  triggerOnComplete: boolean
  autoCreate: boolean
  delayMinutes: number
  createdAt: string
  active: boolean
}

export interface TaskTemplateEdge {
  id: string
  fromTemplateId: string
  toTemplateId: string
  depType: DependencyType
  autoCreate: boolean
}

export interface WorkOrderLink {
  id: string
  fromWorkOrderId: string
  toWorkOrderId: string
  linkType: WorkOrderLinkType
  reasonCode: ReasonCode | null
  note: string | null
  createdAt: string
  createdBy: string | null
}

export interface WorkOrderEvent {
  id: number
  occurredAt: string
  recordedAt: string
  workOrderId: string
  taskId: string | null
  actorId: string | null
  eventType: string
  payload: Record<string, unknown>
  clientId: string | null
  taskTitle?: string | null   // populated by timeline query
}
