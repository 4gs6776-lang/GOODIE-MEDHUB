import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import { useRealtimeAlert } from '../../lib/useRealtimeAlert'
import SearchInput from '../../components/common/SearchInput'
import TrashIcon from '../../components/icons/TrashIcon'
import AppIcon from '../../components/icons'
import ConnectionState from '../../components/common/ConnectionState'
import PatientAutocomplete from '../../components/common/PatientAutocomplete'
import Autocomplete from '../../components/common/Autocomplete'
import LabResultViewer from '../../components/LabResultViewer'
import { writeAudit } from '../../lib/audit'
import { getTimezone, formatDateTimeSec, formatDate } from '../../lib/datetime'
import {
  labStage, stageStatus, normalizeLabRow, LAB_STAGE_LABEL, ABNORMAL_FLAGS,
} from '../../lib/lab'

// Common lab tests power the test-name autocomplete (global rule: no
// free-typing a value the system already knows). Anything unmatched can
// still be added as a custom test via the autocomplete's free-text row.
const COMMON_LAB_TESTS = [
  'Full Blood Count (FBC)',
  'Malaria Parasite Test',
  'Widal Test',
  'Urinalysis',
  'Stool Routine Examination',
  'Lipid Profile',
  'Liver Function Test (LFT)',
  'Renal Function Test (RFT)',
  'Random Blood Glucose',
  'Fasting Blood Glucose',
  'HbA1c',
  'HIV Screening',
  'Hepatitis B Surface Antigen',
  'Hepatitis C Antibody',
  'Thyroid Profile',
  'Pregnancy Test (UPT)',
  'Blood Grouping & Rh',
  'Genotype (Hb Electrophoresis)',
  'ESR (Erythrocyte Sedimentation Rate)',
  'CRP (C-Reactive Protein)',
  'Electrolytes & Urea',
  'Semen Analysis',
  'Pap Smear',
  'X-Ray Chest',
  'Ultrasound Scan',
  'CT Scan',
  'MRI Scan',
  'ECG',
]

const TEST_OPTIONS = COMMON_LAB_TESTS.map(t => ({ id: t, label: t }))

