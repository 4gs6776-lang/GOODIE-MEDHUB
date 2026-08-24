import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import { useRealtimeAlert } from '../../lib/useRealtimeAlert'
import SearchInput from '../../components/common/SearchInput'

// NEW: List of common lab tests for the dropdown
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
export default function Laboratory(){
  const { profile, hospital } = useAuth()
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
    setTimeout(() => setToast(null), 3000)
  }

  // Live alert — the instant a doctor sends a lab order anywhere in
  // the hospital, it shows up here without needing a page refresh.
  useRealtimeAlert('lab_orders', hospital?.id, (newRow) => {
    showToast(`🧪 New lab order: ${newRow.test_name || 'test'} for ${newRow.patient_name || 'a patient'}`)
    syncOrders()
  })


  const [selectedPatient, setSelectedPatient] = useState(null) 
  const [patientSearch, setPatientSearch] = useState('') 
  const [testName, setTestName] = useState('')
  const [customTestName, setCustomTestName] = useState('') // NEW: For custom input
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Professional Result Form State
  const [showResultForm, setShowResultForm] = useState(false)
  const [formPatient, setFormPatient] = useState(null)
  const [formTests, setFormTests] = useState([])
  const [formResults, setFormResults] = useState({})

  const filteredPatients = patientSearch.trim() ? patients.filter(p => String(p.full_name || '').toLowerCase().includes(patientSearch.trim().toLowerCase())).slice(0, 5) : []

  async function handleAdd(e){
    e.preventDefault()
    setFormError('')
    
    // Determine final test name (from dropdown or custom input)
    const finalTestName = testName === 'Other' ? customTestName : testName
    
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
      setShowModal(false)
      setSelectedPatient(null); setPatientSearch(''); setTestName(''); setCustomTestName('')
      showToast(isOnline ? 'Test requested' : 'Test requested — will sync when back online')
    } catch (err) {
      setFormError(err.message || 'Could not save test request')
    } finally {
      setSaving(false)
    }
  }

  function openResultForm(test) {
    const patientDetails = patients.find(p => p.id === test.patient_id) || { full_name: test.patient_name, phone: 'N/A', id: test.patient_id }
    setFormPatient(patientDetails)
    
    const pending = combined.filter(t => t.patient_id === test.patient_id && t.isPending)
    setFormTests(pending)
    
    const initialResults = {}
    pending.forEach(t => {
      initialResults[t.id] = { result: t.result || '', price: '0', result_file: null, file_name: t.file_name || '' }
    })
    setFormResults(initialResults)
    setShowResultForm(true)
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
    try {
      for (const t of formTests) {
        const resData = formResults[t.id]
        if (resData && resData.result.trim() !== '') {
          const price = parseFloat(resData.price) || 0
          const payload = { 
            status: 'completed', 
            result: resData.result, 
            result_file: resData.result_file || null,
            updated_at: new Date().toISOString() 
          }
          
          if (t.origin === 'doctor') {
            await updateOrder(t.id, payload)
          } else {
            await updateRecord(t.id, payload)
          }

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
        }
      }
      showToast('All results saved & sent to Billing Queue')
      setShowResultForm(false)
    } catch (err) {
      showToast(err.message || 'Failed to save results')
    } finally {
      setSaving(false)
    }
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
            <div><strong>Date:</strong> ${new Date().toLocaleString()}</div>
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

  async function handleReopen(test){
    if (test.origin === 'doctor') {
      await updateOrder(test.id, { status: 'requested' })
    } else {
      await updateRecord(test.id, { status: 'pending' })
    }
    showToast(isOnline ? 'Marked pending' : 'Marked pending — will sync when back online')
  }

  async function handleDelete(test){
    if (!confirm(`Delete this test request for ${test.patient_name}?`)) return
    if (test.origin === 'doctor') {
      await deleteOrder(test.id)
    } else {
      await deleteRecord(test.id)
    }
    showToast('Test deleted')
  }

  const combined = [
    ...tests.map(t => ({ ...t, origin: 'lab', isPending: t.status === 'pending' })),
    ...orders.map(o => ({ ...o, origin: 'doctor', isPending: o.status !== 'completed' })),
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
  const completedCount = combined.filter(t => !t.isPending).length

  return (
    <>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 20, gap: 12 }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Pending</div>
            <div className="dash-stat-value">{pendingCountStat}</div>
            <div className="dash-stat-delta" style={{ color: 'var(--gold)' }}>awaiting results</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 6 9 17l-5-5"/></svg>
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
            <div className="dash-panel-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)', display: 'inline-block' }} />
              {isOnline ? 'Online' : 'Offline'}{pendingCount > 0 ? ` · ${pendingCount} syncing` : ''}{' · Auto-sends charges to Billing'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%', maxWidth: 600 }}>
            <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search patient, test..." style={{ flex: 1, minWidth: 150 }} />
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ New Request</button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : visibleSorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No lab requests yet. Add your first one above.</div>
        ) : (
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr>
                  {['Patient', 'Test', 'Status', 'Result', 'Date', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleSorted.map(test => (
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
                      <span
                        onClick={() => test.isPending ? openResultForm(test) : handleReopen(test)}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                          background: !test.isPending ? 'var(--teal-soft)' : 'rgba(201,169,97,0.14)',
                          color: !test.isPending ? 'var(--teal)' : 'var(--gold)',
                          whiteSpace: 'nowrap'
                        }}
                        title={test.isPending ? "Click to open Result Form" : "Tap to change"}
                      >
                        {!test.isPending ? 'Completed' : 'Enter Results'}
                      </span>
                    </td>
                    <td style={{ padding: 12, fontSize: 12, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {test.result || '—'}
                    </td>
                    <td style={{ padding: 12, fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {new Date(test.updated_at || test.requested_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: 12, display: 'flex', gap: 6 }}>
                      <button onClick={() => handleDelete(test)} style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }} title="Delete">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* NEW REQUEST MODAL */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }} onClick={e => { if(e.target === e.currentTarget) setShowModal(false) }}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>New Lab Request</div>
            {formError && <div className="error-box">{formError}</div>}
            <form onSubmit={handleAdd}>
              <div className="field" style={{ position: 'relative' }}>
                <label>Select Patient</label>
                <input type="text" value={selectedPatient ? selectedPatient.full_name : patientSearch} onChange={e => { setPatientSearch(e.target.value); setSelectedPatient(null) }} placeholder="Search patient name..." autoFocus disabled={!!selectedPatient} />
                {filteredPatients.length > 0 && !selectedPatient && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 150, overflowY: 'auto' }}>
                    {filteredPatients.map(p => (<div key={p.id} onClick={() => { setSelectedPatient(p); setPatientSearch('') }} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line-soft)', fontSize: 13 }}>{p.full_name}</div>))}
                  </div>
                )}
                {selectedPatient && <button type="button" onClick={() => setSelectedPatient(null)} style={{ position: 'absolute', right: 10, top: 35, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>}
              </div>

              {/* NEW: Standard Select Dropdown for Test Name */}
              <div className="field">
                <label>Test Name</label>
                <select 
                  value={testName} 
                  onChange={e => setTestName(e.target.value)} 
                  style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 6, padding: '10px', color: 'var(--text)', fontSize: 14 }}
                >
                  <option value="">Select a test...</option>
                  {COMMON_LAB_TESTS.map(test => <option key={test} value={test}>{test}</option>)}
                  <option value="Other">Other (Type manually)</option>
                </select>
              </div>

              {/* NEW: Show custom input if "Other" is selected */}
              {testName === 'Other' && (
                <div className="field">
                  <label>Enter Custom Test Name</label>
                  <input 
                    type="text" 
                    value={customTestName} 
                    onChange={e => setCustomTestName(e.target.value)} 
                    placeholder="e.g. Special Blood Smear" 
                    style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 6, padding: '10px', color: 'var(--text)', fontSize: 14 }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '0 16px' }} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '0 20px' }} disabled={saving}>{saving ? 'Saving…' : 'Save Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROFESSIONAL MULTIPLE RESULT FORM MODAL */}
      {showResultForm && formPatient && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }} onClick={e => { if(e.target === e.currentTarget) setShowResultForm(false) }}>
          <div className="card" style={{ width: '100%', maxWidth: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ padding: '20px 24px', borderBottom: '2px solid var(--teal)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--teal)' }}>{hospital?.name || 'Hospital'}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Laboratory Test Request & Result Form</div>
              </div>
              <button onClick={() => setShowResultForm(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
              {/* Auto-filled Patient Info Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, background: 'var(--bg-elevated)', padding: 16, borderRadius: 8, marginBottom: 24, border: '1px solid var(--line-soft)' }}>
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
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{new Date().toLocaleString()}</div>
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
                        style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 6, padding: '10px', color: 'var(--text)', fontSize: 14 }}
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
                          style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 6, padding: '8px', color: 'var(--text)', fontSize: 14 }}
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
                        {formResults[t.id]?.file_name && <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 4 }}>✓ {formResults[t.id]?.file_name}</div>}
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

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" style={{ width: 'auto', padding: '0 20px', border: '1px solid var(--line)' }} onClick={handlePrintForm}>
                🖨️ Print Form
              </button>
              <button className="btn btn-primary" style={{ width: 'auto', padding: '0 24px' }} onClick={handleSaveAllResults} disabled={saving}>
                {saving ? 'Saving...' : 'Save All Results & Send to Billing'}
              </button>
            </div>
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