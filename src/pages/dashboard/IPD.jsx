import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import { useRealtimeAlert } from '../../lib/useRealtimeAlert'

const SECTIONS = [
  { key: 'private', label: 'Private Suites' },
  { key: 'general', label: 'General Ward' },
  { key: 'icu', label: 'ICU' },
]

const STATUS_COLOR = {
  available: { bg: 'rgba(124,134,184,0.14)', border: 'var(--line)', text: 'var(--muted)', label: 'Available' },
  occupied: { bg: 'rgba(76,141,255,0.16)', border: 'rgba(76,141,255,0.4)', text: 'var(--blue)', label: 'Occupied' },
  cleaning: { bg: 'rgba(201,169,97,0.16)', border: 'rgba(201,169,97,0.4)', text: 'var(--gold)', label: 'Cleaning' },
  reserved: { bg: 'rgba(139,124,246,0.16)', border: 'rgba(139,124,246,0.4)', text: 'var(--violet)', label: 'Reserved' },
}

// Props: onGoToAdmissions — optional callback so the "available bed" info
// panel can jump the user straight to the Admissions module.
export default function IPD({ onGoToAdmissions }){
  const { profile, hospital } = useAuth()
  const { records: beds, loading, isOnline, pendingCount, addRecord, deleteRecord, updateRecord, refreshTable, syncFromServer } = useOfflineTable('beds', hospital?.id)

  const [toast, setToast] = useState(null)
  const [selectedBed, setSelectedBed] = useState(null)
  const [showAddBed, setShowAddBed] = useState(false)
  const [newSection, setNewSection] = useState('general')
  const [newBedNumber, setNewBedNumber] = useState('')

  const [showDischarge, setShowDischarge] = useState(false)
  const [billingCleared, setBillingCleared] = useState(false)
  const [pharmacyCleared, setPharmacyCleared] = useState(false)
  const [doctorSigned, setDoctorSigned] = useState(false)

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // Live alert — a new inpatient admission from another device refreshes bed status here.
  // syncFromServer (not refreshTable) so we actually pull the updated bed rows down,
  // not just re-read whatever was already sitting in the local offline cache.
  useRealtimeAlert('admissions', hospital?.id, () => {
    showToast('🏥 A new patient was admitted — bed list refreshed')
    syncFromServer()
  })

  async function handleAddBed(e){
    e.preventDefault()
    if (!newBedNumber) return
    await addRecord({ section: newSection, bed_number: newBedNumber, status: 'available', created_by: profile.id })
    setShowAddBed(false)
    setNewBedNumber('')
    showToast('Bed added')
  }

  function openBed(bed){
    setSelectedBed(bed)
    if (bed.status === 'occupied') {
      setBillingCleared(bed.billing_cleared); setPharmacyCleared(bed.pharmacy_cleared); setDoctorSigned(bed.doctor_signed)
    }
  }

  async function saveChecklist(){
    await updateRecord(selectedBed.id, { billing_cleared: billingCleared, pharmacy_cleared: pharmacyCleared, doctor_signed: doctorSigned })
  }

  async function confirmDischarge(){
    await updateRecord(selectedBed.id, {
      status: 'cleaning',
      patient_name: null, doctor_name: null, diagnosis: null, admission_date: null,
      billing_cleared: false, pharmacy_cleared: false, doctor_signed: false,
    })
    setShowDischarge(false)
    setSelectedBed(null)
    showToast('Discharged — bed marked for cleaning')
  }

  async function markCleaned(bed){
    await updateRecord(bed.id, { status: 'available' })
    setSelectedBed(null)
    showToast('Bed marked available')
  }

  async function handleDeleteBed(bed){
    if (!confirm(`Remove bed ${bed.bed_number}?`)) return
    await deleteRecord(bed.id)
    setSelectedBed(null)
    showToast('Bed removed')
  }

  const allChecked = billingCleared && pharmacyCleared && doctorSigned

  return (
    <>
      <div className="dash-panel" style={{ marginBottom: 16 }}>
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Ward &amp; Bed Map</div>
            <div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)', display: 'inline-block' }} />
              {isOnline ? 'Online' : 'Offline'}{pendingCount > 0 ? ` · ${pendingCount} syncing` : ''} · Tap a bed for details
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowAddBed(true)}>+ Add Bed</button>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 4, fontSize: 11.5 }}>
          {Object.entries(STATUS_COLOR).map(([key, s]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.bg, border: `1px solid ${s.border}` }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="dash-panel" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
      ) : (
        SECTIONS.map(section => {
          const sectionBeds = beds.filter(b => b.section === section.key)
          return (
            <div className="dash-panel" key={section.key} style={{ marginBottom: 16 }}>
              <div className="dash-panel-head">
                <div className="dash-panel-title" style={{ fontSize: 15 }}>{section.label}</div>
                <div className="dash-panel-sub" style={{ margin: 0 }}>{sectionBeds.length} bed(s)</div>
              </div>
              {sectionBeds.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 12.5, padding: '8px 0' }}>No beds set up in this section yet.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))', gap: 10 }}>
                  {sectionBeds.map(bed => {
                    const s = STATUS_COLOR[bed.status]
                    return (
                      <div
                        key={bed.id}
                        onClick={() => openBed(bed)}
                        style={{
                          background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10,
                          padding: '12px 8px', textAlign: 'center', cursor: 'pointer', transition: '.15s',
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: 13, color: s.text }}>{bed.bed_number}</div>
                        <div style={{ fontSize: 9.5, color: s.text, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
      )}

      {/* Available bed: info only — admission now happens through the
          Admissions module (approved request -> bed assignment), not by
          free-typing a name directly onto a bed. */}
      {selectedBed && selectedBed.status === 'available' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}
          onClick={() => setSelectedBed(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 4 }}>Bed {selectedBed.bed_number}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>{SECTIONS.find(s => s.key === selectedBed.section)?.label} · Available</div>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
              This bed is free. To admit a patient into it, approve an admission request in the Admissions module and assign this bed during confirmation.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setSelectedBed(null)}>Close</button>
              {onGoToAdmissions && (
                <button className="btn btn-primary" onClick={() => { setSelectedBed(null); onGoToAdmissions() }}>Go to Admissions</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bed detail panel for occupied beds */}
      {selectedBed && selectedBed.status === 'occupied' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}
          onClick={() => setSelectedBed(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 4 }}>Bed {selectedBed.bed_number}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>{SECTIONS.find(s => s.key === selectedBed.section)?.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20, fontSize: 13.5 }}>
              <div><span style={{ color: 'var(--muted)' }}>Patient: </span><b>{selectedBed.patient_name}</b></div>
              {selectedBed.doctor_name && <div><span style={{ color: 'var(--muted)' }}>Doctor: </span>{selectedBed.doctor_name}</div>}
              {selectedBed.admission_date && <div><span style={{ color: 'var(--muted)' }}>Admitted: </span>{selectedBed.admission_date}</div>}
              {selectedBed.diagnosis && <div><span style={{ color: 'var(--muted)' }}>Diagnosis: </span>{selectedBed.diagnosis}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setSelectedBed(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => setShowDischarge(true)}>Initiate Discharge Clearance</button>
            </div>
          </div>
        </div>
      )}

      {/* Cleaning-status bed: allow marking as cleaned, or delete */}
      {selectedBed && selectedBed.status === 'cleaning' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}
          onClick={() => setSelectedBed(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>Bed {selectedBed.bed_number} — Pending Cleaning</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => handleDeleteBed(selectedBed)}>Remove Bed</button>
              <button className="btn btn-primary" onClick={() => markCleaned(selectedBed)}>Mark Cleaned &amp; Available</button>
            </div>
          </div>
        </div>
      )}

      {/* Discharge clearance checklist modal */}
      {showDischarge && selectedBed && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 55, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 4 }}>Discharge Clearance</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>{selectedBed.patient_name} — Bed {selectedBed.bed_number}</div>
            {[
              { label: 'Billing cleared', val: billingCleared, set: setBillingCleared },
              { label: 'Pharmacy cleared', val: pharmacyCleared, set: setPharmacyCleared },
              { label: 'Doctor signed off', val: doctorSigned, set: setDoctorSigned },
            ].map((c, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: i < 2 ? '1px solid var(--line-soft)' : 'none', cursor: 'pointer', fontSize: 13.5 }}>
                <input type="checkbox" checked={c.val} onChange={e => { c.set(e.target.checked); setTimeout(saveChecklist, 0) }} style={{ width: 18, height: 18, accentColor: 'var(--teal)' }} />
                {c.label}
              </label>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button className="btn btn-ghost" onClick={() => setShowDischarge(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!allChecked} onClick={confirmDischarge}>
                {allChecked ? 'Confirm Discharge' : 'Complete checklist to continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddBed && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>Add Bed</div>
            <form onSubmit={handleAddBed}>
              <div className="field">
                <label>Section</label>
                <select value={newSection} onChange={e => setNewSection(e.target.value)}>
                  {SECTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Bed Number</label>
                <input value={newBedNumber} onChange={e => setNewBedNumber(e.target.value)} placeholder="e.g. G-14" />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddBed(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Bed</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)',
          padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60, maxWidth: '85vw', textAlign: 'center',
        }}>
          {toast}
        </div>
      )}
    </>
  )
}
