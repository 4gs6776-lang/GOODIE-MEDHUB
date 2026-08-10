import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import { TagAutocomplete, DrugSearchInput } from '../../components/ClinicalAutocomplete'
import { SYMPTOM_OPTIONS, DIAGNOSIS_OPTIONS, FREQUENCY_OPTIONS, ROUTE_OPTIONS, DEFAULT_TEMPLATES } from '../../lib/clinicalData'
import AdmissionRequestModal from '../../components/AdmissionRequestModal'

const EMPTY_MED = { drugName: '', dose: '', route: '', frequency: '', frequencyCustom: '', duration: '', quantity: '', instructions: '' }

export default function DoctorWorkbench(){
  const { profile, hospital } = useAuth()

  const { records: patients, loading: loadingPatients, updateRecord: updatePatient } = useOfflineTable('patients', hospital?.id)
  const { records: vitals, loading: loadingVitals, updateRecord: updateVitals } = useOfflineTable('patient_vitals', hospital?.id)
  const { records: labOrders, loading: loadingLabOrders, addRecord: addLabOrder } = useOfflineTable('lab_orders', hospital?.id)
  const { records: prescriptions, loading: loadingPrescriptions, addRecord: addPrescription, updateRecord: updatePrescription, deleteRecord: deletePrescription } = useOfflineTable('prescriptions', hospital?.id)
  const { records: pharmacyItems } = useOfflineTable('pharmacy_items', hospital?.id)
  const { records: hospitalTemplates, addRecord: addTemplate } = useOfflineTable('prescription_templates', hospital?.id)
  const { records: admissionRequests, addRecord: addAdmissionRequest } = useOfflineTable('admission_requests', hospital?.id)
const [showAdmissionModal, setShowAdmissionModal] = useState(false)


  const loading = loadingPatients || loadingVitals || loadingLabOrders || loadingPrescriptions

  const [activeVitalsId, setActiveVitalsId] = useState(null)
  const [toast, setToast] = useState(null)
  const [completing, setCompleting] = useState(false)

  // History / clinical note fields for the active consultation
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

  // Symptoms & diagnoses — chip multi-selects
  const [symptoms, setSymptoms] = useState([])
  const [diagnoses, setDiagnoses] = useState([])

  // Lab order quick-add
  const [labTestName, setLabTestName] = useState('')
  const [labNotes, setLabNotes] = useState('')
  const [savingLabOrder, setSavingLabOrder] = useState(false)

  // Prescription builder
  const [medications, setMedications] = useState([]) // draft list for this consultation
  const [medBuilder, setMedBuilder] = useState(EMPTY_MED)
  const [editingMedLocalId, setEditingMedLocalId] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [savingPrescriptions, setSavingPrescriptions] = useState(false)

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // Queue = triaged patients with vitals logged, still waiting for a doctor.
  const queue = vitals
    .filter(v => v.status === 'waiting')
    .sort((a, b) => {
      const order = { Emergency: 0, Urgent: 1, Routine: 2 }
      const urgencyDiff = (order[a.urgency] ?? 3) - (order[b.urgency] ?? 3)
      if (urgencyDiff !== 0) return urgencyDiff
      return new Date(a.recorded_at || a.created_at) - new Date(b.recorded_at || b.created_at)
    })

  const activeVitals = vitals.find(v => v.id === activeVitalsId) || null
  const activePatient = activeVitals
    ? patients.find(p => p.id === activeVitals.patient_id) || null
    : null

  const activePatientLabOrders = activeVitals
    ? labOrders.filter(o => o.patient_vitals_id === activeVitals.id)
    : []

  const drugCatalog = pharmacyItems.map(i => ({ id: i.id, label: i.name, stock: i.quantity }))
  const allTemplates = [...DEFAULT_TEMPLATES, ...hospitalTemplates.map(t => ({ ...t, builtin: false }))]

  function openConsultation(v){
    setActiveVitalsId(v.id)
    setChiefComplaints(v.chief_complaints || '')
    setHistoryPresenting(v.history_presenting_complaint || '')
    setPastMedicalHistory(v.past_medical_history || '')
    setPastSurgicalHistory(v.past_surgical_history || '')
    setDrugHistory(v.drug_history || '')
    setAllergyHistory(v.allergy_history || '')
    setFamilySocialHistory(v.family_social_history || '')
    setExaminationFindings(v.examination_findings || v.observations || '')
    setClinicalNotes(v.clinical_notes || '')
    setTreatmentPlan(v.treatment_plan || '')
    setFollowUpNotes(v.follow_up_notes || '')
    setSymptoms(Array.isArray(v.symptoms) ? v.symptoms : [])
    setDiagnoses(Array.isArray(v.diagnoses) ? v.diagnoses : [])

    // Restore any medications already saved for this visit (draft or active)
    // into the builder, so reopening a consultation doesn't lose work.
    const existing = prescriptions
      .filter(p => p.patient_vitals_id === v.id && p.status !== 'cancelled')
      .map(p => ({
        localId: p.id, dbId: p.id,
        drugName: p.drug_name, dose: p.dosage, route: p.route || '',
        frequency: p.frequency || '', frequencyCustom: '',
        duration: p.duration || '', quantity: p.quantity || '', instructions: p.instructions || '',
      }))
    setMedications(existing)
    resetMedBuilder()
    setShowPreview(false)
    setSelectedTemplateId('')
  }

  function clearWorkbench(){
    setActiveVitalsId(null)
    setChiefComplaints(''); setHistoryPresenting(''); setPastMedicalHistory(''); setPastSurgicalHistory('')
    setDrugHistory(''); setAllergyHistory(''); setFamilySocialHistory(''); setExaminationFindings('')
    setClinicalNotes(''); setTreatmentPlan(''); setFollowUpNotes('')
    setSymptoms([]); setDiagnoses([])
    setLabTestName(''); setLabNotes('')
    setMedications([]); resetMedBuilder(); setSelectedTemplateId(''); setShowPreview(false)
  }

  function resetMedBuilder(){
    setMedBuilder(EMPTY_MED)
    setEditingMedLocalId(null)
  }

  async function handleAddLabOrder(e){
    e.preventDefault()
    if (!activeVitals || !labTestName) return
    if (!hospital || !profile) {
      showToast('Still loading your account — try again in a moment')
      return
    }
    setSavingLabOrder(true)
    try {
      await addLabOrder({
        patient_vitals_id: activeVitals.id,
        patient_name: activePatient?.full_name || activeVitals.patient_name || 'Unknown',
        test_name: labTestName,
        notes: labNotes || null,
        status: 'requested',
        requested_at: new Date().toISOString(),
        created_by: profile.id,
      })
      setLabTestName(''); setLabNotes('')
      showToast('Lab order sent')
    } catch (err) {
      showToast(err.message || 'Could not save lab order')
    } finally {
      setSavingLabOrder(false)
    }
  }

  function handleAddOrUpdateMedToDraft(){
    if (!medBuilder.drugName.trim() || !medBuilder.dose.trim()) {
      showToast('Drug name and dose are required')
      return
    }
    if (editingMedLocalId) {
      setMedications(meds => meds.map(m => m.localId === editingMedLocalId ? { ...m, ...medBuilder, localId: m.localId, dbId: m.dbId } : m))
    } else {
      setMedications(meds => [...meds, { ...medBuilder, localId: crypto.randomUUID(), dbId: null }])
    }
    resetMedBuilder()
  }
// Most recent non-cancelled admission request for the active patient.
function getActiveAdmissionRequest(patientId) {
  if (!patientId) return null
  return admissionRequests
    .filter(r => r.patient_id === patientId && r.status !== 'cancelled' && r.status !== 'rejected')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null
}

async function handleSubmitAdmissionRequest(payload) {
  if (!activePatient || !hospital || !profile) {
    showToast('Still loading your account — try again in a moment')
    return
  }
  await addAdmissionRequest({
    patient_id: activePatient.id,
    doctor_id: profile.id,
    status: 'pending',
    ...payload,
  })
  setShowAdmissionModal(false)
  showToast('Admission recommendation submitted.')
}

  function handleEditMed(m){
    setMedBuilder({
      drugName: m.drugName, dose: m.dose, route: m.route, frequency: m.frequency,
      frequencyCustom: m.frequencyCustom, duration: m.duration, quantity: m.quantity, instructions: m.instructions,
    })
    setEditingMedLocalId(m.localId)
  }

  async function handleRemoveMed(m){
    if (m.dbId) {
      if (!confirm(`Remove ${m.drugName} from this prescription?`)) return
      await deletePrescription(m.dbId)
    }
    setMedications(meds => meds.filter(x => x.localId !== m.localId))
    if (editingMedLocalId === m.localId) resetMedBuilder()
  }

  function handleApplyTemplate(){
    const template = allTemplates.find(t => t.id === selectedTemplateId)
    if (!template) return
    const loaded = template.medications.map(med => ({
      localId: crypto.randomUUID(), dbId: null,
      drugName: med.drug_name, dose: med.dose, route: med.route || '',
      frequency: med.frequency || '', frequencyCustom: '',
      duration: med.duration || '', quantity: med.quantity || '', instructions: med.instructions || '',
    }))
    setMedications(meds => [...meds, ...loaded])
    setSelectedTemplateId('')
    showToast(`Loaded "${template.name}" — review before saving`)
  }

  async function handleSaveAsTemplate(){
    if (medications.length === 0) return
    const name = prompt('Template name (e.g. "Malaria"):')
    if (!name || !name.trim()) return
    const category = prompt('Category (optional, e.g. "Infectious disease"):') || null
    try {
      await addTemplate({
        name: name.trim(),
        category,
        medications: medications.map(m => ({
          drug_name: m.drugName, dose: m.dose, route: m.route,
          frequency: m.frequency === 'Custom' ? m.frequencyCustom : m.frequency,
          duration: m.duration, quantity: m.quantity, instructions: m.instructions,
        })),
        created_by: profile?.id || null,
      })
      showToast('Template saved for this hospital')
    } catch (err) {
      showToast(err.message || 'Could not save template')
    }
  }

  async function handleSavePrescriptions(status){
    if (!activeVitals || medications.length === 0) return
    if (!hospital || !profile) {
      showToast('Still loading your account — try again in a moment')
      return
    }
    setSavingPrescriptions(true)
    try {
      const updated = []
      for (const m of medications) {
        const payload = {
          patient_vitals_id: activeVitals.id,
          patient_name: activePatient?.full_name || activeVitals.patient_name || 'Unknown',
          drug_name: m.drugName,
          dosage: m.dose,
          route: m.route || null,
          frequency: (m.frequency === 'Custom' ? m.frequencyCustom : m.frequency) || null,
          duration: m.duration || null,
          quantity: m.quantity || null,
          instructions: m.instructions || null,
          status,
          prescribed_at: new Date().toISOString(),
          created_by: profile.id,
        }
        if (m.dbId) {
          await updatePrescription(m.dbId, payload)
          updated.push(m)
        } else {
          const saved = await addPrescription(payload)
          updated.push({ ...m, dbId: saved?.id || null })
        }
      }
      setMedications(updated)
      showToast(status === 'draft' ? 'Draft saved' : 'Prescription finalized')
    } catch (err) {
      showToast(err.message || 'Could not save prescription')
    } finally {
      setSavingPrescriptions(false)
    }
  }

  function handlePrint(){
    if (medications.length === 0) return
    const patientName = activePatient?.full_name || activeVitals?.patient_name || 'Patient'
    const rows = medications.map((m, i) => `
      <li>
        <strong>${i + 1}. ${escapeHtml(m.drugName)}</strong><br/>
        ${escapeHtml(m.dose)} ${escapeHtml(m.route || '')} ${escapeHtml((m.frequency === 'Custom' ? m.frequencyCustom : m.frequency) || '')}${m.duration ? ` for ${escapeHtml(m.duration)}` : ''}.
        ${m.instructions ? `<br/><em>${escapeHtml(m.instructions)}</em>` : ''}
      </li>`).join('')
    const html = `
      <html><head><title>Prescription — ${escapeHtml(patientName)}</title>
      <style>body{font-family:sans-serif;padding:32px;color:#111} h1{font-size:18px;margin-bottom:4px} .meta{color:#555;font-size:13px;margin-bottom:20px} ol{padding-left:20px} li{margin-bottom:14px;line-height:1.5}</style>
      </head><body>
      <h1>${escapeHtml(hospital?.name || 'Prescription')}</h1>
      <div class="meta">Patient: ${escapeHtml(patientName)} &nbsp;·&nbsp; Date: ${new Date().toLocaleDateString()} &nbsp;·&nbsp; Prescribing doctor: ${escapeHtml(profile?.full_name || '')}</div>
      <ol>${rows}</ol>
      </body></html>`
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  function escapeHtml(s){
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  }

  async function handleCompleteConsultation(){
    if (!activeVitals) return
    if (!confirm(`Complete consultation for ${activePatient?.full_name || activeVitals.patient_name}?`)) return
    setCompleting(true)
    try {
      // Finalize any medications still sitting as drafts/unsaved before closing the visit.
      if (medications.length > 0) {
        await handleSavePrescriptions('active')
      }

      const diagnosisSummary = diagnoses.map(d => d.code ? `${d.label} — ${d.code}` : d.label).join('; ')

      await updateVitals(activeVitals.id, {
        status: 'completed',
        chief_complaints: chiefComplaints || null,
        history_presenting_complaint: historyPresenting || null,
        past_medical_history: pastMedicalHistory || null,
        past_surgical_history: pastSurgicalHistory || null,
        drug_history: drugHistory || null,
        allergy_history: allergyHistory || null,
        family_social_history: familySocialHistory || null,
        examination_findings: examinationFindings || null,
        observations: examinationFindings || null, // legacy field kept in sync
        clinical_notes: clinicalNotes || null,
        treatment_plan: treatmentPlan || null,
        follow_up_notes: followUpNotes || null,
        symptoms,
        diagnoses,
        diagnosis: diagnosisSummary || null, // legacy field kept in sync
        completed_at: new Date().toISOString(),
        completed_by: profile?.id || null,
      })

      // Sync back with Reception's board — send to lab if the doctor ordered
      // tests during this visit, otherwise the visit is finished.
      if (activePatient) {
        const hasLabOrders = activePatientLabOrders.length > 0
        await updatePatient(activePatient.id, {
          queue_status: hasLabOrders ? 'in_lab' : 'discharged',
          queue_updated_at: new Date().toISOString(),
        })
      }

      showToast('Consultation completed')
      clearWorkbench()
    } catch (err) {
      showToast(err.message || 'Could not complete consultation')
    } finally {
      setCompleting(false)
    }
  }

  function vitalRow(label, value, unit){
    return (
      <div>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{value ? `${value}${unit ? ' ' + unit : ''}` : '—'}</div>
      </div>
    )
  }

  function summaryRow(label, value){
    return (
      <div style={{ display: 'flex', gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--line-soft)' }}>
        <div style={{ width: 120, flexShrink: 0, color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, paddingTop: 2 }}>{label}</div>
        <div style={{ flex: 1, fontSize: 13 }}>{value || <span style={{ color: 'var(--muted)' }}>—</span>}</div>
      </div>
    )
  }

  const historySummary = [
    chiefComplaints && `Chief complaint: ${chiefComplaints}`,
    historyPresenting && `HPC: ${historyPresenting}`,
    pastMedicalHistory && `PMH: ${pastMedicalHistory}`,
    pastSurgicalHistory && `PSH: ${pastSurgicalHistory}`,
    drugHistory && `Drug Hx: ${drugHistory}`,
    allergyHistory && `Allergies: ${allergyHistory}`,
    familySocialHistory && `Family/Social: ${familySocialHistory}`,
  ].filter(Boolean).join(' · ')

  return (
    <>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(139,124,246,0.14)', color: 'var(--violet)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6.3 7-6.3s7 2.8 7 6.3"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Waiting for Doctor</div>
            <div className="dash-stat-value">{queue.length}</div>
            <div className="dash-stat-delta" style={{ color: 'var(--gold)' }}>triaged patients</div>
          </div>
        </div>
        <<div className="dash-stat-card">
  <div className="dash-stat-icon" style={{ background: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M12 13v5M9.5 15.5h5"/></svg>
  </div>
  <div style={{ flex: 1 }}>
    <div className="dash-stat-label">Active Consultation</div>
    <div className="dash-stat-value" style={{ fontSize: 17 }}>{activePatient?.full_name || activeVitals?.patient_name || 'None'}</div>
    <div className="dash-stat-delta">{activeVitals ? 'in progress' : 'select from queue'}</div>

    {activePatient && (() => {
      const req = getActiveAdmissionRequest(activePatient.id)
      if (!req) {
        return (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: 'auto', marginTop: 10, padding: '6px 12px', fontSize: 12 }}
            onClick={() => setShowAdmissionModal(true)}
          >
            Recommend Admission
          </button>
        )
      }
      const labelByStatus = {
        pending: 'Admission Requested',
        approved: 'Admission Approved',
        converted: 'Currently Admitted',
      }
      const colorByStatus = {
        pending: 'var(--gold)',
        approved: 'var(--teal)',
        converted: 'var(--teal)',
      }
      return (
        <div
          style={{
            marginTop: 10, display: 'inline-block', padding: '5px 12px', borderRadius: 8,
            fontSize: 11.5, fontWeight: 700, color: colorByStatus[req.status] || 'var(--muted)',
            background: 'var(--bg-elevated)', border: `1px solid ${colorByStatus[req.status] || 'var(--line-soft)'}`,
          }}
        >
          {labelByStatus[req.status] || req.status}
        </div>
      )
    })()}
  </div>
</div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M12 13v5M9.5 15.5h5"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Active Consultation</div>
            <div className="dash-stat-value" style={{ fontSize: 17 }}>{activePatient?.full_name || activeVitals?.patient_name || 'None'}</div>
            <div className="dash-stat-delta">{activeVitals ? 'in progress' : 'select from queue'}</div>
          </div>
        </div>
      </div>

      <div className="dash-row dash-row-2">
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Consultation Queue</div>
              <div className="dash-panel-sub">Triaged patients with vitals logged</div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
          ) : queue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No patients waiting.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {queue.map(v => {
                const p = patients.find(pt => pt.id === v.patient_id)
                const isActive = activeVitalsId === v.id
                return (
                  <div
                    key={v.id}
                    onClick={() => openConsultation(v)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                      padding: '10px 14px', borderRadius: 10,
                      background: isActive ? 'var(--teal-soft)' : 'var(--bg-elevated)',
                      border: isActive ? '1px solid var(--teal)' : '1px solid var(--line-soft)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: isActive ? 'var(--teal)' : undefined }}>{p?.full_name || v.patient_name || 'Unknown patient'}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>BP {v.blood_pressure || '—'} · Pulse {v.pulse_rate || '—'}{v.assigned_doctor ? ` · Dr. ${v.assigned_doctor}` : ''}</div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: v.urgency === 'Emergency' ? 'var(--danger)' : v.urgency === 'Urgent' ? 'var(--gold)' : 'var(--gold)',
                    }}>
                      {v.urgency || 'Waiting'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Recorded Vitals</div>
              <div className="dash-panel-sub">{activePatient?.full_name || activeVitals?.patient_name || 'No patient selected'}</div>
            </div>
          </div>

          {!activeVitals ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Select a patient from the queue to view vitals.</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                {vitalRow('Blood Pressure', activeVitals.blood_pressure)}
                {vitalRow('Pulse', activeVitals.pulse_rate, 'bpm')}
                {vitalRow('Temperature', activeVitals.temperature, '°C')}
                {vitalRow('SpO2', activeVitals.spo2, '%')}
                {vitalRow('Respiratory Rate', activeVitals.respiratory_rate, 'bpm')}
                {vitalRow('Weight', activeVitals.weight, 'kg')}
                {vitalRow('Height', activeVitals.height, 'cm')}
                {vitalRow('Urgency', activeVitals.urgency)}
              </div>
              {activeVitals.nurse_notes && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-soft)', fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic' }}>
                  Nurse note: "{activeVitals.nurse_notes}"
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {activeVitals && (
        <>
          <div className="dash-panel" style={{ marginTop: 20 }}>
            <div className="dash-panel-head">
              <div>
                <div className="dash-panel-title">History & Clinical Notes</div>
                <div className="dash-panel-sub">Full consultation record for this visit</div>
              </div>
            </div>

            <div className="field">
              <label>Chief Complaint</label>
              <textarea rows={2} value={chiefComplaints} onChange={e => setChiefComplaints(e.target.value)} placeholder="e.g. Fever and headache for 3 days" />
            </div>
            <div className="field">
              <label>History of Presenting Complaint</label>
              <textarea rows={3} value={historyPresenting} onChange={e => setHistoryPresenting(e.target.value)} placeholder="Onset, duration, character, associated symptoms…" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Past Medical History</label>
                <textarea rows={2} value={pastMedicalHistory} onChange={e => setPastMedicalHistory(e.target.value)} placeholder="e.g. Hypertension diagnosed 2019" />
              </div>
              <div className="field">
                <label>Past Surgical History</label>
                <textarea rows={2} value={pastSurgicalHistory} onChange={e => setPastSurgicalHistory(e.target.value)} placeholder="e.g. Appendectomy 2015" />
              </div>
              <div className="field">
                <label>Drug History</label>
                <textarea rows={2} value={drugHistory} onChange={e => setDrugHistory(e.target.value)} placeholder="Current / regular medications" />
              </div>
              <div className="field">
                <label>Allergy History</label>
                <textarea rows={2} value={allergyHistory} onChange={e => setAllergyHistory(e.target.value)} placeholder="e.g. Penicillin — rash" />
              </div>
            </div>

            <div className="field">
              <label>Family / Social History</label>
              <textarea rows={2} value={familySocialHistory} onChange={e => setFamilySocialHistory(e.target.value)} placeholder="Smoking, alcohol, occupation, family conditions…" />
            </div>

            <div className="field" style={{ marginTop: 4 }}>
              <label>Symptoms</label>
              <TagAutocomplete options={SYMPTOM_OPTIONS} value={symptoms} onChange={setSymptoms} placeholder="Type to search symptoms, e.g. fev…" />
            </div>

            <div className="field">
              <label>Diagnosis</label>
              <TagAutocomplete options={DIAGNOSIS_OPTIONS} value={diagnoses} onChange={setDiagnoses} placeholder="Type to search diagnoses, e.g. mala…" />
            </div>

            <div className="field">
              <label>Examination Findings</label>
              <textarea rows={3} value={examinationFindings} onChange={e => setExaminationFindings(e.target.value)} placeholder="On examination…" />
            </div>
            <div className="field">
              <label>Clinical Notes</label>
              <textarea rows={3} value={clinicalNotes} onChange={e => setClinicalNotes(e.target.value)} placeholder="Additional notes…" />
            </div>
            <div className="field">
              <label>Treatment Plan</label>
              <textarea rows={2} value={treatmentPlan} onChange={e => setTreatmentPlan(e.target.value)} placeholder="e.g. Antipyretics, rest, review in 3 days" />
            </div>
            <div className="field">
              <label>Follow-up Notes</label>
              <textarea rows={2} value={followUpNotes} onChange={e => setFollowUpNotes(e.target.value)} placeholder="e.g. Return in 1 week, sooner if symptoms worsen" />
            </div>
          </div>

          <div className="dash-row dash-row-2" style={{ marginTop: 20 }}>
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <div className="dash-panel-title">Lab Orders</div>
                  <div className="dash-panel-sub">Request tests for this patient</div>
                </div>
              </div>

              <form onSubmit={handleAddLabOrder}>
                <div className="field">
                  <label>Test Name</label>
                  <input value={labTestName} onChange={e => setLabTestName(e.target.value)} placeholder="e.g. Full Blood Count" />
                </div>
                <div className="field">
                  <label>Notes</label>
                  <input value={labNotes} onChange={e => setLabNotes(e.target.value)} placeholder="Optional" />
                </div>
                <button type="submit" className="btn btn-primary" disabled={savingLabOrder}>{savingLabOrder ? 'Sending…' : 'Send Lab Order'}</button>
              </form>

              {activePatientLabOrders.length > 0 && (
                <ul className="dash-legend" style={{ marginTop: 16 }}>
                  {activePatientLabOrders.map(o => (
                    <li key={o.id}>
                      <span className="dash-legend-name"><span className="dash-legend-dot" style={{ background: 'var(--gold)' }} />{o.test_name}</span>
                      <span className="dash-legend-val">{o.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <div className="dash-panel-title">Prescription</div>
                  <div className="dash-panel-sub">Build medications for this consultation</div>
                </div>
              </div>

              <div className="field">
                <label>Load Template</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} style={{ flex: 1 }}>
                    <option value="">Select a template…</option>
                    <optgroup label="Built-in">
                      {DEFAULT_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                    {hospitalTemplates.length > 0 && (
                      <optgroup label="Hospital Templates">
                        {hospitalTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                  <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={handleApplyTemplate} disabled={!selectedTemplateId}>Load</button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14, marginTop: 6 }}>
                <div className="field">
                  <label>Drug / Medication</label>
                  <DrugSearchInput
                    drugOptions={drugCatalog}
                    value={medBuilder.drugName}
                    onChange={v => setMedBuilder(b => ({ ...b, drugName: v }))}
                    placeholder="e.g. Amoxicillin 500mg capsule"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field">
                    <label>Dose</label>
                    <input value={medBuilder.dose} onChange={e => setMedBuilder(b => ({ ...b, dose: e.target.value }))} placeholder="e.g. 1 capsule" />
                  </div>
                  <div className="field">
                    <label>Route</label>
                    <select value={medBuilder.route} onChange={e => setMedBuilder(b => ({ ...b, route: e.target.value }))}>
                      <option value="">Select route…</option>
                      {ROUTE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Frequency</label>
                    <select value={medBuilder.frequency} onChange={e => setMedBuilder(b => ({ ...b, frequency: e.target.value }))}>
                      <option value="">Select frequency…</option>
                      {FREQUENCY_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  {medBuilder.frequency === 'Custom' && (
                    <div className="field">
                      <label>Custom Frequency</label>
                      <input value={medBuilder.frequencyCustom} onChange={e => setMedBuilder(b => ({ ...b, frequencyCustom: e.target.value }))} placeholder="e.g. Every other day" />
                    </div>
                  )}
                  <div className="field">
                    <label>Duration</label>
                    <input value={medBuilder.duration} onChange={e => setMedBuilder(b => ({ ...b, duration: e.target.value }))} placeholder="e.g. 5 days" />
                  </div>
                  <div className="field">
                    <label>Quantity</label>
                    <input value={medBuilder.quantity} onChange={e => setMedBuilder(b => ({ ...b, quantity: e.target.value }))} placeholder="e.g. 10 capsules" />
                  </div>
                </div>
                <div className="field">
                  <label>Instructions</label>
                  <input value={medBuilder.instructions} onChange={e => setMedBuilder(b => ({ ...b, instructions: e.target.value }))} placeholder="e.g. Take after meals" />
                </div>
                <button type="button" className="btn btn-primary" onClick={handleAddOrUpdateMedToDraft}>
                  {editingMedLocalId ? 'Update Medication' : '+ Add Medication'}
                </button>
                {editingMedLocalId && (
                  <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }} onClick={resetMedBuilder}>Cancel Edit</button>
                )}
              </div>

              {medications.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    Medications ({medications.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {medications.map(m => (
                      <div key={m.localId} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.drugName}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                              {m.dose} · {m.route || '—'} · {m.frequency === 'Custom' ? m.frequencyCustom : (m.frequency || '—')}{m.duration ? ` · ${m.duration}` : ''}
                            </div>
                            {m.instructions && <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>{m.instructions}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button type="button" onClick={() => handleEditMed(m)} className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }}>Edit</button>
                            <button type="button" onClick={() => handleRemoveMed(m)} style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--danger)', borderRadius: 8, width: 28, height: 28, cursor: 'pointer' }}>✕</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => setShowPreview(s => !s)}>{showPreview ? 'Hide Preview' : 'Preview Prescription'}</button>
                    <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => handleSavePrescriptions('draft')} disabled={savingPrescriptions}>{savingPrescriptions ? 'Saving…' : 'Save Draft'}</button>
                    <button type="button" className="btn btn-primary" style={{ width: 'auto' }} onClick={() => handleSavePrescriptions('active')} disabled={savingPrescriptions}>{savingPrescriptions ? 'Saving…' : 'Finalize Prescription'}</button>
                    <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={handlePrint}>Print Prescription</button>
                    <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={handleSaveAsTemplate}>Save as Template</button>
                  </div>

                  {showPreview && (
                    <div style={{ marginTop: 16, padding: 16, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
                      <div style={{ fontWeight: 700, marginBottom: 10, letterSpacing: 1, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' }}>Prescription Preview</div>
                      <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {medications.map(m => (
                          <li key={m.localId} style={{ fontSize: 13.5 }}>
                            <strong>{m.drugName}</strong>
                            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                              {m.dose} {(m.route || '').toLowerCase()} {(m.frequency === 'Custom' ? m.frequencyCustom : (m.frequency || '')).toLowerCase()}{m.duration ? ` for ${m.duration}` : ''}.
                              {m.instructions ? ` ${m.instructions}.` : ''}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="dash-panel" style={{ marginTop: 20 }}>
            <div className="dash-panel-head">
              <div>
                <div className="dash-panel-title">Consultation Summary</div>
                <div className="dash-panel-sub">Review before completing</div>
              </div>
            </div>
            <div>
              {summaryRow('Patient', activePatient?.full_name || activeVitals.patient_name)}
              {summaryRow('History', historySummary)}
              {summaryRow('Symptoms', symptoms.map(s => s.label).join(', '))}
              {summaryRow('Vitals', `BP ${activeVitals.blood_pressure || '—'} · Pulse ${activeVitals.pulse_rate || '—'} · Temp ${activeVitals.temperature || '—'}°C`)}
              {summaryRow('Diagnosis', diagnoses.map(d => d.code ? `${d.label} (${d.code})` : d.label).join(', '))}
              {summaryRow('Prescription', medications.map(m => `${m.drugName} — ${m.dose}`).join('; '))}
              {summaryRow('Clinical Notes', examinationFindings || clinicalNotes)}
              {summaryRow('Treatment Plan', treatmentPlan)}
              {summaryRow('Follow-up', followUpNotes)}
            </div>
          </div>

          <div className="dash-panel" style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="dash-panel-title">Finish Up</div>
              <div className="dash-panel-sub">Finalizes any pending medications and marks this visit as completed</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={clearWorkbench}>Cancel</button>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleCompleteConsultation} disabled={completing}>
                {completing ? 'Completing…' : 'Complete Consultation'}
              </button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)',
          padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60, maxWidth: '85vw', textAlign: 'center',
        }}>
          {toast}
          {showAdmissionModal && activePatient && (
  <AdmissionRequestModal
    patient={activePatient}
    consultationId={activeVitals?.id}
    prefillDiagnosis={diagnoses.map(d => d.label).join(', ')}
    onSubmit={handleSubmitAdmissionRequest}
    onClose={() => setShowAdmissionModal(false)}
  />
)}
        </div>
      )}
    </>
  )
}
