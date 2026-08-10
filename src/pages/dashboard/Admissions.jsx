import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'

// Section 5 — Admission Module Dashboard.
// Requests list (Section 6) and Review screen (Section 7) land in this
// same file next; for now this establishes the live stats row so the
// module has somewhere real to grow from.
export default function Admissions(){
  const { hospital } = useAuth()

  const { records: admissionRequests, loading: loadingRequests } = useOfflineTable('admission_requests', hospital?.id)
  const { records: admissions, loading: loadingAdmissions } = useOfflineTable('admissions', hospital?.id)
  const { records: beds, loading: loadingBeds } = useOfflineTable('beds', hospital?.id)

  const loading = loadingRequests || loadingAdmissions || loadingBeds

  const todayStr = new Date().toDateString()

  const pendingRequests = admissionRequests.filter(r => r.status === 'pending').length
  const approvedRequests = admissionRequests.filter(r => r.status === 'approved').length
  const admittedToday = admissions.filter(a => new Date(a.admitted_at).toDateString() === todayStr).length
  const currentlyAdmitted = admissions.filter(a => a.status === 'active').length
  const availableBeds = beds.filter(b => b.status === 'available').length
  const occupiedBeds = beds.filter(b => b.status === 'occupied').length
  const pendingCleaning = beds.filter(b => b.status === 'cleaning').length

  const stats = [
    { label: 'Pending Requests', value: pendingRequests, color: 'var(--gold)' },
    { label: 'Approved Requests', value: approvedRequests, color: 'var(--teal)' },
    { label: 'Admitted Today', value: admittedToday, color: 'var(--teal)' },
    { label: 'Currently Admitted', value: currentlyAdmitted, color: 'var(--blue)' },
    { label: 'Available Beds', value: availableBeds, color: 'var(--muted)' },
    { label: 'Occupied Beds', value: occupiedBeds, color: 'var(--blue)' },
    { label: 'Pending Cleaning', value: pendingCleaning, color: 'var(--gold)' },
  ]

  return (
    <div>
      <div className="dash-panel" style={{ marginBottom: 16 }}>
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Admissions</div>
            <div className="dash-panel-sub">Requests, bed assignment, and active admissions</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="dash-panel" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
      ) : (
        <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 20 }}>
          {stats.map(s => (
            <div className="dash-stat-card" key={s.label}>
              <div>
                <div className="dash-stat-label">{s.label}</div>
                <div className="dash-stat-value" style={{ color: s.color }}>{s.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="dash-panel" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
        Admission requests list coming next.
      </div>
    </div>
  )
}
