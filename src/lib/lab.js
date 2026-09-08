// =====================================================================
// GOODIE-MEDHUB — Laboratory results pipeline helpers
//
// The lab workflow is built AROUND the existing lab_orders / lab_tests
// rows (no duplicate results store). Statuses follow the global rule:
//
//   Ordered → Sample Collected → Processing → Completed/Verified
//   (or Cancelled from any active stage)
//
// Legacy statuses already in the database keep working:
//   'pending' (lab-created) and 'requested' (doctor orders) both display
//   as Ordered; 'completed' stays Completed/Verified.
// =====================================================================

export const LAB_STAGES = ['ordered', 'sample_collected', 'processing', 'completed', 'cancelled']

export const LAB_STAGE_LABEL = {
  ordered: 'Ordered',
  sample_collected: 'Sample Collected',
  processing: 'Processing',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

// Any stored status string → canonical pipeline stage. Unknown values
// fall through to 'ordered' so old rows never disappear from the board.
export function labStage(status) {
  switch (String(status || '').toLowerCase()) {
    case 'pending':
    case 'requested':
    case 'ordered':
      return 'ordered'
    case 'sample_collected':
    case 'collected':
      return 'sample_collected'
    case 'processing':
      return 'processing'
    case 'completed':
    case 'verified':
      return 'completed'
    case 'cancelled':
    case 'canceled':
      return 'cancelled'
    default:
      return 'ordered'
  }
}

// Canonical stage → the concrete status value persisted for a row.
// Lab-created rows keep the legacy 'pending' vocabulary at the ordered
// stage so nothing about existing data changes; new intermediate stages
// are only introduced when the user advances the pipeline.
export function stageStatus(stage, origin) {
  if (stage === 'ordered') return origin === 'doctor' ? 'requested' : 'pending'
  return stage // sample_collected | processing | completed | cancelled
}

export const ABNORMAL_FLAGS = ['normal', 'high', 'low', 'critical']

// Columns introduced by migration 008 (kept in one place so the code
// and the migration never drift apart). Writes go through useOfflineTable,
// whose schema-gap tolerance already retries without columns the live
// database does not have yet — so this list is documentation, plus a
// ready-made allow-list if any code path ever needs to filter fields.
export const EXTENDED_LAB_FIELDS = [
  'collected_at', 'collected_by',
  'resulted_at', 'verified_by',
  'result_notes', 'result_unit', 'reference_range', 'abnormal_flag',
  'cancelled_at', 'cancel_reason',
]

// One lab row (lab_tests or lab_orders) → normalized shape shared by the
// Laboratory board, the LabResultViewer and the Doctor Workbench panel.
export function normalizeLabRow(row, origin) {
  if (!row) return null
  const stage = labStage(row.status)
  return {
    id: row.id,
    origin, // 'doctor' | 'lab'
    patientId: row.patient_id || null,
    patientName: row.patient_name || null,
    testName: row.test_name || null,
    status: row.status || null,
    stage,
    priority: row.priority || 'routine',
    notes: row.notes || row.result_notes || null, // doctor's clinical note vs lab comment
    result: row.result || null,
    resultUnit: row.result_unit || null,
    referenceRange: row.reference_range || null,
    abnormalFlag: row.abnormal_flag || null,
    resultFile: row.result_file || null,
    fileName: row.file_name || null,
    requestedAt: row.requested_at || row.created_at || null,
    collectedAt: row.collected_at || null,
    resultedAt: row.resulted_at || row.updated_at || null,
    verifiedBy: row.verified_by || null,
    requestGroup: row.request_group || null,
    patientVitalsId: row.patient_vitals_id || null,
    raw: row,
  }
}
