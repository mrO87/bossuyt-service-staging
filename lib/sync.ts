/**
 * lib/sync.ts — Morning sync logic
 *
 * At the start of each day, the technician opens the app.
 * This module fetches today's work from the server and saves it
 * to IndexedDB so everything works offline during the day.
 *
 * What gets cached:
 *   - Up to 10 interventions: max 6 'planned' + max 4 'reactive' (open pool)
 *   - Travel times between the planned stops (via /api/route/daily)
 *
 * After a successful sync the app works fully offline.
 */

import {
  cacheInterventions,
  saveDayMeta,
  getDayMeta,
  deleteWorkOrderPhotoDraft,
  getWorkOrderPhotoBlob,
  markWorkOrderPhotoDeleting,
  markWorkOrderPhotoFailed,
  markWorkOrderPhotoPending,
  markWorkOrderPhotoUploaded,
  type PendingWrite,
  type PendingWriteResult,
  type DayMeta,
} from './idb'
import type { Intervention } from '@/types'
import type { RouteStep } from '@/types/planning'
import type { WorkOrderPhotoRecord } from '@/types'

// How many of each type we cache at most
const MAX_PLANNED = 10
const MAX_OPEN = 4

export interface SyncResult {
  success: boolean
  planned: number        // how many planned items cached
  open: number           // how many open items cached
  route: RouteStep[]     // travel times between planned stops
  cachedAt: string
  error?: string
}

const SYNC_TTL_MS = 5 * 60 * 1000 // re-sync after 5 minutes so new work orders appear

/**
 * shouldSync — check if we need a fresh sync
 *
 * Returns true when: new day, different technician, or cache is older than SYNC_TTL_MS.
 * The TTL ensures newly created follow-up work orders appear in the open pool promptly.
 */
export async function shouldSync(technicianId: string): Promise<boolean> {
  const meta = await getDayMeta()
  if (!meta) return true

  const today = new Date().toISOString().slice(0, 10)
  if (meta.date !== today || meta.technicianId !== technicianId) return true

  const ageMs = Date.now() - new Date(meta.cachedAt).getTime()
  return ageMs > SYNC_TTL_MS
}

/**
 * syncToday — the main sync function
 *
 * Call this at app startup if shouldSync() returns true.
 * It fetches data from the server and stores it in IndexedDB.
 */
export async function syncToday(technicianId: string): Promise<SyncResult> {
  const today = new Date().toISOString().slice(0, 10)

  try {
    // Step 1: fetch today's interventions from the server
    // The server returns planned first, then open pool items
    const res = await fetch(`/api/sync/today?technicianId=${technicianId}&date=${today}`)
    if (!res.ok) throw new Error(`Server error: ${res.status}`)

    const data = await res.json() as {
      planned: Intervention[]
      open: Intervention[]
    }

    // Step 2: cap at our limits so we don't cache too much
    const planned = data.planned.slice(0, MAX_PLANNED)
    const open = data.open.slice(0, MAX_OPEN)
    const all = [...planned, ...open]

    // Step 3: save to IndexedDB
    await cacheInterventions(all)

    // Step 4: fetch travel times for the planned stops in sequence
    // We only do routing for planned items (in their assigned order)
    // Open items don't have a fixed position yet
    const route = await fetchDailyRoute(planned)

    // Step 5: save metadata so we know when we last synced
    const meta: DayMeta = {
      date: today,
      technicianId,
      cachedAt: new Date().toISOString(),
      totalPlanned: planned.length,
      totalOpen: open.length,
    }
    await saveDayMeta(meta)

    return { success: true, planned: planned.length, open: open.length, route, cachedAt: meta.cachedAt }

  } catch (err) {
    // Sync failed (offline or server error) — that's OK, we use cached data
    return {
      success: false,
      planned: 0,
      open: 0,
      route: [],
      cachedAt: '',
      error: err instanceof Error ? err.message : 'Onbekende fout',
    }
  }
}

/**
 * fetchDailyRoute — get travel times for today's planned stops
 *
 * Sends all addresses to our /api/route/daily endpoint which
 * calls ORS and returns travel time + distance for each hop.
 */
async function fetchDailyRoute(planned: Intervention[]): Promise<RouteStep[]> {
  // We need lat/lon for each stop. For now we geocode via the address.
  // TODO: store lat/lon on Intervention when Core API is connected
  // For now: skip routing if no coordinates available
  const stops = planned
    .filter(i => typeof i.siteLat === 'number' && typeof i.siteLon === 'number')
    .map(i => ({
      lat: i.siteLat!,
      lon: i.siteLon!,
      workOrderId: i.id,
    }))

  if (stops.length < 2) return []  // need at least 2 points for a route

  try {
    const res = await fetch('/api/route/daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops: stops.map(s => ({ lat: s.lat, lon: s.lon })) }),
    })
    if (!res.ok) return []

    const data = await res.json() as { steps: Array<{ distanceKm: number; travelMinutes: number; provider: string }> }

    // Map each step back to the intervention ids it connects
    return data.steps.map((step, i) => ({
      fromWorkOrderId: i === 0 ? 'depot' : stops[i - 1].workOrderId,
      toWorkOrderId: stops[i].workOrderId,
      distanceKm: step.distanceKm,
      travelMinutes: step.travelMinutes,
      provider: step.provider as 'ors' | 'tomtom',
    }))
  } catch {
    // Routing failed — non-fatal, app works without travel times
    return []
  }
}

