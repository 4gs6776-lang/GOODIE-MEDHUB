import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const paths = {
    building: <><path d="M4 21V5l8-3 8 3v16" /><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.6 3-6.5 7-6.5s7 2.9 7 6.5" /><path d="M16 5.5a3.2 3.2 0 0 1 0 6.2M18 14c2.4.8 4 2.9 4 6" /></>,
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 9h18" /></>,
    arrowLeft: <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
    pause: <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>,
    play: <path d="M6 4l14 8-14 8V4Z" />,
    trash: <><path d="M4 7h16" /><path d="M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" /><path d="M9 7V4h6v3" /></>,
    arrowUp: <path d="m6 15 6-6 6 6" />,
  }
  return <svg {...common}>{paths[name] || paths.building}</svg>
}

const TIERS = [
  { value: 'tier1', label: 'Tier 1' },
  { value: 'tier2', label: 'Tier 2' },
  { value: 'tier3', label: 'Tier 3' },
]
const statusColor = { active: 'var(--teal)', pending: 'var(--gold)', suspended: 'var(--danger)' }
const statusBg = { active: 'var(--teal-soft)', pending: 'rgba(201,169,97,0.14)', suspended: 'var(--danger-soft)' }

const SPARK = "M2 27 C12 22 15 10 25 18 S38 29 48 16 S61 8 70 22 S80 24 88 11"

