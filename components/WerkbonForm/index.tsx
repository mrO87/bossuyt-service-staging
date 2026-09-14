'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import SignaturePad from '@/components/SignaturePad'
import DevicePanel from '@/components/DevicePanel'
import { generateWerkbonPDF } from '@/lib/pdf'
import type { PdfDevice, PdfPart, ServiceBonPdfData } from '@/lib/pdf'
import { useTasks } from '@/lib/task-store'
import { queueTaskCommand } from '@/lib/tasks/sync'
import { deleteWerkbon, loadWerkbon, saveWerkbon } from '@/lib/idb'
import { chooseDraft, type DraftSide } from '@/lib/werkbon/draftMerge'
import type { Device, Intervention, DbTask, WerkbonFormState } from '@/types'
import PartsSection from './PartsSection'
import PhotoUploadSection from './PhotoUploadSection'
import TaskManager from './TaskManager'
import Section from './Section'
import BonHeaderCard from './BonHeaderCard'
import VisitSection, { type TechnicianOption } from './VisitSection'
import DevicePicker from './DevicePicker'
import { BonDeviceTabs } from './BonDeviceTabs'
import { deviceLabel, useBonDevices, type BonDevice } from './useBonDevices'
import { kindForDate, resolveInterventionKind } from '@/lib/werkbon/interventionKind'
import { todayInBelgium } from '@/lib/planning/pastDays'
import AlertNoteCard from './AlertNoteCard'

const STATUS_OPTIONS = [
  { value: 'gepland',          label: 'Gepland',               activeClass: 'bg-stroke text-ink-soft border-stroke',           inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'onderweg',         label: 'Onderweg',              activeClass: 'bg-brand-orange text-white border-brand-orange',   inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'bezig',            label: 'Bezig',                 activeClass: 'bg-brand-blue text-white border-brand-blue',       inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'wacht_onderdelen', label: 'Wacht op onderdelen',   activeClass: 'bg-brand-red text-white border-brand-red',         inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'afgewerkt',        label: 'Afgewerkt',             activeClass: 'bg-brand-green text-white border-brand-green',     inactiveClass: 'bg-surface text-ink-soft border-stroke' },
]

/**
 * De bezoekdatum waarmee een verse bon opent.
 *
 * Niet `toISOString()`: dat is UTC, en tussen middernacht en twee uur 's nachts
 * staat dat nog op gisteren. Een bon die je na een late interventie invult,
 * kreeg dan de datum van de dag ervoor — en daarmee ook de verkeerde keuze
 * tussen week en weekend, want die volgt de datum.
 */
function todayISODate(): string {
  return todayInBelgium()
}


/**
 * The technicians a fresh bon starts with: whoever is filling it in, then the
 * ones planning assigned.
 *
 * The logged-in technician comes first because they are almost always the one
 * standing at the machine, and because being first makes them the lead — the
 * name that signs. Duplicates are dropped so being both logged in and assigned
 * does not list you twice.
 */
function initialTechnicianIds(intervention: Intervention, currentUserId?: string): string[] {
  const assigned = [...intervention.technicians]
    .sort((a, b) => Number(b.isLead) - Number(a.isLead))
    .map(t => t.technicianId)

  return [...new Set([currentUserId, ...assigned].filter((id): id is string => Boolean(id)))]
}

function initialForm(intervention: Intervention, currentUserId?: string): WerkbonFormState {
  const today = todayISODate()
  const technicianIds = initialTechnicianIds(intervention, currentUserId)
  return {
    status: intervention.status,
    deviceId: intervention.deviceId,
    technicianIds,
    technicianId: technicianIds[0] ?? null,
    visitDate: today,
    arrivalTime: '',
    departureTime: '',
    interventionKind: kindForDate(today),
    interventionKindManual: false,
    tripCount: 1,
    // AANTAL PERSONEN follows who is on the bon, not who was planned.
    personCount: Math.max(1, technicianIds.length),
    notes: '',
    remarks: '',
    parts: [],
    signature: null,
  }
}

interface Props {
  intervention: Intervention
  initialActivityId?: string
}

