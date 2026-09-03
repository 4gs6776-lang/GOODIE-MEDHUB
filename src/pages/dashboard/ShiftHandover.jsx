import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { useOfflineTable } from '../../lib/useOfflineTable'

// ============================================================
// Shift Handover module
// Reuses the existing offline-first table hook, tenant model
// (hospital_id), auth context, and shared UI classes (.dash-panel,
// .btn, .field, .dash-modal…). Everything module-specific is
// scoped under "ho-" classes defined in theme/handover.css.
//
// Data reused, not duplicated:
//   admissions + beds + patients  -> current ward patient list
//   patient_vitals                -> live "Assessment" readouts
//   lab_tests / radiology_scans   -> pending investigations
//   patient_drug_charts           -> active medication count
// New tables (see supabase/migrations/005_shift_handover.sql):
//   shift_handovers, handover_patients, handover_tasks
// ============================================================

const WARDS = [
  { key: 'general', label: 'General Ward' },
  { key: 'private', label: 'Private Suites' },
  { key: 'icu', label: 'ICU' },
]

const SHIFT_LABELS = { M: 'Morning', N: 'Night' }

const TEMPLATES = [
  { key: 'general', label: 'General Nursing Handover' },
  { key: 'maternity', label: 'Maternity Handover' },
  { key: 'paediatric', label: 'Paediatric Handover' },
  { key: 'emergency', label: 'Emergency Handover' },
  { key: 'surgical', label: 'Surgical Ward Handover' },
  { key: 'medical', label: 'Medical Ward Handover' },
  { key: 'icu', label: 'ICU Handover' },
]

const PRIORITIES = [
  { key: 'low', label: 'Low' },
  { key: 'medium', label: 'Medium' },
  { key: 'high', label: 'High' },
  { key: 'critical', label: 'Critical' },
]

const TASK_STATUSES = [
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
]

const MATERNITY_FIELDS = [
  { key: 'gravida_para', label: 'Gravida / Para' },
  { key: 'gestational_age', label: 'Gestational Age' },
  { key: 'lmp_edd', label: 'LMP / EDD' },
  { key: 'labour_status', label: 'Labour Status' },
  { key: 'cervical_findings', label: 'Cervical Findings' },
  { key: 'fetal_heart_rate', label: 'Fetal Heart Rate' },
  { key: 'contractions', label: 'Contractions' },
  { key: 'membrane_status', label: 'Membrane Status' },
  { key: 'delivery_plan', label: 'Delivery Plan' },
  { key: 'postpartum_status', label: 'Postpartum Status' },
]

const PAEDIATRIC_FIELDS = [
  { key: 'weight', label: 'Weight (kg)' },
  { key: 'feeding', label: 'Feeding' },
  { key: 'fluid_balance', label: 'Fluid Balance' },
  { key: 'temperature', label: 'Temperature' },
  { key: 'respiratory_status', label: 'Respiratory Status' },
  { key: 'oxygen_requirement', label: 'Oxygen Requirement' },
  { key: 'parent_concerns', label: "Parent/Guardian Concerns" },
]

const SUBNAV = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'new', label: 'New Handover' },
  { key: 'mine', label: 'My Handovers' },
  { key: 'ward', label: 'Ward Handovers' },
  { key: 'history', label: 'Handover History' },
  { key: 'templates', label: 'Templates' },
]

const PAGE_SIZE = 10

function todayKey() {
  const n = new Date()
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0')
}

function guessShift() {
  const h = new Date().getHours()
  return (h >= 7 && h < 19) ? 'M' : 'N'
}

function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
}

function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function wardLabel(key) {
  return WARDS.find(w => w.key === key)?.label || key || '—'
}

function templateLabel(key) {
  return TEMPLATES.find(t => t.key === key)?.label || 'General Nursing Handover'
}

// --- small shared bits -------------------------------------------------

function PriorityPill({ value }) {
  const p = PRIORITIES.find(x => x.key === value) || PRIORITIES[0]
  return <span className={`ho-priority ho-priority-${p.key}`}>{p.label}</span>
}

function StatusPill({ value }) {
  const v = value || 'draft'
  const label = v.charAt(0).toUpperCase() + v.slice(1)
  return <span className={`ho-status-pill ho-status-${v}`}>{label}</span>
}

function VoiceButton({ onResult }) {
  const [active, setActive] = useState(false)
  const recRef = useRef(null)
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
  if (!SR) return null

  function toggle() {
    if (active) { recRef.current?.stop(); return }
    const rec = new SR()
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = (e) => { onResult(e.results[0][0].transcript) }
    rec.onend = () => setActive(false)
    rec.onerror = () => setActive(false)
    try { rec.start(); recRef.current = rec; setActive(true) } catch { setActive(false) }
  }

  return (
    <button type="button" className={`ho-mic ${active ? 'active' : ''}`} onClick={toggle} title="Voice input">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8"/>
      </svg>
    </button>
  )
}