export default function HospitalDetails() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [hospital, setHospital] = useState(null)
  const [staff, setStaff] = useState([])
  const [counts, setCounts] = useState({ patients: null, appointments: null })
  const [revenue, setRevenue] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [staffSearch, setStaffSearch] = useState('')

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function loadAll() {
    setLoading(true)

    const { data: hospitalData } = await supabase
      .from('hospitals')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    setHospital(hospitalData || null)

    const { data: staffData } = await supabase
      .from('profiles')
      .select('*')
      .eq('hospital_id', id)
      .order('created_at', { ascending: false })
    setStaff(staffData || [])

    const [{ count: patientCount }, { count: apptCount }] = await Promise.all([
      supabase.from('patients').select('id', { count: 'exact', head: true }).eq('hospital_id', id),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('hospital_id', id),
    ])
    setCounts({ patients: patientCount ?? 0, appointments: apptCount ?? 0 })

    const { data: paymentsData } = await supabase
      .from('payments')
      .select('amount')
      .eq('hospital_id', id)
    const total = (paymentsData || []).reduce((sum, p) => sum + Number(p.amount || 0), 0)
    setRevenue(total)

    setLoading(false)
  }

  useEffect(() => { loadAll() }, [id])

  async function updateTier(newTier) {
    const { error } = await supabase.from('hospitals').update({ subscription_tier: newTier }).eq('id', id)
    if (!error) { showToast('Tier updated'); loadAll() } else { showToast(error.message) }
  }

  async function toggleStatus() {
    const newStatus = hospital.status === 'active' ? 'suspended' : 'active'
    const { error } = await supabase.from('hospitals').update({ status: newStatus }).eq('id', id)
    if (!error) { showToast(`Hospital ${newStatus}`); loadAll() } else { showToast(error.message) }
  }

  async function deleteHospital() {
    if (!hospital) return
    if (!confirm(`Permanently delete ${hospital.name} and all its data? This cannot be undone.`)) return
    const { error } = await supabase.from('hospitals').delete().eq('id', id)
    if (!error) { showToast(`${hospital.name} deleted`); navigate('/owner') } else { showToast(error.message) }
  }

  async function toggleStaffActive(member) {
    const goingActive = !member.active
    if (!goingActive && !confirm(`Deactivate ${member.full_name}? They'll immediately lose access to log in.`)) return
    const { error } = await supabase.from('profiles').update({ active: goingActive }).eq('id', member.id)
    if (!error) { showToast(`${member.full_name} ${goingActive ? 'reactivated' : 'deactivated'}`); loadAll() } else { showToast(error.message) }
  }

  const visibleStaff = staffSearch
    ? staff.filter(m => [m.full_name, m.email, m.role].some(v => String(v || '').toLowerCase().includes(staffSearch.toLowerCase())))
    : staff

  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()

  if (loading) {
    return <div className="owner-shell owner-fullpage-msg">Loading…</div>
  }

  if (!hospital) {
    return (
      <div className="owner-shell owner-fullpage-msg" style={{ flexDirection: 'column', gap: 14 }}>
        <div>Hospital not found.</div>
        <Link to="/owner" className="btn btn-ghost" style={{ width: 'auto', padding: '0 20px' }}>← Back to All Hospitals</Link>
      </div>
    )
  }

  return (
    <div className="owner-shell">
      <header className="owner-topbar">
        <Link to="/owner" className="owner-icon-btn" title="Back to all hospitals">
          <Icon name="arrowLeft" size={18} />
        </Link>
        <div className="owner-brand" style={{ flex: 1, minWidth: 0 }}>
          <div className="owner-brand-mark"><Icon name="building" size={19} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="owner-brand-name" style={{ maxWidth: 'none' }}>{hospital.name}</div>
            <div className="owner-brand-sub" style={{ textTransform: 'none', letterSpacing: 0 }}>{hospital.subdomain}</div>
          </div>
        </div>
        <span className="owner-status-pill" style={{ background: statusBg[hospital.status], color: statusColor[hospital.status] }}>
          {hospital.status}
        </span>
        <button className="owner-icon-btn" onClick={toggleStatus} title={hospital.status === 'active' ? 'Suspend' : 'Activate'}>
          <Icon name={hospital.status === 'active' ? 'pause' : 'play'} size={16} />
        </button>
        <button className="owner-icon-btn owner-icon-btn-danger" onClick={deleteHospital} title="Delete hospital">
          <Icon name="trash" size={16} />
        </button>
      </header>

      <main className="owner-content">
        {/* Stats — same visual system as the hospital's own dashboard */}
        <section className="dash-stats premium-stats">
          <div className="dash-stat-card premium-stat red-stat">
            <div className="dash-stat-top">
              <div className="dash-stat-icon"><Icon name="users" size={20} /></div>
              <svg className="dash-mini-chart" viewBox="0 0 90 38"><path d={SPARK} /></svg>
            </div>
            <div className="dash-stat-label">Staff</div>
            <div className="dash-stat-value">{staff.length}</div>
            <div className="dash-stat-delta positive"><Icon name="arrowUp" size={12} /> Registered accounts</div>
          </div>

          <div className="dash-stat-card premium-stat teal-stat">
            <div className="dash-stat-top">
              <div className="dash-stat-icon"><Icon name="users" size={20} /></div>
              <svg className="dash-mini-chart" viewBox="0 0 90 38"><path d={SPARK} /></svg>
            </div>
            <div className="dash-stat-label">Patients</div>
            <div className="dash-stat-value">{(counts.patients ?? 0).toLocaleString()}</div>
            <div className="dash-stat-delta positive"><Icon name="arrowUp" size={12} /> Live patient count</div>
          </div>

          <div className="dash-stat-card premium-stat violet-stat">
            <div className="dash-stat-top">
              <div className="dash-stat-icon"><Icon name="calendar" size={20} /></div>
              <svg className="dash-mini-chart" viewBox="0 0 90 38"><path d={SPARK} /></svg>
            </div>
            <div className="dash-stat-label">Appointments</div>
            <div className="dash-stat-value">{(counts.appointments ?? 0).toLocaleString()}</div>
            <div className="dash-stat-delta positive"><Icon name="arrowUp" size={12} /> All-time total</div>
          </div>

          <div className="dash-stat-card premium-stat gold-stat">
            <div className="dash-stat-top">
              <div className="dash-stat-icon money-icon">₦</div>
              <svg className="dash-mini-chart" viewBox="0 0 90 38"><path d={SPARK} /></svg>
            </div>
            <div className="dash-stat-label">Total Revenue</div>
            <div className="dash-stat-value">₦{(revenue ?? 0).toLocaleString()}</div>
            <div className="dash-stat-delta positive"><Icon name="arrowUp" size={12} /> Collected to date</div>
          </div>
        </section>

        {/* Subscription */}
        <section className="owner-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div className="owner-panel-title" style={{ marginBottom: 4 }}>Subscription</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              Created {hospital.created_at ? new Date(hospital.created_at).toLocaleDateString() : '—'}
            </div>
          </div>
          <select className="owner-tier-select" style={{ height: 38, fontSize: 13 }} value={hospital.subscription_tier} onChange={e => updateTier(e.target.value)}>
            {TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </section>

        {/* Staff */}
        <section className="owner-panel">
          <div className="owner-panel-head">
            <div className="owner-panel-title">Staff ({staff.length})</div>
            <input
              placeholder="Search staff…"
              value={staffSearch}
              onChange={e => setStaffSearch(e.target.value)}
              style={{ maxWidth: 220 }}
            />
          </div>

          {visibleStaff.length === 0 ? (
            <div className="owner-empty">No staff found.</div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-full-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStaff.map(m => (
                    <tr key={m.id}>
                      <td>
                        <div className="dash-patient-name">
                          <span>{initials(m.full_name)}</span>
                          {m.full_name}
                        </div>
                      </td>
                      <td>{m.email}</td>
                      <td style={{ textTransform: 'capitalize' }}>{String(m.role || '').replace('_', ' ')}</td>
                      <td>
                        <span className="dash-status" style={{
                          background: m.active ? 'var(--teal-soft)' : 'var(--danger-soft)',
                          color: m.active ? 'var(--teal)' : 'var(--danger)',
                        }}>
                          {m.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <button className="owner-icon-btn owner-icon-btn-inline" onClick={() => toggleStaffActive(m)}>
                          {m.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {toast && <div className="owner-toast">{toast}</div>}
    </div>
  )
}
