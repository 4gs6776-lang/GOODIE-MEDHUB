import { useEffect, useMemo, useState } from 'react'
import '../theme/marChart.css'

// ============================================================
// PREMIUM MEDICATION ADMINISTRATION CHART (MAR)
// ------------------------------------------------------------
// A clinical, print-ready document — always white/navy regardless
// of the app's dark theme, exactly 8 columns, exactly 15 rows per
// page, with dynamic pagination that never loses or duplicates a
// record across pages. Data lives in the same 'patient_drug_charts'
// offline table every other tab already reads/writes; this file
// only adds two optional fields to that table: next_dose and sign.
// ============================================================

const ROUTE_CODES = ['PO', 'IV', 'IM', 'SC', 'PR', 'SL', 'Top', 'Inh', 'Other']
const FREQUENCY_CODES = ['STAT', 'OD', 'BD', 'TDS', 'QID', 'QDS', 'PRN', 'Nocte', 'Weekly']
const ROWS_PER_PAGE = 15

function emptyMedForm(){
  const now = new Date()
  return {
    id: null,
    entry_date: now.toISOString().slice(0, 10),
    entry_time: now.toTimeString().slice(0, 5),
    drug_name: '',
    dosage: '',
    next_dose: '',
    route: '',
    frequency: '',
    sign: '',
  }
}

