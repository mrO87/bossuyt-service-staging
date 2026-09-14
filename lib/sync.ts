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
/**
 * De wachtrij mag nooit twee keer tegelijk vertrekken.
 *
 * Gemeten op staging: sleep een bon en klik meteen door naar de volgende dag,
 * en dezelfde opdracht gaat twee keer de lijn op —
 *
 *     → update_planning v8 n=1
 *     → update_planning v8 n=1
 *     ← 200 success=true
 *     ← 409
 *
 * — want `persist` maakt de wachtrij leeg ná een sleep, en `useDayData` doet
 * het bij elke datumwissel. Allebei lazen ze dezelfde wachtrij vóór de ander
 * klaar was, en de tweede kreeg een conflict van de eerste. Op het scherm
 * verscheen dan een weigering voor iets wat gewoon gelukt was.
 *
 * De oplossing is niet "de tweede oproep negeren", want die tweede wil iets
 * wat er misschien ná de eerste bij is gekomen. Ze gaan dus achter elkaar in
 * de rij staan: elke oproep wacht tot de vorige klaar is en begint dan zelf.
 * Een ronde die niets meer vindt, kost niets.
 *
 * `.catch()` op de keten is er zodat één mislukte ronde de volgende niet
 * blokkeert — de keten mag nooit stukgaan op een fout die al afgehandeld is.
 */
let synchronisatieKeten: Promise<unknown> = Promise.resolve()

export function syncPendingWrites(): Promise<PendingWriteResult> {
  const volgende = synchronisatieKeten
    .catch(() => undefined)
    .then(() => runSyncPendingWrites())
  synchronisatieKeten = volgende
  return volgende
}

async function runSyncPendingWrites(): Promise<PendingWriteResult> {
  const {
    getPendingWrites,
    removePendingWrite,
  } = await import('./idb')
  const pending = await getPendingWrites()

  let synced = 0
  let failed = 0
  let notice: string | undefined
  let conflict = false
  /** De dag zoals de server hem na de laatste geslaagde schrijfactie kent. */
  let fresh: Intervention[] | undefined

  for (const write of pending) {
    try {
      if (write.type === 'upload_work_order_photo') {
        const uploaded = await uploadPendingWorkOrderPhoto(write)
        if (uploaded) {
          await removePendingWrite(write.id!)
          synced++
        } else {
          failed++
          // Photo uploads are independent — continue with the rest of the queue
        }
        continue
      }

      if (write.type === 'save_draft') {
        const { workOrderId, form, updatedAt, updatedBy } = write.payload as {
          workOrderId: string
          form: unknown
          updatedAt: string
          updatedBy?: string
        }
        const res = await fetch(`/api/work-orders/${workOrderId}/draft`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ form, updatedAt, updatedBy }),
        })

        if (res.ok || res.status === 409 || res.status === 404) {
          // 409 means the server already holds something newer, which is the
          // rule working rather than a failure — retrying would only lose
          // again. 404 means the work order is gone; so is the point of the
          // draft.
          await removePendingWrite(write.id!)
          synced++
          if (res.status === 409) {
            notice = 'Er stond een nieuwere versie van een werkbon op de server'
            conflict = true
          }
        } else {
          failed++
        }
        continue
      }

      if (write.type === 'update_estimate') {
        // Its own endpoint rather than the planning door: changing how long a
        // job takes says nothing about which day it is on, and coupling the two
        // would make a corrected estimate able to trip a planning conflict.
        const { workOrderId, estimatedMinutes } = write.payload as {
          workOrderId: string
          estimatedMinutes: number | null
        }
        const res = await fetch(`/api/work-orders/${workOrderId}/estimate`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estimatedMinutes }),
        })
        if (res.ok || res.status === 404) {
          // A 404 means the work order is gone; replaying forever helps nobody.
          await removePendingWrite(write.id!)
          synced++
        } else {
          failed++
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
          // Photo deletes are independent — continue with the rest of the queue
        }
        continue
      }

      if (write.type === 'set_day_clock') {
        // Rechtstreeks naar zijn eigen route, want dit gaat niet over een
        // werkbon: `/api/sync/write` antwoordt met een dag vol bonnen, en die
        // heeft de dagklok niet.
        const res = await fetch('/api/day-clock', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(write.payload),
        })
        if (res.ok) {
          await removePendingWrite(write.id!)
          synced++
        } else if (res.status >= 400 && res.status < 500) {
          // Een uur dat de server weigert, wordt bij de honderdste poging niet
          // ineens geldig. Weggooien is hier beter dan een wachtrij die voor
          // altijd vastloopt op één rij.
          await removePendingWrite(write.id!)
          failed++
        } else {
          failed++
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
          // Ook teruggeven aan wie ons aanriep. Een scherm dat niet uit
          // IndexedDB leest — de dagplanning op een andere dag dan vandaag —
          // houdt anders de oude versienummers vast, en dan botst de vólgende
          // sleep. Wie snel een paar keer heen en weer sleept om rijtijden te
          // vergelijken, loopt daar meteen tegenaan.
          fresh = [...data.planned, ...data.open]
        }
        await removePendingWrite(write.id!)
        synced++
      } else if (
        res.status === 409 &&
        (write.type === 'update_planning' || write.type === 'update_sequence')
      ) {
        // The server holds the truth. Take its version of the day, drop our
        // write — retrying it would only lose again — and say what happened.
        const data = await res.json() as {
          code?: 'PLANNING_CONFLICT' | 'WORK_ORDER_LOCKED' | 'WORK_ORDER_PAST'
          planned: Intervention[]
          open: Intervention[]
        }
        await cacheInterventions([...data.planned, ...data.open])
        await removePendingWrite(write.id!)
        synced++
        conflict = true
        notice =
          data.code === 'WORK_ORDER_LOCKED'
            ? 'Een werkbon was al gestart en blijft op de dag staan'
            : data.code === 'WORK_ORDER_PAST'
              // Komt vooral voor bij een telefoon die een nacht offline stond:
              // de wijziging was van gisteren, de dag is intussen voorbij.
              ? 'Die dag is intussen voorbij — de werkbon staat weer in de pool'
              : 'Planning gewijzigd, gelieve je planning opnieuw te ordenen'
      } else if (res.status === 409 && write.type === 'update_placement') {
        // Geweigerd omdat er intussen iets veranderd is, niet omdat er iets mis
        // is met wat we stuurden — opnieuw proberen zou opnieuw verliezen, en
        // de hele wachtrij erachter blijven blokkeren. Weggooien en het zeggen.
        const data = await res.json().catch(() => ({})) as { code?: string }
        await removePendingWrite(write.id!)
        synced++
        conflict = true
        notice =
          data.code === 'WORK_ORDER_LOCKED'
            ? 'Een werkbon was al gestart en blijft staan waar hij staat'
            : data.code === 'WORK_ORDER_PAST'
              ? 'Die dag is voorbij — een werkbon kan alleen vandaag of later staan'
              : 'Een werkbon kon niet verplaatst worden'
      } else {
        failed++
        break  // stop on first failure — maintain order
      }
    } catch {
      failed++
      break
    }
  }

  return { synced, failed, notice, conflict, fresh }
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