/**
 * syncPendingWrites — send queued offline actions to the server
 *
 * Call this when the app comes back online.
 * Each pending write is tried in order. If it fails, we stop
 * and try again next time (keeps things in the right order).
 */
export async function syncPendingWrites(): Promise<PendingWriteResult> {
  const {
    getPendingWrites,
    removePendingWrite,
  } = await import('./idb')
  const pending = await getPendingWrites()

  let synced = 0
  let failed = 0
  let notice: string | undefined
  let conflict = false

  for (const write of pending) {
    try {
      if (write.type === 'upload_work_order_photo') {
        const uploaded = await uploadPendingWorkOrderPhoto(write)
        if (uploaded) {
          await removePendingWrite(write.id!)
          synced++
        } else {
          failed++
          break
        }
        continue
      }

      if (write.type === 'delete_work_order_photo') {
        const deleted = await deleteServerWorkOrderPhoto(write)
        if (deleted) {
          await removePendingWrite(write.id!)
          synced++
        } else {
          failed++
          break
        }
        continue
      }

      const res = await fetch(`/api/sync/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(write),
      })
      if (res.ok) {
        const data = await res.json() as {
          planned?: Intervention[]
          open?: Intervention[]
        }
        if (data.planned && data.open) {
          await cacheInterventions([...data.planned, ...data.open])
        }
        await removePendingWrite(write.id!)
        synced++
      } else if (res.status === 409 && write.type === 'update_sequence') {
        const data = await res.json() as {
          planned: Intervention[]
          open: Intervention[]
        }
        await cacheInterventions([...data.planned, ...data.open])
        await removePendingWrite(write.id!)
        synced++
        conflict = true
        notice = 'Planning gewijzigd, gelieve je planning opnieuw te ordenen'
      } else {
        failed++
        break  // stop on first failure — maintain order
      }
    } catch {
      failed++
      break
    }
  }

  return { synced, failed, notice, conflict }
}

type UploadWorkOrderPhotoPayload = {
  photoId: string
  workOrderId: string
  fileName: string
  mimeType: string
  changedBy?: string | null
}

function isUploadWorkOrderPhotoPayload(payload: Record<string, unknown>): payload is UploadWorkOrderPhotoPayload {
  return (
    typeof payload.photoId === 'string' &&
    typeof payload.workOrderId === 'string' &&
    typeof payload.fileName === 'string' &&
    typeof payload.mimeType === 'string'
  )
}

async function uploadPendingWorkOrderPhoto(write: PendingWrite): Promise<boolean> {
  if (!isUploadWorkOrderPhotoPayload(write.payload)) {
    return false
  }

  const payload = write.payload
  await markWorkOrderPhotoPending(payload.photoId)

  const blob = await getWorkOrderPhotoBlob(payload.photoId)
  if (!blob) {
    await markWorkOrderPhotoFailed(payload.photoId, 'Lokale foto niet gevonden')
    return false
  }

  const formData = new FormData()
  formData.append('photoId', payload.photoId)
  formData.append('changedBy', payload.changedBy ?? '')
  formData.append(
    'file',
    new File([blob], payload.fileName, { type: blob.type || payload.mimeType || 'image/jpeg' }),
  )

  try {
    const res = await fetch(`/api/work-orders/${payload.workOrderId}/photos`, {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      await markWorkOrderPhotoFailed(payload.photoId, `Upload mislukt (${res.status})`)
      return false
    }

    const data = await res.json() as { photo: WorkOrderPhotoRecord }
    await markWorkOrderPhotoUploaded(payload.photoId, {
      serverPath: data.photo.storagePath,
      uploadedAt: data.photo.uploadedAt,
    })
    return true
  } catch {
    await markWorkOrderPhotoFailed(payload.photoId, 'Upload mislukt')
    return false
  }
}

type DeleteWorkOrderPhotoPayload = {
  photoId: string
  workOrderId: string
  localBlobKey: string
  changedBy: string | null
}

function isDeleteWorkOrderPhotoPayload(payload: Record<string, unknown>): payload is DeleteWorkOrderPhotoPayload {
  return (
    typeof payload.photoId === 'string' &&
    typeof payload.workOrderId === 'string' &&
    typeof payload.localBlobKey === 'string'
  )
}

async function deleteServerWorkOrderPhoto(write: PendingWrite): Promise<boolean> {
  if (!isDeleteWorkOrderPhotoPayload(write.payload)) return false

  const { photoId, workOrderId, localBlobKey, changedBy } = write.payload
  await markWorkOrderPhotoDeleting(photoId)

  try {
    const params = changedBy ? `?changedBy=${encodeURIComponent(changedBy)}` : ''
    const res = await fetch(`/api/work-orders/${workOrderId}/photos/${photoId}${params}`, {
      method: 'DELETE',
    })

    if (!res.ok) return false

    await deleteWorkOrderPhotoDraft(photoId, localBlobKey)
    return true
  } catch {
    return false
  }
}
