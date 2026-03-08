'use client'

import { useState, useCallback } from 'react'
import SignaturePad from '@/components/SignaturePad'
import { generateWerkbonPDF } from '@/lib/pdf'
import type { PdfPart, PdfFollowUp } from '@/lib/pdf'
import type { Intervention } from '@/types'

// Local state shape for the form
interface FormState {
  status: string
  arrivalTime: string
  workStart: string
  workEnd: string
  description: string
  parts: PdfPart[]
  followUp: PdfFollowUp[]
  signature: string | null
}

const STATUS_OPTIONS = [
  { value: 'gepland',          label: 'Gepland',             activeClass: 'bg-stroke text-ink-soft border-stroke',                inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'onderweg',         label: 'Onderweg',            activeClass: 'bg-brand-orange text-white border-brand-orange',       inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'bezig',            label: 'Bezig',               activeClass: 'bg-brand-blue text-white border-brand-blue',           inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'wacht_onderdelen', label: 'Wacht op onderdelen', activeClass: 'bg-brand-red text-white border-brand-red',             inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'afgewerkt',        label: 'Afgewerkt',           activeClass: 'bg-brand-green text-white border-brand-green',         inactiveClass: 'bg-surface text-ink-soft border-stroke' },
]

const PRIORITY_OPTIONS = [
  { value: 'laag',     label: 'Laag',     activeClass: 'bg-brand-green text-white border-brand-green',   inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'normaal',  label: 'Normaal',  activeClass: 'bg-brand-blue text-white border-brand-blue',     inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'hoog',     label: 'Hoog',     activeClass: 'bg-brand-orange text-white border-brand-orange', inactiveClass: 'bg-surface text-ink-soft border-stroke' },
  { value: 'dringend', label: 'Dringend', activeClass: 'bg-brand-red text-white border-brand-red',       inactiveClass: 'bg-surface text-ink-soft border-stroke' },
]

function now() {
  return new Date().toISOString()
}

function fmtTime(iso: string) {
  if (!iso) return '--:--'
  return new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
}

// Reusable section wrapper
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden bg-white border border-stroke shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 bg-brand-dark">
        <div className="w-1 h-4 rounded-full bg-brand-orange" />
        <p className="font-bold text-sm tracking-wide text-white">{title}</p>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}

interface Props {
  intervention: Intervention
}

