/**
 * lib/server/work-order-intakes.ts — the uploaded-bon side of creating a work
 * order.
 *
 * An intake is a proposal: a stored file plus the field values docling read out
 * of it. Confirming one runs the same createWorkOrder path as the wizard and
 * the ERP route, so an uploaded bon becomes an ordinary work order with no
 * second creation path to keep in step.
 */
import { randomUUID } from 'crypto'
import { copyFile, mkdir, readFile } from 'fs/promises'
import { extname, join } from 'path'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workOrderIntakes, workOrderPhotos } from '@/lib/db/schema'
import { withAudit } from '@/lib/db/with-audit'
import { convertDocument, DoclingFailedError, DoclingUnavailableError } from '@/lib/server/docling'
import { handleCreateWorkOrderRequest, type CreateWorkOrderHttpResult } from '@/lib/server/work-orders'
import { correctStreet, nameAtAddress } from '@/lib/routing/StreetCorrector'
import { extractWerkbon } from '@/lib/werkbon-zones'

export type IntakeRow = typeof workOrderIntakes.$inferSelect

/** What the browser receives: dates as ISO strings, nothing else changed. */
export type SerializedIntake = {
  id: string
  clientId: string
  originalPath: string
  normalizedPath: string | null
  mimeType: string
  size: number
  status: string
  extracted: Record<string, string> | null
  fieldSources: Record<string, string> | null
  ocrGrade: string | null
  errorMessage: string | null
  workOrderId: string | null
  createdAt: string
}

