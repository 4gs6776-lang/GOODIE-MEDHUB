import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

const TIERS = ['tier1', 'tier2', 'tier3']
const statusColor = { active: 'var(--teal)', pending: 'var(--gold)', suspended: 'var(--danger)' }
const statusBg = { active: 'var(--teal-soft)', pending: 'rgba(201,169,97,0.14)', suspended: 'var(--danger-soft)' }

function StatCard({ label, value, sub }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px', background: 'var(--bg-card)' }}>
      <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, fontFamily: 'var(--font-mono)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

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
    if (!error) {
      showToast('Tier updated')
      loadAll()
    } else {
      showToast(error.message)
    }
  }

  async function toggleStatus() {
    const newStatus = hospital.status === 'active' ? 'suspended' : 'active'
    const { error } = await supabase.from('hospitals').update({ status: newStatus }).eq('id', id)
    if (!error) {
      showToast(`Hospital ${newStatus}`)
      loadAll()
    } else {
      showToast(error.message)
    }
  }

  async function deleteHospital() {
    if (!hospital) return
    if (!confirm(`Permanently delete ${hospital.name} and all its data? This cannot be undone.`)) return
    const { error } = await supabase.from('hospitals').delete().eq('id', id)
    if (!error) {
      showToast(`${hospital.name} deleted`)
      navigate('/owner')
    } else {
      showToast(error.message)
    }
  }

  async function toggleStaffActive(member) {
    const goingActive = !member.active
    if (!goingActive && !confirm(`Deactivate ${member.full_name}? They'll immediately lose access to log in.`)) return
    const { error } = await supabase.from('profiles').update({ active: goingActive }).eq('id', member.id)
    if (!error) {
      showToast(`${member.full_name} ${goingActive ? 'reactivated' : 'deactivated'}`)
      loadAll()
    } else {
      showToast(error.message)
    }
  }

  const visibleStaff = staffSearch
    ? staff.filter(m => [m.full_name, m.email, m.role].some(v => String(v || '').toLowerCase().includes(staffSearch.toLowerCase())))
    : staff

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        Loading…
      </div>
    )
  }

  if (!hospital) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'var(--muted)' }}>
        <div>Hospital not found.</div>
        <Link to="/owner" className="btn btn-ghost" style={{ width: 'auto', padding: '0 20px' }}>← Back to All Hospitals</Link>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', padding: '32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link to="/owner" style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 700 }}>← All Hospitals</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 27, fontWeight: 500 }}>{hospital.name}</h1>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>{hospital.subdomain}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 20,
              background: statusBg[hospital.status], color: statusColor[hospital.status], textTransform: 'capitalize',
            }}>
              {hospital.status}
            </span>
            <button className="btn btn-ghost" style={{ width: 'auto' }} onClick={toggleStatus}>
              {hospital.status === 'active' ? 'Suspend' : 'Activate'}
            </button>
            <button
              className="btn"
              style={{ width: 'auto', background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid rgba(225,104,94,0.35)' }}
              onClick={deleteHospital}
            >
              Delete Hospital
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard label="Staff" value={staff.length} />
        <StatCard label="Patients" value={counts.patients ?? '—'} />
        <StatCard label="Appointments" value={counts.appointments ?? '—'} />
        <StatCard label="Total Revenue" value={`₦${(revenue ?? 0).toLocaleString()}`} />
      </div>

      {/* Plan */}
      <div className="card" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>Subscription</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
            Created {hospital.created_at ? new Date(hospital.created_at).toLocaleDateString() : '—'}
          </div>
        </div>
        <select
          value={hospital.subscription_tier}
          onChange={e => updateTier(e.target.value)}
          style={{ background: 'var(--bg-elevated)', color: 'var(--ivory)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700 }}
        >
          {TIERS.map(t => <option key={t} value={t}>{t.replace('tier', 'Tier ')}</option>)}
        </select>
      </div>

      {/* Staff list */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>
            Staff ({staff.length})
          </div>
          <input
            placeholder="Search staff…"
            value={staffSearch}
            onChange={e => setStaffSearch(e.target.value)}
            style={{ maxWidth: 220 }}
          />
        </div>

        {visibleStaff.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)', fontSize: 12.5 }}>No staff found.</div>
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
                    <td style={{ fontWeight: 700 }}>{m.full_name}</td>
                    <td>{m.email}</td>
                    <td style={{ textTransform: 'capitalize' }}>{String(m.role || '').replace('_', ' ')}</td>
                    <td>
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                        background: m.active ? 'var(--teal-soft)' : 'var(--danger-soft)',
                        color: m.active ? 'var(--teal)' : 'var(--danger)',
                      }}>
                        {m.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => toggleStaffActive(m)}
                        style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 7, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}
                      >
                        {m.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)',
          padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60, maxWidth: '85vw', textAlign: 'center',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