export default function WerkbonForm({ intervention }: Props) {
  const [form, setForm] = useState<FormState>({
    status:      intervention.status,
    arrivalTime: '',
    workStart:   '',
    workEnd:     '',
    description: '',
    parts:       [],
    followUp:    [],
    signature:   null,
  })
  const [pdfLoading, setPdfLoading] = useState(false)

  // Generic updater for simple fields
  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // Time buttons
  function markAankomst() {
    setForm(prev => ({ ...prev, arrivalTime: now(), status: 'bezig' }))
  }
  function markStartWork() {
    setForm(prev => ({ ...prev, workStart: now() }))
  }
  function markEndWork() {
    setForm(prev => ({ ...prev, workEnd: now(), status: 'afgewerkt' }))
  }

  // Parts
  function addPart() {
    const part: PdfPart = { id: `p-${Date.now()}`, code: '', description: '', quantity: 1, toOrder: false, urgent: false }
    setForm(prev => ({ ...prev, parts: [...prev.parts, part] }))
  }
  function updatePart(id: string, field: keyof PdfPart, value: string | number | boolean) {
    setForm(prev => ({
      ...prev,
      parts: prev.parts.map(p => p.id === id ? { ...p, [field]: value } : p)
    }))
  }
  function removePart(id: string) {
    setForm(prev => ({ ...prev, parts: prev.parts.filter(p => p.id !== id) }))
  }

  // Follow-up
  function addFollowUp() {
    const f: PdfFollowUp = { id: `f-${Date.now()}`, description: '', priority: 'normaal', dueDate: '' }
    setForm(prev => ({ ...prev, followUp: [...prev.followUp, f] }))
  }
  function updateFollowUp(id: string, field: keyof PdfFollowUp, value: string) {
    setForm(prev => ({
      ...prev,
      followUp: prev.followUp.map(f => f.id === id ? { ...f, [field]: value } : f)
    }))
  }
  function removeFollowUp(id: string) {
    setForm(prev => ({ ...prev, followUp: prev.followUp.filter(f => f.id !== id) }))
  }

  // Signature
  const handleSignature = useCallback((dataUrl: string | null) => {
    setForm(prev => ({ ...prev, signature: dataUrl }))
  }, [])

  // PDF
  async function handlePDF() {
    setPdfLoading(true)
    await new Promise(r => setTimeout(r, 200))
    try {
      generateWerkbonPDF({
        customerName: intervention.customerName,
        siteName:     intervention.siteName,
        siteAddress:  intervention.siteAddress,
        siteCity:     intervention.siteCity,
        deviceBrand:  intervention.deviceBrand  || '',
        deviceModel:  intervention.deviceModel  || '',
        status:       form.status,
        arrivalTime:  form.arrivalTime,
        workStart:    form.workStart,
        workEnd:      form.workEnd,
        description:  form.description,
        parts:        form.parts,
        followUp:     form.followUp,
        signature:    form.signature,
      })
    } catch (err) {
      console.error('PDF error:', err)
    }
    setPdfLoading(false)
  }

  return (
    <div className="flex flex-col gap-4 pb-10">

      {/* ── Info card ── */}
      <Section title="KLANT & TOESTEL">
        <div className="flex flex-col gap-1">
          <p className="font-bold text-base text-ink">{intervention.customerName}</p>
          <p className="text-sm text-ink-soft">{intervention.siteName}</p>
          <p className="text-sm text-ink-soft">{intervention.siteAddress}, {intervention.siteCity}</p>
          <div className="mt-2 pt-2 border-t border-stroke">
            <p className="font-bold text-sm text-ink">
              {intervention.deviceBrand} {intervention.deviceModel}
            </p>
            {intervention.description && (
              <p className="text-sm mt-1 italic text-brand-orange">
                Melding: {intervention.description}
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* ── Status ── */}
      <Section title="STATUS">
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s.value}
              onClick={() => update('status', s.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-opacity border ${form.status === s.value ? s.activeClass : s.inactiveClass}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Time registration ── */}
      <Section title="TIJDREGISTRATIE">
        {/* Time display boxes */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Aankomst',   value: form.arrivalTime },
            { label: 'Werk start', value: form.workStart },
            { label: 'Werk einde', value: form.workEnd },
          ].map(t => (
            <div key={t.label} className="rounded-xl p-3 text-center bg-surface">
              <p className="text-xs mb-1 text-ink-soft">{t.label}</p>
              <p className="text-xl font-bold text-ink">{fmtTime(t.value)}</p>
            </div>
          ))}
        </div>

        {/* Action buttons — show progressively */}
        <div className="flex flex-col gap-2">
          {!form.arrivalTime && (
            <button
              onClick={markAankomst}
              className="w-full py-3 rounded-xl font-bold text-white text-sm bg-brand-orange"
            >
              Aankomst registreren
            </button>
          )}
          {form.arrivalTime && !form.workStart && (
            <button
              onClick={markStartWork}
              className="w-full py-3 rounded-xl font-bold text-white text-sm bg-brand-blue"
            >
              Start werk
            </button>
          )}
          {form.workStart && !form.workEnd && (
            <button
              onClick={markEndWork}
              className="w-full py-3 rounded-xl font-bold text-white text-sm bg-brand-green"
            >
              Werk beëindigen
            </button>
          )}
        </div>
      </Section>

      {/* ── Work description ── */}
      <Section title="OMSCHRIJVING WERKZAAMHEDEN">
        <textarea
          rows={5}
          placeholder="Beschrijf de uitgevoerde werkzaamheden..."
          value={form.description}
          onChange={e => update('description', e.target.value)}
          className="w-full rounded-xl p-3 text-sm resize-none outline-none bg-surface border border-stroke text-ink"
        />
      </Section>

      {/* ── Parts ── */}
      <Section title="GEBRUIKTE ONDERDELEN">
        <div className="flex flex-col gap-3">
          {form.parts.length === 0 && (
            <p className="text-sm text-center py-2 text-ink-faint">Nog geen onderdelen toegevoegd</p>
          )}
          {form.parts.map(part => (
            <div key={part.id} className="rounded-xl p-3 flex flex-col gap-2 bg-surface border border-stroke">
              <div className="flex gap-2">
                <input
                  placeholder="Artikelcode"
                  value={part.code}
                  onChange={e => updatePart(part.id, 'code', e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none bg-white border border-stroke text-ink"
                />
                <input
                  type="number"
                  min={1}
                  value={part.quantity}
                  onChange={e => updatePart(part.id, 'quantity', parseInt(e.target.value) || 1)}
                  className="w-16 rounded-lg px-3 py-2 text-sm text-center outline-none bg-white border border-stroke text-ink"
                />
                <button onClick={() => removePart(part.id)} className="px-2 text-lg text-brand-red">×</button>
              </div>
              <input
                placeholder="Omschrijving onderdeel"
                value={part.description}
                onChange={e => updatePart(part.id, 'description', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none bg-white border border-stroke text-ink"
              />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-ink-soft">
                  <input
                    type="checkbox"
                    checked={part.toOrder}
                    onChange={e => updatePart(part.id, 'toOrder', e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  Te bestellen
                </label>
                {part.toOrder && (
                  <label className="flex items-center gap-2 text-sm font-medium text-brand-red">
                    <input
                      type="checkbox"
                      checked={part.urgent}
                      onChange={e => updatePart(part.id, 'urgent', e.target.checked)}
                      className="w-4 h-4 rounded"
                    />
                    Dringend
                  </label>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={addPart}
            className="w-full py-2.5 rounded-xl text-sm font-medium border-2 border-dashed border-stroke text-ink-soft"
          >
            + Onderdeel toevoegen
          </button>
        </div>
      </Section>

      {/* ── Follow-up ── */}
      <Section title="OPVOLGACTIES">
        <div className="flex flex-col gap-3">
          {form.followUp.length === 0 && (
            <p className="text-sm text-center py-2 text-ink-faint">Geen opvolgacties</p>
          )}
          {form.followUp.map(f => (
            <div key={f.id} className="rounded-xl p-3 flex flex-col gap-2 bg-surface border border-stroke">
              <div className="flex gap-2">
                <input
                  placeholder="Beschrijving actie..."
                  value={f.description}
                  onChange={e => updateFollowUp(f.id, 'description', e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none bg-white border border-stroke text-ink"
                />
                <button onClick={() => removeFollowUp(f.id)} className="px-2 text-lg text-brand-red">×</button>
              </div>
              <div className="flex gap-2">
                {/* Priority selector */}
                <div className="flex gap-1 flex-wrap flex-1">
                  {PRIORITY_OPTIONS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => updateFollowUp(f.id, 'priority', p.value)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border ${f.priority === p.value ? p.activeClass : p.inactiveClass}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  type="date"
                  value={f.dueDate}
                  onChange={e => updateFollowUp(f.id, 'dueDate', e.target.value)}
                  className="rounded-lg px-2 py-1 text-sm outline-none bg-white border border-stroke text-ink"
                />
              </div>
            </div>
          ))}
          <button
            onClick={addFollowUp}
            className="w-full py-2.5 rounded-xl text-sm font-medium border-2 border-dashed border-stroke text-ink-soft"
          >
            + Opvolgactie toevoegen
          </button>
        </div>
      </Section>

      {/* ── Signature ── */}
      <Section title="HANDTEKENING KLANT">
        <SignaturePad signature={form.signature} onSignatureChange={handleSignature} />
      </Section>

      {/* ── PDF button ── */}
      <button
        onClick={handlePDF}
        disabled={pdfLoading}
        className="w-full py-4 rounded-xl font-bold text-white text-base disabled:opacity-60 bg-brand-orange"
      >
        {pdfLoading ? 'PDF aanmaken...' : 'PDF Genereren & Opslaan'}
      </button>

    </div>
  )
}
