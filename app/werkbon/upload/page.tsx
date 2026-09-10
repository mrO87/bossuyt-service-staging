'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import CornerPicker from '@/components/WorkOrderIntake/CornerPicker'
import ConfirmForm, {
  type ExtractedFields,
  type FieldSources,
} from '@/components/WorkOrderIntake/ConfirmForm'
import {
  queueIntakeUpload,
  removeIntakeUpload,
  markIntakeUploadFailed,
  getIntakeUpload,
  getQueuedIntakeUploads,
} from '@/lib/idb'
import { useTasks } from '@/lib/task-store'

type Intake = {
  id: string
  originalPath: string
  normalizedPath: string | null
  mimeType: string
  status: string
  extracted: ExtractedFields | null
  fieldSources: FieldSources | null
  errorMessage: string | null
}

type Screen = 'kiezen' | 'hoeken' | 'versturen' | 'bevestigen' | 'mislukt'

function BossuytLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <text x="1" y="13" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="14" y="13" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="1" y="27" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
      <text x="14" y="27" fill="#F28C28" fontSize="13" fontWeight="bold" fontFamily="sans-serif">×</text>
    </svg>
  )
}

/**
 * useSearchParams reads the URL on the client, so anything using it has to sit
 * behind a Suspense boundary — otherwise the whole page is forced out of static
 * rendering. This wrapper is that boundary and nothing else.
 */
export default function UploadWerkbonPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface" />}>
      <UploadWerkbon />
    </Suspense>
  )
}

/**
 * /werkbon/upload — turn a paper or PDF Service Bon into a work order in the
 * open pool.
 *
 * Four steps: get the file, mark the corners (a photo only — a PDF is already
 * flat), let the server read it, then check what it read. Only that last
 * confirmation creates anything.
 *
 * The file usually arrives from the + menu in the day view, already stored in
 * IndexedDB with `?bron=` naming it. Coming here directly still works: the two
 * buttons on the first screen do the same thing.
 */
