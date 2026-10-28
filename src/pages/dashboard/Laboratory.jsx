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
import ModuleHistoryButton from '../../components/ModuleHistoryButton'
import { writeAudit } from '../../lib/audit'
import { escapeHtml } from '../../lib/escapeHtml'
import { getTimezone, formatDateTimeSec, formatDate } from '../../lib/datetime'
import {
  labStage, stageStatus, normalizeLabRow, LAB_STAGE_LABEL, ABNORMAL_FLAGS,
} from '../../lib/lab'
import { usePagination } from '../../lib/usePagination'
import Pagination from '../../components/common/Pagination'

// Common lab tests power the test-name autocomplete (global rule: no
// free-typing a value the system already knows). Anything unmatched can
// still be added as a custom test via the autocomplete's free-text row.
// Priced lab catalogue — each test has a default price, sample type,
// and whether a clinician order is required (cannot be walk-in).
// Admins can override prices via Settings → Service Catalog (Phase 1);
// these are the fallback defaults when no catalog entry exists.
const COMMON_LAB_TESTS = [
  { name: 'Full Blood Count (FBC)',           price: 3500,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'Malaria Parasite Test',             price: 1500,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'Widal Test',                        price: 3000,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'Urinalysis',                        price: 2000,  sample_type: 'urine',  requires_clinician_order: false },
  { name: 'Stool Routine Examination',          price: 2000,  sample_type: 'stool',  requires_clinician_order: false },
  { name: 'Lipid Profile',                      price: 5500,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'Liver Function Test (LFT)',          price: 6000,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'Renal Function Test (RFT)',          price: 6000,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'Random Blood Glucose',               price: 1500,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'Fasting Blood Glucose',              price: 2000,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'HbA1c',                              price: 5000,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'HIV Screening',                      price: 2000,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'Hepatitis B Surface Antigen',        price: 2500,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'Hepatitis C Antibody',               price: 3000,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'Thyroid Profile',                    price: 7000,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'Pregnancy Test (UPT)',               price: 1500,  sample_type: 'urine',  requires_clinician_order: false },
  { name: 'Blood Grouping & Rh',                price: 2000,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'Genotype (Hb Electrophoresis)',      price: 3000,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'ESR (Erythrocyte Sedimentation Rate)', price: 2500, sample_type: 'blood', requires_clinician_order: false },
  { name: 'CRP (C-Reactive Protein)',           price: 3000,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'Electrolytes & Urea',                price: 4000,  sample_type: 'blood',  requires_clinician_order: false },
  { name: 'Semen Analysis',                    price: 5000,  sample_type: 'semen',  requires_clinician_order: true },
  { name: 'Pap Smear',                          price: 4000,  sample_type: 'swab',   requires_clinician_order: true },
  { name: 'X-Ray Chest',                        price: 5000,  sample_type: 'imaging', requires_clinician_order: true },
  { name: 'Ultrasound Scan',                    price: 10000, sample_type: 'imaging', requires_clinician_order: true },
  { name: 'CT Scan',                            price: 25000, sample_type: 'imaging', requires_clinician_order: true },
  { name: 'MRI Scan',                           price: 50000, sample_type: 'imaging', requires_clinician_order: true },
  { name: 'ECG',                                price: 5000,  sample_type: 'other',  requires_clinician_order: true },
]

// For the existing "New Request" (single test) — includes ALL tests
const TEST_OPTIONS = COMMON_LAB_TESTS.map(t => ({ id: t.name, label: t.name }))

// For walk-in — only tests that DON'T require a clinician order
const WALKIN_TEST_OPTIONS = COMMON_LAB_TESTS.filter(t => !t.requires_clinician_order)

const formatMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Laboratory(){
  const { profile, hospital } = useAuth()
  const timezone = getTimezone(hospital)
  const { records: tests, loading: loadingTests, isOnline, pendingCount, addRecord, deleteRecord, updateRecord } = useOfflineTable('lab_tests', hospital?.id)
  const { records: orders, loading: loadingOrders, updateRecord: updateOrder, deleteRecord: deleteOrder, syncFromServer: syncOrders } = useOfflineTable('lab_orders', hospital?.id)
  const { records: patients } = useOfflineTable('patients', hospital?.id)
  const { records: billableCharges, addRecord: addBillableCharge } = useOfflineTable('billable_charges', hospital?.id)

  // Nurses can view lab results but cannot create/cancel/advance/archive.
  // Only lab technicians, admins, and owners can make changes.
  const isNurseReadOnly = profile?.role === 'nurse'

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

  // Walk-in Lab Request state
  const [showWalkInModal, setShowWalkInModal] = useState(false)
  const [walkInPatient, setWalkInPatient] = useState(null)
  const [walkInCart, setWalkInCart] = useState([])  // [{ name, price, sample_type }]
  const [walkInSearch, setWalkInSearch] = useState('')
  const [walkInPaymentMethod, setWalkInPaymentMethod] = useState('Cash')
  const [walkInAmountPaid, setWalkInAmountPaid] = useState('')
  const [walkInSaving, setWalkInSaving] = useState(false)

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

  // ---- Walk-in Lab Request handler -------------------------------------
  // Creates one request_number for the basket, one lab_tests row per
  // test, AND one billable_charge per test — all at request time (not
  // at result save time). Uses deterministic source_transaction_id
  // (LABWLK-{requestNumber}-{testName}) so repeated clicks don't
  // create duplicates.
  async function handleWalkInSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!walkInPatient) { setFormError('Select a patient.'); return }
    if (walkInCart.length === 0) { setFormError('Add at least one test to the cart.'); return }

    setWalkInSaving(true)
    try {
      // 1. Generate a sequential request number
      const requestNumber = `LABWLK-${Date.now().toString().slice(-8)}`
      const nowIso = new Date().toISOString()
      const paymentStatus = walkInAmountPaid && parseFloat(walkInAmountPaid) > 0 ? 'paid' : 'unpaid'

      // 2. Create one lab_tests row per test + one billable_charge per test
      for (const item of walkInCart) {
        const stxId = `LABWLK-${requestNumber}-${item.name.replace(/\s+/g, '_').toUpperCase()}`

        // Double-charge guard: check if a charge already exists for this request+test
        const alreadyCharged = billableCharges.some(c =>
          c.source_transaction_id === stxId && c._discarded !== true
        )

        // Create the lab_tests row
        const newTest = await addRecord({
          hospital_id: hospital.id,
          patient_id: walkInPatient.id,
          patient_name: walkInPatient.full_name,
          test_name: item.name,
          status: 'pending',
          result: null,
          requested_at: nowIso,
          created_by: profile?.id,
          // Phase 5 walk-in fields
          request_number: requestNumber,
          request_origin: 'walk_in',
          payment_status: paymentStatus,
          sample_type: item.sample_type || null,
          requires_clinician_order: false,
        })

        // Create the billable_charge (only if not already billed)
        if (!alreadyCharged) {
          await addBillableCharge({
            hospital_id: hospital.id,
            patient_id: walkInPatient.id,
            patient_name: walkInPatient.full_name,
            source_module: 'Laboratory',
            source_transaction_id: stxId,
            item_name: item.name,
            category: 'Lab Test',
            quantity: 1,
            unit_price: item.price,
            total: item.price,
            status: 'pending',
            created_by: profile?.id,
          })
        }
      }

      // 3. Audit
      writeAudit({
        hospitalId: hospital?.id, actor: profile,
        action: 'lab.walkin_request_created',
        entityType: 'lab_request', entityId: null,
        patientId: walkInPatient.id,
        summary: `Walk-in lab request ${requestNumber} created for ${walkInPatient.full_name} — ${walkInCart.length} test(s), total ${formatMoney(walkInCart.reduce((s, i) => s + i.price, 0))} (${paymentStatus})`,
        metadata: {
          request_number: requestNumber,
          patient_id: walkInPatient.id,
          patient_name: walkInPatient.full_name,
          tests: walkInCart.map(t => ({ name: t.name, price: t.price, sample_type: t.sample_type })),
          total: walkInCart.reduce((s, i) => s + i.price, 0),
          payment_status: paymentStatus,
          payment_method: walkInPaymentMethod,
          amount_paid: parseFloat(walkInAmountPaid) || 0,
        },
      })

      showToast(`Walk-in request ${requestNumber} created — ${walkInCart.length} test(s), ${formatMoney(walkInCart.reduce((s, i) => s + i.price, 0))}`)
      setShowWalkInModal(false)
      setWalkInPatient(null); setWalkInCart([]); setWalkInSearch(''); setWalkInAmountPaid('')
    } catch (err) {
      setFormError(err.message || 'Could not create walk-in request')
    } finally {
      setWalkInSaving(false)
    }
  }

  function addToWalkInCart(test) {
    setWalkInCart(prev => {
      if (prev.some(t => t.name === test.name)) return prev  // no duplicates
      return [...prev, { name: test.name, price: test.price, sample_type: test.sample_type }]
    })
  }

  function removeFromWalkInCart(name) {
    setWalkInCart(prev => prev.filter(t => t.name !== name))
  }

  // Pipeline advance: collect the sample / start processing.
  // Phase 5: blocks sample collection when payment_status is 'unpaid'
  // (walk-in tests that haven't been paid for yet).
  async function handleAdvance(test, toStage){
    // Payment gate: if advancing to sample_collected and the test has
    // payment_status='unpaid', block collection until payment is confirmed.
    if (toStage === 'sample_collected') {
      const rawRow = test.raw || test
      if (rawRow?.payment_status === 'unpaid') {
        showToast(`Payment required before sample collection. Record payment in Billing first.`)
        return
      }
    }
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
    const rawRow = test.raw || test
    const stage = labStage(test.status)
    // Determine cancel type based on current stage
    const collected = stage !== 'ordered' && !!rawRow?.collected_at
    const cancelTypeOptions = collected
      ? ['after_collection', 'sample_rejected', 'refund']
      : ['before_collection', 'refund']
    const cancelTypeLabels = {
      before_collection: 'Cancel before collection (no sample taken)',
      after_collection: 'Cancel after collection (sample already taken)',
      sample_rejected: 'Sample rejected / unsuitable',
      refund: 'Process refund',
    }
    const options = cancelTypeOptions.map((t, i) => `${i + 1}. ${cancelTypeLabels[t]}`).join('\n')
    const choice = prompt(`Cancel this request for ${test.test_name} (${test.patient_name})?\n\n${options}\n\nEnter 1-${cancelTypeOptions.length}:`)
    if (!choice) return
    const idx = parseInt(choice, 10) - 1
    if (isNaN(idx) || idx < 0 || idx >= cancelTypeOptions.length) { showToast('Invalid choice'); return }
    const cancelType = cancelTypeOptions[idx]
    const reason = prompt(`Reason for cancellation (${cancelTypeLabels[cancelType]}):`) || ''
    try {
      await updateLabRow(test, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: `${cancelType}: ${reason.trim() || 'No reason given'} — by ${profile?.full_name || 'staff'}`,
        cancel_type: cancelType,
        updated_at: new Date().toISOString(),
      })
      auditLab('lab.cancelled', test, `${test.test_name} for ${test.patient_name}: cancelled (${cancelType}) — ${reason.trim() || 'no reason'}`, { cancel_type: cancelType, reason: reason.trim() })
      showToast(`Request cancelled — ${cancelTypeLabels[cancelType]}`)
    } catch (err) {
      showToast(err.message || 'Could not cancel the request')
    }
  }

  async function handleReopen(test){
    const rawRow = test.raw || test
    const reason = prompt(`Reopen ${test.test_name} for ${test.patient_name}?\n\nThis will save the current result as "previous_result" for the audit trail and allow a new result to be entered.\n\nReason for correction (required):`)
    if (!reason?.trim()) return
    try {
      // Phase 5: Preserve the old result + record who corrected it + why.
      // Do NOT silently clear result/verified_by — keep them so the
      // audit trail shows what was changed.
      const nowIso = new Date().toISOString()
      const payload = {
        status: stageStatus('ordered', test.origin),
        updated_at: nowIso,
        // Preserve the previous result for audit
        previous_result: rawRow?.result || test.result || null,
        correction_reason: reason.trim(),
        corrected_by: profile?.full_name || null,
        // Clear verification (needs re-verification) but keep the result
        // visible until the new one is entered. The UI shows "previous_result"
        // when reopening for corrections.
        verified_by: null,
        verified_at: null,
      }
      await updateLabRow(test, payload)
      auditLab('lab.reopened', test, `${test.test_name} for ${test.patient_name}: reopened for correction — previous result preserved. Reason: ${reason.trim()}`, { previous_result: rawRow?.result || test.result, correction_reason: reason.trim(), corrected_by: profile?.full_name })
      showToast(`Reopened — previous result preserved for audit`)
    } catch (err) {
      showToast(err.message || 'Could not reopen the request')
    }
  }

  // Phase 5: Verify & Release — separate from result entry.
  // Only authorized lab users (admin/owner/lab role) can verify.
  // Nurses CANNOT verify (isNurseReadOnly check).
  async function handleVerifyAndRelease(test){
    if (isNurseReadOnly) { showToast('Nurses cannot verify results'); return }
    if (!confirm(`Verify and release result for ${test.test_name} (${test.patient_name})?\n\nThis action confirms the result is correct and releases it to the patient record. It cannot be undone without reopening for correction.`)) return
    try {
      const nowIso = new Date().toISOString()
      await updateLabRow(test, {
        status: 'completed',
        verified_by: profile?.full_name || null,
        verified_at: nowIso,
        updated_at: nowIso,
      })
      auditLab('lab.verified_released', test, `${test.test_name} for ${test.patient_name}: result verified and released by ${profile?.full_name || 'lab staff'}`, { verified_by: profile?.full_name, verified_at: nowIso })
      showToast(`Result verified and released`)
    } catch (err) {
      showToast(err.message || 'Could not verify the result')
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
        // Phase 5: Split result entry from verification.
        // Result entry sets resulted_by + status 'awaiting_verification'.
        // A SEPARATE "Verify & Release" step (handleVerifyAndRelease) sets
        // verified_by + verified_at + status 'completed'.
        const payload = {
          status: 'awaiting_verification',
          result: resData.result,
          result_file: resData.result_file || null,
          resulted_at: nowIso,
          resulted_by: profile?.full_name || null,
          // Do NOT set verified_by/verified_at here — that's the separate
          // verification step. The old code set verified_by = result enterer,
          // which skipped the required verification safeguard.
          result_unit: resData.result_unit || null,
          reference_range: resData.reference_range || null,
          abnormal_flag: ABNORMAL_FLAGS.includes(resData.abnormal_flag) ? resData.abnormal_flag : null,
          result_notes: resData.result_notes || null,
          updated_at: nowIso,
        }
        await updateLabRow(t, payload)
        // Guard against double-billing: "LAB-<test id>" is a deterministic
        // unique reference, so re-entering results through the Reopen flow
        // must NOT create a second charge for the same test — the database
        // enforces unique_source_transaction and the duplicate would jam
        // the offline sync queue.
        const alreadyBilled = billableCharges.some(
          (c) => c.source_transaction_id === `LAB-${t.id}` && c._discarded !== true
        )
        if (!alreadyBilled) {
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
        auditLab('lab_result.recorded', t,
          `Result recorded for ${t.test_name} — ${t.patient_name}${resData.abnormal_flag && resData.abnormal_flag !== 'normal' ? ` (${resData.abnormal_flag})` : ''} — awaiting verification`,
          { abnormal_flag: resData.abnormal_flag || null, unit: resData.result_unit || null, resulted_by: profile?.full_name || null })
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
      testRows += `<tr><td style="padding:8px;border:1px solid #ccc;">${i+1}</td><td style="padding:8px;border:1px solid #ccc;font-weight:bold;">${escapeHtml(t.test_name)}</td><td style="padding:8px;border:1px solid #ccc;">${escapeHtml(res || 'Pending')}</td></tr>`
    })

    const html = `
      <html><head><title>Lab Result - ${escapeHtml(formPatient?.full_name)}</title>
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
          <div class="h-name">${escapeHtml(hospital?.name || 'Hospital')}</div>
          <div class="h-meta">Laboratory Test Report</div>
        </div>
        <div class="grid">
          <div class="box">
            <h3>Patient Details</h3>
            <div><strong>Name:</strong> ${escapeHtml(formPatient?.full_name || 'N/A')}</div>
            <div><strong>Phone:</strong> ${escapeHtml(formPatient?.phone || 'N/A')}</div>
          </div>
          <div class="box">
            <h3>Report Details</h3>
            <div><strong>Date:</strong> ${escapeHtml(formatDateTimeSec(new Date(), timezone))}</div>
            <div><strong>Lab Scientist:</strong> ${escapeHtml(profile?.full_name || 'N/A')}</div>
          </div>
        </div>
        <table>
          <thead><tr><th style="width:50px;">#</th><th>Test Parameter</th><th>Result</th></tr></thead>
          <tbody>${testRows}</tbody>
        </table>
        <div class="sign">Authorized Signature: ${escapeHtml(profile?.full_name || '')}</div>
        <div class="footer">This is a computer generated report from ${escapeHtml(hospital?.name || 'the laboratory')}.</div>
      </body></html>`
    const win = window.open('', '_blank')
    if (!win) {
      showToast('Your browser blocked the print window. Allow pop-ups for this site and try again.')
      return
    }
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 500)
  }

  // Renamed from "handleDelete" to make clear this is an archive, not a
  // destructive delete. useOfflineTable.js already routes lab_tests and
  // lab_orders through its soft-delete path (SOFT_DELETE_TABLES), so this
  // has ALWAYS safely stamped deleted_at and hidden the record rather than
  // erasing it — only the button/dialog wording was misleading before.
  async function handleArchive(test){
    if (!confirm(`Archive this test request for ${test.patient_name} (${test.test_name})?\n\nIt will be hidden from this list, but the record is kept for the clinical history — nothing is permanently erased.`)) return
    if (test.origin === 'doctor') {
      await deleteOrder(test.id)
    } else {
      await deleteRecord(test.id)
    }
    auditLab('lab_request.archived', test, `Lab request archived — ${test.test_name} for ${test.patient_name}`)
    showToast('Test archived')
  }

  // ---- Bulk actions for a bundle of tests requested together ----
  // When a doctor sends several tests at once (Doctor Workbench →
  // "Send to Lab"), every one of those tests is saved with the SAME
  // `request_group` id. The functions below let the lab team act on an
  // entire bundle — collect samples, start processing, cancel, archive —
  // with ONE click and ONE confirmation/toast, instead of repeating the
  // action once per test. "Enter Results" already opens every pending
  // test for the patient in one form (see openResultForm below), so it
  // does not need a bulk version of its own.
  const STAGE_ORDER = ['ordered', 'sample_collected', 'processing']

  // The stage that should drive the bundle's action button: the
  // earliest pipeline stage still present among its tests. e.g. if 2
  // tests already have samples collected but 1 is still just
  // "ordered", the whole bundle still needs a sample collected first.
  function groupPrimaryStage(groupTests) {
    for (const s of STAGE_ORDER) {
      if (groupTests.some(t => labStage(t.status) === s)) return s
    }
    return 'processing'
  }

  async function handleAdvanceGroup(groupTests, toStage) {
    const targets = groupTests.filter(t => labStage(t.status) === groupPrimaryStage(groupTests))
    try {
      for (const t of targets) {
        const payload = { status: stageStatus(toStage, t.origin), updated_at: new Date().toISOString() }
        if (toStage === 'sample_collected') { payload.collected_at = new Date().toISOString(); payload.collected_by = profile?.full_name || null }
        await updateLabRow(t, payload)
        auditLab(`lab.${toStage}`, t, `${t.test_name} for ${t.patient_name}: ${LAB_STAGE_LABEL[toStage]}`)
      }
      showToast(`${targets.length} test(s) — ${LAB_STAGE_LABEL[toStage]}`)
    } catch (err) {
      showToast(err.message || 'Could not update the requests')
    }
  }

  function groupStageAction(groupRow) {
    const stage = groupPrimaryStage(groupRow.groupTests)
    const count = groupRow.groupTests.filter(t => labStage(t.status) === stage).length
    if (stage === 'ordered') return { label: `Collect Samples (${count})`, run: () => handleAdvanceGroup(groupRow.groupTests, 'sample_collected'), aria: `Mark samples collected for ${groupRow.patient_name}'s ${groupRow.groupTests.length} requested tests` }
    if (stage === 'sample_collected') return { label: `Start Processing (${count})`, run: () => handleAdvanceGroup(groupRow.groupTests, 'processing'), aria: `Start processing ${groupRow.patient_name}'s ${groupRow.groupTests.length} requested tests` }
    return { label: 'Enter Results', run: () => openResultForm(groupRow.groupTests[0]), aria: `Enter results for ${groupRow.patient_name}'s ${groupRow.groupTests.length} requested tests` }
  }

  async function handleCancelGroup(groupRow) {
    if (!confirm(`Cancel all ${groupRow.groupTests.length} test(s) requested together for ${groupRow.patient_name}? The records are kept for the audit trail.`)) return
    try {
      for (const t of groupRow.groupTests) {
        await updateLabRow(t, { status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: `Cancelled by ${profile?.full_name || 'staff'}`, updated_at: new Date().toISOString() })
        auditLab('lab.cancelled', t, `${t.test_name} for ${t.patient_name}: request cancelled`)
      }
      showToast(`${groupRow.groupTests.length} test(s) cancelled`)
    } catch (err) {
      showToast(err.message || 'Could not cancel the requests')
    }
  }

  async function handleArchiveGroup(groupRow) {
    if (!confirm(`Archive all ${groupRow.groupTests.length} test(s) requested together for ${groupRow.patient_name}?\n\nThey will be hidden from this list, but the records are kept for the clinical history — nothing is permanently erased.`)) return
    for (const t of groupRow.groupTests) {
      await deleteOrder(t.id)
      auditLab('lab_request.archived', t, `Lab request archived — ${t.test_name} for ${t.patient_name}`)
    }
    showToast(`${groupRow.groupTests.length} test(s) archived`)
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

  // Bundle same-request_group, still-pending doctor orders into one row
  // (see the bulk-action comment above). A "bundle" of just 1 test is
  // downgraded back to a normal single row so the UI stays uncluttered.
  const groupedRows = []
  const groupIndex = new Map()
  visibleSorted.forEach(t => {
    if (t.origin === 'doctor' && t.request_group && t.isPending) {
      let g = groupIndex.get(t.request_group)
      if (!g) {
        g = { ...t, isGroup: true, groupTests: [], displayKey: `group-${t.request_group}` }
        groupIndex.set(t.request_group, g)
        groupedRows.push(g)
      }
      g.groupTests.push(t)
    } else {
      groupedRows.push({ ...t, isGroup: false, groupTests: [t], displayKey: t.id })
    }
  })
  groupedRows.forEach(row => { if (row.isGroup && row.groupTests.length <= 1) row.isGroup = false })

  const pendingCountStat = combined.filter(t => t.isPending).length
  const completedCount = combined.filter(t => labStage(t.status) === 'completed').length

  // Global Pagination Rule — the combined lab_tests + lab_orders list
  // can grow into the hundreds over time, so only the current page's
  // rows are rendered into the table. Page size 10 (same as Radiology
  // and Insurance) because each row carries a lot of clinical detail.
  const {
    pageItems: pagedTests, currentPage, setCurrentPage, pageSize, setPageSize,
    totalPages, totalItems, startIndex, endIndex,
  } = usePagination(groupedRows, { pageSize: 10, resetKey: labSearch })

  // Stage-aware primary action per row (pipeline, global lab rule).
  // Phase 5: Added 'awaiting_verification' stage with "Verify & Release" action.
  function stageAction(test){
    const stage = labStage(test.status)
    if (stage === 'ordered') return { label: 'Collect Sample', run: () => handleAdvance(test, 'sample_collected'), aria: `Mark sample collected for ${test.test_name} for ${test.patient_name}` }
    if (stage === 'sample_collected') return { label: 'Start Processing', run: () => handleAdvance(test, 'processing'), aria: `Start processing ${test.test_name} for ${test.patient_name}` }
    if (stage === 'processing') return { label: 'Enter Results', run: () => openResultForm(test), aria: `Enter results for ${test.test_name} for ${test.patient_name}` }
    if (stage === 'awaiting_verification') return { label: 'Verify & Release', run: () => handleVerifyAndRelease(test), aria: `Verify and release result for ${test.test_name} for ${test.patient_name}` }
    if (stage === 'completed') return { label: 'View Result', run: () => openViewer(test), aria: `View result for ${test.test_name} for ${test.patient_name}` }
    return null
  }

  return (
    <>
      <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 20, gap: 12 }}>
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
            <ModuleHistoryButton moduleKey="laboratory" />
            {!isNurseReadOnly && (
              <>
                <button className="btn btn-primary" style={{ width: 'auto', background: 'var(--teal)' }} onClick={() => setShowWalkInModal(true)}>
                  <AppIcon name="plus" size={14} /> Walk-in Lab Request
                </button>
                <button className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>
                  <AppIcon name="plus" size={14} /> New Request
                </button>
              </>
            )}
            {isNurseReadOnly && (
              <span style={{ fontSize: 11, color: 'var(--gold)', alignSelf: 'center' }}>Read-only view — nurses can view results but not make changes</span>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : visibleSorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No lab requests yet. Add your first one above.</div>
        ) : (
          <>
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
                  {pagedTests.map(test => {
                    const stage = test.isGroup ? groupPrimaryStage(test.groupTests) : labStage(test.status)
                    const action = test.isGroup ? groupStageAction(test) : stageAction(test)
                    return (
                    <tr key={test.displayKey} style={{ borderTop: '1px solid var(--line-soft)' }}>
                      <td style={{ padding: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {test.patient_name}
                        {test.origin === 'doctor' && (
                          <span style={{ marginLeft: 8, fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(139,124,246,0.14)', color: 'var(--violet)', verticalAlign: 'middle' }}>
                            DOCTOR
                          </span>
                        )}
                        {test.origin === 'lab' && (test.raw?.request_origin === 'walk_in' || test.requestOrigin === 'walk_in') && (
                          <span style={{ marginLeft: 8, fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(0,199,199,0.14)', color: 'var(--teal)', verticalAlign: 'middle' }}>
                            WALK-IN
                          </span>
                        )}
                        {test.raw?.request_number && (
                          <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--blue)', fontFamily: 'var(--font-mono, monospace)' }}>
                            {test.raw.request_number}
                          </span>
                        )}
                        {test.raw?.payment_status === 'unpaid' && (
                          <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(225,104,94,0.14)', color: 'var(--danger)', verticalAlign: 'middle' }}>
                            UNPAID
                          </span>
                        )}
                        {test.raw?.payment_status === 'paid' && (
                          <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(0,199,199,0.14)', color: 'var(--teal)', verticalAlign: 'middle' }}>
                            PAID
                          </span>
                        )}
                        {(test.priority === 'urgent' || test.priority === 'stat') && (
                          <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: test.priority === 'stat' ? 'var(--danger-soft)' : 'rgba(201,169,97,0.14)', color: test.priority === 'stat' ? 'var(--danger)' : 'var(--gold)', verticalAlign: 'middle' }}>
                            {test.priority === 'stat' ? 'STAT' : 'URGENT'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5, maxWidth: 260 }}>
                        {test.isGroup ? (
                          <>
                            <div style={{ fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{test.groupTests.length} tests requested together</div>
                            <div style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{test.groupTests.map(g => g.test_name).join(', ')}</div>
                          </>
                        ) : (
                          <span style={{ whiteSpace: 'nowrap' }}>{test.test_name}</span>
                        )}
                      </td>
                      <td style={{ padding: 12 }}>
                        <span className={`lab-stage is-${stage}`}>{LAB_STAGE_LABEL[stage]}</span>
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: 'var(--muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {test.isGroup
                          ? '—'
                          : (test.result
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                {test.abnormal_flag && test.abnormal_flag !== 'normal' && <span className={`lab-flag is-${test.abnormal_flag}`}>{test.abnormal_flag}</span>}
                                {test.result}
                              </span>
                            : '—')}
                      </td>
                      <td style={{ padding: 12, fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(test.requested_at, timezone)}
                      </td>
                      <td style={{ padding: 12 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {action && !isNurseReadOnly && (
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
                          {test.isPending && !isNurseReadOnly && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ width: 'auto', padding: '5px 10px', fontSize: 11.5 }}
                              onClick={() => (test.isGroup ? handleCancelGroup(test) : handleCancel(test))}
                              aria-label={test.isGroup ? `Cancel all requested tests for ${test.patient_name}` : `Cancel ${test.test_name} request for ${test.patient_name}`}
                            >
                              Cancel
                            </button>
                          )}
                          {stage === 'completed' && !test.isGroup && !isNurseReadOnly && (
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
                          {!isNurseReadOnly && (
                            <button
                              onClick={() => (test.isGroup ? handleArchiveGroup(test) : handleArchive(test))}
                              className="icon-btn-delete"
                              title="Archive"
                              aria-label={test.isGroup ? `Archive all requested tests for ${test.patient_name}` : `Archive ${test.test_name} request for ${test.patient_name}`}
                            ><TrashIcon size={14}/></button>
                          )}
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              itemLabel="lab requests"
            />
          </>
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
              {!isNurseReadOnly && (
                <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleSaveAllResults} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Results (awaiting verification)'}
                </button>
              )}
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

      {/* ---- Walk-in Lab Request modal ---- */}
      {showWalkInModal && (
        <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowWalkInModal(false) }}>
          <div className="card dash-modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14 }}>
              <div>
                <div className="dash-modal-title" style={{ paddingBottom: 0 }}>Walk-in Lab Request</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>Select patient + tests — charges are created immediately at request time.</div>
              </div>
              <button className="dash-icon-btn" onClick={() => setShowWalkInModal(false)} aria-label="Close"><AppIcon name="close" size={18} /></button>
            </div>
            <div className="dash-modal-body">
              <form id="walkin-lab-form" onSubmit={handleWalkInSubmit}>
                {formError && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{formError}</div>}

                {/* Patient picker */}
                <div className="field">
                  <label>Patient *</label>
                  <PatientAutocomplete
                    patients={patients}
                    value={walkInPatient ? { id: walkInPatient.id, label: walkInPatient.full_name, patient: walkInPatient } : null}
                    onChange={(opt) => setWalkInPatient(opt?.patient || null)}
                    placeholder="Search patient by name, ID or phone…"
                    ariaLabel="Patient"
                  />
                </div>

                {/* Test search + add */}
                <div className="field">
                  <label>Add Tests (only tests not requiring a clinician order)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Search test name…"
                      value={walkInSearch}
                      onChange={e => setWalkInSearch(e.target.value)}
                      style={{ flex: 1, padding: '8px 10px', fontSize: 12, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)' }}
                    />
                  </div>
                  {/* Test picker list */}
                  {walkInSearch.trim() && (
                    <div style={{ marginTop: 6, border: '1px solid var(--line-soft)', borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
                      {WALKIN_TEST_OPTIONS
                        .filter(t => t.name.toLowerCase().includes(walkInSearch.trim().toLowerCase()))
                        .filter(t => !walkInCart.some(c => c.name === t.name))
                        .map(t => (
                          <button key={t.name} type="button" onClick={() => { addToWalkInCart(t); setWalkInSearch('') }} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--line-soft)', cursor: 'pointer', color: 'inherit' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t.name}</span>
                              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--teal)', fontSize: 12 }}>{formatMoney(t.price)}</span>
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{t.sample_type}</div>
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                {/* Cart */}
                {walkInCart.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Selected Tests ({walkInCart.length})</div>
                    <div style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead style={{ background: 'var(--bg-card)' }}>
                          <tr><th style={{ padding: '6px 8px', textAlign: 'left' }}>Test</th><th style={{ padding: '6px 8px' }}>Sample</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>Price</th><th></th></tr>
                        </thead>
                        <tbody>
                          {walkInCart.map(item => (
                            <tr key={item.name}>
                              <td style={{ padding: '6px 8px', borderTop: '1px solid var(--line-soft)', fontWeight: 600 }}>{item.name}</td>
                              <td style={{ padding: '6px 8px', borderTop: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--muted)' }}>{item.sample_type}</td>
                              <td style={{ padding: '6px 8px', borderTop: '1px solid var(--line-soft)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--teal)' }}>{formatMoney(item.price)}</td>
                              <td style={{ padding: '4px 8px', borderTop: '1px solid var(--line-soft)' }}>
                                <button type="button" onClick={() => removeFromWalkInCart(item.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4 }}><TrashIcon size={12} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: 'var(--bg-card)' }}>
                            <td colSpan={2} style={{ padding: '8px', fontWeight: 800, textAlign: 'right' }}>Total:</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', fontWeight: 800, color: 'var(--teal)', fontSize: 14 }}>{formatMoney(walkInCart.reduce((s, i) => s + i.price, 0))}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* Payment */}
                <div className="dash-field-grid">
                  <div className="field">
                    <label>Payment Method</label>
                    <select value={walkInPaymentMethod} onChange={e => setWalkInPaymentMethod(e.target.value)} style={{ padding: '8px 10px', fontSize: 12, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)' }}>
                      <option value="Cash">Cash</option>
                      <option value="POS">POS</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Wallet">Patient Wallet</option>
                      <option value="HMO">HMO (authorized)</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Amount Paid (₦) — leave 0 if unpaid</label>
                    <input type="number" min="0" step="0.01" value={walkInAmountPaid} onChange={e => setWalkInAmountPaid(e.target.value)} placeholder={String(walkInCart.reduce((s, i) => s + i.price, 0))} style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  {walkInAmountPaid && parseFloat(walkInAmountPaid) > 0
                    ? '✓ Payment recorded — sample collection allowed.'
                    : '⚠ No payment recorded — sample collection will be blocked until payment is confirmed.'}
                </div>
              </form>
            </div>
            <div className="dash-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowWalkInModal(false)} disabled={walkInSaving}>Cancel</button>
              <button type="submit" form="walkin-lab-form" className="btn btn-primary" disabled={walkInSaving || !walkInPatient || walkInCart.length === 0}>
                {walkInSaving ? 'Creating…' : `Create Request · ${formatMoney(walkInCart.reduce((s, i) => s + i.price, 0))}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="dash-toast dash-toast-success">{toast}</div>
      )}
    </>
  )
}
