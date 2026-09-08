import AppIcon from './icons'
import { formatDateTime, formatDateTimeSec, calculateAge, getTimezone } from '../lib/datetime'
import { LAB_STAGE_LABEL, LAB_STAGES } from '../lib/lab'

// =====================================================================
// LabResultViewer — THE shared completed-lab-result viewer.
//
// Used by the Laboratory board (lab staff + authorized roles reviewing
// results) and the Doctor Workbench (doctor opens a patient's result).
// It renders EXISTING lab_orders / lab_tests rows through
// normalizeLabRow() — no separate results database.
//
// Shows, per the global lab-results requirement:
//   patient info · test/order name · requested / collected / resulted
//   timestamps · result value · unit · reference range · abnormal flag
//   notes · verifying staff · result status (pipeline stepper) ·
//   previous results for the same test (comparison history)
//
// Props:
//   row        normalized lab row (src/lib/lab.js normalizeLabRow)
//   patient    raw patient row when available (enriches patient block)
//   history    [{...normalized rows}] earlier results, same patient+test
//   hospital   hospital object (timezone + name for print header)
//   onClose    called by backdrop click / close button
//   onOpenRow  (normalizedRow) => void — lets the parent swap the shown
//              result when a history entry is clicked
// =====================================================================

export default function LabResultViewer({ row, patient, history = [], hospital, onClose, onOpenRow }){
  const timezone = getTimezone(hospital)
  const hospitalName = hospital?.name || 'Hospital'

  const mrn = patient?.patient_id || patient?.hospital_number || row.raw?.patient_id || ''
  const age = patient ? (patient.age ?? (patient.date_of_birth ? calculateAge(patient.date_of_birth) : null)) : null
  const abnormal = row.abnormalFlag && row.abnormalFlag !== 'normal'

  function handlePrint(){
    const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
    const resultRow = `
      <tr>
        <td style="padding:8px;border:1px solid #ccc;font-weight:bold;">${esc(row.testName)}</td>
        <td style="padding:8px;border:1px solid #ccc;">${esc(row.result)}${row.resultUnit ? ` ${esc(row.resultUnit)}` : ''}</td>
        <td style="padding:8px;border:1px solid #ccc;">${esc(row.referenceRange || '—')}</td>
        <td style="padding:8px;border:1px solid #ccc;">${esc(row.abnormalFlag ? row.abnormalFlag.toUpperCase() : '—')}</td>
      </tr>`
    const html = `
      <html><head><title>Lab Result — ${esc(patient?.full_name || row.patientName)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #111; max-width: 800px; margin: auto; }
        .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 30px; }
        .h-name { font-size: 24px; font-weight: bold; text-transform: uppercase; }
        .h-meta { font-size: 14px; color: #555; margin-top: 5px; }
        .grid { display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px; }
        .box { background: #f8f9fa; padding: 15px; border-radius: 8px; width: 48%; }
        .box h3 { margin: 0 0 10px 0; font-size: 12px; text-transform: uppercase; color: #888; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f8f9fa; font-weight: bold; }
        .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #888; }
        .sign { margin-top: 60px; border-top: 1px solid #000; width: 220px; margin-left: auto; text-align: center; font-size: 12px; padding-top: 5px; }
      </style></head><body>
        <div class="header">
          <div class="h-name">${esc(hospitalName)}</div>
          <div class="h-meta">Laboratory Result Report</div>
        </div>
        <div class="grid">
          <div class="box">
            <h3>Patient Details</h3>
            <div><strong>Name:</strong> ${esc(patient?.full_name || row.patientName)}</div>
            ${mrn ? `<div><strong>MRN:</strong> ${esc(mrn)}</div>` : ''}
            ${patient?.phone ? `<div><strong>Phone:</strong> ${esc(patient.phone)}</div>` : ''}
            ${age != null ? `<div><strong>Age:</strong> ${age} yrs</div>` : ''}
          </div>
          <div class="box">
            <h3>Report Details</h3>
            <div><strong>Requested:</strong> ${esc(row.requestedAt ? formatDateTime(row.requestedAt, timezone) : '—')}</div>
            <div><strong>Collected:</strong> ${esc(row.collectedAt ? formatDateTime(row.collectedAt, timezone) : '—')}</div>
            <div><strong>Resulted:</strong> ${esc(row.resultedAt ? formatDateTime(row.resultedAt, timezone) : '—')}</div>
            <div><strong>Verified by:</strong> ${esc(row.verifiedBy || '—')}</div>
          </div>
        </div>
        <table>
          <thead><tr><th>Test</th><th>Result</th><th>Reference Range</th><th>Flag</th></tr></thead>
          <tbody>${resultRow}</tbody>
        </table>
        ${row.resultNotes ? `<div style="font-size:13px;margin-bottom:30px;"><strong>Comments:</strong> ${esc(row.resultNotes)}</div>` : ''}
        <div class="sign">${esc(row.verifiedBy || 'Laboratory')}</div>
        <div class="footer">This is a computer generated report from ${esc(hospitalName)}.</div>
      </body></html>`
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 500)
  }

  const activeIdx = LAB_STAGES.indexOf(row.stage)

  return (
    <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card dash-modal" style={{ maxWidth: 640 }} role="dialog" aria-label="Laboratory result">
        <div className="dash-modal-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span>
            Laboratory Result
            <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginTop: 2 }}>
              {hospitalName} · {row.origin === 'doctor' ? 'Doctor order' : 'Lab request'}
            </span>
          </span>
          <button type="button" className="field-clear-btn" style={{ position: 'static' }} onClick={onClose} aria-label="Close result viewer">
            <AppIcon name="close" size={16} />
          </button>
        </div>

        <div className="dash-modal-body">
          {/* Patient identity — enough to distinguish similar names */}
          <div className="lab-viewer-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', background: 'var(--bg-elevated)', padding: 14, borderRadius: 8, border: '1px solid var(--line-soft)', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Patient</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{patient?.full_name || row.patientName || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>MRN / Phone</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--muted)' }}>
                {[mrn && `MRN ${mrn}`, patient?.phone].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Age / Sex</div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                {[age != null ? `${age}y` : null, patient?.gender].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Priority</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, textTransform: 'capitalize', color: row.priority === 'stat' ? 'var(--danger)' : row.priority === 'urgent' ? 'var(--gold)' : 'var(--teal)' }}>
                {row.priority}
              </div>
            </div>
          </div>

          {/* Test + pipeline status */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--teal)' }}>{row.testName}</div>
            <span className={`lab-stage is-${row.stage}`}>{LAB_STAGE_LABEL[row.stage]}</span>
          </div>

          {row.stage !== 'cancelled' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', margin: '10px 0 18px' }}>
              {LAB_STAGES.slice(0, 4).map((s, i) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 11, fontWeight: 700,
                    color: i <= activeIdx ? 'var(--teal)' : 'var(--muted-dim)',
                    background: i <= activeIdx ? 'var(--teal-soft)' : 'transparent',
                    border: i === activeIdx ? '1px solid var(--teal)' : '1px solid transparent',
                    borderRadius: 20, padding: '3px 10px',
                  }}>
                    <AppIcon name={i === 0 ? 'clipboard' : i === 1 ? 'lab' : i === 2 ? 'loading' : 'check'} size={11} spin={i === 2 && i === activeIdx} />
                    {['Ordered', 'Collected', 'Processing', 'Completed'][i]}
                  </div>
                  {i < 3 && <div style={{ width: 12, height: 1, background: i < activeIdx ? 'var(--teal)' : 'var(--line)' }} />}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ margin: '10px 0 18px' }}>
              <span className="lab-stage is-cancelled">Cancelled{row.raw?.cancel_reason ? ` — ${row.raw.cancel_reason}` : ''}</span>
            </div>
          )}

          {/* Timestamps */}
          <div className="lab-viewer-grid" style={{ marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Requested</div>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{row.requestedAt ? formatDateTime(row.requestedAt, timezone) : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Sample collected</div>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{row.collectedAt ? formatDateTime(row.collectedAt, timezone) : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Result reported</div>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{row.resultedAt ? formatDateTimeSec(row.resultedAt, timezone) : '—'}</div>
            </div>
          </div>

          {/* Result values */}
          <div style={{ border: `1px solid ${abnormal ? 'var(--danger)' : 'var(--line-soft)'}`, background: abnormal ? 'var(--danger-soft)' : 'var(--bg-elevated)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Result value</div>
                <div className="lab-viewer-value">
                  {row.result || '—'}{row.resultUnit ? <span style={{ color: 'var(--muted)', fontWeight: 600, fontSize: 13, marginLeft: 5 }}>{row.resultUnit}</span> : null}
                </div>
              </div>
              {row.abnormalFlag && (
                <span className={`lab-flag is-${row.abnormalFlag}`}>
                  {abnormal && <AppIcon name="alert" size={12} />}
                  {row.abnormalFlag}
                </span>
              )}
            </div>
            {row.referenceRange && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
                Reference range: <strong style={{ color: 'var(--text)' }}>{row.referenceRange}</strong>
              </div>
            )}
            {row.resultNotes && (
              <div style={{ fontSize: 12.5, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line-soft)', color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--text)' }}>Comments: </strong>{row.resultNotes}
              </div>
            )}
          </div>

          {/* Attachment + verifier */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {row.resultFile ? (
              <a
                href={row.resultFile}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
                style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}
              >
                <AppIcon name="eye" size={14} /> View attached file{row.fileName ? `: ${row.fileName}` : ''}
              </a>
            ) : <span />}
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {row.verifiedBy ? <>Verified by <strong style={{ color: 'var(--text)' }}>{row.verifiedBy}</strong></> : 'Verifier not recorded'}
            </div>
          </div>

          {/* Previous results — same patient, same test */}
          {history.length > 0 && (
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Previous results ({history.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.map(h => (
                  <div
                    key={h.id}
                    role={onOpenRow ? 'button' : undefined}
                    tabIndex={onOpenRow ? 0 : undefined}
                    onClick={onOpenRow ? () => onOpenRow(h) : undefined}
                    onKeyDown={onOpenRow ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenRow(h) } }) : undefined}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                      padding: '9px 12px', borderRadius: 8, background: 'var(--bg-elevated)',
                      border: '1px solid var(--line-soft)', cursor: onOpenRow ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{h.resultedAt ? formatDateTime(h.resultedAt, timezone) : '—'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.result || '—'}{h.resultUnit ? ` ${h.resultUnit}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {h.abnormalFlag && h.abnormalFlag !== 'normal' && <span className={`lab-flag is-${h.abnormalFlag}`}>{h.abnormalFlag}</span>}
                      <span className={`lab-stage is-${h.stage}`}>{LAB_STAGE_LABEL[h.stage]}</span>
                      {onOpenRow && <AppIcon name="chevron" size={14} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="dash-modal-actions">
          <button type="button" className="btn btn-ghost" style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--line)' }} onClick={handlePrint}>
            <AppIcon name="print" size={14} /> Print Result
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