export default function ShiftHandover() {
  const { hospital, profile } = useAuth()

  const [subTab, setSubTab] = useState('dashboard')
  const [toast, setToast] = useState(null)
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  // ---- reused existing tables (offline-first, tenant-scoped) ----
  const { records: handovers, addRecord: addHandover, updateRecord: updateHandover } = useOfflineTable('shift_handovers', hospital?.id)
  const { records: hoPatients, addRecord: addHoPatient, updateRecord: updateHoPatient } = useOfflineTable('handover_patients', hospital?.id)
  const { records: hoTasks, addRecord: addHoTask, updateRecord: updateHoTask, deleteRecord: deleteHoTask } = useOfflineTable('handover_tasks', hospital?.id)

  const { records: admissions } = useOfflineTable('admissions', hospital?.id)
  const { records: beds } = useOfflineTable('beds', hospital?.id)
  const { records: patients } = useOfflineTable('patients', hospital?.id)
  const { records: vitals } = useOfflineTable('patient_vitals', hospital?.id)
  const { records: labTests } = useOfflineTable('lab_tests', hospital?.id)
  const { records: scans } = useOfflineTable('radiology_scans', hospital?.id)
  const { records: drugCharts } = useOfflineTable('patient_drug_charts', hospital?.id)

  const patientById = (id) => patients.find(p => p.id === id)
  const latestVitals = (patientId) => {
    const list = vitals.filter(v => v.patient_id === patientId)
    if (!list.length) return null
    return list.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
  }
  const pendingLabsFor = (patientId) => labTests.filter(t => t.patient_id === patientId && t.status !== 'completed')
  const pendingScansFor = (patientId) => scans.filter(s => s.patient_id === patientId && s.status !== 'completed')
  const activeMedsCountFor = (patientId) => drugCharts.filter(d => d.patient_id === patientId).length

  // ---- New Handover: shift meta ----
  const [ward, setWard] = useState('general')
  const [shiftType, setShiftType] = useState(guessShift())
  const [handoverDate, setHandoverDate] = useState(todayKey())
  const [templateKey, setTemplateKey] = useState('general')
  const [draftId, setDraftId] = useState(null)
  const [generalNotes, setGeneralNotes] = useState('')
  const [medicationNotes, setMedicationNotes] = useState('')
  const [investigationNotes, setInvestigationNotes] = useState('')
  const [incidents, setIncidents] = useState([])
  const [patientData, setPatientData] = useState({}) // patient_id -> { hoPatientId, priority, situation, background, assessment, recommendation, medicationNotes, investigationNotes, specialtyFields }
  const [savingDraft, setSavingDraft] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [openPatientId, setOpenPatientId] = useState(null)
  const [newTaskByPatient, setNewTaskByPatient] = useState({})

  // Best-effort auto-detect the staff member's shift from today's roster —
  // falls back silently to the time-of-day guess already set above.
  useEffect(() => {
    if (subTab !== 'new' || !hospital?.id || !profile?.id) return
    let cancelled = false
    async function loadShift() {
      try {
        const now = new Date()
        const month = now.getMonth() + 1
        const year = now.getFullYear()
        const { data: roster } = await supabase.from('rosters').select('id').eq('hospital_id', hospital.id).eq('month', month).eq('year', year).is('department', null).maybeSingle()
        if (!roster || cancelled) return
        const { data: entry } = await supabase.from('roster_entries').select('shift_code').eq('roster_id', roster.id).eq('roster_date', todayKey()).eq('staff_id', profile.id).maybeSingle()
        if (!cancelled && entry?.shift_code && (entry.shift_code === 'M' || entry.shift_code === 'N')) {
          setShiftType(entry.shift_code)
        }
      } catch { /* silent — time-of-day guess already applied */ }
    }
    loadShift()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, hospital?.id, profile?.id])

  // Current inpatients for the selected ward, pulled from admissions/beds —
  // never manually typed.
  const currentWardPatients = useMemo(() => {
    return admissions
      .filter(a => a.status === 'active' && (a.ward === ward))
      .map(a => ({
        admission: a,
        patient: patientById(a.patient_id),
        bed: beds.find(b => b.id === a.bed_id),
      }))
      .filter(row => row.patient)
      .sort((a, b) => (a.patient.full_name || '').localeCompare(b.patient.full_name || ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admissions, beds, patients, ward])

  // Resume an existing draft for this ward/shift/date (mine), instead of
  // silently starting a duplicate — and initialize blank rows for any
  // ward patient who doesn't have one yet.
  useEffect(() => {
    if (subTab !== 'new' || !hospital?.id || !profile?.id) return

    const existingDraft = handovers.find(h =>
      h.status === 'draft' && h.ward === ward && h.shift_type === shiftType &&
      h.handover_date === handoverDate && h.prepared_by === profile.id
    )

    if (existingDraft && existingDraft.id !== draftId) {
      setDraftId(existingDraft.id)
      setTemplateKey(existingDraft.template_key || 'general')
      setGeneralNotes(existingDraft.general_notes || '')
      setMedicationNotes(existingDraft.medication_notes || '')
      setInvestigationNotes(existingDraft.investigation_notes || '')
      setIncidents(Array.isArray(existingDraft.incidents) ? existingDraft.incidents : [])
    }

    const activeDraftId = existingDraft?.id || draftId
    setPatientData(prev => {
      const next = { ...prev }
      currentWardPatients.forEach(({ patient, admission, bed }) => {
        if (next[patient.id]) return
        const existingRow = activeDraftId ? hoPatients.find(hp => hp.handover_id === activeDraftId && hp.patient_id === patient.id) : null
        next[patient.id] = existingRow ? {
          hoPatientId: existingRow.id,
          priority: existingRow.priority || 'low',
          situation: existingRow.situation || '',
          background: existingRow.background || admission.diagnosis || '',
          assessment: existingRow.assessment || '',
          recommendation: existingRow.recommendation || '',
          medicationNotes: existingRow.medication_notes || '',
          investigationNotes: existingRow.investigation_notes || '',
          specialtyFields: existingRow.specialty_fields || {},
        } : {
          hoPatientId: null,
          priority: 'low',
          situation: '',
          background: admission.diagnosis ? `Dx: ${admission.diagnosis}` : '',
          assessment: '',
          recommendation: '',
          medicationNotes: '',
          investigationNotes: '',
          specialtyFields: {},
        }
      })
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, ward, shiftType, handoverDate, currentWardPatients, hospital?.id, profile?.id])

  async function ensureDraft() {
    if (draftId) return draftId
    const rec = await addHandover({
      ward, shift_type: shiftType, handover_date: handoverDate,
      prepared_by: profile.id, prepared_by_name: profile.full_name,
      template_key: templateKey, status: 'draft',
      general_notes: '', medication_notes: '', investigation_notes: '', incidents: [],
    })
    setDraftId(rec.id)
    return rec.id
  }

  async function savePatientField(patientId, patch) {
    setPatientData(prev => ({ ...prev, [patientId]: { ...prev[patientId], ...patch } }))
    const id = await ensureDraft()
    const row = patientById(patientId)
    const admission = currentWardPatients.find(r => r.patient?.id === patientId)?.admission
    const bed = currentWardPatients.find(r => r.patient?.id === patientId)?.bed
    const current = { ...(patientData[patientId] || {}), ...patch }

    if (current.hoPatientId) {
      await updateHoPatient(current.hoPatientId, {
        priority: current.priority, situation: current.situation, background: current.background,
        assessment: current.assessment, recommendation: current.recommendation,
        medication_notes: current.medicationNotes, investigation_notes: current.investigationNotes,
        specialty_fields: current.specialtyFields,
      })
    } else {
      const rec = await addHoPatient({
        handover_id: id, patient_id: patientId, patient_name: row?.full_name, bed_label: bed?.bed_number || null,
        admission_id: admission?.id || null,
        priority: current.priority, situation: current.situation, background: current.background,
        assessment: current.assessment, recommendation: current.recommendation,
        medication_notes: current.medicationNotes, investigation_notes: current.investigationNotes,
        specialty_fields: current.specialtyFields,
      })
      setPatientData(prev => ({ ...prev, [patientId]: { ...prev[patientId], hoPatientId: rec.id } }))
    }
  }

  async function saveMeta(extra = {}) {
    const id = await ensureDraft()
    await updateHandover(id, {
      ward, shift_type: shiftType, handover_date: handoverDate, template_key: templateKey,
      general_notes: generalNotes, medication_notes: medicationNotes, investigation_notes: investigationNotes,
      incidents, ...extra,
    })
    return id
  }

  async function handleSaveDraft() {
    setSavingDraft(true)
    try { await saveMeta(); showToast('Draft saved') }
    catch (err) { showToast(err.message || 'Could not save draft') }
    finally { setSavingDraft(false) }
  }

  async function handleSubmit() {
    if (currentWardPatients.length === 0 && !confirm('No current patients are loaded for this ward. Submit the handover anyway?')) return
    setSubmitting(true)
    try {
      await saveMeta({ status: 'submitted', submitted_at: new Date().toISOString() })
      showToast('Handover submitted')
      setDraftId(null); setPatientData({}); setGeneralNotes(''); setMedicationNotes(''); setInvestigationNotes(''); setIncidents([])
      setSubTab('dashboard')
    } catch (err) { showToast(err.message || 'Could not submit handover') }
    finally { setSubmitting(false) }
  }

  function addIncident() {
    setIncidents(prev => [...prev, { id: 'inc-' + Date.now(), patient_name: '', incident_type: '', description: '', action_taken: '', escalated_to: '', follow_up_required: false, time: new Date().toISOString() }])
  }
  async function updateIncident(idx, patch) {
    const next = incidents.map((it, i) => i === idx ? { ...it, ...patch } : it)
    setIncidents(next)
    const id = await ensureDraft()
    await updateHandover(id, { incidents: next })
  }
  async function removeIncident(idx) {
    const next = incidents.filter((_, i) => i !== idx)
    setIncidents(next)
    if (draftId) await updateHandover(draftId, { incidents: next })
  }

  async function handleAddTask(patientId, patientName) {
    const draft = newTaskByPatient[patientId]
    if (!draft?.description?.trim()) return
    const id = await ensureDraft()
    await addHoTask({
      handover_id: id, patient_id: patientId, patient_name: patientName,
      description: draft.description.trim(), priority: draft.priority || 'medium',
      due_at: draft.dueAt || null, assigned_role: draft.assignedRole || null, status: 'pending',
    })
    setNewTaskByPatient(prev => ({ ...prev, [patientId]: { description: '', priority: 'medium', dueAt: '', assignedRole: '' } }))
  }

  async function cycleTaskStatus(task) {
    const order = ['pending', 'in_progress', 'completed']
    const idx = order.indexOf(task.status)
    const next = order[(idx + 1) % order.length]
    const patch = { status: next }
    if (next === 'completed') { patch.completed_by = profile.id; patch.completed_by_name = profile.full_name; patch.completed_at = new Date().toISOString() }
    else { patch.completed_by = null; patch.completed_by_name = null; patch.completed_at = null }
    await updateHoTask(task.id, patch)
  }

  async function handleAcknowledge(handover) {
    await updateHandover(handover.id, {
      status: 'acknowledged', acknowledged_by: profile.id, acknowledged_by_name: profile.full_name,
      acknowledged_at: new Date().toISOString(), receiving_shift: handover.shift_type === 'M' ? 'N' : 'M',
    })
    showToast('Handover acknowledged')
  }

  async function handleArchive(handover) {
    await updateHandover(handover.id, { status: 'archived', archived_by: profile.id, archived_at: new Date().toISOString() })
    showToast('Handover archived')
  }

  // ---- Dashboard stats ----
  const unacknowledged = handovers.filter(h => h.status === 'submitted')
  const activeHandoverIds = new Set(handovers.filter(h => h.status !== 'archived').map(h => h.id))
  const pendingTasksCount = hoTasks.filter(t => (t.status === 'pending' || t.status === 'in_progress') && activeHandoverIds.has(t.handover_id)).length
  const highPriorityCount = hoPatients.filter(p => ['high', 'critical'].includes(p.priority) && activeHandoverIds.has(p.handover_id)).length
  const todaysHandovers = handovers.filter(h => h.handover_date === todayKey())
  const patientsHandedOverToday = hoPatients.filter(p => {
    const h = handovers.find(x => x.id === p.handover_id)
    return h && h.handover_date === todayKey()
  }).length

  const recentHandovers = handovers.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6)

  // ---- List view (mine / ward / history) with filters ----
  const [filterWard, setFilterWard] = useState('')
  const [filterShift, setFilterShift] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [searchText, setSearchText] = useState('')
  const [page, setPage] = useState(1)
  const [detailHandover, setDetailHandover] = useState(null)

  const listSource = useMemo(() => {
    let base = handovers
    if (subTab === 'mine') base = base.filter(h => h.prepared_by === profile?.id)
    if (subTab === 'ward' && filterWard) base = base.filter(h => h.ward === filterWard)
    if (filterWard && subTab !== 'ward') base = base.filter(h => h.ward === filterWard)
    if (filterShift) base = base.filter(h => h.shift_type === filterShift)
    if (filterStatus) base = base.filter(h => h.status === filterStatus)
    if (filterDate) base = base.filter(h => h.handover_date === filterDate)
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      base = base.filter(h => {
        if ((h.prepared_by_name || '').toLowerCase().includes(q)) return true
        if (wardLabel(h.ward).toLowerCase().includes(q)) return true
        const namesInHandover = hoPatients.filter(p => p.handover_id === h.id).some(p => (p.patient_name || '').toLowerCase().includes(q))
        return namesInHandover
      })
    }
    return base.slice().sort((a, b) => new Date(b.handover_date) - new Date(a.handover_date) || new Date(b.created_at) - new Date(a.created_at))
  }, [handovers, hoPatients, subTab, filterWard, filterShift, filterStatus, filterDate, searchText, profile?.id])

  const pageCount = Math.max(1, Math.ceil(listSource.length / PAGE_SIZE))
  const pageItems = listSource.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => { setPage(1) }, [subTab, filterWard, filterShift, filterStatus, filterDate, searchText])

  function patientsOf(handoverId) { return hoPatients.filter(p => p.handover_id === handoverId) }
  function tasksOf(handoverId) { return hoTasks.filter(t => t.handover_id === handoverId) }

  function openHandover(h) { setDetailHandover(h) }

  return (
    <div className="ho-shell">
      <div className="ho-subnav">
        {SUBNAV.map(s => (
          <button key={s.key} className={subTab === s.key ? 'active' : ''} onClick={() => setSubTab(s.key)}>
            {s.label}
            {s.key === 'dashboard' && unacknowledged.length > 0 && <span className="ho-badge">{unacknowledged.length}</span>}
          </button>
        ))}
      </div>

      {/* ================= DASHBOARD ================= */}
      {subTab === 'dashboard' && (
        <>
          <section className="dash-stats ho-stats">
            <div className="dash-stat-card premium-stat red-stat">
              <div className="dash-stat-top"><div className="dash-stat-icon"><Icon24 name="bell"/></div></div>
              <div className="dash-stat-label">Unacknowledged</div>
              <div className="dash-stat-value">{unacknowledged.length}</div>
            </div>
            <div className="dash-stat-card premium-stat gold-stat">
              <div className="dash-stat-top"><div className="dash-stat-icon"><Icon24 name="task"/></div></div>
              <div className="dash-stat-label">Pending Tasks</div>
              <div className="dash-stat-value">{pendingTasksCount}</div>
            </div>
            <div className="dash-stat-card premium-stat red-stat">
              <div className="dash-stat-top"><div className="dash-stat-icon"><Icon24 name="alert"/></div></div>
              <div className="dash-stat-label">High Priority</div>
              <div className="dash-stat-value">{highPriorityCount}</div>
            </div>
            <div className="dash-stat-card premium-stat teal-stat">
              <div className="dash-stat-top"><div className="dash-stat-icon"><Icon24 name="handover"/></div></div>
              <div className="dash-stat-label">Today's Handovers</div>
              <div className="dash-stat-value">{todaysHandovers.length}</div>
            </div>
            <div className="dash-stat-card premium-stat violet-stat">
              <div className="dash-stat-top"><div className="dash-stat-icon"><Icon24 name="users"/></div></div>
              <div className="dash-stat-label">Patients Handed Over</div>
              <div className="dash-stat-value">{patientsHandedOverToday}</div>
            </div>
          </section>

          {unacknowledged.length > 0 && (
            <div className="ho-alert-widget">
              <div className="ho-alert-widget-head"><Icon24 name="alert" size={16}/> {unacknowledged.length} Unacknowledged Handover{unacknowledged.length > 1 ? 's' : ''}</div>
              {unacknowledged.slice(0, 6).map(h => (
                <div className="ho-alert-row" key={h.id} onClick={() => openHandover(h)}>
                  <div>
                    <div className="ho-alert-ward">{wardLabel(h.ward)} — {SHIFT_LABELS[h.shift_type]} Shift</div>
                    <div className="ho-alert-meta">{formatDate(h.handover_date)} · {patientsOf(h.id).length} patient{patientsOf(h.id).length === 1 ? '' : 's'} · prepared by {h.prepared_by_name || 'Staff'}</div>
                  </div>
                  <StatusPill value={h.status}/>
                </div>
              ))}
            </div>
          )}

          <div className="dash-panel">
            <div className="dash-panel-head">
              <div className="dash-panel-title">Recent Handovers</div>
              <button className="dash-view-all" onClick={() => setSubTab('history')}>View all</button>
            </div>
            {recentHandovers.length > 0 ? recentHandovers.map(h => (
              <div className="ho-history-row" key={h.id} onClick={() => openHandover(h)}>
                <div><b style={{ fontSize: 12.5 }}>{formatDate(h.handover_date)}</b><div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{SHIFT_LABELS[h.shift_type]}</div></div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ivory)' }}>{wardLabel(h.ward)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{h.prepared_by_name || 'Staff'} · {patientsOf(h.id).length} patients · {tasksOf(h.id).filter(t => t.status === 'pending').length} pending tasks</div>
                </div>
                <StatusPill value={h.status}/>
              </div>
            )) : (
              <div className="dash-empty-state dash-empty-state-rich">
                <Icon24 name="handover"/>
                <p>No handovers recorded yet</p>
                <button className="btn btn-ghost dash-empty-cta" onClick={() => setSubTab('new')}><Icon24 name="plus" size={14}/> Start a handover</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ================= NEW HANDOVER ================= */}
      {subTab === 'new' && (
        <>
          <div className="ho-shift-header">
            <div>
              <h2>{SHIFT_LABELS[shiftType]} Shift Handover</h2>
              <div className="ho-shift-meta">
                <div>Ward<b>{wardLabel(ward)}</b></div>
                <div>Date<b>{formatDate(handoverDate)}</b></div>
                <div>Prepared By<b>{profile?.full_name || 'You'}</b></div>
                <div>Status<b><StatusPill value={draftId ? (handovers.find(h => h.id === draftId)?.status || 'draft') : 'draft'}/></b></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" disabled={savingDraft} onClick={handleSaveDraft}>{savingDraft ? 'Saving…' : 'Save Draft'}</button>
              <button className="btn btn-primary" disabled={submitting} onClick={handleSubmit}>{submitting ? 'Submitting…' : 'Submit Handover'}</button>
            </div>
          </div>

          <div className="dash-field-grid" style={{ marginBottom: 20 }}>
            <div className="field"><label>Ward</label>
              <select value={ward} onChange={e => { setWard(e.target.value); setDraftId(null); setPatientData({}) }}>
                {WARDS.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
              </select>
            </div>
            <div className="field"><label>Shift</label>
              <select value={shiftType} onChange={e => { setShiftType(e.target.value); setDraftId(null); setPatientData({}) }}>
                <option value="M">Morning</option><option value="N">Night</option>
              </select>
            </div>
            <div className="field"><label>Date</label>
              <input type="date" value={handoverDate} onChange={e => { setHandoverDate(e.target.value); setDraftId(null); setPatientData({}) }}/>
            </div>
            <div className="field"><label>Template</label>
              <select value={templateKey} onChange={async e => { setTemplateKey(e.target.value); if (draftId) await updateHandover(draftId, { template_key: e.target.value }) }}>
                {TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="dash-panel" style={{ marginBottom: 20 }}>
            <div className="dash-panel-head"><div className="dash-panel-title">Current Ward Patients ({currentWardPatients.length})</div></div>
            {currentWardPatients.length === 0 ? (
              <div className="dash-empty-state dash-empty-state-rich"><Icon24 name="users"/><p>No active inpatients in this ward right now.</p></div>
            ) : currentWardPatients.map(({ patient, bed, admission }) => {
              const pd = patientData[patient.id] || {}
              const isOpen = openPatientId === patient.id
              const lv = latestVitals(patient.id)
              const pendingLabs = pendingLabsFor(patient.id)
              const pendingScans = pendingScansFor(patient.id)
              const medsCount = activeMedsCountFor(patient.id)
              const showMaternity = templateKey === 'maternity' || patient.category === 'anc'
              const showPaediatric = templateKey === 'paediatric' || (patient.age !== '' && patient.age != null && Number(patient.age) < 18 && Number(patient.age) >= 0)
              const patientTasks = draftId ? hoTasks.filter(t => t.handover_id === draftId && t.patient_id === patient.id) : []
              const taskDraft = newTaskByPatient[patient.id] || { description: '', priority: 'medium', dueAt: '', assignedRole: '' }

              return (
                <div className="ho-patient-card" key={patient.id} onClick={() => setOpenPatientId(isOpen ? null : patient.id)}>
                  <div className="ho-patient-card-top">
                    <div>
                      <div className="ho-patient-card-name">{patient.full_name}</div>
                      <div className="ho-patient-card-sub">Bed {bed?.bed_number || '—'} · {patient.age || '—'} {patient.gender || ''} · {admission.diagnosis || 'No diagnosis on file'}</div>
                    </div>
                    <div onClick={e => e.stopPropagation()}>
                      <select value={pd.priority || 'low'} onChange={e => savePatientField(patient.id, { priority: e.target.value })}>
                        {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="ho-patient-card-flags">
                    <PriorityPill value={pd.priority || 'low'}/>
                    {lv && <span className="ho-flag">BP {lv.blood_pressure || '—'} · Temp {lv.temperature ? `${lv.temperature}°C` : '—'} · SpO2 {lv.spo2 ? `${lv.spo2}%` : '—'}</span>}
                    {pendingLabs.length > 0 && <span className="ho-flag warn">{pendingLabs.length} lab{pendingLabs.length > 1 ? 's' : ''} pending</span>}
                    {pendingScans.length > 0 && <span className="ho-flag warn">{pendingScans.length} scan{pendingScans.length > 1 ? 's' : ''} pending</span>}
                    {medsCount > 0 && <span className="ho-flag">{medsCount} med{medsCount > 1 ? 's' : ''} on chart</span>}
                    {patientTasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length > 0 && <span className="ho-flag warn">{patientTasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length} open task(s)</span>}
                  </div>

                  {isOpen && (
                    <div onClick={e => e.stopPropagation()} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
                      <div className="ho-sbar-grid">
                        <div className="ho-sbar-section">
                          <div className="ho-sbar-label">S — Situation <VoiceButton onResult={t => savePatientField(patient.id, { situation: ((pd.situation || '') + ' ' + t).trim() })}/></div>
                          <textarea placeholder="Current condition, main complaint, current concern…" value={pd.situation || ''} onChange={e => setPatientData(prev => ({ ...prev, [patient.id]: { ...prev[patient.id], situation: e.target.value } }))} onBlur={e => savePatientField(patient.id, { situation: e.target.value })}/>
                        </div>
                        <div className="ho-sbar-section">
                          <div className="ho-sbar-label">B — Background <VoiceButton onResult={t => savePatientField(patient.id, { background: ((pd.background || '') + ' ' + t).trim() })}/></div>
                          <textarea placeholder="Diagnosis, admission date, relevant history…" value={pd.background || ''} onChange={e => setPatientData(prev => ({ ...prev, [patient.id]: { ...prev[patient.id], background: e.target.value } }))} onBlur={e => savePatientField(patient.id, { background: e.target.value })}/>
                        </div>
                        <div className="ho-sbar-section">
                          <div className="ho-sbar-label">A — Assessment <VoiceButton onResult={t => savePatientField(patient.id, { assessment: ((pd.assessment || '') + ' ' + t).trim() })}/></div>
                          <div className="ho-readouts">
                            <span className="ho-readout">BP <b>{lv?.blood_pressure || '—'}</b></span>
                            <span className="ho-readout">Pulse <b>{lv?.pulse_rate || '—'}</b></span>
                            <span className="ho-readout">Temp <b>{lv?.temperature ? `${lv.temperature}°C` : '—'}</b></span>
                            <span className="ho-readout">RR <b>{lv?.respiratory_rate || '—'}</b></span>
                            <span className="ho-readout">SpO2 <b>{lv?.spo2 ? `${lv.spo2}%` : '—'}</b></span>
                          </div>
                          <textarea placeholder="Nursing assessment, changes during shift…" value={pd.assessment || ''} onChange={e => setPatientData(prev => ({ ...prev, [patient.id]: { ...prev[patient.id], assessment: e.target.value } }))} onBlur={e => savePatientField(patient.id, { assessment: e.target.value })}/>
                        </div>
                        <div className="ho-sbar-section">
                          <div className="ho-sbar-label">R — Recommendation <VoiceButton onResult={t => savePatientField(patient.id, { recommendation: ((pd.recommendation || '') + ' ' + t).trim() })}/></div>
                          <textarea placeholder="Tasks for incoming shift, doctor review, monitoring, follow-up…" value={pd.recommendation || ''} onChange={e => setPatientData(prev => ({ ...prev, [patient.id]: { ...prev[patient.id], recommendation: e.target.value } }))} onBlur={e => savePatientField(patient.id, { recommendation: e.target.value })}/>
                        </div>
                      </div>

                      {(showMaternity || showPaediatric) && (
                        <div className="ho-specialty-grid">
                          {(showMaternity ? MATERNITY_FIELDS : PAEDIATRIC_FIELDS).map(f => (
                            <div className="field" key={f.key}>
                              <label>{f.label}</label>
                              <input value={pd.specialtyFields?.[f.key] || ''} onChange={e => setPatientData(prev => ({ ...prev, [patient.id]: { ...prev[patient.id], specialtyFields: { ...prev[patient.id]?.specialtyFields, [f.key]: e.target.value } } }))} onBlur={e => savePatientField(patient.id, { specialtyFields: { ...pd.specialtyFields, [f.key]: e.target.value } })}/>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="dash-field-grid" style={{ marginTop: 12 }}>
                        <div className="field"><label>Medication Issues (this patient)</label>
                          <input placeholder="e.g. Missed 2pm dose — patient refused" value={pd.medicationNotes || ''} onChange={e => setPatientData(prev => ({ ...prev, [patient.id]: { ...prev[patient.id], medicationNotes: e.target.value } }))} onBlur={e => savePatientField(patient.id, { medicationNotes: e.target.value })}/>
                        </div>
                        <div className="field"><label>Investigation Notes (this patient)</label>
                          <input placeholder="e.g. Awaiting CBC result" value={pd.investigationNotes || ''} onChange={e => setPatientData(prev => ({ ...prev, [patient.id]: { ...prev[patient.id], investigationNotes: e.target.value } }))} onBlur={e => savePatientField(patient.id, { investigationNotes: e.target.value })}/>
                        </div>
                      </div>

                      {pendingLabs.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div className="ho-kicker">Pending Laboratory</div>
                          {pendingLabs.map(t => <div key={t.id} className="ho-readout" style={{ marginRight: 6, marginBottom: 6, display: 'inline-block' }}>{t.test_name} — {t.status}{t.priority && t.priority !== 'routine' ? ` (${t.priority.toUpperCase()})` : ''}</div>)}
                        </div>
                      )}
                      {pendingScans.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <div className="ho-kicker">Pending Radiology</div>
                          {pendingScans.map(s => <div key={s.id} className="ho-readout" style={{ marginRight: 6, marginBottom: 6, display: 'inline-block' }}>{s.scan_type || 'Scan'} — {s.status}</div>)}
                        </div>
                      )}

                      <div style={{ marginTop: 14 }}>
                        <div className="ho-kicker">Pending Tasks</div>
                        {patientTasks.map(t => (
                          <div className="ho-task-row" key={t.id}>
                            <button className={`ho-task-check ${t.status === 'completed' ? 'done' : ''}`} onClick={() => cycleTaskStatus(t)}>{t.status === 'completed' ? '✓' : ''}</button>
                            <div style={{ flex: 1 }}>
                              <div className={`ho-task-desc ${t.status === 'completed' ? 'done' : ''}`}>{t.description}</div>
                              <div className="ho-task-meta">{t.priority} {t.due_at ? `· due ${formatDateTime(t.due_at)}` : ''} {t.assigned_role ? `· ${t.assigned_role}` : ''} · {TASK_STATUSES.find(s => s.key === t.status)?.label}</div>
                            </div>
                            <button className="ho-remove-btn" onClick={() => deleteHoTask(t.id)} title="Remove task">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>
                            </button>
                          </div>
                        ))}
                        <div className="ho-task-add">
                          <input type="text" placeholder="Add a task e.g. Repeat BP at 06:00" value={taskDraft.description} onChange={e => setNewTaskByPatient(prev => ({ ...prev, [patient.id]: { ...taskDraft, description: e.target.value } }))}/>
                          <select value={taskDraft.priority} onChange={e => setNewTaskByPatient(prev => ({ ...prev, [patient.id]: { ...taskDraft, priority: e.target.value } }))}>
                            {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                          </select>
                          <input type="time" value={taskDraft.dueAt} onChange={e => setNewTaskByPatient(prev => ({ ...prev, [patient.id]: { ...taskDraft, dueAt: e.target.value } }))}/>
                          <button type="button" className="btn btn-ghost" onClick={() => handleAddTask(patient.id, patient.full_name)}>Add Task</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="dash-panel" style={{ marginBottom: 20 }}>
            <div className="dash-panel-head"><div className="dash-panel-title">Incidents / Events</div></div>
            {incidents.map((inc, idx) => (
              <div className="ho-incident-card" key={inc.id}>
                <div className="ho-incident-card-head">
                  <b>Incident {idx + 1}</b>
                  <button className="ho-remove-btn" onClick={() => removeIncident(idx)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>
                  </button>
                </div>
                <div className="dash-field-grid">
                  <div className="field"><label>Patient</label><input value={inc.patient_name} onChange={e => updateIncident(idx, { patient_name: e.target.value })}/></div>
                  <div className="field"><label>Incident Type</label><input value={inc.incident_type} onChange={e => updateIncident(idx, { incident_type: e.target.value })} placeholder="e.g. Fall, Medication error"/></div>
                </div>
                <div className="field"><label>Description</label><textarea value={inc.description} onChange={e => updateIncident(idx, { description: e.target.value })}/></div>
                <div className="dash-field-grid">
                  <div className="field"><label>Action Taken</label><input value={inc.action_taken} onChange={e => updateIncident(idx, { action_taken: e.target.value })}/></div>
                  <div className="field"><label>Escalated To</label><input value={inc.escalated_to} onChange={e => updateIncident(idx, { escalated_to: e.target.value })}/></div>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-ghost" onClick={addIncident}><Icon24 name="plus" size={14}/> Add Incident</button>
          </div>

          <div className="dash-field-grid">
            <div className="field"><label>Medication / MAR Issues (shift-wide) <VoiceButton onResult={t => setMedicationNotes(v => (v + ' ' + t).trim())}/></label>
              <textarea value={medicationNotes} onChange={e => setMedicationNotes(e.target.value)} onBlur={() => saveMeta()} placeholder="Missed doses, delays, withheld medication, adverse reactions…"/>
            </div>
            <div className="field"><label>Investigation Notes (shift-wide) <VoiceButton onResult={t => setInvestigationNotes(v => (v + ' ' + t).trim())}/></label>
              <textarea value={investigationNotes} onChange={e => setInvestigationNotes(e.target.value)} onBlur={() => saveMeta()} placeholder="Outstanding labs/scans context that isn't patient-specific…"/>
            </div>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label>General Shift Notes <VoiceButton onResult={t => setGeneralNotes(v => (v + ' ' + t).trim())}/></label>
            <textarea value={generalNotes} onChange={e => setGeneralNotes(e.target.value)} onBlur={() => saveMeta()} placeholder="Ward issues, equipment problems, staffing, infection control, announcements…"/>
          </div>
        </>
      )}

      {/* ================= MINE / WARD / HISTORY ================= */}
      {(subTab === 'mine' || subTab === 'ward' || subTab === 'history') && (
        <>
          <div className="ho-toolbar">
            <div className="ho-toolbar-filters">
              <select value={filterWard} onChange={e => setFilterWard(e.target.value)}>
                <option value="">All wards</option>
                {WARDS.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
              </select>
              <select value={filterShift} onChange={e => setFilterShift(e.target.value)}>
                <option value="">All shifts</option><option value="M">Morning</option><option value="N">Night</option>
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="draft">Draft</option><option value="submitted">Submitted</option>
                <option value="acknowledged">Acknowledged</option><option value="archived">Archived</option>
              </select>
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}/>
              <input type="text" placeholder="Search patient, staff, ward…" value={searchText} onChange={e => setSearchText(e.target.value)} style={{ minWidth: 200 }}/>
            </div>
          </div>

          <div className="dash-panel">
            {pageItems.length > 0 ? pageItems.map(h => (
              <div className="ho-history-row" key={h.id} onClick={() => openHandover(h)}>
                <div><b style={{ fontSize: 12.5 }}>{formatDate(h.handover_date)}</b><div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{SHIFT_LABELS[h.shift_type]}</div></div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ivory)' }}>{wardLabel(h.ward)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{h.prepared_by_name || 'Staff'} · {patientsOf(h.id).length} patients · {tasksOf(h.id).filter(t => t.status === 'pending').length} pending · {hoPatients.filter(p => p.handover_id === h.id && ['high', 'critical'].includes(p.priority)).length} high priority</div>
                </div>
                <StatusPill value={h.status}/>
              </div>
            )) : (
              <div className="dash-empty-state dash-empty-state-rich"><Icon24 name="handover"/><p>No handovers match these filters.</p></div>
            )}
          </div>

          {pageCount > 1 && (
            <div className="ho-pager">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span>Page {page} of {pageCount}</span>
              <button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {/* ================= TEMPLATES ================= */}
      {subTab === 'templates' && (
        <div className="dash-panel">
          <div className="dash-panel-head"><div className="dash-panel-title">Handover Templates</div><div className="dash-panel-sub">Choose one from the New Handover screen — specialty fields appear automatically for maternity and paediatric patients.</div></div>
          {TEMPLATES.map(t => (
            <div className="ho-history-row" key={t.key} style={{ gridTemplateColumns: '1fr auto', cursor: 'default' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ivory)' }}>{t.label}</div>
              <span className="ho-status-pill ho-status-draft">{t.key}</span>
            </div>
          ))}
        </div>
      )}

      {/* ================= DETAIL / ACKNOWLEDGE MODAL ================= */}
      {detailHandover && (() => {
        const h = handovers.find(x => x.id === detailHandover.id) || detailHandover
        const pts = patientsOf(h.id)
        const tsk = tasksOf(h.id)
        return (
          <div className="dash-modal-backdrop" onClick={() => setDetailHandover(null)}>
            <div className="dash-modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
              <div className="dash-modal-title">{wardLabel(h.ward)} — {SHIFT_LABELS[h.shift_type]} Shift <StatusPill value={h.status}/></div>
              <div className="dash-modal-body">
                <div className="ho-shift-meta" style={{ marginBottom: 14 }}>
                  <div>Date<b>{formatDate(h.handover_date)}</b></div>
                  <div>Prepared By<b>{h.prepared_by_name || '—'}</b></div>
                  <div>Template<b>{templateLabel(h.template_key)}</b></div>
                  <div>Patients<b>{pts.length}</b></div>
                </div>

                {h.status === 'acknowledged' && (
                  <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 14 }}>Acknowledged by {h.acknowledged_by_name} — {formatDateTime(h.acknowledged_at)}</div>
                )}

                {pts.map(p => (
                  <div className="ho-detail-patient" key={p.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <b style={{ fontSize: 13 }}>{p.patient_name} {p.bed_label ? `— Bed ${p.bed_label}` : ''}</b>
                      <PriorityPill value={p.priority}/>
                    </div>
                    {p.situation && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 3 }}><b style={{ color: 'var(--teal)' }}>S:</b> {p.situation}</div>}
                    {p.background && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 3 }}><b style={{ color: 'var(--teal)' }}>B:</b> {p.background}</div>}
                    {p.assessment && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 3 }}><b style={{ color: 'var(--teal)' }}>A:</b> {p.assessment}</div>}
                    {p.recommendation && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 3 }}><b style={{ color: 'var(--teal)' }}>R:</b> {p.recommendation}</div>}
                    {tsk.filter(t => t.patient_id === p.patient_id).map(t => (
                      <div key={t.id} style={{ fontSize: 11.5, color: 'var(--muted-dim)', marginTop: 4 }}>☐ {t.description} — {TASK_STATUSES.find(s => s.key === t.status)?.label}</div>
                    ))}
                  </div>
                ))}

                {Array.isArray(h.incidents) && h.incidents.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div className="ho-kicker">Incidents</div>
                    {h.incidents.map(inc => (
                      <div key={inc.id} style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                        <b style={{ color: 'var(--ivory)' }}>{inc.incident_type || 'Incident'}</b>{inc.patient_name ? ` — ${inc.patient_name}` : ''}: {inc.description}
                      </div>
                    ))}
                  </div>
                )}

                {h.general_notes && <div style={{ marginTop: 14 }}><div className="ho-kicker">General Notes</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{h.general_notes}</div></div>}
                {h.medication_notes && <div style={{ marginTop: 10 }}><div className="ho-kicker">Medication Notes</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{h.medication_notes}</div></div>}
                {h.investigation_notes && <div style={{ marginTop: 10 }}><div className="ho-kicker">Investigation Notes</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{h.investigation_notes}</div></div>}
              </div>
              <div className="dash-modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setDetailHandover(null)}>Close</button>
                {h.status === 'submitted' && <button type="button" className="btn btn-primary" onClick={() => { handleAcknowledge(h); setDetailHandover(null) }}>Acknowledge Handover</button>}
                {h.status === 'acknowledged' && <button type="button" className="btn btn-ghost" onClick={() => { handleArchive(h); setDetailHandover(null) }}>Archive</button>}
              </div>
            </div>
          </div>
        )
      })()}

      {toast && <div className="dash-toast">{toast}</div>}
    </div>
  )
}

// Small local icon set so this module doesn't need to modify the shared
// Icon() component in Dashboard.jsx for handover-only glyphs.
function Icon24({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const paths = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    task: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/></>,
    alert: <><path d="M12 3 3 20h18Z"/><path d="M12 10v4M12 17h.01"/></>,
    handover: <><path d="M7 8h11l-3-3M17 16H6l3 3"/><path d="M4 8v3a2 2 0 0 0 2 2h1M20 16v-3a2 2 0 0 0-2-2h-1"/></>,
    users: <><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.6 3-6.5 7-6.5s7 2.9 7 6.5"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6.2M18 14c2.4.8 4 2.9 4 6"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
  }
  return <svg {...common}>{paths[name] || paths.task}</svg>
}
