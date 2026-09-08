import { NextRequest, NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { db } from '@/lib/db'
import { workOrders, werkbonnen } from '@/lib/db/schema'
import { withAudit } from '@/lib/db/with-audit'
import type { PdfFollowUp, PdfPart } from '@/lib/pdf'
import type { InterventionKind } from '@/types'

// ── helpers ──────────────────────────────────────────────────────────────────

function str(fd: FormData, key: string): string | null {
  const value = fd.get(key)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function date(fd: FormData, key: string): Date | null {
  const raw = str(fd, key)
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function int(fd: FormData, key: string): number | null {
  const raw = str(fd, key)
  if (raw === null) return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

/** Parse a JSON list field. Returns `{ error }` when the JSON is malformed — the caller answers 400. */
function jsonList<T>(fd: FormData, key: string): { value: T[] | null } | { error: true } {
  const raw = str(fd, key)
  if (!raw) return { value: null }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? { value: parsed as T[] } : { error: true }
  } catch {
    return { error: true }
  }
}

// ── POST /api/work-orders/[id]/complete ──────────────────────────────────────
// Multipart form from the werkbon. Creates ONE new werkbonnen row per submit
// (never overwrites), numbers it `${ticket}-NN`, stores the PDF, and marks the
// work order afgewerkt.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const fd = await req.formData()

  const partsResult    = jsonList<PdfPart>(fd, 'completionParts')
  if ('error' in partsResult)    return NextResponse.json({ error: 'Ongeldige onderdelenlijst' }, { status: 400 })
  const followUpResult = jsonList<PdfFollowUp>(fd, 'followUp')
  if ('error' in followUpResult) return NextResponse.json({ error: 'Ongeldige opvolglijst' }, { status: 400 })

  const kindRaw = str(fd, 'interventionKind')
  if (kindRaw && kindRaw !== 'week' && kindRaw !== 'weekend') {
    return NextResponse.json({ error: 'interventionKind moet week of weekend zijn' }, { status: 400 })
  }

  const changedBy = str(fd, 'changedBy')
  const deviceId  = str(fd, 'deviceId')
  const pdfFile   = fd.get('pdf') as File | null
  const werkbonId = crypto.randomUUID()

  const [existing] = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.id, id))
  if (!existing) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

  let pdfPath: string | null = null
  if (pdfFile && pdfFile.size > 0) {
    const buffer    = Buffer.from(await pdfFile.arrayBuffer())
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'werkbonnen')
    await mkdir(uploadDir, { recursive: true })
    await writeFile(join(uploadDir, `${werkbonId}.pdf`), buffer)
    pdfPath = `/api/uploads/werkbonnen/${werkbonId}.pdf`
  }

  const bonNumber = await withAudit(changedBy, async (tx) => {
    // Lock the work order row so two simultaneous submits cannot both become -01.
    const [wo] = await tx
      .select({ id: workOrders.id, ticketNumber: workOrders.ticketNumber, deviceId: workOrders.deviceId })
      .from(workOrders)
      .where(eq(workOrders.id, id))
      .for('update')

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(werkbonnen)
      .where(eq(werkbonnen.workOrderId, id))

    const prefix = wo!.ticketNumber ?? wo!.id
    const number = `${prefix}-${String(count + 1).padStart(2, '0')}`

    await tx.insert(werkbonnen).values({
      id:               werkbonId,
      workOrderId:      id,
      bonNumber:        number,
      technicianId:     str(fd, 'technicianId'),
      deviceId:         deviceId ?? wo!.deviceId,
      visitDate:        date(fd, 'visitDate'),
      arrivalTime:      date(fd, 'arrivalTime'),
      departureTime:    date(fd, 'departureTime'),
      workStart:        date(fd, 'workStart'),
      workEnd:          date(fd, 'workEnd'),
      interventionKind: (kindRaw as InterventionKind | null),
      tripCount:        int(fd, 'tripCount'),
      personCount:      int(fd, 'personCount'),
      notes:            str(fd, 'completionNotes'),
      remarks:          str(fd, 'remarks'),
      parts:            partsResult.value,
      followUp:         followUpResult.value,
      signatureData:    str(fd, 'signature'),
      pdfPath,
      changedBy,
    })

    await tx
      .update(workOrders)
      .set({
        status: 'afgewerkt',
        ...(deviceId && !wo!.deviceId ? { deviceId } : {}),
      })
      .where(eq(workOrders.id, id))

    return number
  })

  return NextResponse.json({ ok: true, werkbonId, bonNumber, pdfPath })
}
