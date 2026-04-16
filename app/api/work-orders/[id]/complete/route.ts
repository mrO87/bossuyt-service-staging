import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { workOrders, werkbonPhotos, werkbonnen } from '@/lib/db/schema'
import { withAudit } from '@/lib/db/with-audit'
import { createSyncEvent, findSyncEventByIdempotencyKey } from '@/lib/server/sync-events'
import { buildIdempotencyKey, calculateDurationMinutes, toLocalVersion } from '@/lib/sync-utils'
import type {
  UploadedWorkOrderPhotoDTO,
  WorkOrderExecutionDTO,
  WorkOrderPhotoDTO,
} from '@/types/sync'

function fileExtensionForMime(mimeType: string) {
  switch (mimeType) {
    case 'image/png':
      return '.png'
    case 'image/jpeg':
    default:
      return '.jpg'
  }
}

function sanitizePathSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'photo'
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const formData = await req.formData()

  const changedBy     = (formData.get('changedBy')    as string) || null
  const status        = (formData.get('status')       as string) || 'afgewerkt'
  const notes         = (formData.get('completionNotes') as string) || null
  const parts         = (formData.get('completionParts') as string) || null
  const followUp      = (formData.get('followUp')     as string) || null
  const workStartRaw  = (formData.get('workStart')    as string) || null
  const workEndRaw    = (formData.get('workEnd')      as string) || null
  const hasSignature  = formData.get('hasSignature') === 'true'
  const pdfFile       = formData.get('pdf') as File | null
  const photoMetaRaw  = (formData.get('photoMeta') as string) || '[]'
  const photoFiles    = formData
    .getAll('photos')
    .filter((item): item is File => item instanceof File && item.size > 0)
  const syncEventId   = (formData.get('syncEventId') as string) || crypto.randomUUID()
  const localVersion  = Number(formData.get('localVersion') ?? toLocalVersion())
  const idempotencyKey = (formData.get('idempotencyKey') as string) || buildIdempotencyKey(
    'push_work_order_execution',
    id,
    localVersion,
    syncEventId,
  )

  const workStart = workStartRaw ? new Date(workStartRaw) : null
  const workEnd   = workEndRaw   ? new Date(workEndRaw)   : null
  const parsedPhotoMeta = JSON.parse(photoMetaRaw) as WorkOrderPhotoDTO[]

  const existing = await findSyncEventByIdempotencyKey(idempotencyKey)
  if (existing?.resultPayload) {
    return NextResponse.json(existing.resultPayload)
  }

  // We reuse the sync event id as werkbon id so client retries stay idempotent.
  const werkbonId = syncEventId
  let pdfPath: string | null = null
  const uploadedPhotos: UploadedWorkOrderPhotoDTO[] = []

  if (pdfFile && pdfFile.size > 0) {
    const bytes     = await pdfFile.arrayBuffer()
    const buffer    = Buffer.from(bytes)
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'werkbonnen')
    await mkdir(uploadDir, { recursive: true })
    await writeFile(join(uploadDir, `${werkbonId}.pdf`), buffer)
    pdfPath = `/api/uploads/werkbonnen/${werkbonId}.pdf`
  }

  if (photoFiles.length > 0) {
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'werkbonnen', 'photos')
    await mkdir(uploadDir, { recursive: true })

    for (const [index, photoFile] of photoFiles.entries()) {
      const meta = parsedPhotoMeta[index]
      const photoId = crypto.randomUUID()
      const extension = fileExtensionForMime(photoFile.type || meta?.mimeType || 'image/jpeg')
      const storedName = `${werkbonId}-${sanitizePathSegment(meta?.localId ?? `${index + 1}`)}-${photoId}${extension}`
      const storagePath = `/api/uploads/werkbonnen/photos/${storedName}`
      const bytes = await photoFile.arrayBuffer()
      await writeFile(join(uploadDir, storedName), Buffer.from(bytes))

      uploadedPhotos.push({
        localId: meta?.localId ?? `photo-${index + 1}`,
        photoId,
        url: storagePath,
        fileName: meta?.fileName ?? photoFile.name,
        mimeType: photoFile.type || meta?.mimeType || 'image/jpeg',
        uploadedAt: new Date().toISOString(),
      })
    }
  }

  const parsedParts = parts ? JSON.parse(parts) as Array<{
    localId?: string
    itemCode?: string
    code?: string
    description?: string
    quantity?: number
    unit?: string
    billable?: boolean
    toOrder?: boolean
    urgent?: boolean
  }> : []
  const parsedFollowUp = followUp ? JSON.parse(followUp) as Array<{
    description?: string
    priority?: string
    dueDate?: string
  }> : []

  const executionPayload: WorkOrderExecutionDTO = {
    localEventId: syncEventId,
    workOrderId: id,
    technicianId: changedBy ?? '',
    status,
    notes: notes ?? undefined,
    workStart: workStartRaw ?? undefined,
    workEnd: workEndRaw ?? undefined,
    capturedAt: new Date().toISOString(),
    hasSignature,
    followUp: parsedFollowUp.map(item => ({
      description: item.description ?? '',
      priority: item.priority ?? 'gemiddeld',
      dueDate: item.dueDate,
    })),
    timeEntries: [{
      localId: `${syncEventId}:labour`,
      workOrderId: id,
      technicianId: changedBy ?? '',
      startAt: workStartRaw ?? undefined,
      endAt: workEndRaw ?? undefined,
      durationMinutes: calculateDurationMinutes(workStartRaw ?? undefined, workEndRaw ?? undefined),
      activityType: 'labour',
      billable: true,
      source: 'field_app',
    }],
    materialUsage: parsedParts.map((part, index) => ({
      localId: part.localId ?? `${syncEventId}:part:${index}`,
      workOrderId: id,
      itemCode: part.itemCode ?? part.code ?? '',
      description: part.description ?? '',
      quantity: part.quantity ?? 0,
      unit: part.unit ?? 'st',
      billable: part.billable ?? true,
      toOrder: part.toOrder ?? false,
      urgent: part.urgent ?? false,
    })),
    attachmentRefs: [
      ...(pdfPath ? [{ type: 'pdf' as const, fileName: `${werkbonId}.pdf` }] : []),
      ...uploadedPhotos.map(photo => ({ type: 'photo' as const, fileName: photo.fileName })),
    ],
    photos: parsedPhotoMeta,
  }

  await withAudit(changedBy, async (tx) => {
    // Create a new werkbon record — never overwrites previous submissions
    await tx.insert(werkbonnen).values({
      id:          werkbonId,
      workOrderId: id,
      workStart,
      workEnd,
      notes,
      parts,
      followUp,
      pdfPath,
      changedBy,
    }).onConflictDoNothing()

    if (uploadedPhotos.length > 0) {
      await tx.insert(werkbonPhotos).values(uploadedPhotos.map((photo, index) => ({
        id: photo.photoId,
        werkbonId,
        workOrderId: id,
        localPhotoId: photo.localId,
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        fileSize: photoFiles[index]?.size ?? 0,
        width: parsedPhotoMeta[index]?.width,
        height: parsedPhotoMeta[index]?.height,
        storagePath: photo.url,
        capturedAt: parsedPhotoMeta[index]?.createdAt ? new Date(parsedPhotoMeta[index].createdAt) : null,
        uploadedAt: new Date(photo.uploadedAt),
      })))
    }

    // Mark the work order as completed
    await tx
      .update(workOrders)
      .set({
        status: status as typeof workOrders.$inferInsert.status,
        executionLocalVersion: localVersion,
        executionSyncState: 'pending',
      })
      .where(eq(workOrders.id, id))
  })

  const responsePayload = { ok: true, werkbonId, pdfPath, uploadedPhotos }

  await createSyncEvent({
    id: syncEventId,
    eventType: 'push_work_order_execution',
    entityType: 'work_order',
    entityId: id,
    payload: executionPayload as unknown as Record<string, unknown>,
    idempotencyKey,
    localVersion,
    resultPayload: responsePayload,
  })

  return NextResponse.json(responsePayload)
}
