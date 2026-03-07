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
  { value: 'gepland',          label: 'Gepland',              color: '#6B7280', bg: '#E5E7EB' },
  { value: 'onderweg',         label: 'Onderweg',             color: '#fff',    bg: '#F28C28' },
  { value: 'bezig',            label: 'Bezig',                color: '#fff',    bg: '#4C6A85' },
  { value: 'wacht_onderdelen', label: 'Wacht op onderdelen',  color: '#fff',    bg: '#D64545' },
  { value: 'afgewerkt',        label: 'Afgewerkt',            color: '#fff',    bg: '#2E9E5B' },
]

const PRIORITY_OPTIONS = [
  { value: 'laag',    label: 'Laag',    color: '#2E9E5B' },
  { value: 'normaal', label: 'Normaal', color: '#4C6A85' },
  { value: 'hoog',    label: 'Hoog',    color: '#F28C28' },
  { value: 'dringend',label: 'Dringend',color: '#D64545' },
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
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      {/* Section header */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ backgroundColor: '#2F343A' }}>
        <div className="w-1 h-4 rounded-full" style={{ backgroundColor: '#F28C28' }} />
        <p className="font-bold text-sm tracking-wide" style={{ color: '#fff' }}>{title}</p>
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

  const currentStatus = STATUS_OPTIONS.find(s => s.value === form.status)

  return (
    <div className="flex flex-col gap-4 pb-10">

      {/* ── Info card ── */}
      <Section title="KLANT & TOESTEL">
        <div className="flex flex-col gap-1">
          <p className="font-bold text-base" style={{ color: '#1F2933' }}>{intervention.customerName}</p>
          <p className="text-sm" style={{ color: '#6B7280' }}>{intervention.siteName}</p>
          <p className="text-sm" style={{ color: '#6B7280' }}>{intervention.siteAddress}, {intervention.siteCity}</p>
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid #E5E7EB' }}>
            <p className="font-bold text-sm" style={{ color: '#1F2933' }}>
              {intervention.deviceBrand} {intervention.deviceModel}
            </p>
            {intervention.description && (
              <p className="text-sm mt-1 italic" style={{ color: '#F28C28' }}>
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
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-opacity"
              style={{
                backgroundColor: form.status === s.value ? s.bg : '#F4F6F8',
                color:           form.status === s.value ? s.color : '#6B7280',
                border:          `1px solid ${form.status === s.value ? s.bg : '#E5E7EB'}`,
              }}
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
            <div key={t.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: '#F4F6F8' }}>
              <p className="text-xs mb-1" style={{ color: '#6B7280' }}>{t.label}</p>
              <p className="text-xl font-bold" style={{ color: '#1F2933' }}>{fmtTime(t.value)}</p>
            </div>
          ))}
        </div>

        {/* Action buttons — show progressively */}
        <div className="flex flex-col gap-2">
          {!form.arrivalTime && (
            <button
              onClick={markAankomst}
              className="w-full py-3 rounded-xl font-bold text-white text-sm"
              style={{ backgroundColor: '#F28C28' }}
            >
              Aankomst registreren
            </button>
          )}
          {form.arrivalTime && !form.workStart && (
            <button
              onClick={markStartWork}
              className="w-full py-3 rounded-xl font-bold text-white text-sm"
              style={{ backgroundColor: '#4C6A85' }}
            >
              Start werk
            </button>
          )}
          {form.workStart && !form.workEnd && (
            <button
              onClick={markEndWork}
              className="w-full py-3 rounded-xl font-bold text-white text-sm"
              style={{ backgroundColor: '#2E9E5B' }}
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
          className="w-full rounded-xl p-3 text-sm resize-none outline-none"
          style={{
            backgroundColor: '#F4F6F8',
            border: '1px solid #E5E7EB',
            color: '#1F2933',
          }}
        />
      </Section>

      {/* ── Parts ── */}
      <Section title="GEBRUIKTE ONDERDELEN">
        <div className="flex flex-col gap-3">
          {form.parts.length === 0 && (
            <p className="text-sm text-center py-2" style={{ color: '#9CA3AF' }}>Nog geen onderdelen toegevoegd</p>
          )}
          {form.parts.map(part => (
            <div key={part.id} className="rounded-xl p-3 flex flex-col gap-2" style={{ backgroundColor: '#F4F6F8', border: '1px solid #E5E7EB' }}>
              <div className="flex gap-2">
                <input
                  placeholder="Artikelcode"
                  value={part.code}
                  onChange={e => updatePart(part.id, 'code', e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', color: '#1F2933' }}
                />
                <input
                  type="number"
                  min={1}
                  value={part.quantity}
                  onChange={e => updatePart(part.id, 'quantity', parseInt(e.target.value) || 1)}
                  className="w-16 rounded-lg px-3 py-2 text-sm text-center outline-none"
                  style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', color: '#1F2933' }}
                />
                <button onClick={() => removePart(part.id)} className="px-2 text-lg" style={{ color: '#D64545' }}>×</button>
              </div>
              <input
                placeholder="Omschrijving onderdeel"
                value={part.description}
                onChange={e => updatePart(part.id, 'description', e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', color: '#1F2933' }}
              />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm" style={{ color: '#6B7280' }}>
                  <input
                    type="checkbox"
                    checked={part.toOrder}
                    onChange={e => updatePart(part.id, 'toOrder', e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  Te bestellen
                </label>
                {part.toOrder && (
                  <label className="flex items-center gap-2 text-sm font-medium" style={{ color: '#D64545' }}>
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
            className="w-full py-2.5 rounded-xl text-sm font-medium"
            style={{ border: '2px dashed #E5E7EB', color: '#6B7280' }}
          >
            + Onderdeel toevoegen
          </button>
        </div>
      </Section>

      {/* ── Follow-up ── */}
      <Section title="OPVOLGACTIES">
        <div className="flex flex-col gap-3">
          {form.followUp.length === 0 && (
            <p className="text-sm text-center py-2" style={{ color: '#9CA3AF' }}>Geen opvolgacties</p>
          )}
          {form.followUp.map(f => (
            <div key={f.id} className="rounded-xl p-3 flex flex-col gap-2" style={{ backgroundColor: '#F4F6F8', border: '1px solid #E5E7EB' }}>
              <div className="flex gap-2">
                <input
                  placeholder="Beschrijving actie..."
                  value={f.description}
                  onChange={e => updateFollowUp(f.id, 'description', e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', color: '#1F2933' }}
                />
                <button onClick={() => removeFollowUp(f.id)} className="px-2 text-lg" style={{ color: '#D64545' }}>×</button>
              </div>
              <div className="flex gap-2">
                {/* Priority selector */}
                <div className="flex gap-1 flex-wrap flex-1">
                  {PRIORITY_OPTIONS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => updateFollowUp(f.id, 'priority', p.value)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: f.priority === p.value ? p.color : '#F4F6F8',
                        color:           f.priority === p.value ? '#fff' : '#6B7280',
                        border:          `1px solid ${f.priority === p.value ? p.color : '#E5E7EB'}`,
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  type="date"
                  value={f.dueDate}
                  onChange={e => updateFollowUp(f.id, 'dueDate', e.target.value)}
                  className="rounded-lg px-2 py-1 text-sm outline-none"
                  style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', color: '#1F2933' }}
                />
              </div>
            </div>
          ))}
          <button
            onClick={addFollowUp}
            className="w-full py-2.5 rounded-xl text-sm font-medium"
            style={{ border: '2px dashed #E5E7EB', color: '#6B7280' }}
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
        className="w-full py-4 rounded-xl font-bold text-white text-base disabled:opacity-60"
        style={{ backgroundColor: '#F28C28' }}
      >
        {pdfLoading ? 'PDF aanmaken...' : 'PDF Genereren & Opslaan'}
      </button>

    </div>
  )
}
