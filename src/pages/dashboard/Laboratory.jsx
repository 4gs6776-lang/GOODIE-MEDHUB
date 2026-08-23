import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import SearchInput from '../../components/common/SearchInput'

export default function Laboratory(){
  const { profile, hospital } = useAuth()
  const { records: tests, loading: loadingTests, isOnline, pendingCount, addRecord, deleteRecord, updateRecord } = useOfflineTable('lab_tests', hospital?.id)
  const { records: orders, loading: loadingOrders, updateRecord: updateOrder, deleteRecord: deleteOrder } = useOfflineTable('lab_orders', hospital?.id)
  const { records: patients } = useOfflineTable('patients', hospital?.id) // NEW: Fetch patients
  const { addRecord: addBillableCharge } = useOfflineTable('billable_charges', hospital?.id)
  
  const loading = loadingTests || loadingOrders
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [selectedPatient, setSelectedPatient] = useState(null) // NEW: For dropdown
  const [patientSearch, setPatientSearch] = useState('') // NEW: For dropdown
  const [testName, setTestName] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // NEW: Batch Results State
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [batchPatient, setBatchPatient] = useState(null)
  const [batchResults, setBatchResults] = useState({})

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const filteredPatients = patientSearch.trim() ? patients.filter(p => String(p.full_name || '').toLowerCase().includes(patientSearch.trim().toLowerCase())).slice(0, 5) : []

  async function handleAdd(e){
    e.preventDefault()
    setFormError('')
    if (!selectedPatient || !testName) {
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
        patient_id: selectedPatient.id, // Link patient ID
        patient_name: selectedPatient.full_name,
        test_name: testName,
        status: 'pending',
        result: null,
        requested_at: new Date().toISOString(),
        created_by: profile.id,
      })
      setShowModal(false)
      setSelectedPatient(null); setPatientSearch(''); setTestName('')
      showToast(isOnline ? 'Test requested' : 'Test requested — will sync when back online')
    } catch (err) {
      setFormError(err.message || 'Could not save test request')
    } finally {
      setSaving(false)
    }
  }

  // NEW: Open Batch Results Grid
  function openBatchResults(test) {
    // Find all pending tests for this exact patient
    const patientTests = combined.filter(t => t.patient_name === test.patient_name && t.isPending)
    setBatchPatient(test)
    
    const initialResults = {}
    patientTests.forEach(t => {
      initialResults[t.id] = { result: t.result || '', price: '0' }
    })
    setBatchResults(initialResults)
    setShowBatchModal(true)
  }

  // NEW: Save Batch Results
  async function handleSaveBatch() {
    setSaving(true)
    try {
      const testsToUpdate = combined.filter(t => t.patient_name === batchPatient.patient_name && t.isPending)
      
      for (const t of testsToUpdate) {
        const resData = batchResults[t.id]
        if (resData && resData.result.trim() !== '') {
          const price = parseFloat(resData.price) || 0
          
          if (t.origin === 'doctor') {
            await updateOrder(t.id, { status: 'completed', result: resData.result })
          } else {
            await updateRecord(t.id, { status: 'completed', result: resData.result })
          }

          // Send Charge to Billing
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
      showToast('Results saved & sent to Billing Queue')
      setShowBatchModal(false)
    } catch (err) {
      showToast(err.message || 'Failed to save results')
    } finally {
      setSaving(false)
    }
  }

  function updateBatchResult(testId, field, value) {
    setBatchResults(prev => ({
      ...prev,
      [testId]: { ...prev[testId], [field]: value }
    }))
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

  const sorted = [...combined].sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at))
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
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr>
                  {['Patient', 'Test', 'Status', 'Result', ''].map(h => (
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
                    </td>
                    <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{test.test_name}</td>
                    <td style={{ padding: 12 }}>
                      <span
                        onClick={() => test.isPending ? openBatchResults(test) : handleReopen(test)}
                        style={{
                          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                          background: !test.isPending ? 'var(--teal-soft)' : 'rgba(201,169,97,0.14)',
                          color: !test.isPending ? 'var(--teal)' : 'var(--gold)',
                          whiteSpace: 'nowrap'
                        }}
                        title={test.isPending ? "Click to enter results grid" : "Tap to change"}
                      >
                        {!test.isPending ? 'Completed' : 'Enter Results'}
                      </span>
                    </td>
                    <td style={{ padding: 12, fontSize: 12, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {test.result || '—'}
                    </td>
                    <td style={{ padding: 12 }}>
                      <button
                        onClick={() => handleDelete(test)}
                        style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}
                        title="Delete"
                      >✕</button>
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
              {/* NEW: Patient Dropdown */}
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

              <div className="field">
                <label>Test Name</label>
                <input value={testName} onChange={e => setTestName(e.target.value)} placeholder="e.g. Full Blood Count" />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '0 16px' }} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '0 20px' }} disabled={saving}>{saving ? 'Saving…' : 'Save Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW: BATCH RESULTS GRID MODAL */}
      {showBatchModal && batchPatient && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }} onClick={e => { if(e.target === e.currentTarget) setShowBatchModal(false) }}>
          <div className="card" style={{ width: '100%', maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>Enter Lab Results</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{batchPatient.patient_name}</div>
              </div>
              <button onClick={() => setShowBatchModal(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', fontWeight: 700, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12, borderBottom: '1px solid var(--line-soft)', paddingBottom: 8 }}>
                <div style={{ flex: 1.2 }}>Test Name</div>
                <div style={{ flex: 1.8 }}>Result</div>
                <div style={{ flex: 1, maxWidth: 100 }}>Price (₦)</div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {combined.filter(t => t.patient_name === batchPatient.patient_name && t.isPending).map(t => (
                  <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ flex: 1.2, fontSize: 13, fontWeight: 600 }}>{t.test_name}</div>
                    <div style={{ flex: 1.8 }}>
                      <input 
                        type="text" 
                        value={batchResults[t.id]?.result || ''} 
                        onChange={e => updateBatchResult(t.id, 'result', e.target.value)} 
                        placeholder="Enter result..." 
                        style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 6, padding: '8px', color: 'var(--text)', fontSize: 13 }}
                      />
                    </div>
                    <div style={{ flex: 1, maxWidth: 100 }}>
                      <input 
                        type="number" 
                        value={batchResults[t.id]?.price || '0'} 
                        onChange={e => updateBatchResult(t.id, 'price', e.target.value)} 
                        placeholder="0" 
                        style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 6, padding: '8px', color: 'var(--text)', fontSize: 13 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" style={{ width: 'auto', padding: '0 24px' }} onClick={handleSaveBatch} disabled={saving}>
                {saving ? 'Saving...' : 'Save All Results'}
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