/**
 * Serves uploaded files from public/uploads/.
 *
 * Next.js standalone output does not serve the public/ directory automatically,
 * so all runtime-written files (werkbonnen PDFs, device docs) are served here.
 *
 * URL pattern: /api/uploads/<subpath>  → public/uploads/<subpath>
 */
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join, extname } from 'path'

const MIME: Record<string, string> = {
  '.pdf':  'application/pdf',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params

  // Prevent path traversal
  const safe = path.map(segment => segment.replace(/\.\./g, ''))
  const filePath = join(process.cwd(), 'public', 'uploads', ...safe)

  try {
    const file        = await readFile(filePath)
    const ext         = extname(filePath).toLowerCase()
    const contentType = MIME[ext] ?? 'application/octet-stream'
    const filename    = safe[safe.length - 1]

    return new NextResponse(file, {
      headers: {
        'Content-Type':        contentType,
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control':       'private, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
