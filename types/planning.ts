export type WorkOrderType = 'planned' | 'open'

export type RemovedReason =
  | 'cant_finish'
  | 'missing_material'
  | 'impossible_timing'
  | 'other'

export interface WorkOrder {
  id: string
  navOrderNr: string
  type: WorkOrderType
  executeBeforeDate?: string
  sequence?: number
  status: 'open' | 'in_progress' | 'completed' | 'removed'
  removedReason?: RemovedReason
  removedNote?: string
  customerId: string
  customerName: string
  address: string
  estimatedMinutes?: number
  syncedAt?: string
}

export interface RouteStep {
  fromWorkOrderId: string | 'depot'
  toWorkOrderId: string
  distanceKm: number
  travelMinutes: number
  provider: 'ors' | 'tomtom'
}

export interface TechnicianDayCache {
  technicianId: string
  date: string
  plannedItems: WorkOrder[]   // max ~6, assigned by dispatcher
  openItems: WorkOrder[]      // max ~4, optional pool
  route: RouteStep[]
  cachedAt: string
}

export interface TechnicianPlanningSettings {
  technicianId: string
  openPoolEnabled: boolean
  colleagueViewEnabled: boolean
}