export function serializeIntake(row: IntakeRow): SerializedIntake {
  return {
    id: row.id,
    clientId: row.clientId,
    originalPath: row.originalPath,
    normalizedPath: row.normalizedPath,
    mimeType: row.mimeType,
    size: row.size,
    status: row.status,
    extracted: row.extracted,
    fieldSources: row.fieldSources,
    ocrGrade: row.ocrGrade,
    errorMessage: row.errorMessage,
    workOrderId: row.workOrderId,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Look an intake up by its server id or by the id the phone generated. */
export async function readIntake(key: { id: string } | { clientId: string }): Promise<IntakeRow | undefined> {
  const where = 'id' in key
    ? eq(workOrderIntakes.id, key.id)
    : eq(workOrderIntakes.clientId, key.clientId)

  const [row] = await db.select().from(workOrderIntakes).where(where).limit(1)
  return row
}

export type ConfirmResult =
  | { status: 404; body: { error: string } }
  | { status: 200; body: { id: string; ticket_number?: string; already: true } }
  | CreateWorkOrderHttpResult

/**
 * Turn a confirmed intake into a work order in the open pool.
 *
 * Three things are decided here rather than by the request body:
 *
 * - `source: 'reactive'` and `status: 'aangemaakt'`, because that is the pair
 *   getDayInterventions looks for when it fills the pool. A bon that arrived on
 *   paper has not been scheduled by planning, so it belongs there and not in
 *   somebody's day list.
 * - a placeholder `planned_date` of today when the body carries none. An
 *   unplanned bon has no date by definition, but the column is NOT NULL and
 *   planning overwrites it as soon as the job is scheduled. The follow-up route
 *   does exactly the same for exactly the same reason.
 */
export async function confirmIntake(
  intakeId: string,
  rawBody: unknown,
  changedBy?: string,
): Promise<ConfirmResult> {
  const intake = await readIntake({ id: intakeId })
  if (!intake) return { status: 404, body: { error: 'Upload niet gevonden' } }

  // Confirming twice — a double tap, a retried request — must not create a
  // second work order for the same sheet of paper.
  if (intake.status === 'bevestigd' && intake.workOrderId) {
    return { status: 200, body: { id: intake.workOrderId, already: true } }
  }

  const body = withPlaceholderPlannedDate(rawBody)

  const result = await handleCreateWorkOrderRequest(body, changedBy, {
    source: 'reactive',
    status: 'aangemaakt',
  })

  if (result.status !== 201) return result

  const workOrderId = result.body.id
  await attachSourceDocument(intake, workOrderId, changedBy ?? null)

  await withAudit(changedBy ?? null, async (tx) => {
    await tx
      .update(workOrderIntakes)
      .set({ status: 'bevestigd', workOrderId, errorMessage: null })
      .where(eq(workOrderIntakes.id, intakeId))
  })

  return result
}

/** Fill in today's date when the body has none, leaving a supplied one alone. */
function withPlaceholderPlannedDate(rawBody: unknown): unknown {
  if (typeof rawBody !== 'object' || rawBody === null) return rawBody

  const body = rawBody as Record<string, unknown>
  const supplied = typeof body.planned_date === 'string' ? body.planned_date.trim() : ''
  if (supplied) return body

  return { ...body, planned_date: new Date().toISOString() }
}

/**
 * Hang the uploaded bon on the new work order so the technician can see the
 * paper he is working from.
 *
 * Only images are attached. work_order_photos is rendered with next/image by
 * PhotoUploadSection, which would show a broken tile for a PDF. A PDF stays on
 * the intake row, which keeps pointing at this work order through
 * work_order_id, so it remains findable without breaking that view.
 */
async function attachSourceDocument(
  intake: IntakeRow,
  workOrderId: string,
  changedBy: string | null,
): Promise<void> {
  if (!intake.mimeType.startsWith('image/')) return

  // Prefer the deskewed A4 the browser produced; fall back to what was uploaded.
  const sourceUrl = intake.normalizedPath ?? intake.originalPath
  const sourceFile = uploadUrlToPath(sourceUrl)
  if (!sourceFile) return

  const photoId = `photo-${randomUUID()}`
  const extension = extname(sourceFile) || '.jpg'
  const directory = join(process.cwd(), 'public', 'uploads', 'work-order-photos', workOrderId)
  const storedName = `${photoId}${extension}`

  try {
    await mkdir(directory, { recursive: true })
    await copyFile(sourceFile, join(directory, storedName))
  } catch (err) {
    // The work order already exists and is correct; losing the attached image
    // is a nuisance, not a reason to fail the confirmation.
    console.error('[confirmIntake] kon brondocument niet koppelen', err)
    return
  }

  const createdAt = new Date()
  await withAudit(changedBy, async (tx) => {
    await tx.insert(workOrderPhotos).values({
      id: photoId,
      workOrderId,
      fileName: 'werkbon-origineel' + extension,
      mimeType: intake.mimeType,
      size: intake.size,
      storagePath: `/api/uploads/work-order-photos/${workOrderId}/${storedName}`,
      createdAt,
      changedBy,
    })
  })
}

/**
 * Turn a /api/uploads/... URL back into the file it serves.
 *
 * Anything that does not look like one of our own upload URLs returns null
 * rather than a path, so a value that ever came from outside cannot be talked
 * into pointing somewhere else on disk.
 */
function uploadUrlToPath(url: string): string | null {
  const prefix = '/api/uploads/'
  if (!url.startsWith(prefix)) return null

  const segments = url.slice(prefix.length).split('/')
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return null

  return join(process.cwd(), 'public', 'uploads', ...segments)
}

// ── Reading the file ─────────────────────────────────────────────────────────

/**
 * Send a stored bon through docling and record what came out.
 *
 * Every failure ends the same way: status 'mislukt' with a message the user can
 * act on, and no exception escaping. The file is already on disk by the time
 * this runs, so a failed read costs a retry and never the upload itself. That
 * is why this returns a warning instead of throwing — the caller still answers
 * "opgeslagen".
 */
export async function extractIntakeFields(
  intake: IntakeRow,
  bytes: Buffer,
  changedBy: string | null,
): Promise<{ warning?: string }> {
  try {
    const blob = new Blob([new Uint8Array(bytes)], { type: intake.mimeType })
    const converted = await convertDocument(blob, `werkbon${extname(intake.originalPath) || '.pdf'}`)
    const extracted = extractWerkbon(converted.document)

    // A street OCR read wrong is a street nobody can drive to and no map can
    // find. The postal code came off the same scan intact — digits survive
    // where letters do not — so it can vouch for the correction.
    const fields = { ...extracted.fields }
    const sources: Record<string, string> = { ...extracted.sources }
    if (fields.address && fields.postalCode) {
      const better = await correctStreet(fields.address, fields.postalCode)
      if (better) {
        // Keep the house number: only the name was ever in question.
        const houseNumber = fields.address.match(/\s(\d+\s*[A-Za-z]?)$/)?.[1] ?? ''
        fields.address = houseNumber ? `${better.street} ${houseNumber}` : better.street
        // A moved capital is not worth anybody's attention; a moved letter is.
        if (!better.caseOnly) sources.address = 'corrected'
      }
    }

    // The name is the one field with no shape to recognise it by, so OCR either
    // reads it or it does not. When it does not, the map often knows who sits at
    // that address — offered, never assumed, because the business at a door is
    // usually the customer and sometimes the neighbour.
    if (!fields.customerName && fields.address && fields.postalCode) {
      const houseNumber = fields.address.match(/\s(\d+\s*[A-Za-z]?)$/)?.[1]?.trim() ?? ''
      const street = houseNumber ? fields.address.slice(0, -houseNumber.length).trim() : fields.address
      const proposed = await nameAtAddress(street, houseNumber, fields.postalCode)
      if (proposed) {
        fields.customerName = proposed
        sources.customerName = 'suggested'
      }
    }

    const readAnything = Object.values(fields).some(value => value !== '')

    await withAudit(changedBy, async (tx) => {
      await tx
        .update(workOrderIntakes)
        .set({
          status: readAnything ? 'gelezen' : 'mislukt',
          extracted: fields,
          fieldSources: sources,
          ocrGrade: converted.grade,
          errorMessage: readAnything
            ? null
            : 'Geen enkel veld herkend — is dit een Bossuyt-werkbon?',
        })
        .where(eq(workOrderIntakes.id, intake.id))
    })

    if (!readAnything) return { warning: 'Geen enkel veld herkend' }
    if (converted.grade === 'poor') return { warning: 'De scan is moeilijk leesbaar — controleer elk veld' }
    return {}
  } catch (err) {
    const known = err instanceof DoclingUnavailableError || err instanceof DoclingFailedError
    if (!known) console.error('[work-order-intake] uitlezen mislukt', err)

    const message = known ? (err as Error).message : 'Uitlezen mislukt'

    await withAudit(changedBy, async (tx) => {
      await tx
        .update(workOrderIntakes)
        .set({ status: 'mislukt', errorMessage: message })
        .where(eq(workOrderIntakes.id, intake.id))
    })

    return { warning: message }
  }
}

/**
 * Read a stored bon again — the retry behind "opnieuw proberen" after docling
 * was unreachable. Identical to the first read, except the bytes come off disk
 * instead of off the request.
 */
export async function reReadIntake(
  intakeId: string,
  changedBy: string | null,
): Promise<{ intake: IntakeRow; warning?: string } | null> {
  const intake = await readIntake({ id: intakeId })
  if (!intake) return null

  const path = uploadUrlToPath(intake.normalizedPath ?? intake.originalPath)
  if (!path) return null

  const bytes = await readFile(path)
  const outcome = await extractIntakeFields(intake, bytes, changedBy)

  const refreshed = await readIntake({ id: intakeId })
  return { intake: refreshed ?? intake, warning: outcome.warning }
}
