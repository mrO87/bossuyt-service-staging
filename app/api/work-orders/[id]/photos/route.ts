import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { mkdir, writeFile } from 'fs/promises'
import { join, extname } from 'path'
import { db } from '@/lib/db'
import { workOrderPhotos } from '@/lib/db/schema'
import { withAudit } from '@/lib/db/with-audit'

function getSafeExtension(file: File): string {
  const fileExtension = extname(file.name).toLowerCase()
  if (fileExtension) return fileExtension

  if (file.type === 'image/png') return '.png'
  if (file.type === 'image/webp') return '.webp'
  return '.jpg'
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workOrderId } = await params
  const formData = await req.formData()
  const photoId = (formData.get('photoId') as string | null)?.trim()
  const changedBy = (formData.get('changedBy') as string | null)?.trim() || null
  const file = formData.get('file') as File | null

  if (!photoId || !file) {
    return NextResponse.json({ error: 'photoId and file are required' }, { status: 400 })
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image uploads are supported' }, { status: 400 })
  }

  const existing = await db
    .select()
    .from(workOrderPhotos)
    .where(eq(workOrderPhotos.id, photoId))
    .limit(1)

  if (existing[0]) {
    return NextResponse.json({
      success: true,
      photo: {
        id: existing[0].id,
        workOrderId: existing[0].workOrderId,
        fileName: existing[0].fileName,
        mimeType: existing[0].mimeType,
        size: existing[0].size,
        storagePath: existing[0].storagePath,
        createdAt: existing[0].createdAt.toISOString(),
        uploadedAt: existing[0].uploadedAt.toISOString(),
        changedBy: existing[0].changedBy,
      },
    })
  }

  const extension = getSafeExtension(file)
  const uploadDir = join(process.cwd(), 'public', 'uploads', 'work-order-photos', workOrderId)
  const storedFileName = `${photoId}${extension}`
  const filePath = join(uploadDir, storedFileName)
  const storagePath = `/api/uploads/work-order-photos/${workOrderId}/${storedFileName}`
  const createdAt = new Date()

  await mkdir(uploadDir, { recursive: true })
  await writeFile(filePath, Buffer.from(await file.arrayBuffer()))

  await withAudit(changedBy, async (tx) => {
    await tx.insert(workOrderPhotos).values({
      id: photoId,
      workOrderId,
      fileName: file.name || storedFileName,
      mimeType: file.type || 'image/jpeg',
      size: file.size,
      storagePath,
      createdAt,
      changedBy,
    })
  })

  return NextResponse.json({
    success: true,
    photo: {
      id: photoId,
      workOrderId,
      fileName: file.name || storedFileName,
      mimeType: file.type || 'image/jpeg',
      size: file.size,
      storagePath,
      createdAt: createdAt.toISOString(),
      uploadedAt: createdAt.toISOString(),
      changedBy,
    },
  })
}
