/**
 * GET /api/work-orders/[id]/files — de twee bonnen die bij een werkbon horen.
 *
 * Het **origineel** is wat er binnenkwam: de geüploade PDF of de foto van het
 * papier. Het **afgewerkte** is wat eruit ging: de getekende servicebon.
 *
 * Twee verschillende tabellen, en dat is geen toeval — de eerste hoort bij de
 * upload, de tweede bij het afwerken. Ze hier samenbrengen spaart het scherm
 * twee oproepen en de vraag welke tabel waarvoor dient.
 */
import { NextRequest, NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { werkbonnen, workOrderIntakes } from '@/lib/db/schema'

type RouteContext = { params: Promise<{ id: string }> }

export interface BonFiles {
  /** Het bestand zoals het binnenkwam, of null als de bon met de hand is ingetikt. */
  original: string | null
  /** De getekende servicebon, of null zolang er niet afgewerkt is. */
  finished: string | null
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params

  try {
    const [intake] = await db
      .select({ path: workOrderIntakes.originalPath })
      .from(workOrderIntakes)
      .where(eq(workOrderIntakes.workOrderId, id))
      .orderBy(desc(workOrderIntakes.createdAt))
      .limit(1)

    // De laatste: een bon kan een tweede keer afgewerkt worden, en dan is de
    // nieuwste degene die de klant getekend heeft.
    const [bon] = await db
      .select({ path: werkbonnen.pdfPath })
      .from(werkbonnen)
      .where(eq(werkbonnen.workOrderId, id))
      .orderBy(desc(werkbonnen.completedAt))
      .limit(1)

    const files: BonFiles = {
      original: intake?.path ?? null,
      finished: bon?.path ?? null,
    }

    return NextResponse.json(files)
  } catch (error) {
    console.error('[api/work-orders/[id]/files GET]', error)
    return NextResponse.json({ error: 'Bestanden konden niet geladen worden' }, { status: 500 })
  }
}
