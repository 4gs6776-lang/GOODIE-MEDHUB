import { useState, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import { TagAutocomplete } from '../../components/ClinicalAutocomplete'
import { SYMPTOM_OPTIONS, DIAGNOSIS_OPTIONS, FREQUENCY_OPTIONS, ROUTE_OPTIONS, DEFAULT_TEMPLATES } from '../../lib/clinicalData'
import AdmissionRequestModal from '../../components/AdmissionRequestModal'

// NEW: Global Medication Reference List (allows searching even if hospital has 0 stock)
const GLOBAL_MEDICATIONS = [
  { id: 'GMED-001', name: 'Ceftriaxone 1g Injection', generic: 'Ceftriaxone', strength: '1g', form: 'Injection', route: 'IV/IM' },
  { id: 'GMED-002', name: 'Ceftriaxone 500mg Injection', generic: 'Ceftriaxone', strength: '500mg', form: 'Injection', route: 'IV/IM' },
  { id: 'GMED-003', name: 'Amoxicillin 500mg Capsule', generic: 'Amoxicillin', strength: '500mg', form: 'Capsule', route: 'Oral' },
  { id: 'GMED-004', name: 'Paracetamol 500mg Tablet', generic: 'Paracetamol', strength: '500mg', form: 'Tablet', route: 'Oral' },
  { id: 'GMED-005', name: 'Artesunate 120mg Injection', generic: 'Artesunate', strength: '120mg', form: 'Injection', route: 'IV' },
  { id: 'GMED-006', name: 'Methyldopa 250mg Tablet', generic: 'Methyldopa', strength: '250mg', form: 'Tablet', route: 'Oral' },
  // Can be expanded or moved to a database table later
]

const EMPTY_MED = { 
  inventory_item_id: null, global_med_id: null, drugName: '', dose: '', route: '', frequency: '', frequencyCustom: '', 
  duration: '', quantity: '', instructions: '', stock_at_prescription: 0, 
  availability_status: null, accepted_unavailable: false 
}

export default function DoctorWorkbench() {
  const { profile, hospital } = useAuth()
  const { records: patients, loading: loadingPatients, updateRecord: updatePatient } = useOfflineTable('patients', hospital?.id)
  const { records: vitals, loading: loadingVitals, updateRecord: updateVitals } = useOfflineTable('patient_vitals', hospital?.id)
  const { records: labOrders, loading: loadingLabOrders, addRecord: addLabOrder } = useOfflineTable('lab_orders', hospital?.id)
  const { records: prescriptions, loading: loadingPrescriptions, addRecord: addPrescription, updateRecord: updatePrescription, deleteRecord: deletePrescription } = useOfflineTable('prescriptions', hospital?.id)
  const { records: inventoryItems } = useOfflineTable('inventory_items', hospital?.id)
  const { records: hospitalTemplates, addRecord: addTemplate } = useOfflineTable('prescription_templates', hospital?.id)
  const { records: admissionRequests, addRecord: addAdmissionRequest } = useOfflineTable('admission_requests', hospital?.id)
  const { addRecord: addTimelineEvent } = useOfflineTable('admission_timeline_events', hospital?.id)
  const { addRecord: addPharmacyOrder } = useOfflineTable('pharmacy_orders', hospital?.id)
  
  const [showAdmissionModal, setShowAdmissionModal] = useState(false)
  const loading = loadingPatients || loadingVitals || loadingLabOrders || loadingPrescriptions
  const [activeVitalsId, setActiveVitalsId] = useState(null)
  const [toast, setToast] = useState(null)
  const [completing, setCompleting] = useState(false)

  const [chiefComplaints, setChiefComplaints] = useState('')
  const [historyPresenting, setHistoryPresenting] = useState('')
  const [pastMedicalHistory, setPastMedicalHistory] = useState('')
  const [pastSurgicalHistory, setPastSurgicalHistory] = useState('')
  const [drugHistory, setDrugHistory] = useState('')
  const [allergyHistory, setAllergyHistory] = useState('')
  const [familySocialHistory, setFamilySocialHistory] = useState('')
  const [examinationFindings, setExaminationFindings] = useState('')
  const [clinicalNotes, setClinicalNotes] = useState('')
  const [treatmentPlan, setTreatmentPlan] = useState('')
  const [followUpNotes, setFollowUpNotes] = useState('')
  const [symptoms, setSymptoms] = useState([])
  const [diagnoses, setDiagnoses] = useState([])

  const [labTestName, setLabTestName] = useState('')
  const [labNotes, setLabNotes] = useState('')
  const [savingLabOrder, setSavingLabOrder] = useState(false)

  const [medications, setMedications] = useState([])
  const [medBuilder, setMedBuilder] = useState(EMPTY_MED)
  const [editingMedLocalId, setEditingMedLocalId] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [savingPrescriptions, setSavingPrescriptions] = useState(false)
  const [drugSearch, setDrugSearch] = useState('')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  // NEW: Search Global Medications first, then cross-reference with Hospital Inventory
  const drugSearchResults = useMemo(() => {
    if (!drugSearch.trim()) return []
    const q = drugSearch.toLowerCase()
    
    // Combine Global Meds + Hospital Inventory into one searchable list
    const combinedResults = {}
    
    // Add matching hospital items
    inventoryItems.forEach(it => {
      if (String(it.category).toLowerCase() === 'drug' && (String(it.name).toLowerCase().includes(q) || String(it.generic_name).toLowerCase().includes(q))) {
        combinedResults[it.name] = {
          id: it.id, global_med_id: null, name: it.name, generic: it.generic_name || 'Generic',
          strength: it.strength || '', form: it.dosage_form || '', route: '',
          stock: Number(it.quantity || 0)
        }
      }
    })

    // Add matching global meds (if not already added by hospital inventory)
    GLOBAL_MEDICATIONS.forEach(gm => {
      if (gm.name.toLowerCase().includes(q) || gm.generic.toLowerCase().includes(q)) {
        if (!combinedResults[gm.name]) {
          // Check if hospital has this global med in stock
          const hospMatch = inventoryItems.find(it => it.name.toLowerCase() === gm.name.toLowerCase())
          combinedResults[gm.name] = {
            id: hospMatch?.id || null, global_med_id: gm.id, name: gm.name, generic: gm.generic,
            strength: gm.strength, form: gm.form, route: gm.route,
            stock: hospMatch ? Number(hospMatch.quantity || 0) : 0
          }
        }
      }
    })

    return Object.values(combinedResults).slice(0, 8)
  }, [drugSearch, inventoryItems])

  function selectDrug(item) {
    setMedBuilder(b => ({
      ...b, 
      inventory_item_id: item.id, 
      global_med_id: item.global_med_id,
      drugName: item.name, 
      dose: item.strength || b.dose,
      route: item.route || item.form || b.route, 
      stock_at_prescription: item.stock,
      availability_status: item.stock > 0 ? 'AVAILABLE' : 'UNAVAILABLE', 
      accepted_unavailable: false
    }))
    setDrugSearch('')
  }

  const queue = vitals.filter(v => v.status === 'waiting').sort((a, b) => {
    const order = { Emergency: 0, Urgent: 1, Routine: 2 }
    const urgencyDiff = (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3)
    if (urgencyDiff !== 0) return urgencyDiff
    return new Date(a.recorded_at || a.created_at) - new Date(b.recorded_at || b.created_at)
  })

  const activeVitals = vitals.find(v => v.id === activeVitalsId) || null
  const activePatient = activeVitals ? patients.find(p => p.id === activeVitals.patient_id) || null : null
  const activePatientLabOrders = activeVitals ? labOrders.filter(o => o.patient_vitals_id === activeVitals.id) : []
  const allTemplates = [...DEFAULT_TEMPLATES, ...hospitalTemplates.map(t => ({ ...t, builtin: false }))]

  function openConsultation(v) {
    setActiveVitalsId(v.id)
    setChiefComplaints(v.chief_complaints || ''); setHistoryPresenting(v.history_presenting_complaint || '')
    setPastMedicalHistory(v.past_medical_history || ''); setPastSurgicalHistory(v.past_surgical_history || '')
    setDrugHistory(v.drug_history || ''); setAllergyHistory(v.allergy_history || '')
    setFamilySocialHistory(v.family_social_history || ''); setExaminationFindings(v.examination_findings || v.observations || '')
    setClinicalNotes(v.clinical_notes || ''); setTreatmentPlan(v.treatment_plan || ''); setFollowUpNotes(v.follow_up_notes || '')
    setSymptoms(Array.isArray(v.symptoms) ? v.symptoms : []); setDiagnoses(Array.isArray(v.diagnoses) ? v.diagnoses : [])
    
    const existing = prescriptions.filter(p => p.patient_vitals_id === v.id && p.status !== 'cancelled').map(p => ({
      localId: p.id, dbId: p.id, inventory_item_id: p.inventory_item_id, drugName: p.drug_name, dose: p.dosage, 
      route: p.route || '', frequency: p.frequency || '', frequencyCustom: '', duration: p.duration || '', 
      quantity: p.quantity || '', instructions: p.instructions || '', stock_at_prescription: p.stock_at_prescription || 0,
      availability_status: p.availability_status || 'AVAILABLE', accepted_unavailable: p.availability_status === 'UNAVAILABLE'
    }))
    setMedications(existing); resetMedBuilder(); setShowPreview(false); setSelectedTemplateId('')
  }

  function clearWorkbench() {
    setActiveVitalsId(null); setChiefComplaints(''); setHistoryPresenting(''); setPastMedicalHistory(''); setPastSurgicalHistory('')
    setDrugHistory(''); setAllergyHistory(''); setFamilySocialHistory(''); setExaminationFindings(''); setClinicalNotes('')
    setTreatmentPlan(''); setFollowUpNotes(''); setSymptoms([]); setDiagnoses([]); setLabTestName(''); setLabNotes('')
    setMedications([]); resetMedBuilder(); setSelectedTemplateId(''); setShowPreview(false)
  }

  function resetMedBuilder() { setMedBuilder(EMPTY_MED); setEditingMedLocalId(null); setDrugSearch('') }

  async function handleAddLabOrder(e) {
    e.preventDefault()
    if (!activeVitals || !labTestName) return
    if (!hospital || !profile) return showToast('Still loading your account...')
    setSavingLabOrder(true)
    try {
      await addLabOrder({ patient_vitals_id: activeVitals.id, patient_name: activePatient?.full_name || 'Unknown', test_name: labTestName, notes: labNotes || null, status: 'requested', requested_at: new Date().toISOString(), created_by: profile.id })
      setLabTestName(''); setLabNotes(''); showToast('Lab order sent')
    } catch (err) { showToast(err.message) } finally { setSavingLabOrder(false) }
  }

  function handleAddOrUpdateMedToDraft() {
    if (!medBuilder.drugName.trim() || !medBuilder.dose.trim()) return showToast('Drug name and dose are required')
    if (medBuilder.availability_status === 'UNAVAILABLE' && !medBuilder.accepted_unavailable) return showToast('Please choose whether to continue prescribing or remove the unavailable medication.')
    
    if (editingMedLocalId) {
      setMedications(meds => meds.map(m => m.localId === editingMedLocalId ? { ...m, ...medBuilder, localId: m.localId, dbId: m.dbId } : m))
    } else {
      setMedications(meds => [...meds, { ...medBuilder, localId: crypto.randomUUID(), dbId: null }])
    }
    resetMedBuilder()
  }

  function getActiveAdmissionRequest(patientId) {
    if (!patientId) return null
    return admissionRequests.filter(r => r.patient_id === patientId && r.status !== 'cancelled' && r.status !== 'rejected').sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null
  }

  async function handleSubmitAdmissionRequest(payload) {
    if (!activePatient || !hospital || !profile) return showToast('Still loading your account...')
    const request = await addAdmissionRequest({ patient_id: activePatient.id, doctor_id: profile.id, doctor_name: profile.full_name || null, status: 'pending', ...payload })
    try { await addTimelineEvent({ patient_id: activePatient.id, admission_request_id: request?.id || null, event_type: 'recommended', description: `Dr. ${profile.full_name || 'Unknown'} recommended admission${payload.diagnosis ? ` — ${payload.diagnosis}` : ''}.`, created_by: profile.id }) } catch {}
    setShowAdmissionModal(false); showToast('Admission recommendation submitted.')
  }

  function handleEditMed(m) {
    setMedBuilder({ ...m }); setEditingMedLocalId(m.localId); setDrugSearch('')
  }

  async function handleRemoveMed(m) {
    if (m.dbId) { if (!confirm(`Remove ${m.drugName}?`)) return; await deletePrescription(m.dbId) }
    setMedications(meds => meds.filter(x => x.localId !== m.localId))
    if (editingMedLocalId === m.localId) resetMedBuilder()
  }

  function handleApplyTemplate() {
    const template = allTemplates.find(t => t.id === selectedTemplateId)
    if (!template) return
    const loaded = template.medications.map(med => ({ localId: crypto.randomUUID(), dbId: null, inventory_item_id: null, drugName: med.drug_name, dose: med.dose, route: med.route || '', frequency: med.frequency || '', frequencyCustom: '', duration: med.duration || '', quantity: med.quantity || '', instructions: med.instructions || '', stock_at_prescription: 0, availability_status: 'AVAILABLE', accepted_unavailable: false }))
    setMedications(meds => [...meds, ...loaded]); setSelectedTemplateId(''); showToast(`Loaded "${template.name}"`)
  }

  async function handleSaveAsTemplate() {
    if (medications.length === 0) return
    const name = prompt('Template name:')
    if (!name) return
    const category = prompt('Category (optional):') || null
    try {
      await addTemplate({ name, category, medications: medications.map(m => ({ drug_name: m.drugName, dose: m.dose, route: m.route, frequency: m.frequency === 'Custom' ? m.frequencyCustom : m.frequency, duration: m.duration, quantity: m.quantity, instructions: m.instructions })), created_by: profile?.id })
      showToast('Template saved')
    } catch (err) { showToast(err.message) }
  }

  async function handleSavePrescriptions(status) {
    if (!activeVitals || medications.length === 0) return
    if (!hospital || !profile) return showToast('Still loading account...')
    
    const unaccepted = medications.find(m => m.availability_status === 'UNAVAILABLE' && !m.accepted_unavailable)
    if (unaccepted) return showToast('Some medications are unavailable. Please accept or remove them first.')

    setSavingPrescriptions(true)
    try {
      const updated = []
      for (const m of medications) {
        const payload = {
          patient_vitals_id: activeVitals.id, patient_id: activeVitals.patient_id, patient_name: activePatient?.full_name || 'Unknown',
          encounter_id: activeVitals.id, doctor_id: profile?.id, inventory_item_id: m.inventory_item_id, drug_name: m.drugName,
          dosage: m.dose, route: m.route || null, frequency: (m.frequency === 'Custom' ? m.frequencyCustom : m.frequency) || null,
          duration: m.duration || null, quantity: m.quantity || null, instructions: m.instructions || null,
          availability_status: m.availability_status || 'AVAILABLE', stock_at_prescription: m.stock_at_prescription || 0,
          status, prescribed_at: new Date().toISOString(), created_by: profile.id
        }
        if (m.dbId) { await updatePrescription(m.dbId, payload); updated.push(m) } 
        else {
          const saved = await addPrescription(payload)
          if (status === 'active' && saved?.id) {
            await addPharmacyOrder({ hospital_id: hospital.id, prescription_id: saved.id, patient_id: activeVitals.patient_id, patient_name: payload.patient_name, encounter_id: activeVitals.id, doctor_id: profile?.id, doctor_name: profile?.full_name, status: 'pending_pharmacy' })
          }
          updated.push({ ...m, dbId: saved?.id || null })
        }
      }
      setMedications(updated)
      showToast(status === 'draft' ? 'Draft saved' : 'Prescription finalized & sent to Pharmacy')
    } catch (err) { showToast(err.message) } finally { setSavingPrescriptions(false) }
  }

  function handlePrint() {
    if (medications.length === 0) return
    const patientName = activePatient?.full_name || 'Patient'
    const rows = medications.map((m, i) => `<li><strong>${i + 1}. ${m.drugName}</strong><br/>${m.dose} ${m.route || ''} ${m.frequency || ''}${m.duration ? ` for ${m.duration}` : ''}.${m.instructions ? `<br/><em>${m.instructions}</em>` : ''}</li>`).join('')
    const html = `<html><head><title>Prescription</title><style>body{font-family:sans-serif;padding:32px;color:#111}h1{font-size:18px}.meta{color:#555;font-size:13px;margin-bottom:20px}ol{padding-left:20px}li{margin-bottom:14px}</style></head><body><h1>${hospital?.name || 'Prescription'}</h1><div class="meta">Patient: ${patientName} · Date: ${new Date().toLocaleDateString()} · Dr: ${profile?.full_name || ''}</div><ol>${rows}</ol></body></html>`
    const win = window.open('', '_blank'); if (!win) return; win.document.write(html); win.document.close(); win.focus(); win.print()
  }

  async function handleCompleteConsultation() {
    if (!activeVitals) return
    if (!confirm(`Complete consultation for ${activePatient?.full_name}?`)) return
    setCompleting(true)
    try {
      if (medications.length > 0) await handleSavePrescriptions('active')
      const diagnosisSummary = diagnoses.map(d => d.code ? `${d.label} — ${d.code}` : d.label).join('; ')
      await updateVitals(activeVitals.id, {
        status: 'completed', chief_complaints: chiefComplaints || null, history_presenting_complaint: historyPresenting || null,
        past_medical_history: pastMedicalHistory || null, past_surgical_history: pastSurgicalHistory || null, drug_history: drugHistory || null,
        allergy_history: allergyHistory || null, family_social_history: familySocialHistory || null, examination_findings: examinationFindings || null,
        observations: examinationFindings || null, clinical_notes: clinicalNotes || null, treatment_plan: treatmentPlan || null,
        follow_up_notes: followUpNotes || null, symptoms, diagnoses, diagnosis: diagnosisSummary || null,
        completed_at: new Date().toISOString(), completed_by: profile?.id || null
      })
      if (activePatient) {
        const hasLabOrders = activePatientLabOrders.length > 0
        await updatePatient(activePatient.id, { queue_status: hasLabOrders ? 'in_lab' : 'discharged', queue_updated_at: new Date().toISOString() })
      }
      showToast('Consultation completed'); clearWorkbench()
    } catch (err) { showToast(err.message) } finally { setCompleting(false) }
  }

  function vitalRow(label, value, unit) {
    return <div><div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div><div style={{ fontSize: 14, fontWeight: 700 }}>{value ? `${value}${unit ? ' ' + unit : ''}` : '—'}</div></div>
  }
  function summaryRow(label, value) {
    return <div style={{ display: 'flex', gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--line-soft)' }}><div style={{ width: 120, color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>{label}</div><div style={{ flex: 1, fontSize: 13 }}>{value || <span style={{ color: 'var(--muted)' }}>—</span>}</div></div>
  }

  const historySummary = [chiefComplaints && `Chief complaint: ${chiefComplaints}`, historyPresenting && `HPC: ${historyPresenting}`, pastMedicalHistory && `PMH: ${pastMedicalHistory}`, pastSurgicalHistory && `PSH: ${pastSurgicalHistory}`, drugHistory && `Drug Hx: ${drugHistory}`, allergyHistory && `Allergies: ${allergyHistory}`, familySocialHistory && `Family/Social: ${familySocialHistory}`].filter(Boolean).join(' · ')
    return (
    <>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="dash-stat-card"><div className="dash-stat-icon" style={{ background: 'rgba(139,124,246,0.14)', color: 'var(--violet)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6.3 7-6.3s7 2.8 7 6.3"/></svg></div><div><div className="dash-stat-label">Waiting for Doctor</div><div className="dash-stat-value">{queue.length}</div><div className="dash-stat-delta" style={{ color: 'var(--gold)' }}>triaged</div></div></div>
        <div className="dash-stat-card"><div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 6 9 17l-5-5"/></svg></div><div><div className="dash-stat-label">Completed</div><div className="dash-stat-value">{vitals.filter(v => v.status === 'completed').length}</div><div className="dash-stat-delta">total</div></div></div>
        <div className="dash-stat-card"><div className="dash-stat-icon" style={{ background: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M12 13v5M9.5 15.5h5"/></svg></div><div style={{ flex: 1 }}><div className="dash-stat-label">Active Consultation</div><div className="dash-stat-value" style={{ fontSize: 17 }}>{activePatient?.full_name || 'None'}</div><div className="dash-stat-delta">{activeVitals ? 'in progress' : 'select'}</div>{activePatient && (() => { const req = getActiveAdmissionRequest(activePatient.id); if (!req) return <button type="button" className="btn btn-ghost" style={{ width: 'auto', marginTop: 10, padding: '6px 12px', fontSize: 12 }} onClick={() => setShowAdmissionModal(true)}>Recommend Admission</button>; const l = { pending: 'Requested', approved: 'Approved', converted: 'Admitted' }; const c = { pending: 'var(--gold)', approved: 'var(--teal)', converted: 'var(--teal)' }; return <div style={{ marginTop: 10, display: 'inline-block', padding: '5px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, color: c[req.status] || 'var(--muted)', background: 'var(--bg-elevated)', border: `1px solid ${c[req.status]}` }}>{l[req.status] || req.status}</div> })()}</div></div>
      </div>

      <div className="dash-row dash-row-2">
        <div className="dash-panel"><div className="dash-panel-head"><div><div className="dash-panel-title">Consultation Queue</div><div className="dash-panel-sub">Triaged patients</div></div></div>{loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div> : queue.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No patients waiting.</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{queue.map(v => { const p = patients.find(pt => pt.id === v.patient_id); const isActive = activeVitalsId === v.id; return <div key={v.id} onClick={() => openConsultation(v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '10px 14px', borderRadius: 10, background: isActive ? 'var(--teal-soft)' : 'var(--bg-elevated)', border: isActive ? '1px solid var(--teal)' : '1px solid var(--line-soft)' }}><div><div style={{ fontWeight: 700, color: isActive ? 'var(--teal)' : undefined }}>{p?.full_name || v.patient_name}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>BP {v.blood_pressure || '—'} · Pulse {v.pulse_rate || '—'}</div></div><span style={{ fontSize: 11, fontWeight: 700, color: v.urgency === 'Emergency' ? 'var(--danger)' : 'var(--gold)' }}>{v.urgency || 'Waiting'}</span></div> })}</div>}</div>
        <div className="dash-panel"><div className="dash-panel-head"><div><div className="dash-panel-title">Recorded Vitals</div><div className="dash-panel-sub">{activePatient?.full_name || 'No patient selected'}</div></div></div>{!activeVitals ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Select a patient from the queue.</div> : <><div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>{vitalRow('Blood Pressure', activeVitals.blood_pressure)}{vitalRow('Pulse', activeVitals.pulse_rate, 'bpm')}{vitalRow('Temperature', activeVitals.temperature, '°C')}{vitalRow('SpO2', activeVitals.spo2, '%')}{vitalRow('Resp Rate', activeVitals.respiratory_rate, 'bpm')}{vitalRow('Weight', activeVitals.weight, 'kg')}{vitalRow('Height', activeVitals.height, 'cm')}{vitalRow('Urgency', activeVitals.urgency)}</div>{activeVitals.nurse_notes && <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-soft)', fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>Nurse note: "{activeVitals.nurse_notes}"</div>}</>}</div>
      </div>

      {activeVitals && (
        <>
          <div className="dash-panel" style={{ marginTop: 20 }}>
            <div className="dash-panel-head"><div><div className="dash-panel-title">History & Clinical Notes</div><div className="dash-panel-sub">Consultation record</div></div></div>
            <div className="field"><label>Chief Complaint</label><textarea rows={2} value={chiefComplaints} onChange={e => setChiefComplaints(e.target.value)} placeholder="e.g. Fever and headache for 3 days" /></div>
            <div className="field"><label>History of Presenting Complaint</label><textarea rows={3} value={historyPresenting} onChange={e => setHistoryPresenting(e.target.value)} placeholder="Onset, duration, character, associated symptoms…" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label>Past Medical History</label><textarea rows={2} value={pastMedicalHistory} onChange={e => setPastMedicalHistory(e.target.value)} placeholder="e.g. Hypertension diagnosed 2019" /></div>
              <div className="field"><label>Past Surgical History</label><textarea rows={2} value={pastSurgicalHistory} onChange={e => setPastSurgicalHistory(e.target.value)} placeholder="e.g. Appendectomy 2015" /></div>
              <div className="field"><label>Drug History</label><textarea rows={2} value={drugHistory} onChange={e => setDrugHistory(e.target.value)} placeholder="Current / regular medications" /></div>
              <div className="field"><label>Allergy History</label><textarea rows={2} value={allergyHistory} onChange={e => setAllergyHistory(e.target.value)} placeholder="e.g. Penicillin — rash" /></div>
            </div>
            <div className="field"><label>Family / Social History</label><textarea rows={2} value={familySocialHistory} onChange={e => setFamilySocialHistory(e.target.value)} placeholder="Smoking, alcohol, occupation, family conditions…" /></div>
            <div className="field"><label>Symptoms</label><TagAutocomplete options={SYMPTOM_OPTIONS} value={symptoms} onChange={setSymptoms} placeholder="Type to search symptoms, e.g. fev…" /></div>
            <div className="field"><label>Diagnosis</label><TagAutocomplete options={DIAGNOSIS_OPTIONS} value={diagnoses} onChange={setDiagnoses} placeholder="Type to search diagnoses, e.g. mala…" /></div>
            <div className="field"><label>Examination Findings</label><textarea rows={3} value={examinationFindings} onChange={e => setExaminationFindings(e.target.value)} placeholder="On examination…" /></div>
            <div className="field"><label>Clinical Notes</label><textarea rows={3} value={clinicalNotes} onChange={e => setClinicalNotes(e.target.value)} placeholder="Additional notes…" /></div>
            <div className="field"><label>Treatment Plan</label><textarea rows={2} value={treatmentPlan} onChange={e => setTreatmentPlan(e.target.value)} placeholder="e.g. Antipyretics, rest, review in 3 days" /></div>
            <div className="field"><label>Follow-up Notes</label><textarea rows={2} value={followUpNotes} onChange={e => setFollowUpNotes(e.target.value)} placeholder="e.g. Return in 1 week, sooner if symptoms worsen" /></div>
          </div>

          <div className="dash-row dash-row-2" style={{ marginTop: 20 }}>
            <div className="dash-panel">
              <div className="dash-panel-head"><div><div className="dash-panel-title">Lab Orders</div><div className="dash-panel-sub">Request tests</div></div></div>
              <form onSubmit={handleAddLabOrder}>
                <div className="field"><label>Test Name</label><input value={labTestName} onChange={e => setLabTestName(e.target.value)} placeholder="e.g. Full Blood Count" /></div>
                <div className="field"><label>Notes</label><input value={labNotes} onChange={e => setLabNotes(e.target.value)} placeholder="Optional" /></div>
                <button type="submit" className="btn btn-primary" disabled={savingLabOrder}>{savingLabOrder ? 'Sending…' : 'Send Lab Order'}</button>
              </form>
              {activePatientLabOrders.length > 0 && <ul className="dash-legend" style={{ marginTop: 16 }}>{activePatientLabOrders.map(o => <li key={o.id}><span className="dash-legend-name"><span className="dash-legend-dot" style={{ background: 'var(--gold)' }} />{o.test_name}</span><span className="dash-legend-val">{o.status}</span></li>)}</ul>}
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head"><div><div className="dash-panel-title">Prescription</div><div className="dash-panel-sub">Build medications</div></div></div>
              <div className="field"><label>Load Template</label><div style={{ display: 'flex', gap: 8 }}><select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} style={{ flex: 1 }}><option value="">Select…</option><optgroup label="Built-in">{DEFAULT_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>{hospitalTemplates.length > 0 && <optgroup label="Hospital">{hospitalTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>}</select><button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={handleApplyTemplate} disabled={!selectedTemplateId}>Load</button></div></div>

              <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14, marginTop: 6 }}>
                <div className="field" style={{ position: 'relative' }}>
                  <label>Drug / Medication Search</label>
                  <input value={drugSearch} onChange={e => setDrugSearch(e.target.value)} placeholder="Search medication by generic or brand name..." />
                  {drugSearchResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 240, overflowY: 'auto' }}>
                      {drugSearchResults.map(it => { const stock = Number(it.stock || 0); return <div key={it.global_med_id || it.id} onClick={() => selectDrug(it)} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--line-soft)' }}><div style={{ fontWeight: 700, fontSize: 13 }}>{it.name}</div><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: 'var(--muted)' }}>{it.generic} • {it.form || 'N/A'}</span><span style={{ fontSize: 11, color: stock > 0 ? 'var(--teal)' : 'var(--danger)', fontWeight: 700 }}>{stock > 0 ? `🟢 In Stock: ${stock}` : '🔴 Out of Stock'}</span></div></div> })}
                    </div>
                  )}
                </div>

                {medBuilder.availability_status === 'UNAVAILABLE' && (
                  <div style={{ border: '1px solid var(--danger)', background: 'rgba(235,87,87,0.05)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                    <div style={{ color: 'var(--danger)', fontWeight: 800, marginBottom: 6 }}>🔴 Medication Unavailable</div>
                    <div style={{ fontSize: 13, marginBottom: 8 }}>This medication is not available in the hospital.</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Current hospital stock: 0</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-primary" style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }} onClick={() => setMedBuilder(b => ({ ...b, accepted_unavailable: true }))}>Continue Prescribing</button>
                      <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '6px 12px', fontSize: 12, border: '1px solid var(--danger)', color: 'var(--danger)' }} onClick={resetMedBuilder}>Remove Medication</button>
                    </div>
                  </div>
                )}
                {medBuilder.accepted_unavailable && <div style={{ fontSize: 12, color: 'var(--gold)', marginBottom: 12, fontWeight: 700 }}>⚠ UNAVAILABLE AT TIME OF PRESCRIPTION</div>}
                {medBuilder.availability_status === 'AVAILABLE' && medBuilder.drugName && <div style={{ fontSize: 12, color: 'var(--teal)', marginBottom: 12, fontWeight: 700 }}>🟢 AVAILABLE (Hospital Stock: {medBuilder.stock_at_prescription})</div>}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field"><label>Dose</label><input value={medBuilder.dose} onChange={e => setMedBuilder(b => ({ ...b, dose: e.target.value }))} placeholder="e.g. 500 mg" /></div>
                  <div className="field"><label>Route</label><select value={medBuilder.route} onChange={e => setMedBuilder(b => ({ ...b, route: e.target.value }))}><option value="">Select route…</option>{ROUTE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                  <div className="field"><label>Frequency</label><select value={medBuilder.frequency} onChange={e => setMedBuilder(b => ({ ...b, frequency: e.target.value }))}><option value="">Select frequency…</option>{FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                  {medBuilder.frequency === 'Custom' && <div className="field"><label>Custom Freq</label><input value={medBuilder.frequencyCustom} onChange={e => setMedBuilder(b => ({ ...b, frequencyCustom: e.target.value }))} placeholder="e.g. Every other day" /></div>}
                  <div className="field"><label>Duration</label><input value={medBuilder.duration} onChange={e => setMedBuilder(b => ({ ...b, duration: e.target.value }))} placeholder="e.g. 7 days" /></div>
                  <div className="field"><label>Quantity</label><input value={medBuilder.quantity} onChange={e => setMedBuilder(b => ({ ...b, quantity: e.target.value }))} placeholder="e.g. 21 tablets" /></div>
                </div>
                <div className="field"><label>Instructions</label><input value={medBuilder.instructions} onChange={e => setMedBuilder(b => ({ ...b, instructions: e.target.value }))} placeholder="e.g. Take 1 tablet after meals" /></div>
                <button type="button" className="btn btn-primary" onClick={handleAddOrUpdateMedToDraft}>{editingMedLocalId ? 'Update Medication' : '+ Add Medication'}</button>
                {editingMedLocalId && <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }} onClick={resetMedBuilder}>Cancel Edit</button>}
              </div>

              {medications.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Medications ({medications.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {medications.map(m => (
                      <div key={m.localId} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.drugName}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{m.dose} · {m.route || '—'} · {m.frequency}{m.duration ? ` · ${m.duration}` : ''}</div>
                            {m.availability_status === 'AVAILABLE' && <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 6, fontWeight: 700 }}>🟢 AVAILABLE</div>}
                            {m.availability_status === 'UNAVAILABLE' && m.accepted_unavailable && <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 6, fontWeight: 700 }}>⚠ UNAVAILABLE AT TIME OF PRESCRIPTION</div>}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" onClick={() => handleEditMed(m)} className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }}>Edit</button>
                            <button type="button" onClick={() => handleRemoveMed(m)} style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--danger)', borderRadius: 8, width: 28, height: 28, cursor: 'pointer' }}>✕</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => setShowPreview(s => !s)}>{showPreview ? 'Hide' : 'Preview'}</button>
                    <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => handleSavePrescriptions('draft')} disabled={savingPrescriptions}>Save Draft</button>
                    <button type="button" className="btn btn-primary" style={{ width: 'auto' }} onClick={() => handleSavePrescriptions('active')} disabled={savingPrescriptions}>Finalize</button>
                    <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={handlePrint}>Print</button>
                    <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={handleSaveAsTemplate}>Save as Template</button>
                  </div>
                  {showPreview && <div style={{ marginTop: 16, padding: 16, borderRadius: 10, background: 'var(--bg-elevated)' }}><ol style={{ paddingLeft: 20 }}>{medications.map(m => <li key={m.localId} style={{ fontSize: 13.5, marginBottom: 8 }}><strong>{m.drugName}</strong> - {m.dose} {m.route} {m.frequency}</li>)}</ol></div>}
                </div>
              )}
            </div>
          </div>

          <div className="dash-panel" style={{ marginTop: 20 }}>
            <div className="dash-panel-head"><div><div className="dash-panel-title">Consultation Summary</div></div></div>
            <div>{summaryRow('Patient', activePatient?.full_name)}{summaryRow('History', historySummary)}{summaryRow('Symptoms', symptoms.map(s => s.label).join(', '))}{summaryRow('Vitals', `BP ${activeVitals.blood_pressure || '—'} · Pulse ${activeVitals.pulse_rate || '—'}`)}{summaryRow('Diagnosis', diagnoses.map(d => d.label).join(', '))}{summaryRow('Prescription', medications.map(m => m.drugName).join('; '))}{summaryRow('Plan', treatmentPlan)}</div>
          </div>

          <div className="dash-panel" style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><div className="dash-panel-title">Finish Up</div><div className="dash-panel-sub">Finalizes meds and completes visit</div></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={clearWorkbench}>Cancel</button>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleCompleteConsultation} disabled={completing}>{completing ? 'Completing…' : 'Complete Consultation'}</button>
            </div>
          </div>
        </>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60 }}>{toast}</div>}
      {showAdmissionModal && activePatient && <AdmissionRequestModal patient={activePatient} consultationId={activeVitals?.id} prefillDiagnosis={diagnoses.map(d => d.label).join(', ')} onSubmit={handleSubmitAdmissionRequest} onClose={() => setShowAdmissionModal(false)} />}
    </>
  )
}