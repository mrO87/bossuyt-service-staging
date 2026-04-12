import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { workOrders, werkbonnen } from '@/lib/db/schema'
import { withAudit } from '@/lib/db/with-audit'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const formData = await req.formData()

  const changedBy     = (formData.get('changedBy')    as string) || null
  const notes         = (formData.get('completionNotes') as string) || null
  const parts         = (formData.get('completionParts') as string) || null
  const followUp      = (formData.get('followUp')     as string) || null
  const workStartRaw  = (formData.get('workStart')    as string) || null
  const workEndRaw    = (formData.get('workEnd')      as string) || null
  const pdfFile       = formData.get('pdf') as File | null

  const workStart = workStartRaw ? new Date(workStartRaw) : null
  const workEnd   = workEndRaw   ? new Date(workEndRaw)   : null

  // Each submission gets its own ID so multiple completions don't overwrite
  const werkbonId = crypto.randomUUID()
  let pdfPath: string | null = null

  if (pdfFile && pdfFile.size > 0) {
    const bytes     = await pdfFile.arrayBuffer()
    const buffer    = Buffer.from(bytes)
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'werkbonnen')
    await mkdir(uploadDir, { recursive: true })
    await writeFile(join(uploadDir, `${werkbonId}.pdf`), buffer)
    pdfPath = `/api/uploads/werkbonnen/${werkbonId}.pdf`
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
    })

    // Mark the work order as completed
    await tx
      .update(workOrders)
      .set({ status: 'afgewerkt' })
      .where(eq(workOrders.id, id))
  })

  return NextResponse.json({ ok: true, werkbonId, pdfPath })
}