function UploadWerkbon() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentUser } = useTasks()

  const [screen, setScreen] = useState<Screen>('kiezen')
  const [photo, setPhoto] = useState<File | null>(null)
  // Set only when the photo came in through the + menu and is already queued.
  const [photoClientId, setPhotoClientId] = useState<string | null>(null)
  const [intake, setIntake] = useState<Intake | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [queued, setQueued] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<{ field?: string; message: string; existingId?: string } | null>(null)

  const refreshQueue = useCallback(async () => {
    setQueued((await getQueuedIntakeUploads()).length)
  }, [])

  /**
   * Send one file up, having stored it locally first.
   *
   * The order matters and is the project's offline rule: the bon goes into
   * IndexedDB before the request, and only leaves it once the server has
   * confirmed it holds the file. A dropped connection therefore costs a retry,
   * never the photograph. `clientId` rides along so a retry after a
   * half-finished request finds the existing upload instead of making a second.
   */
  const upload = useCallback(
    async (file: Blob, fileName: string, mimeType: string, clientId: string = crypto.randomUUID()) => {
      setScreen('versturen')
      setError(null)
      setWarning(null)

      await queueIntakeUpload({
        clientId,
        fileName,
        mimeType,
        size: file.size,
        file,
        createdAt: new Date().toISOString(),
      })

      const body = new FormData()
      body.append('clientId', clientId)
      body.append('file', file, fileName)
      if (currentUser?.id) body.append('changedBy', currentUser.id)

      try {
        const response = await fetch('/api/work-order-intakes', { method: 'POST', body })
        const json = (await response.json()) as { intake?: Intake; warning?: string; error?: string }

        if (!response.ok || !json.intake) {
          throw new Error(json.error ?? 'Uploaden mislukt')
        }

        // The server has the file now, so the local copy has done its job.
        await removeIntakeUpload(clientId)
        setIntake(json.intake)
        setWarning(json.warning ?? null)
        setScreen(json.intake.status === 'mislukt' ? 'mislukt' : 'bevestigen')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Uploaden mislukt'
        await markIntakeUploadFailed(clientId, message)
        setError(
          navigator.onLine
            ? message
            : 'Geen verbinding — de bon is bewaard en wordt verstuurd zodra je online bent.',
        )
        setScreen('kiezen')
        void refreshQueue()
      }
    },
    [currentUser?.id, refreshQueue],
  )

  useEffect(() => {
    void refreshQueue()
  }, [refreshQueue])

  // Arriving from the + menu, the file is already in IndexedDB and the URL
  // carries only its id. A ref guards it so a re-render cannot start a second
  // upload of the same bon.
  const handedOver = useRef<string | null>(null)

  useEffect(() => {
    const clientId = searchParams.get('bron')
    if (!clientId || handedOver.current === clientId) return
    handedOver.current = clientId

    void (async () => {
      const draft = await getIntakeUpload(clientId)
      // Nothing there means it was already sent — a reload of this URL after a
      // successful upload, which is not an error.
      if (!draft) return

      if (draft.mimeType === 'application/pdf') {
        await upload(draft.file, draft.fileName, draft.mimeType, clientId)
        return
      }

      // A photo goes past the corner picker first. It keeps the id it was
      // queued under, so straightening it does not create a second record.
      setPhoto(new File([draft.file], draft.fileName, { type: draft.mimeType }))
      setPhotoClientId(clientId)
      setScreen('hoeken')
    })()
  }, [searchParams, upload])

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Let the same file be picked twice in a row — without this the input keeps
    // its value and the change event never fires again.
    event.target.value = ''
    if (!file) return

    setError(null)

    if (file.type === 'application/pdf') {
      // A PDF is already a flat page; there is nothing to straighten.
      void upload(file, file.name, file.type)
      return
    }

    setPhoto(file)
    setScreen('hoeken')
  }

  /** Read the stored file again after docling was unreachable. */
  async function retryRead() {
    if (!intake) return
    setScreen('versturen')

    try {
      const response = await fetch(`/api/work-order-intakes/${intake.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ changedBy: currentUser?.id }),
      })
      const json = (await response.json()) as { intake?: Intake; warning?: string }
      if (!json.intake) throw new Error('Opnieuw uitlezen mislukt')

      setIntake(json.intake)
      setWarning(json.warning ?? null)
      setScreen(json.intake.status === 'mislukt' ? 'mislukt' : 'bevestigen')
    } catch {
      setScreen('mislukt')
    }
  }

  async function confirm(body: Record<string, unknown>) {
    if (!intake) return

    setSubmitting(true)
    setServerError(null)

    try {
      const response = await fetch(`/api/work-order-intakes/${intake.id}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, created_by: currentUser?.id }),
      })
      const json = (await response.json()) as { id?: string; error?: string; field?: string }

      if ((response.status === 201 || response.status === 200) && json.id) {
        router.push(`/interventions/${json.id}`)
        return
      }

      if (response.status === 409 && json.id) {
        setServerError({ field: 'ticket_number', message: 'Ticket bestaat al', existingId: json.id })
        return
      }

      setServerError({ field: json.field, message: json.error ?? 'Aanmaken mislukt' })
    } catch {
      setServerError({ message: 'Geen verbinding — probeer opnieuw' })
    } finally {
      setSubmitting(false)
    }
  }

  const previewUrl = intake ? intake.normalizedPath ?? intake.originalPath : ''

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-brand-dark px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BossuytLogo />
          <div>
            <p className="font-bold text-base leading-tight tracking-wide text-white">bossuyt</p>
            <p className="text-xs leading-tight text-ink-soft">werkbon uploaden</p>
          </div>
        </div>
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-mid text-white"
        >
          ← Terug
        </button>
      </header>

      <main className="px-4 py-4 flex flex-col gap-3 pb-8">
        {error && (
          <p className="rounded-xl bg-brand-red/10 border border-brand-red px-3 py-3 text-sm font-semibold text-brand-red">
            {error}
          </p>
        )}

        {queued > 0 && screen === 'kiezen' && (
          <p className="rounded-xl bg-brand-orange/10 border border-brand-orange px-3 py-3 text-sm font-semibold text-brand-orange">
            {queued === 1 ? '1 bon wacht' : `${queued} bonnen wachten`} op een verbinding.
          </p>
        )}

        {screen === 'kiezen' && (
          <>
            <div className="rounded-xl bg-white border border-stroke shadow-sm p-4 flex flex-col gap-2">
              <p className="font-bold text-base text-ink">Werkbon uploaden</p>
              <p className="text-sm text-ink-soft">
                Maak een foto van de papieren bon, of kies een PDF. De velden worden uitgelezen
                en je krijgt ze te zien voor de werkbon in de open pool komt.
              </p>
            </div>

            <label className="w-full py-5 rounded-xl font-bold text-base bg-brand-orange text-white text-center cursor-pointer">
              Foto maken
              <input type="file" accept="image/*" capture="environment" onChange={pickFile} className="hidden" />
            </label>

            <label className="w-full py-5 rounded-xl font-bold text-base bg-white text-ink border border-stroke text-center cursor-pointer">
              Bestand kiezen (foto of PDF)
              <input type="file" accept="image/*,application/pdf" onChange={pickFile} className="hidden" />
            </label>
          </>
        )}

        {screen === 'hoeken' && photo && (
          <CornerPicker
            file={photo}
            onCancel={() => { setPhoto(null); setPhotoClientId(null); setScreen('kiezen') }}
            onDone={blob => void upload(blob, 'werkbon.jpg', 'image/jpeg', photoClientId ?? undefined)}
          />
        )}

        {screen === 'versturen' && (
          <div className="rounded-xl bg-white border border-stroke shadow-sm p-6 flex flex-col gap-2 items-center">
            <p className="font-bold text-base text-ink">De bon wordt uitgelezen…</p>
            <p className="text-sm text-ink-soft text-center">Dit duurt ongeveer tien seconden.</p>
          </div>
        )}

        {screen === 'mislukt' && intake && (
          <div className="rounded-xl bg-white border border-stroke shadow-sm p-4 flex flex-col gap-3">
            <p className="font-bold text-base text-ink">Uitlezen lukte niet</p>
            <p className="text-sm text-ink-soft">
              {intake.errorMessage ?? 'De bon kon niet gelezen worden.'} De bon zelf is wel bewaard.
            </p>
            <button
              type="button"
              onClick={() => void retryRead()}
              className="w-full py-4 rounded-xl font-bold text-base bg-brand-orange text-white"
            >
              Opnieuw proberen
            </button>
            <button
              type="button"
              onClick={() => setScreen('bevestigen')}
              className="w-full py-4 rounded-xl font-bold text-base bg-surface text-ink border border-stroke"
            >
              Zelf invullen
            </button>
          </div>
        )}

        {screen === 'bevestigen' && intake && (
          <>
            {warning && (
              <p className="rounded-xl bg-brand-orange/10 border border-brand-orange px-3 py-3 text-sm font-semibold text-brand-orange">
                {warning}
              </p>
            )}
            {serverError?.existingId && (
              <button
                type="button"
                onClick={() => router.push(`/interventions/${serverError.existingId}`)}
                className="rounded-xl bg-brand-red/10 border border-brand-red px-3 py-3 text-sm font-semibold text-brand-red text-left"
              >
                Dit ticket bestaat al — open de bestaande werkbon ›
              </button>
            )}
            <ConfirmForm
              extracted={intake.extracted ?? {}}
              sources={intake.fieldSources ?? {}}
              previewUrl={previewUrl}
              isPdf={intake.mimeType === 'application/pdf'}
              submitting={submitting}
              serverError={serverError}
              onSubmit={confirm}
            />
          </>
        )}
      </main>
    </div>
  )
}