export default function Laboratory(){
  const { profile, hospital } = useAuth()
  const timezone = getTimezone(hospital)
  const { records: tests, loading: loadingTests, isOnline, pendingCount, addRecord, deleteRecord, updateRecord } = useOfflineTable('lab_tests', hospital?.id)
  const { records: orders, loading: loadingOrders, updateRecord: updateOrder, deleteRecord: deleteOrder, syncFromServer: syncOrders } = useOfflineTable('lab_orders', hospital?.id)
  const { records: patients } = useOfflineTable('patients', hospital?.id)
  const { addRecord: addBillableCharge } = useOfflineTable('billable_charges', hospital?.id)

  const loading = loadingTests || loadingOrders
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3600)
  }

  // Live alert — the instant a doctor sends a lab order anywhere in
  // the hospital, it shows up here without needing a page refresh.
  useRealtimeAlert('lab_orders', hospital?.id, (newRow) => {
    showToast(`New lab order: ${newRow.test_name || 'test'} for ${newRow.patient_name || 'a patient'}`)
    syncOrders()
  })

  const [selectedPatient, setSelectedPatient] = useState(null)
  const [selectedTest, setSelectedTest] = useState(null) // { id, label, freeText? }
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Professional Result Form State
  const [showResultForm, setShowResultForm] = useState(false)
  const [formPatient, setFormPatient] = useState(null)
  const [formTests, setFormTests] = useState([])
  const [formResults, setFormResults] = useState({})

  // Lab Result Viewer state (shared viewer, also used by the doctor)
  const [viewRow, setViewRow] = useState(null)
  const [viewHistory, setViewHistory] = useState([])

  // Writes a lab row. Migration-008 columns (units, ranges, flags,
  // timestamps) are handled by useOfflineTable's built-in schema-gap
  // tolerance: if the live database does not have a column yet, the
  // write retries without it automatically and everything else still
  // saves. Errors surface as toasts and never block the other rows.
  async function updateLabRow(test, payload){
    if (test.origin === 'doctor') {
      await updateOrder(test.id, payload)
    } else {
      await updateRecord(test.id, payload)
    }
  }

  function auditLab(action, test, summary, metadata = {}){
    writeAudit({
      hospitalId: hospital?.id,
      actor: profile,
      action,
      entityType: 'lab_request',
      entityId: test.id,
      patientId: test.patient_id || null,
      summary,
      metadata: { test_name: test.test_name, origin: test.origin, ...metadata },
    })
  }

  async function handleAdd(e){
    e.preventDefault()
    setFormError('')

    const finalTestName = selectedTest?.label?.trim()
    if (!selectedPatient || !finalTestName) {
      setFormError('Please select a patient and enter a test name.')
      return
    }
    if (!hospital || !profile) {
      setFormError('Still loading your account — try again in a moment.')
      return
    }
    setSaving(true)
    try {
      await addRecord({
        patient_id: selectedPatient.id,
        patient_name: selectedPatient.full_name,
        test_name: finalTestName,
        status: 'pending',
        result: null,
        requested_at: new Date().toISOString(),
        created_by: profile.id,
      })
      auditLab('lab_request.created', { id: null, patient_id: selectedPatient.id, test_name: finalTestName, origin: 'lab' },
        `Lab request raised for ${selectedPatient.full_name} — ${finalTestName}`)
      setShowModal(false)
      setSelectedPatient(null); setSelectedTest(null)
      showToast(isOnline ? 'Test requested' : 'Test requested — will sync when back online')
    } catch (err) {
      setFormError(err.message || 'Could not save test request')
    } finally {
      setSaving(false)
    }
  }

  // Pipeline advance: collect the sample / start processing.
  async function handleAdvance(test, toStage){
    const payload = { status: stageStatus(toStage, test.origin), updated_at: new Date().toISOString() }
    if (toStage === 'sample_collected') { payload.collected_at = new Date().toISOString(); payload.collected_by = profile?.full_name || null }
    try {
      await updateLabRow(test, payload)
      auditLab(`lab.${toStage}`, test, `${test.test_name} for ${test.patient_name}: ${LAB_STAGE_LABEL[toStage]}`)
      showToast(`${test.test_name} — ${LAB_STAGE_LABEL[toStage]}`)
    } catch (err) {
      showToast(err.message || 'Could not update the request')
    }
  }

  async function handleCancel(test){
    if (!confirm(`Cancel this request for ${test.test_name} (${test.patient_name})? The record is kept for the audit trail.`)) return
    try {
      await updateLabRow(test, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: `Cancelled by ${profile?.full_name || 'staff'}`,
        updated_at: new Date().toISOString(),
      })
      auditLab('lab.cancelled', test, `${test.test_name} for ${test.patient_name}: request cancelled`)
      showToast('Request cancelled')
    } catch (err) {
      showToast(err.message || 'Could not cancel the request')
    }
  }

  async function handleReopen(test){
    try {
      await updateLabRow(test, { status: stageStatus('ordered', test.origin), resulted_at: null, verified_by: null, updated_at: new Date().toISOString() })
      auditLab('lab.reopened', test, `${test.test_name} for ${test.patient_name}: reopened as Ordered`)
      showToast(isOnline ? 'Marked pending' : 'Marked pending — will sync when back online')
    } catch (err) {
      showToast(err.message || 'Could not reopen the request')
    }
  }

  function openResultForm(test) {
    const patientDetails = patients.find(p => p.id === test.patient_id) || { full_name: test.patient_name, phone: 'N/A', id: test.patient_id }
    setFormPatient(patientDetails)

    const pending = combined.filter(t => t.patient_id === test.patient_id && t.isPending)
    setFormTests(pending)

    const initialResults = {}
    pending.forEach(t => {
      initialResults[t.id] = {
        result: t.result || '', price: '0', result_file: null, file_name: t.file_name || '',
        result_unit: t.result_unit || '', reference_range: t.reference_range || '',
        abnormal_flag: t.abnormal_flag || 'normal', result_notes: t.result_notes || '',
      }
    })
    setFormResults(initialResults)
    setShowResultForm(true)
  }

  // Opens the shared Lab Result Viewer with comparison history for the
  // same patient + test (previous results where available).
  function openViewer(test){
    const norm = normalizeLabRow(test.raw || test, test.origin)
    const patient = patients.find(p => p.id === norm.patientId) || null
    const history = combined
      .filter(t => t.id !== norm.id && t.patient_id === norm.patientId &&
        String(t.test_name || '').toLowerCase() === String(norm.testName || '').toLowerCase() &&
        labStage(t.status) === 'completed')
      .map(t => normalizeLabRow(t.raw || t, t.origin))
      .sort((a, b) => new Date(b.resultedAt || 0) - new Date(a.resultedAt || 0))
    setViewHistory(history)
    setViewRow({ ...norm, patient })
  }

  function handleFileUpload(e, testId) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setFormResults(prev => ({
        ...prev,
        [testId]: { ...prev[testId], result_file: reader.result, file_name: file.name }
      }))
    }
    reader.readAsDataURL(file)
  }

  async function handleSaveAllResults() {
    setSaving(true)
    const failed = []
    for (const t of formTests) {
      const resData = formResults[t.id]
      if (!resData || resData.result.trim() === '') { failed.push(t); continue }
      try {
        const price = parseFloat(resData.price) || 0
        const nowIso = new Date().toISOString()
        const payload = {
          status: 'completed',
          result: resData.result,
          result_file: resData.result_file || null,
          resulted_at: nowIso,
          verified_by: profile?.full_name || null,
          result_unit: resData.result_unit || null,
          reference_range: resData.reference_range || null,
          abnormal_flag: ABNORMAL_FLAGS.includes(resData.abnormal_flag) ? resData.abnormal_flag : null,
          result_notes: resData.result_notes || null,
          updated_at: nowIso,
        }
        await updateLabRow(t, payload)
        await addBillableCharge({
          hospital_id: hospital.id,
          patient_id: t.patient_id || null,
          patient_name: t.patient_name,
          source_module: 'Laboratory',
          source_transaction_id: `LAB-${t.id}`,
          item_name: t.test_name,
          category: 'Lab Test',
          quantity: 1,
          unit_price: price,
          total: price,
          status: 'pending',
          created_by: profile?.id
        })
        auditLab('lab_result.recorded', t,
          `Result recorded for ${t.test_name} — ${t.patient_name}${resData.abnormal_flag && resData.abnormal_flag !== 'normal' ? ` (${resData.abnormal_flag})` : ''}`,
          { abnormal_flag: resData.abnormal_flag || null, unit: resData.result_unit || null })
      } catch (err) {
        console.error(`Failed to save result for ${t.test_name}:`, err)
        failed.push(t)
      }
    }
    setFormTests(failed)
    if (failed.length === 0) {
      showToast('All results saved & sent to Billing Queue')
      setShowResultForm(false)
    } else {
      showToast(`Saved successfully. ${failed.length} result(s) still need attention.`)
    }
    setSaving(false)
  }
  function handlePrintForm() {
    let testRows = ''
    formTests.forEach((t, i) => {
      const res = formResults[t.id]?.result || ''
      testRows += `<tr><td style="padding:8px;border:1px solid #ccc;">${i+1}</td><td style="padding:8px;border:1px solid #ccc;font-weight:bold;">${t.test_name}</td><td style="padding:8px;border:1px solid #ccc;">${res || 'Pending'}</td></tr>`
    })

    const html = `
      <html><head><title>Lab Result - ${formPatient?.full_name}</title>
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
        .sign { margin-top: 60px; border-top: 1px solid #000; width: 200px; text-align: center; font-size: 12px; padding-top: 5px; }
      </style></head><body>
        <div class="header">
          <div class="h-name">${hospital?.name || 'Hospital'}</div>
          <div class="h-meta">Laboratory Test Report</div>
        </div>
        <div class="grid">
          <div class="box">
            <h3>Patient Details</h3>
            <div><strong>Name:</strong> ${formPatient?.full_name || 'N/A'}</div>
            <div><strong>Phone:</strong> ${formPatient?.phone || 'N/A'}</div>
          </div>
          <div class="box">
            <h3>Report Details</h3>
            <div><strong>Date:</strong> ${formatDateTimeSec(new Date(), timezone)}</div>
            <div><strong>Lab Scientist:</strong> ${profile?.full_name || 'N/A'}</div>
          </div>
        </div>
        <table>
          <thead><tr><th style="width:50px;">#</th><th>Test Parameter</th><th>Result</th></tr></thead>
          <tbody>${testRows}</tbody>
        </table>
        <div class="sign">Authorized Signature: ${profile?.full_name || ''}</div>
        <div class="footer">This is a computer generated report from ${hospital?.name || 'the laboratory'}.</div>
      </body></html>`
    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 500)
  }

  async function handleDelete(test){
    if (!confirm(`Delete this test request for ${test.patient_name}?`)) return
    if (test.origin === 'doctor') {
      await deleteOrder(test.id)
    } else {
      await deleteRecord(test.id)
    }
    auditLab('lab_request.deleted', test, `Lab request deleted — ${test.test_name} for ${test.patient_name}`)
    showToast('Test deleted')
  }

  const combined = [
    ...tests.map(t => ({ ...t, origin: 'lab', isPending: labStage(t.status) !== 'completed' && labStage(t.status) !== 'cancelled' })),
    ...orders.map(o => ({ ...o, origin: 'doctor', isPending: labStage(o.status) !== 'completed' && labStage(o.status) !== 'cancelled' })),
  ]

  const priorityWeight = { stat: 0, urgent: 1, routine: 2 }
  const sorted = [...combined].sort((a, b) => {
    if (a.isPending && b.isPending) {
      const pw = (priorityWeight[a.priority] ?? 2) - (priorityWeight[b.priority] ?? 2)
      if (pw !== 0) return pw
    }
    return new Date(b.requested_at) - new Date(a.requested_at)
  })
  const labSearch = searchTerm.trim().toLowerCase()
  const visibleSorted = labSearch ? sorted.filter(t => [t.patient_name, t.patient_id, t.test_name, t.request_number, t.status, t.result].some(v => String(v || '').toLowerCase().includes(labSearch))) : sorted
  const pendingCountStat = combined.filter(t => t.isPending).length
  const completedCount = combined.filter(t => labStage(t.status) === 'completed').length

  // Stage-aware primary action per row (pipeline, global lab rule).
  function stageAction(test){
    const stage = labStage(test.status)
    if (stage === 'ordered') return { label: 'Collect Sample', run: () => handleAdvance(test, 'sample_collected'), aria: `Mark sample collected for ${test.test_name} for ${test.patient_name}` }
    if (stage === 'sample_collected') return { label: 'Start Processing', run: () => handleAdvance(test, 'processing'), aria: `Start processing ${test.test_name} for ${test.patient_name}` }
    if (stage === 'processing') return { label: 'Enter Results', run: () => openResultForm(test), aria: `Enter results for ${test.test_name} for ${test.patient_name}` }
    if (stage === 'completed') return { label: 'View Result', run: () => openViewer(test), aria: `View result for ${test.test_name} for ${test.patient_name}` }
    return null
  }

  return (
    <>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 20, gap: 12 }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }}>
            <AppIcon name="clock" size={20} />
          </div>
          <div>
            <div className="dash-stat-label">Pending</div>
            <div className="dash-stat-value">{pendingCountStat}</div>
            <div className="dash-stat-delta" style={{ color: 'var(--gold)' }}>awaiting results</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
            <AppIcon name="check" size={20} />
          </div>
          <div>
            <div className="dash-stat-label">Completed</div>
            <div className="dash-stat-value">{completedCount}</div>
            <div className="dash-stat-delta">results ready</div>
          </div>
        </div>
      </div>

      <div className="dash-panel">
        <div className="dash-panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="dash-panel-title">Lab Requests</div>
            <div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <ConnectionState isOnline={isOnline} pendingCount={pendingCount} />
              <span>Ordered → Collected → Processing → Completed · auto-bills</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%', maxWidth: 600 }}>
            <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search patient, test..." style={{ flex: 1, minWidth: 150 }} />
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>
              <AppIcon name="plus" size={14} /> New Request
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : visibleSorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No lab requests yet. Add your first one above.</div>
        ) : (
          <div className="dash-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr>
                  {['Patient', 'Test', 'Status', 'Result', 'Requested', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleSorted.map(test => {
                  const stage = labStage(test.status)
                  const action = stageAction(test)
                  return (
                  <tr key={test.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {test.patient_name}
                      {test.origin === 'doctor' && (
                        <span style={{ marginLeft: 8, fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(139,124,246,0.14)', color: 'var(--violet)', verticalAlign: 'middle' }}>
                          DOCTOR
                        </span>
                      )}
                      {(test.priority === 'urgent' || test.priority === 'stat') && (
                        <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: test.priority === 'stat' ? 'var(--danger-soft)' : 'rgba(201,169,97,0.14)', color: test.priority === 'stat' ? 'var(--danger)' : 'var(--gold)', verticalAlign: 'middle' }}>
                          {test.priority === 'stat' ? 'STAT' : 'URGENT'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{test.test_name}</td>
                    <td style={{ padding: 12 }}>
                      <span className={`lab-stage is-${stage}`}>{LAB_STAGE_LABEL[stage]}</span>
                    </td>
                    <td style={{ padding: 12, fontSize: 12, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {test.result
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {test.abnormal_flag && test.abnormal_flag !== 'normal' && <span className={`lab-flag is-${test.abnormal_flag}`}>{test.abnormal_flag}</span>}
                            {test.result}
                          </span>
                        : '—'}
                    </td>
                    <td style={{ padding: 12, fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(test.requested_at, timezone)}
                    </td>
                    <td style={{ padding: 12 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {action && (
                          <button
                            type="button"
                            className="appt-status-btn"
                            onClick={action.run}
                            aria-label={action.aria}
                            style={stage === 'completed' ? { background: 'var(--teal-soft)', color: 'var(--teal)', whiteSpace: 'nowrap' } : { whiteSpace: 'nowrap' }}
                          >
                            {action.label}
                          </button>
                        )}
                        {test.isPending && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ width: 'auto', padding: '5px 10px', fontSize: 11.5 }}
                            onClick={() => handleCancel(test)}
                            aria-label={`Cancel ${test.test_name} request for ${test.patient_name}`}
                          >
                            Cancel
                          </button>
                        )}
                        {stage === 'completed' && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ width: 'auto', padding: '5px 10px', fontSize: 11.5 }}
                            onClick={() => handleReopen(test)}
                            aria-label={`Reopen ${test.test_name} for ${test.patient_name} as pending`}
                            title="Re-open as pending (correct a result)"
                          >
                            Reopen
                          </button>
                        )}
                        <button onClick={() => handleDelete(test)} className="icon-btn-delete" title="Delete" aria-label={`Delete ${test.test_name} request for ${test.patient_name}`}><TrashIcon size={14}/></button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* NEW REQUEST MODAL — shared modal chrome: bottom sheet on phones */}
      {showModal && (
        <div className="dash-modal-backdrop" onClick={e => { if(e.target === e.currentTarget) setShowModal(false) }}>
          <div className="card dash-modal">
            <div className="dash-modal-title">New Lab Request</div>
            <form onSubmit={handleAdd}>
              <div className="dash-modal-body">
                {formError && <div className="error-box">{formError}</div>}
              <div className="field">
                <label id="lab-patient-label">Select Patient</label>
                <PatientAutocomplete
                  patients={patients}
                  value={selectedPatient
                    ? { id: selectedPatient.id, label: selectedPatient.full_name, patient: selectedPatient }
                    : null}
                  onChange={opt => setSelectedPatient(opt?.patient || null)}
                  ariaLabel="Patient"
                />
              </div>

              {/* Test name — searchable autocomplete over the standard
                  test list; unmatched names can be added as custom. */}
              <div className="field">
                <label>Test Name</label>
                <Autocomplete
                  options={TEST_OPTIONS}
                  value={selectedTest}
                  onChange={setSelectedTest}
                  placeholder="Search tests, e.g. blood count…"
                  allowFreeText
                  freeTextLabel='Use "{query}" as custom test'
                  emptyText="No standard test matches — use the free-text row below"
                  ariaLabel="Test name"
                />
              </div>
              </div>
              <div className="dash-modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROFESSIONAL MULTIPLE RESULT FORM MODAL — shared chrome keeps the
          body scrollable and the action row pinned on phones (QA B2). */}
      {showResultForm && formPatient && (
        <div className="dash-modal-backdrop" onClick={e => { if(e.target === e.currentTarget) setShowResultForm(false) }}>
          <div className="card dash-modal" style={{ maxWidth: 800 }}>
            <div className="dash-modal-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span>
                {hospital?.name || 'Hospital'}
                <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--muted)', marginTop: 2 }}>Laboratory Test Request &amp; Result Form</span>
              </span>
              <button type="button" className="field-clear-btn" style={{ position: 'static' }} onClick={() => setShowResultForm(false)} aria-label="Close result form">
                <AppIcon name="close" size={16} />
              </button>
            </div>

            <div className="dash-modal-body">
              {/* Auto-filled Patient Info Header */}
              <div className="lab-viewer-grid" style={{ gridTemplateColumns: '1fr 1fr', background: 'var(--bg-elevated)', padding: 16, borderRadius: 8, marginBottom: 24, border: '1px solid var(--line-soft)' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Patient Name</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{formPatient.full_name}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Phone Number</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{formPatient.phone || 'N/A'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Date / Time</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{formatDateTimeSec(new Date(), timezone)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Lab Scientist</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{profile?.full_name || 'N/A'}</div>
                </div>
              </div>

              {/* MULTIPLE TEST RESULTS AREA */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {formTests.map((t, index) => (
                  <div key={t.id} style={{ border: '1px solid var(--line-soft)', borderRadius: 8, padding: 16, background: 'var(--bg-card)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--teal)' }}>{index + 1}. {t.test_name}</div>
                      {t.origin === 'doctor' && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(139,124,246,0.14)', color: 'var(--violet)' }}>DOCTOR ORDER</span>}
                    </div>

                    <div className="field" style={{ marginBottom: 12 }}>
                      <label>Result</label>
                      <textarea
                        rows={3}
                        value={formResults[t.id]?.result || ''}
                        onChange={e => setFormResults(prev => ({ ...prev, [t.id]: { ...prev[t.id], result: e.target.value } }))}
                        placeholder="Enter result..."
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="field">
                        <label>Unit</label>
                        <input
                          value={formResults[t.id]?.result_unit || ''}
                          onChange={e => setFormResults(prev => ({ ...prev, [t.id]: { ...prev[t.id], result_unit: e.target.value } }))}
                          placeholder="e.g. g/dL"
                        />
                      </div>
                      <div className="field">
                        <label>Reference Range</label>
                        <input
                          value={formResults[t.id]?.reference_range || ''}
                          onChange={e => setFormResults(prev => ({ ...prev, [t.id]: { ...prev[t.id], reference_range: e.target.value } }))}
                          placeholder="e.g. 11.0 – 16.5"
                        />
                      </div>
                    </div>

                    <div className="field" style={{ marginBottom: 12 }}>
                      <label>Flag</label>
                      <select
                        value={formResults[t.id]?.abnormal_flag || 'normal'}
                        onChange={e => setFormResults(prev => ({ ...prev, [t.id]: { ...prev[t.id], abnormal_flag: e.target.value } }))}
                      >
                        {ABNORMAL_FLAGS.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                      </select>
                    </div>

                    <div className="field" style={{ marginBottom: 12 }}>
                      <label>Comments / Notes</label>
                      <input
                        value={formResults[t.id]?.result_notes || ''}
                        onChange={e => setFormResults(prev => ({ ...prev, [t.id]: { ...prev[t.id], result_notes: e.target.value } }))}
                        placeholder="Optional remark for the requesting doctor"
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <div className="field" style={{ flex: 1, minWidth: 120 }}>
                        <label>Price (₦)</label>
                        <input
                          type="number"
                          value={formResults[t.id]?.price || '0'}
                          onChange={e => setFormResults(prev => ({ ...prev, [t.id]: { ...prev[t.id], price: e.target.value } }))}
                          placeholder="0"
                        />
                      </div>
                      <div className="field" style={{ flex: 2, minWidth: 200 }}>
                        <label>Upload File</label>
                        <input
                          type="file"
                          accept="image/*, .pdf"
                          onChange={e => handleFileUpload(e, t.id)}
                          style={{ fontSize: 12, color: 'var(--muted)', width: '100%' }}
                        />
                        {formResults[t.id]?.file_name && (
                          <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AppIcon name="check" size={12} /> {formResults[t.id]?.file_name}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Signature Area */}
              <div style={{ marginTop: 40, display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ borderTop: '1px solid var(--text)', width: 200, marginBottom: 4 }}></div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{profile?.full_name || 'Lab Scientist'}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Lab Scientist Signature</div>
                </div>
              </div>
            </div>

            <div className="dash-modal-actions" style={{ justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" style={{ width: 'auto', border: '1px solid var(--line)', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={handlePrintForm}>
                <AppIcon name="print" size={14} /> Print Form
              </button>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleSaveAllResults} disabled={saving}>
                {saving ? 'Saving...' : 'Save All Results & Send to Billing'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared Lab Result Viewer — also embedded in the Doctor Workbench */}
      {viewRow && (
        <LabResultViewer
          row={viewRow}
          patient={viewRow.patient}
          history={viewHistory}
          hospital={hospital}
          onClose={() => { setViewRow(null); setViewHistory([]) }}
        />
      )}

      {toast && (
        <div className="dash-toast dash-toast-success">{toast}</div>
      )}
    </>
  )
}
