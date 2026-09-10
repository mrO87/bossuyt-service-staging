/**
 * Client for the local docling document-conversion service.
 *
 * docling turns a PDF or a photo into structured text. Crucially for us it
 * reports the box each fragment sits in, which is what lib/werkbon-zones.ts
 * reads the Service Bon fields out of.
 *
 * It runs as a container on the same Docker network as this app, so nothing
 * leaves the host: no external API, no vision model, no uploaded customer data
 * going anywhere.
 */
import type { DoclingDocument } from '@/lib/werkbon-zones'

/**
 * Where docling listens. The container publishes port 5001 on the host's
 * loopback only, so from inside this container the host is unreachable — we
 * reach it by service name over the shared Docker network instead.
 */
const DOCLING_URL = process.env.DOCLING_URL ?? 'http://docling:5001'

/** A page of scanned text takes docling roughly 20 seconds on CPU. */
const TIMEOUT_MS = Number(process.env.DOCLING_TIMEOUT_MS ?? 120_000)

export class DoclingUnavailableError extends Error {
  constructor(cause: string) {
    super(`Docling niet bereikbaar: ${cause}`)
    this.name = 'DoclingUnavailableError'
  }
}

export class DoclingFailedError extends Error {
  constructor(message: string) {
    super(`Docling kon het bestand niet lezen: ${message}`)
    this.name = 'DoclingFailedError'
  }
}

type DoclingResponse = {
  status?: string
  errors?: unknown[]
  document?: {
    json_content?: DoclingDocument | string
  }
  confidence?: {
    mean_score?: number
    mean_grade?: string
  }
}

export type ConvertResult = {
  document: DoclingDocument
  /** docling's own read on how well it did — 'poor' is worth surfacing. */
  grade: string
  score: number
}

/**
 * Send one file to docling and return its structured document.
 *
 * OCR is switched on explicitly. For a PDF that already contains a text layer
 * docling uses that text and skips OCR by itself, so this one call covers both
 * an uploaded photo and a PDF straight out of the ERP.
 *
 * The languages matter: these bons are printed in Dutch and French, and an OCR
 * pass configured for English alone turns "MATÉRIAUX" into noise.
 */
export async function convertDocument(
  file: Blob,
  fileName: string,
): Promise<ConvertResult> {
  const form = new FormData()
  form.append('files', file, fileName)
  form.append('to_formats', 'json')
  form.append('do_ocr', 'true')
  form.append('ocr_lang', 'nl')
  form.append('ocr_lang', 'fr')

  // Every field we read sits on the first page, and the bon that arrives from
  // the ERP carries two more pages of terms and conditions. Converting only
  // page 1 and skipping table detection — there is no table we need — takes
  // this from 33 seconds to 6 on the same file.
  form.append('page_range', '1')
  form.append('page_range', '1')
  form.append('do_table_structure', 'false')

  // AbortSignal.timeout gives up on a request that hangs. Without it a stalled
  // docling would hold this route open until the platform kills it, and the
  // user would see a spinner rather than "probeer opnieuw".
  let response: Response
  try {
    response = await fetch(`${DOCLING_URL}/v1/convert/file`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw new DoclingUnavailableError(err instanceof Error ? err.message : String(err))
  }

  if (!response.ok) {
    throw new DoclingUnavailableError(`HTTP ${response.status}`)
  }

  const body = (await response.json()) as DoclingResponse

  if (body.status && body.status !== 'success') {
    throw new DoclingFailedError(String(body.status))
  }

  // docling returns json_content as a nested object on some builds and as a
  // JSON string on others, so accept both rather than depending on the build.
  const raw = body.document?.json_content
  const document = typeof raw === 'string' ? (JSON.parse(raw) as DoclingDocument) : raw

  if (!document?.texts || !document.pages) {
    throw new DoclingFailedError('geen tekst gevonden in het document')
  }

  return {
    document,
    grade: body.confidence?.mean_grade ?? 'unknown',
    score: body.confidence?.mean_score ?? 0,
  }
}

/** Cheap liveness check, used by the upload route to fail fast and clearly. */
export async function isDoclingReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${DOCLING_URL}/health`, {
      signal: AbortSignal.timeout(3_000),
    })
    return response.ok
  } catch {
    return false
  }
}
