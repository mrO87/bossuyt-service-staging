import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { db } from '@/lib/db'
import { workOrderPhotos } from '@/lib/db/schema'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  const { id: workOrderId, photoId } = await params

  const existing = await db
    .select()
    .from(workOrderPhotos)
    .where(eq(workOrderPhotos.id, photoId))
    .limit(1)

  if (!existing[0]) {
    return NextResponse.json({ success: true })
  }

  const parts = existing[0].storagePath.split('/')
  const storedFileName = parts[parts.length - 1]
  const filePath = join(process.cwd(), 'public', 'uploads', 'work-order-photos', workOrderId, storedFileName)

  try {
    await unlink(filePath)
  } catch {
    // file may already be missing — proceed with DB delete
  }

  await db.delete(workOrderPhotos).where(eq(workOrderPhotos.id, photoId))

  return NextResponse.json({ success: true })
}