export default function WerkbonForm({ intervention, initialActivityId }: Props) {
  const { tasks, currentUser } = useTasks()
  const werkbonId = `wb-${intervention.id}`

  const [form, setForm] = useState<WerkbonFormState>(() => initialForm(intervention, currentUser?.id))
  // All active technicians, so a colleague who came along can be added without
  // being assigned to the work order first.
  const [fetchedTechnicians, setFetchedTechnicians] = useState<TechnicianOption[]>([])
  const [alertNote, setAlertNote] = useState(intervention.alertNote ?? '')
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [pickedDevice, setPickedDevice] = useState<Device | null>(null)
  /**
   * Welk van de toestellen van deze bon je op dit moment bekijkt.
   *
   * Alleen weergave: het verslag en de onderdelen blijven aan het hoofdtoestel
   * hangen. Dit staat los van `form.deviceId` en schrijft niets weg.
   */
  const [bekekenToestel, setBekekenToestel] = useState<BonDevice | null>(null)
  /** Alle toestellen van deze bon — voor de keuzerij én voor de afgewerkte bon. */
  const bonToestellen = useBonDevices(intervention.id)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  /** Whether this half-filled bon is safe yet, and where. Separate from
   *  saveStatus, which is about submitting the finished bon. */
  const [draftStatus, setDraftStatus] =
    useState<'idle' | 'typing' | 'saved' | 'queued' | 'error'>('idle')
  const [draftNotice, setDraftNotice] = useState<string | null>(null)
  const [bonNumber, setBonNumber] = useState<string | null>(null)
  const [existingCount, setExistingCount] = useState(0)
  const [deviceRefresh, setDeviceRefresh] = useState(0)
  const [queuedPartIds, setQueuedPartIds] = useState<Set<string>>(new Set())
  const [orderTasks, setOrderTasks] = useState<DbTask[]>([])
  const [workflowTasks, setWorkflowTasks] = useState<DbTask[]>([])
  const [workflowRefresh, setWorkflowRefresh] = useState(0)
  const saveTimer = useRef<number | null>(null)
  // Set the moment the technician changes anything. Guards three separate races
  // around the IndexedDB draft — see the two effects below and handleSubmit.
  const isDirty = useRef(false)

  // Everyone who could go on this bon.
  useEffect(() => {
    let cancelled = false

    fetch('/api/technicians')
      .then(r => (r.ok ? r.json() : { technicians: [] }))
      .then((data: { technicians: Array<TechnicianOption & { role?: string }> }) => {
        // The route returns every active user, office staff included. Only
        // technicians go on a bon — the same filter the wizard's picker uses.
        if (!cancelled) setFetchedTechnicians(data.technicians.filter(t => t.role === 'technician'))
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [])

  // Offline, or while that request is still out, fall back to the technicians
  // planning assigned — a bon must always be signable. Derived at render rather
  // than copied into state: one source of truth, and no second render pass.
  const allTechnicians: TechnicianOption[] =
    fetchedTechnicians.length > 0
      ? fetchedTechnicians
      : intervention.technicians.map(t => ({ id: t.technicianId, name: t.name }))

  // ── Draft: load once, then autosave (debounced 500 ms) ──────────────────────
  //
  // Two copies now: this device and the server. Newest wins, and if the
  // server's copy sets aside something that was typed here, say so — an
  // afternoon of work must not go quietly.
  useEffect(() => {
    let cancelled = false

    async function loadDraft() {
      const local = await loadWerkbon(intervention.id).catch(() => undefined)

      let remote: DraftSide<WerkbonFormState> | null = null
      try {
        const res = await fetch(`/api/work-orders/${intervention.id}/draft`)
        if (res.ok) {
          const data = await res.json() as { draft: DraftSide<WerkbonFormState> | null }
          remote = data.draft ?? null
        }
      } catch {
        // Offline. The local copy is all there is, which is the normal case in
        // a cellar and not worth mentioning.
      }

      if (cancelled) return

      const choice = chooseDraft<WerkbonFormState>(
        local ? { form: local.form, updatedAt: local.lastSavedAt } : null,
        remote,
      )

      // If the technician started typing while we were reading, their input is
      // newer than anything we found and must win.
      if (choice.use !== 'none' && !isDirty.current) setForm(choice.draft.form)

      if (choice.use === 'remote' && choice.displaced) {
        const who = remote?.updatedBy && remote.updatedBy !== currentUser?.id
          ? ` door ${remote.updatedBy}`
          : ''
        setDraftNotice(
          `Een nieuwere versie van deze bon${who} is geladen. Wat hier nog niet ` +
          `verstuurd was, is vervangen.`,
        )
      }
    }

    loadDraft()
      .catch(() => {})
      .finally(() => { if (!cancelled) setDraftLoaded(true) })

    return () => { cancelled = true }
  }, [intervention.id, currentUser?.id])

  useEffect(() => {
    // Only save real edits. Saving an untouched form would persist initialForm
    // and let a stale local copy shadow assignment changes made on the server.
    // And once the bon is submitted the draft is gone deliberately: writing it
    // back here would resurrect it.
    if (!draftLoaded || !isDirty.current || saveStatus === 'saved') return

    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void saveWerkbon(intervention.id, form, currentUser?.id)
        .then(() => setDraftStatus(navigator.onLine ? 'saved' : 'queued'))
        .catch(() => setDraftStatus('error'))
    }, 500)

    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current) }
  }, [form, draftLoaded, saveStatus, intervention.id, currentUser?.id])

  // How many werkbonnen already exist for this work order → bon number preview "-NN".
  // Falls back to the device the technician picked on-site, so a work order that
  // arrived without one does not sit frozen at -01. This is only a preview: the
  // server assigns the authoritative number under a row lock.
  const previewDeviceId = intervention.deviceId ?? form.deviceId
  useEffect(() => {
    if (!previewDeviceId) return
    fetch(`/api/devices/${previewDeviceId}/history`)
      .then(r => (r.ok ? r.json() : []))
      .then((rows: Array<{ workOrderId: string }>) =>
        setExistingCount(rows.filter(r => r.workOrderId === intervention.id).length))
      .catch(() => {})
  }, [intervention.id, previewDeviceId, saveStatus])

  useEffect(() => {
    fetch(`/api/tasks?work_order_id=${intervention.id}`)
      .then(r => r.ok ? r.json() : { tasks: [] })
      .then((data: { tasks: DbTask[] }) => {
        const all = data.tasks ?? []
        setOrderTasks(all.filter(t => t.type === 'order_part' || t.type === 'replenish_stock'))
        setWorkflowTasks(all.filter(t => t.type === 'pick_parts' || t.type === 'load_parts' || t.type === 'plan_revisit'))
      })
      .catch(() => {})
  }, [intervention.id, queuedPartIds, workflowRefresh])

  // Poll every 10s while a load_parts task is pending (waiting for warehouse to finish pick_parts).
  // Once pick_parts is marked done, the server promotes load_parts to ready — we pick that up here.
  useEffect(() => {
    const hasPendingLoad = workflowTasks.some(t => t.type === 'load_parts' && t.status === 'pending')
    if (!hasPendingLoad) return
    const interval = setInterval(() => setWorkflowRefresh(v => v + 1), 10_000)
    return () => clearInterval(interval)
  }, [workflowTasks])

  /**
   * Every edit marks the form dirty and shows that something is being saved.
   * Set here rather than in the autosave effect: this is where the typing
   * actually happens, and an effect that calls setState on render is a
   * cascade waiting to happen.
   */
  const markEdited = useCallback(() => {
    isDirty.current = true
    setDraftStatus('typing')
  }, [])

  const update = useCallback(<K extends keyof WerkbonFormState>(field: K, value: WerkbonFormState[K]) => {
    markEdited()
    setForm(prev => ({ ...prev, [field]: value }))
  }, [markEdited])

  function addPart(toOrder: boolean) {
    markEdited()
    const part: PdfPart = { id: `p-${Date.now()}`, code: '', description: '', quantity: 1, toOrder, urgent: false }
    setForm(prev => ({ ...prev, parts: [...prev.parts, part] }))
  }

  function updatePart(id: string, field: keyof PdfPart, value: string | number | boolean) {
    markEdited()
    setForm(prev => ({ ...prev, parts: prev.parts.map(p => (p.id === id ? { ...p, [field]: value } : p)) }))
  }

  function removePart(id: string) {
    markEdited()
    setForm(prev => ({ ...prev, parts: prev.parts.filter(p => p.id !== id) }))
  }

  const handleSignature = useCallback((dataUrl: string | null) => update('signature', dataUrl), [update])

  function handleDevicePicked(device: Device) {
    setPickedDevice(device)
    update('deviceId', device.id)
  }

  const bonNumberPreview =
    bonNumber ?? `${intervention.ticketNumber ?? intervention.id}-${String(existingCount + 1).padStart(2, '0')}`
  // The TECHNICUS line of the paper bon holds one line of text, so everyone who
  // worked the visit goes on it, separated by commas, in the order they were
  // added. Names come from the full technician list because someone can be on
  // the bon without ever having been assigned to the work order.
  const technicianName = form.technicianIds
    .map(id =>
      allTechnicians.find(t => t.id === id)?.name ??
      intervention.technicians.find(t => t.technicianId === id)?.name ??
      '',
    )
    .filter(Boolean)
    .join(', ')

  /**
   * Week of weekend, zoals het op de bon moet komen.
   *
   * Dezelfde afleiding als op het scherm, zodat wat de technieker ziet en wat
   * er op de PDF en naar de server gaat niet uit elkaar kunnen lopen. Het veld
   * `interventionKind` in het formulier is nog maar een opslagplaats voor een
   * eigen keuze; wat geldt, staat hier.
   */
  function getoondeSoort() {
    return resolveInterventionKind({
      visitDate: form.visitDate,
      stored: form.interventionKind,
      manual: Boolean(form.interventionKindManual),
    })
  }

  /**
   * De toestelregels voor de afgewerkte bon.
   *
   * Alle toestellen van deze bon, met het hoofdtoestel vooraan — dat is waar
   * het verslag en de onderdelen aan hangen, en op papier hoort dat bovenaan
   * te staan.
   *
   * Kent de app er geen (een bon die met de hand is ingetikt, of een lijst die
   * nog aan het laden is), dan valt dit terug op het ene toestel dat de
   * werkbon zelf al kende. Een lege band op een afgewerkte bon zou erger zijn
   * dan een onvolledige.
   */
  function pdfDevices(): PdfDevice[] {
    if (bonToestellen.length > 0) {
      return [...bonToestellen]
        .sort((a, b) => Number(b.isMain) - Number(a.isMain))
        .map(device => ({
          unitNumber: device.unitNumber ?? '',
          description: deviceLabel(device),
          deliveryDate: device.deliveryDate ?? '',
          warrantyUntil: device.warrantyUntil ?? '',
        }))
    }

    return [{
      unitNumber: pickedDevice?.unitNumber ?? intervention.deviceUnitNumber ?? '',
      description: [
        pickedDevice?.brand ?? intervention.deviceBrand,
        pickedDevice?.model ?? intervention.deviceModel,
      ].filter(Boolean).join(' '),
      deliveryDate: pickedDevice?.deliveryDate ?? intervention.deviceDeliveryDate ?? '',
      warrantyUntil: pickedDevice?.warrantyUntil ?? intervention.deviceWarrantyUntil ?? '',
    }]
  }

  /** Single place that maps form + intervention to the Service Bon PDF input. */
  function buildPdfData(): ServiceBonPdfData {
    const invoiceNumber =
      intervention.invoiceCustomerNumber && intervention.invoiceCustomerNumber !== intervention.customerNumber
        ? intervention.invoiceCustomerNumber
        : ''

    return {
      ticketNumber: intervention.ticketNumber ?? '',
      bonNumber: bonNumberPreview,
      ticketDate: intervention.ticketDate ?? intervention.createdAt ?? '',
      customerNumber: intervention.customerNumber ?? '',
      invoiceCustomerNumber: invoiceNumber,
      customerName: intervention.customerName,
      siteAddress: intervention.siteAddress,
      siteCity: intervention.siteCity,
      contactName: intervention.contactName ?? '',
      phones: [intervention.contactPhone, ...(intervention.sitePhones ?? [])].filter((p): p is string => Boolean(p)),
      closingDay: intervention.closingDay ?? '',
      devices: pdfDevices(),
      customerDescription: intervention.description ?? '',
      technicianReport: form.notes,
      parts: form.parts,
      technicianName,
      visitDate: form.visitDate ? new Date(`${form.visitDate}T00:00:00`).toISOString() : '',
      arrivalTime: form.arrivalTime,
      departureTime: form.departureTime,
      interventionKind: getoondeSoort(),
      tripCount: form.tripCount,
      personCount: form.personCount,
      remarks: form.remarks,
      signature: form.signature,
    }
  }

  async function handleSubmit() {
    setSaving(true)
    // Cancel any queued autosave. Without this, an edit made within 500ms of
    // tapping submit fires after deleteWerkbon and writes the draft back.
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const linkedTasks = tasks.filter(task => task.werkbonId === werkbonId)

    try {
      const pdfBlob = await generateWerkbonPDF(buildPdfData())

      const fd = new FormData()
      fd.append('changedBy', form.technicianId ?? intervention.technicians[0]?.technicianId ?? '')
      if (form.technicianId) fd.append('technicianId', form.technicianId)
      fd.append('technicianIds', JSON.stringify(form.technicianIds))
      if (form.deviceId) fd.append('deviceId', form.deviceId)
      fd.append('completionNotes', form.notes)
      fd.append('remarks', form.remarks)
      fd.append('completionParts', JSON.stringify(form.parts))
      fd.append('followUp', JSON.stringify(linkedTasks))
      fd.append('visitDate', new Date(`${form.visitDate}T00:00:00`).toISOString())
      for (const key of ['arrivalTime', 'departureTime'] as const) {
        if (form[key]) fd.append(key, form[key])
      }
      fd.append('interventionKind', getoondeSoort())
      fd.append('tripCount', String(form.tripCount))
      fd.append('personCount', String(form.personCount))
      if (form.signature) fd.append('signature', form.signature)
      fd.append('pdf', pdfBlob, `servicebon-${intervention.id}.pdf`)

      const res = await fetch(`/api/work-orders/${intervention.id}/complete`, { method: 'POST', body: fd })

      if (res.ok) {
        const json = (await res.json()) as { bonNumber: string }
        setBonNumber(json.bonNumber)
        setSaveStatus('saved')
        setDeviceRefresh(current => current + 1)
        isDirty.current = false
        await deleteWerkbon(intervention.id)
        setDraftStatus('idle')
        // The draft has served its purpose; leaving it on the server would let
        // a half-filled version of a submitted bon reappear on another device.
        await fetch(`/api/work-orders/${intervention.id}/draft`, { method: 'DELETE' })
          .catch(() => {})

        for (const part of form.parts) {
          await queueTaskCommand('/api/tasks', 'POST', {
            work_order_id: intervention.id,
            // A part taken from stock is a refill, not a purchase. Keeping both
            // as order_part put refills in the warehouse's order queue and, worse,
            // exported them to the ERP as pending supplier orders for parts that
            // were already fitted.
            type: part.toOrder ? 'order_part' : 'replenish_stock',
            role: 'warehouse',
            title: part.toOrder
              ? `Bestellen: ${part.description || part.code || 'onderdeel'}`
              : `Stock aanvullen: ${part.description || part.code || 'onderdeel'}`,
            payload: {
              part_number: part.code,
              description: part.description,
              quantity:    part.quantity,
              urgency:     part.urgent ? 'urgent' : 'normal',
              order_type:  part.toOrder ? 'supplier_order' : 'stock_replenish',
            },
            client_id: part.id,
          })
        }

        if (form.parts.length > 0) {
          setQueuedPartIds(new Set(form.parts.map(p => p.id)))
        }
      } else {
        console.error('Complete route error:', res.status, await res.text())
        setSaveStatus('error')
      }
    } catch (err) {
      console.error('Submit error:', err)
      setSaveStatus('error')
    }

    setSaving(false)
  }

  const deviceKnown = Boolean(form.deviceId)

  return (
    <div className="flex flex-col gap-4 pb-10">
      {/* First thing on the bon, above the header: this is what changes what the
          technician does next, and reading it after driving out is too late. */}
      {alertNote && (
        <AlertNoteCard
          note={alertNote}
          noteBy={intervention.alertNoteBy}
          currentUserId={currentUser?.id ?? ''}
          workOrderId={intervention.id}
          onChange={next => setAlertNote(next ?? '')}
        />
      )}

      {/* What was typed here is only really safe once it has left the phone.
          Saying which of the two it is costs one line and answers the question
          a technician would otherwise have to guess at. */}
      {draftNotice && (
        <div className="rounded-xl border border-brand-orange/40 bg-brand-orange/10 px-3 py-2">
          <p className="text-xs text-ink">{draftNotice}</p>
          <button
            type="button"
            onClick={() => setDraftNotice(null)}
            className="mt-1 text-[11px] font-semibold text-brand-orange active:opacity-70"
          >
            Begrepen
          </button>
        </div>
      )}

      {draftStatus !== 'idle' && saveStatus !== 'saved' && (
        <p className="px-1 text-[11px] text-ink-soft flex items-center gap-1.5">
          <span
            aria-hidden
            className={[
              'inline-block w-2 h-2 rounded-full',
              draftStatus === 'saved' ? 'bg-brand-green'
                : draftStatus === 'queued' ? 'bg-brand-orange'
                : draftStatus === 'error' ? 'bg-brand-red'
                : 'bg-stroke',
            ].join(' ')}
          />
          {draftStatus === 'typing' && 'Bewaren…'}
          {draftStatus === 'saved' && 'Bewaard'}
          {draftStatus === 'queued' && 'Bewaard op dit toestel — wacht op verbinding'}
          {draftStatus === 'error' && 'Kon niet bewaren'}
        </p>
      )}

      <BonHeaderCard intervention={intervention} bonNumberPreview={bonNumberPreview} />

      <div className="flex flex-wrap gap-2 px-1">
        {STATUS_OPTIONS.map(s => (
          <button
            key={s.value}
            type="button"
            onClick={() => update('status', s.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              form.status === s.value ? s.activeClass : s.inactiveClass
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {deviceKnown ? (
        <>
          {/*
            De andere toestellen van deze bon. Kiezen verandert alleen wat je
            ziet — het verslag en de onderdelen blijven aan het hoofdtoestel
            hangen, en dat staat er ook bij.
          */}
          <BonDeviceTabs
            devices={bonToestellen}
            selectedId={bekekenToestel?.id ?? form.deviceId}
            onSelect={setBekekenToestel}
          />
          <DevicePanel
            deviceId={bekekenToestel?.id ?? form.deviceId}
            brand={bekekenToestel?.brand ?? pickedDevice?.brand ?? intervention.deviceBrand}
            model={bekekenToestel?.model ?? pickedDevice?.model ?? intervention.deviceModel}
            refreshKey={deviceRefresh}
          />
        </>
      ) : (
        <DevicePicker
          siteId={intervention.siteId}
          customerId={intervention.customerId}
          onPick={handleDevicePicked}
        />
      )}

      <Section title="OMSCHRIJVING KLANT | OBSERVATIONS CLIENT">
        <p className="text-sm text-ink whitespace-pre-wrap">{intervention.description || '—'}</p>
      </Section>

      <Section title="TECHNICUS RAPPORT | RAPPORT TECHNICIEN">
        <textarea
          rows={5}
          placeholder="Wat heb je vastgesteld en gedaan?"
          value={form.notes}
          onChange={e => update('notes', e.target.value)}
          className="w-full rounded-xl p-3 text-sm resize-none outline-none bg-surface border border-stroke text-ink"
        />
      </Section>

      <PartsSection
        parts={form.parts}
        onAddPart={addPart}
        onUpdatePart={updatePart}
        onRemovePart={removePart}
        queuedPartIds={queuedPartIds}
      />

      <VisitSection form={form} technicians={allTechnicians} onChange={update} />

      <Section title="OPMERKINGEN | REMARQUES">
        <textarea
          rows={3}
          placeholder="Opmerkingen voor kantoor of volgende technieker"
          value={form.remarks}
          onChange={e => update('remarks', e.target.value)}
          className="w-full rounded-xl p-3 text-sm resize-none outline-none bg-surface border border-stroke text-ink"
        />
      </Section>

      <PhotoUploadSection workOrderId={intervention.id} technicianId={form.technicianId} />

      <TaskManager
        intervention={intervention}
        werkbonId={werkbonId}
        orderTasks={orderTasks}
        workflowTasks={workflowTasks}
        onWorkflowTaskComplete={() => setWorkflowRefresh(r => r + 1)}
        initialActivityId={initialActivityId}
      />

      <Section title="AKKOORD VAN KLANT | ACCORD DU CLIENT">
        <SignaturePad signature={form.signature} onSignatureChange={handleSignature} />
        {technicianName && <p className="mt-2 text-xs text-ink-soft">Technicus: {technicianName}</p>}
      </Section>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving || saveStatus === 'saved'}
        className="w-full py-4 rounded-xl font-bold text-white text-base disabled:opacity-60 bg-brand-orange"
      >
        {saving ? 'Bon afsluiten...' : saveStatus === 'saved' ? '✓ Bon afgesloten' : 'Bon afsluiten & PDF'}
      </button>

      {saveStatus === 'saved' && bonNumber && (
        <p className="text-center text-sm font-semibold text-brand-green">✓ Service bon {bonNumber} opgeslagen</p>
      )}
      {saveStatus === 'error' && (
        <p className="text-center text-sm font-semibold text-brand-red">✗ Opslaan mislukt — probeer opnieuw</p>
      )}
    </div>
  )
}
