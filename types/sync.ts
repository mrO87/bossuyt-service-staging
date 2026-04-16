export type ExternalSystem = 'nav' | 'business_central' | 'odoo'

export type CanonicalEntityType =
  | 'customer'
  | 'service_location'
  | 'technician'
  | 'work_order'
  | 'work_order_task'
  | 'time_entry'
  | 'material_usage'
  | 'attachment'
  | 'signature'
  | 'invoice_draft'

export type SyncEventType =
  | 'pull_master_data'
  | 'pull_assigned_work_orders'
  | 'push_work_order_execution'
  | 'push_time_entries'
  | 'push_material_usage'
  | 'reorder_work_orders'

export type SyncEventStatus =
  | 'pending'
  | 'processing'
  | 'acked'
  | 'retry_scheduled'
  | 'conflict'
  | 'dead_letter'
  | 'cancelled'
  | 'reconciled'

export type OwnershipCategory = 'erp' | 'field_app' | 'shared'

export interface TimeEntryDTO {
  localId: string
  workOrderId: string
  technicianId: string
  startAt?: string
  endAt?: string
  durationMinutes?: number
  activityType: 'travel' | 'labour' | 'waiting' | 'follow_up'
  billable: boolean
  source: 'field_app'
}

export interface MaterialUsageDTO {
  localId: string
  workOrderId: string
  itemCode: string
  description: string
  quantity: number
  unit: string
  billable: boolean
  toOrder: boolean
  urgent: boolean
}

export interface WorkOrderPhotoDTO {
  localId: string
  fileName: string
  mimeType: string
  originalSize: number
  compressedSize: number
  width: number
  height: number
  createdAt: string
}

export interface UploadedWorkOrderPhotoDTO {
  localId: string
  photoId: string
  url: string
  fileName: string
  mimeType: string
  uploadedAt: string
}

export interface WorkOrderExecutionDTO {
  localEventId: string
  workOrderId: string
  technicianId: string
  status: string
  notes?: string
  workStart?: string
  workEnd?: string
  capturedAt: string
  hasSignature: boolean
  followUp: Array<{
    description: string
    priority: string
    dueDate?: string
  }>
  timeEntries: TimeEntryDTO[]
  materialUsage: MaterialUsageDTO[]
  attachmentRefs: Array<{
    type: 'pdf' | 'photo'
    fileName: string
  }>
  photos: WorkOrderPhotoDTO[]
}

export interface WorkOrderDTO {
  localId: string
  externalId?: string
  customerId: string
  serviceLocationId: string
  technicianIds: string[]
  plannedStart?: string
  plannedEnd?: string
  status: string
  description?: string
  updatedAt?: string
}

export interface MasterDataDTO {
  customers: Array<{
    localId?: string
    externalId: string
    name: string
    customerCode?: string
  }>
  serviceLocations: Array<{
    localId?: string
    externalId: string
    customerExternalId: string
    name: string
    address: string
    city: string
  }>
  technicians: Array<{
    localId?: string
    externalId: string
    name: string
    email?: string
  }>
  items: Array<{
    externalId: string
    itemCode: string
    description: string
    unitPrice?: number
  }>
}

export interface ConflictDTO {
  entityType: CanonicalEntityType
  entityId: string
  fieldGroup: string
  localVersion: number
  remoteVersion?: string
  localValue: unknown
  remoteValue: unknown
  detectedAt: string
}

export interface PushResult {
  accepted: boolean
  remoteCorrelationId?: string
  retriable?: boolean
  errorCode?: string
  errorMessage?: string
  conflicts?: ConflictDTO[]
}

export interface ResolutionResult {
  resolved: boolean
  strategy: 'field_app_wins' | 'erp_wins' | 'latest_writer_wins' | 'manual_review'
  note?: string
}

export interface SyncMappingRecord {
  id: string
  entityType: CanonicalEntityType
  localId: string
  externalSystem: ExternalSystem
  externalId: string
  externalVersion?: string
  lastSeenAt: string
}

export interface SyncEventRecord {
  id: string
  eventType: SyncEventType
  entityType: CanonicalEntityType
  entityId: string
  status: SyncEventStatus
  localVersion: number
  idempotencyKey: string
  attemptCount: number
  maxAttempts: number
  nextAttemptAt: string
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}