function escapeHtml(s){
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export default function MedicationChart({ patient, entries, admissionRequest, latestConsultation, profile, hospitalName, addEntry, updateEntry, deleteEntry, updatePatient, showToast }){
  // Chart order is chronological — oldest entry first, like a real paper MAR sheet.
  const sorted = useMemo(
    () => [...entries].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [entries]
  )

  const pageCount = Math.max(1, Math.ceil(sorted.length / ROWS_PER_PAGE))
  const [page, setPage] = useState(1)

  // If records are added/removed elsewhere and the current page no
  // longer exists, snap back to the last real page instead of showing blank.
  useEffect(() => {
    setPage(p => Math.min(Math.max(p, 1), pageCount))
  }, [pageCount])

  const pageEntries = sorted.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)
  const emptyRowCount = Math.max(0, ROWS_PER_PAGE - pageEntries.length)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyMedForm)
  const [saving, setSaving] = useState(false)

  const derivedDiagnosis = admissionRequest?.diagnosis
    || (latestConsultation?.diagnoses || []).map(d => d.label).join(', ')
    || ''
  const derivedConsultant = admissionRequest?.doctor_name || ''

  // Editable header fields — seeded from whatever the app already knows,
  // but a nurse can override/fill them in directly on the chart. Saved
  // back onto the patient record so they persist next time this opens.
  const [header, setHeader] = useState({
    ward: patient.ward || admissionRequest?.requested_ward || '',
    bed: patient.bed || '',
    diagnosis: patient.diagnosis || derivedDiagnosis,
    consultant: patient.consultant || derivedConsultant,
    allergies: patient.allergies || '',
  })

  function set(key, value){ setForm(f => ({ ...f, [key]: value })) }

  function openAddForm(){
    setForm(emptyMedForm())
    setShowForm(true)
  }

  function openEditForm(entry){
    setForm({
      id: entry.id,
      entry_date: entry.entry_date || '',
      entry_time: entry.entry_time ? entry.entry_time.slice(0, 5) : '',
      drug_name: entry.drug_name || '',
      dosage: entry.dosage || '',
      next_dose: entry.next_dose ? entry.next_dose.slice(0, 5) : '',
      route: entry.route || '',
      frequency: entry.frequency || '',
      sign: entry.sign || '',
    })
    setShowForm(true)
  }

  async function handleSubmit(e){
    e.preventDefault()
    if (!form.drug_name.trim()) { showToast('Medication name is required'); return }
    setSaving(true)
    try {
      const payload = {
        patient_id: patient.id,
        entry_date: form.entry_date || null,
        entry_time: form.entry_time || null,
        drug_name: form.drug_name,
        dosage: form.dosage || null,
        next_dose: form.next_dose || null,
        route: form.route || null,
        frequency: form.frequency || null,
        sign: form.sign || null,
        created_by: profile?.id || null,
      }
      if (form.id) {
        await updateEntry(form.id, payload)
        showToast('Medication record updated')
      } else {
        await addEntry(payload)
        showToast('Medication added to chart')
        // Jump to whichever page the new record will land on.
        setPage(Math.ceil((sorted.length + 1) / ROWS_PER_PAGE))
      }
      setShowForm(false)
    } catch (err) {
      showToast(err.message || 'Could not save medication')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(entry){
    if (!confirm(`Remove ${entry.drug_name} from this chart?`)) return
    await deleteEntry(entry.id)
    showToast('Entry removed')
  }

  function setHeaderField(key, value){
    setHeader(h => ({ ...h, [key]: value }))
  }

  async function commitHeaderField(key, value){
    if (!updatePatient) return
    try { await updatePatient(patient.id, { [key]: value || null }) } catch { /* best-effort */ }
  }

  const age = patient.age ?? (
    patient.date_of_birth
      ? Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000))
      : null
  )

  const dateAdmitted = admissionRequest?.created_at
    ? new Date(admissionRequest.created_at).toLocaleDateString()
    : (patient.created_at ? new Date(patient.created_at).toLocaleDateString() : '')

  // ---------------------------------------------------------
  // PRINT — builds a standalone document covering EVERY chart
  // page (not just the one on screen), 15 rows per physical
  // page, A4 landscape, and opens the browser print dialog on
  // it in a separate window so nothing from the dark dashboard
  // shell ever bleeds into the printout.
  // ---------------------------------------------------------
  function handlePrint(){
    const totalPages = pageCount
    const printHospitalName = hospitalName || 'HOSPITAL MEDICATION CHART'
    const patientInfoHtml = `
      <div class="p-grid">
        ${marInfoCellHtml('Patient Name', patient.full_name)}
        ${marInfoCellHtml('Hospital Number', patient.hospital_number)}
        ${marInfoCellHtml('Age', age != null ? `${age} yrs` : '')}
        ${marInfoCellHtml('Sex', patient.gender)}
        ${marInfoCellHtml('Ward', header.ward)}
        ${marInfoCellHtml('Bed', header.bed)}
        ${marInfoCellHtml('Diagnosis', header.diagnosis, true)}
        ${marInfoCellHtml('Consultant/Doctor', header.consultant)}
        ${marInfoCellHtml('Date Admitted', dateAdmitted)}
        ${marInfoCellHtml('Allergies', header.allergies, true)}
      </div>`

    const pagesHtml = Array.from({ length: totalPages }).map((_, pIdx) => {
      const rows = sorted.slice(pIdx * ROWS_PER_PAGE, (pIdx + 1) * ROWS_PER_PAGE)
      const filledRowsHtml = rows.map(e => `
        <tr>
          <td>${escapeHtml(e.entry_date || '')}</td>
          <td>${escapeHtml((e.entry_time || '').slice(0, 5))}</td>
          <td class="med-cell">${escapeHtml(e.drug_name)}</td>
          <td>${escapeHtml(e.dosage || '')}</td>
          <td>${escapeHtml((e.next_dose || '').slice(0, 5))}</td>
          <td>${escapeHtml(e.route || '')}</td>
          <td>${escapeHtml(e.frequency || '')}</td>
          <td>${escapeHtml(e.sign || '')}</td>
        </tr>`).join('')
      const emptyRows = Math.max(0, ROWS_PER_PAGE - rows.length)
      const emptyRowsHtml = Array.from({ length: emptyRows }).map(() => `
        <tr class="empty-row"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('')

      return `
        <section class="mar-page">
          <div class="mar-hospital-name">${escapeHtml(printHospitalName)}</div>
          <div class="mar-doc-title">MEDICATION ADMINISTRATION CHART (MAR)</div>
          ${patientInfoHtml}
          <table>
            <thead>
              <tr>
                <th style="width:8%">Date</th>
                <th style="width:7%">Time</th>
                <th style="width:25%">Medication Given</th>
                <th style="width:11%">Dosage</th>
                <th style="width:9%">Next Dose</th>
                <th style="width:8%">Route</th>
                <th style="width:10%">Frequency</th>
                <th style="width:13%">Sign</th>
              </tr>
            </thead>
            <tbody>${filledRowsHtml}${emptyRowsHtml}</tbody>
          </table>
          <div class="mar-footer">Page ${pIdx + 1} of ${totalPages}</div>
        </section>`
    }).join('')

    const html = `
      <html>
      <head>
        <title>MAR — ${escapeHtml(patient.full_name)}</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; color: #14202B; background: #fff; }
          @page { size: A4 landscape; margin: 10mm; }
          .mar-page { page-break-after: always; padding: 4mm 2mm; }
          .mar-page:last-child { page-break-after: auto; }
          .mar-hospital-name { font-size: 16px; font-weight: 800; letter-spacing: 0.5px; color: #0C2E4E; }
          .mar-doc-title { font-size: 11.5px; font-weight: 700; letter-spacing: 1.5px; color: #4C6577; margin-bottom: 8px; text-transform: uppercase; }
          .p-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px 16px; padding: 8px 10px; margin-bottom: 10px; background: #F4F7FA; border: 1px solid #DCE4EB; border-radius: 4px; }
          .p-cell { font-size: 10.5px; }
          .p-cell b { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.5px; color: #64798C; font-weight: 700; }
          .p-cell span { font-weight: 700; color: #14202B; }
          .p-cell.wide { grid-column: span 2; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td { border: 1px solid #B9C4CD; padding: 6px 7px; text-align: left; font-size: 10.5px; word-wrap: break-word; }
          th { background: #0C2E4E; color: #fff; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; }
          td { height: 24px; }
          .med-cell { font-weight: 600; }
          .empty-row td { color: transparent; }
          .mar-footer { text-align: right; font-size: 9.5px; color: #64798C; margin-top: 6px; }
        </style>
      </head>
      <body>${pagesHtml}</body>
      </html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  return (
    <div className="mar-chart">
      <div className="mar-toolbar">
        <button type="button" className="mar-btn mar-btn-primary" onClick={openAddForm}>+ Add Medication</button>
        <button type="button" className="mar-btn mar-btn-ghost" onClick={handlePrint}>🖨 Print Chart</button>
      </div>

      <div className="mar-document">
        <div className="mar-header">
          <div className="mar-hospital-name">{hospitalName || 'HOSPITAL MEDICATION CHART'}</div>
          <div className="mar-doc-title">Medication Administration Chart (MAR)</div>
        </div>

        <div className="mar-patient-grid">
          <MarField label="Patient Name" value={patient.full_name} />
          <MarField label="Hospital Number" value={patient.hospital_number} />
          <MarField label="Age" value={age != null ? `${age} yrs` : ''} />
          <MarField label="Sex" value={patient.gender} />
          <MarField label="Ward" value={header.ward} editable onChange={v => setHeaderField('ward', v)} onBlurCommit={v => commitHeaderField('ward', v)} />
          <MarField label="Bed" value={header.bed} editable onChange={v => setHeaderField('bed', v)} onBlurCommit={v => commitHeaderField('bed', v)} />
          <MarField label="Diagnosis" value={header.diagnosis} editable wide onChange={v => setHeaderField('diagnosis', v)} onBlurCommit={v => commitHeaderField('diagnosis', v)} />
          <MarField label="Consultant / Doctor" value={header.consultant} editable onChange={v => setHeaderField('consultant', v)} onBlurCommit={v => commitHeaderField('consultant', v)} />
          <MarField label="Date Admitted" value={dateAdmitted} />
          <MarField label="Allergies" value={header.allergies} editable wide danger={!!header.allergies} onChange={v => setHeaderField('allergies', v)} onBlurCommit={v => commitHeaderField('allergies', v)} />
        </div>

        <div className="mar-table-scroll">
          <table className="mar-table">
            <thead>
              <tr>
                <th style={{ width: '8%' }}>Date</th>
                <th style={{ width: '7%' }}>Time</th>
                <th style={{ width: '24%' }}>Medication Given</th>
                <th style={{ width: '11%' }}>Dosage</th>
                <th style={{ width: '9%' }}>Next Dose</th>
                <th style={{ width: '8%' }}>Route</th>
                <th style={{ width: '10%' }}>Frequency</th>
                <th style={{ width: '13%' }}>Sign</th>
                <th style={{ width: '10%' }}></th>
              </tr>
            </thead>
            <tbody>
              {pageEntries.map(e => (
                <tr key={e.id} className="mar-row-filled" onClick={() => openEditForm(e)}>
                  <td>{e.entry_date || ''}</td>
                  <td>{e.entry_time ? e.entry_time.slice(0, 5) : ''}</td>
                  <td className="mar-med-cell">{e.drug_name}</td>
                  <td>{e.dosage || ''}</td>
                  <td>{e.next_dose ? e.next_dose.slice(0, 5) : ''}</td>
                  <td>{e.route || ''}</td>
                  <td>{e.frequency || ''}</td>
                  <td>{e.sign || ''}</td>
                  <td>
                    <button
                      type="button"
                      className="mar-row-delete"
                      onClick={ev => { ev.stopPropagation(); handleDelete(e) }}
                      title="Remove entry"
                    >✕</button>
                  </td>
                </tr>
              ))}
              {Array.from({ length: emptyRowCount }).map((_, i) => (
                <tr key={`empty-${i}`} className="mar-row-empty">
                  <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mar-doc-footer">Page {page} of {pageCount}</div>
      </div>

      <div className="mar-pagination">
        <button type="button" className="mar-page-btn" disabled={page === 1} onClick={() => setPage(1)}>« First</button>
        <button type="button" className="mar-page-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹ Previous</button>
        <span className="mar-page-indicator">Page {page} of {pageCount}</span>
        <button type="button" className="mar-page-btn" disabled={page === pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>Next ›</button>
        <button type="button" className="mar-page-btn" disabled={page === pageCount} onClick={() => setPage(pageCount)}>Last »</button>
      </div>

      {showForm && (
        <div className="mar-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <form className="mar-modal" onSubmit={handleSubmit}>
            <div className="mar-modal-title">{form.id ? 'Edit Medication' : 'Add Medication'}</div>
            <div className="mar-modal-grid">
              <div className="mar-field"><label>Date</label><input type="date" value={form.entry_date} onChange={e => set('entry_date', e.target.value)} required /></div>
              <div className="mar-field"><label>Time</label><input type="time" value={form.entry_time} onChange={e => set('entry_time', e.target.value)} required /></div>
              <div className="mar-field mar-field-wide"><label>Medication Given</label><input value={form.drug_name} onChange={e => set('drug_name', e.target.value)} placeholder="e.g. Paracetamol 1g" autoFocus /></div>
              <div className="mar-field"><label>Dosage</label><input value={form.dosage} onChange={e => set('dosage', e.target.value)} placeholder="e.g. 500mg" /></div>
              <div className="mar-field"><label>Next Dose</label><input type="time" value={form.next_dose} onChange={e => set('next_dose', e.target.value)} /></div>
              <div className="mar-field">
                <label>Route</label>
                <select value={form.route} onChange={e => set('route', e.target.value)}>
                  <option value="">—</option>
                  {ROUTE_CODES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="mar-field">
                <label>Frequency</label>
                <select value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                  <option value="">—</option>
                  {FREQUENCY_CODES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="mar-field"><label>Sign / Initials</label><input value={form.sign} onChange={e => set('sign', e.target.value.toUpperCase())} placeholder="e.g. RN-GA" maxLength={12} /></div>
            </div>
            <div className="mar-modal-actions">
              <button type="button" className="mar-btn mar-btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="mar-btn mar-btn-primary" disabled={saving}>{saving ? 'Saving…' : form.id ? 'Update' : 'Add Medication'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function marInfoCellHtml(label, value, wide){
  return `<div class="p-cell${wide ? ' wide' : ''}"><b>${escapeHtml(label)}</b><span>${escapeHtml(value) || '—'}</span></div>`
}

function MarField({ label, value, editable, onChange, onBlurCommit, wide, danger }){
  return (
    <div className={`mar-info-field${wide ? ' mar-info-wide' : ''}`}>
      <div className="mar-info-label">{label}</div>
      {editable ? (
        <input
          className={`mar-info-input${danger ? ' mar-info-danger' : ''}`}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          onBlur={e => onBlurCommit && onBlurCommit(e.target.value)}
          placeholder="—"
        />
      ) : (
        <div className="mar-info-value">{value || '—'}</div>
      )}
    </div>
  )
}
