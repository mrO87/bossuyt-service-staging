/**
 * POST /api/work-order-intakes — upload a paper or PDF Service Bon.
 *
 * The file is stored first and read second. That order is deliberate: docling
 * runs on CPU and can be down, and losing the photo a technician just took of a
 * bon on a customer's counter is far worse than showing "uitlezen lukt nu niet,
 * probeer opnieuw". A failed read leaves the row at status 'mislukt' with the
 * file intact.
 *
 * Nothing here creates a work order. This route only proposes field values; a
 * human confirms them at /werkbon/upload, and the confirm route turns the
 * proposal into a real work order.
 */
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { join, extname } from 'path'
import { workOrderIntakes } from '@/lib/db/schema'
import { withAudit } from '@/lib/db/with-audit'
import { extractIntakeFields, readIntake, serializeIntake } from '@/lib/server/work-order-intakes'

/** A photo of an A4 at a readable resolution, with room to spare. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

function extensionFor(file: File): string {
  const fromName = extname(file.name).toLowerCase()
  if (fromName) return fromName

  if (file.type === 'application/pdf') return '.pdf'
  if (file.type === 'image/png') return '.png'
  if (file.type === 'image/webp') return '.webp'
  return '.jpg'
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const clientId = (formData.get('clientId') as string | null)?.trim()
  const changedBy = (formData.get('changedBy') as string | null)?.trim() || null
  const file = formData.get('file') as File | null

  if (!clientId || !file) {
    return NextResponse.json({ error: 'clientId en file zijn verplicht' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Alleen een foto (JPG, PNG, WEBP) of een PDF kan geüpload worden' },
      { status: 415 },
    )
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Bestand is te groot (max 25 MB)' }, { status: 413 })
  }

  // The phone retries on a flaky connection, so the same clientId can arrive
  // twice. Answer with the row we already have instead of storing the bon
  // twice and reading it twice.
  const existing = await readIntake({ clientId })
  if (existing) {
    return NextResponse.json({ intake: serializeIntake(existing) }, { status: 200 })
  }

  const id = `intake-${randomUUID()}`
  const extension = extensionFor(file)
  const directory = join(process.cwd(), 'public', 'uploads', 'work-order-intake', id)
  const storedName = `original${extension}`

  const bytes = Buffer.from(await file.arrayBuffer())
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, storedName), bytes)

  const [intake] = await withAudit(changedBy, async (tx) =>
    tx
      .insert(workOrderIntakes)
      .values({
        id,
        clientId,
        originalPath: `/api/uploads/work-order-intake/${id}/${storedName}`,
        mimeType: file.type,
        size: file.size,
        status: 'nieuw',
        changedBy,
      })
      .returning(),
  )

  const outcome = await extractIntakeFields(intake, bytes, changedBy)

  const stored = await readIntake({ id })
  return NextResponse.json(
    { intake: serializeIntake(stored ?? intake), ...outcome },
    { status: 201 },
  )
}
