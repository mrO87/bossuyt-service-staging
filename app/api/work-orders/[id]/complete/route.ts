import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { workOrders } from '@/lib/db/schema'
import { withAudit } from '@/lib/db/with-audit'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const formData = await req.formData()

  const changedBy        = (formData.get('changedBy')        as string) || null
  const completionNotes  = (formData.get('completionNotes')  as string) || null
  const completionParts  = (formData.get('completionParts')  as string) || null
  const workStartRaw     = (formData.get('workStart')        as string) || null
  const workEndRaw       = (formData.get('workEnd')          as string) || null
  const pdfFile          = formData.get('pdf') as File | null

  const workStart = workStartRaw ? new Date(workStartRaw) : null
  const workEnd   = workEndRaw   ? new Date(workEndRaw)   : null

  let completionPdfPath: string | null = null

  if (pdfFile && pdfFile.size > 0) {
    const bytes     = await pdfFile.arrayBuffer()
    const buffer    = Buffer.from(bytes)
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'werkbonnen')
    await mkdir(uploadDir, { recursive: true })
    await writeFile(join(uploadDir, `${id}.pdf`), buffer)
    completionPdfPath = `/uploads/werkbonnen/${id}.pdf`
  }

  await withAudit(changedBy, async (tx) => {
    await tx
      .update(workOrders)
      .set({
        workStart,
        workEnd,
        completionNotes,
        completionParts,
        completionPdfPath,
        completedAt: new Date(),
        status:      'afgewerkt',
      })
      .where(eq(workOrders.id, id))
  })

  return NextResponse.json({ ok: true, completionPdfPath })
}
