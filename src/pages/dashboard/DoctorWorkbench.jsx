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