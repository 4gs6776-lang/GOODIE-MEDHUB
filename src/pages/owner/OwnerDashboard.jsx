import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-hospital`

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const paths = {
    building: <><path d="M4 21V5l8-3 8 3v16" /><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    power: <><path d="M12 3v9" /><path d="M18.4 6.6a8 8 0 1 1-12.8 0" /></>,
    eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    pause: <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>,
    play: <path d="M6 4l14 8-14 8V4Z" />,
    trash: <><path d="M4 7h16" /><path d="M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" /><path d="M9 7V4h6v3" /></>,
  }
  return <svg {...common}>{paths[name] || paths.building}</svg>
}

const TIER_LABEL = { tier1: 'Tier 1', tier2: 'Tier 2', tier3: 'Tier 3' }
const statusColor = { active: 'var(--teal)', pending: 'var(--gold)', suspended: 'var(--danger)' }
const statusBg = { active: 'var(--teal-soft)', pending: 'rgba(201,169,97,0.14)', suspended: 'var(--danger-soft)' }

export default function OwnerDashboard(){
  const { signOut, session } = useAuth()
  const [hospitals, setHospitals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)

  const [hospitalName, setHospitalName] = useState('')
  const [adminFullName, setAdminFullName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [tier, setTier] = useState('tier1')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')

  async function loadHospitals(){
    setLoading(true)
    const { data, error } = await supabase
      .from('hospitals')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setHospitals(data || [])
    setLoading(false)
  }

  useEffect(() => { loadHospitals() }, [])

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleCreate(e){
    e.preventDefault()
    setFormError('')
    if (!hospitalName || !adminFullName || !adminEmail || !adminPassword) {
      setFormError('Please fill in every field.')
      return
    }
    if (adminPassword.length < 6) {
      setFormError('Password must be at least 6 characters.')
      return
    }

    setCreating(true)
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ hospitalName, adminFullName, adminEmail, adminPassword, tier }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Could not create hospital')

      setShowModal(false)
      setHospitalName(''); setAdminFullName(''); setAdminEmail(''); setAdminPassword(''); setTier('tier1')
      showToast(`${hospitalName} added`)
      loadHospitals()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function updateTier(id, newTier){
    const { error } = await supabase.from('hospitals').update({ subscription_tier: newTier }).eq('id', id)
    if (!error) {
      showToast('Tier updated')
      loadHospitals()
    }
  }

  async function toggleStatus(hospital){
    const newStatus = hospital.status === 'active' ? 'suspended' : 'active'
    const { error } = await supabase.from('hospitals').update({ status: newStatus }).eq('id', hospital.id)
    if (!error) {
      showToast(`${hospital.name} ${newStatus}`)
      loadHospitals()
    }
  }

  async function deleteHospital(hospital){
    if (!confirm(`Permanently delete ${hospital.name} and all its data? This cannot be undone.`)) return
    const { error } = await supabase.from('hospitals').delete().eq('id', hospital.id)
    if (!error) {
      showToast(`${hospital.name} deleted`)
      loadHospitals()
    } else {
      showToast(error.message)
    }
  }

  const activeCount = hospitals.filter(h => h.status === 'active').length
  const suspendedCount = hospitals.filter(h => h.status === 'suspended').length
  const pendingCount = hospitals.filter(h => h.status === 'pending').length

  return (
    <div className="owner-shell">
      {/* Top bar */}
      <header className="owner-topbar">
        <div className="owner-brand">
          <div className="owner-brand-mark"><Icon name="building" size={19} /></div>
          <div>
            <div className="owner-brand-name">G-MedHub</div>
            <div className="owner-brand-sub">Platform Owner</div>
          </div>
        </div>
        <button className="owner-icon-btn" onClick={signOut} title="Sign out">
          <Icon name="power" size={17} />
        </button>
      </header>

      <main className="owner-content">
        {/* Summary stats */}
        <section className="owner-stats">
          <div className="owner-stat-card">
            <div className="owner-stat-value">{hospitals.length}</div>
            <div className="owner-stat-label">Total Hospitals</div>
          </div>
          <div className="owner-stat-card">
            <div className="owner-stat-value" style={{ color: 'var(--teal)' }}>{activeCount}</div>
            <div className="owner-stat-label">Active</div>
          </div>
          <div className="owner-stat-card">
            <div className="owner-stat-value" style={{ color: 'var(--gold)' }}>{pendingCount}</div>
            <div className="owner-stat-label">Pending</div>
          </div>
          <div className="owner-stat-card">
            <div className="owner-stat-value" style={{ color: 'var(--danger)' }}>{suspendedCount}</div>
            <div className="owner-stat-label">Suspended</div>
          </div>
        </section>

        {/* Hospital list */}
        <section className="owner-panel">
          <div className="owner-panel-head">
            <div className="owner-panel-title">
              {hospitals.length} Hospital{hospitals.length !== 1 ? 's' : ''}
            </div>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>
              <Icon name="plus" size={15} /> Add Hospital
            </button>
          </div>

          {loading ? (
            <div className="owner-empty">Loading…</div>
          ) : hospitals.length === 0 ? (
            <div className="owner-empty">No hospitals yet. Add the first one above.</div>
          ) : (
            <div className="owner-hospital-list">
              {hospitals.map(h => (
                <div key={h.id} className="owner-hospital-row">
                  <Link to={`/owner/hospitals/${h.id}`} className="owner-hospital-identity">
                    <div className="owner-hospital-avatar"><Icon name="building" size={18} /></div>
                    <div style={{ minWidth: 0 }}>
                      <div className="owner-hospital-name">{h.name}</div>
                      <div className="owner-hospital-sub">{h.subdomain}</div>
                    </div>
                  </Link>

                  <div className="owner-hospital-actions">
                    <span className="owner-status-pill" style={{ background: statusBg[h.status], color: statusColor[h.status] }}>
                      {h.status}
                    </span>

                    <select
                      className="owner-tier-select"
                      value={h.subscription_tier}
                      onChange={e => updateTier(h.id, e.target.value)}
                    >
                      {Object.entries(TIER_LABEL).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>

                    <Link to={`/owner/hospitals/${h.id}`} className="owner-icon-btn" title="View details">
                      <Icon name="eye" size={16} />
                    </Link>

                    <button
                      className="owner-icon-btn"
                      onClick={() => toggleStatus(h)}
                      title={h.status === 'active' ? 'Suspend' : 'Activate'}
                    >
                      <Icon name={h.status === 'active' ? 'pause' : 'play'} size={15} />
                    </button>

                    <button
                      className="owner-icon-btn owner-icon-btn-danger"
                      onClick={() => deleteHospital(h)}
                      title="Delete"
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {showModal && (
        <div className="dash-modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="card dash-modal" onClick={e => e.stopPropagation()}>
            <div className="dash-modal-title">Add Hospital</div>
            <div className="dash-modal-body">
              {formError && <div className="error-box">{formError}</div>}
              <form id="add-hospital-form" onSubmit={handleCreate}>
                <div className="field">
                  <label>Hospital Name</label>
                  <input value={hospitalName} onChange={e => setHospitalName(e.target.value)} placeholder="e.g. Hallel Hospital & Maternity" />
                </div>
                <div className="dash-field-grid">
                  <div className="field">
                    <label>Admin Full Name</label>
                    <input value={adminFullName} onChange={e => setAdminFullName(e.target.value)} placeholder="e.g. Dr. Jane Doe" />
                  </div>
                  <div className="field">
                    <label>Subscription Tier</label>
                    <select value={tier} onChange={e => setTier(e.target.value)}>
                      {Object.entries(TIER_LABEL).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Admin Email</label>
                  <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@hospital.com" />
                </div>
                <div className="field">
                  <label>Admin Password</label>
                  <input type="text" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Set a password for them" />
                  <div className="field-hint">Share this with the hospital — they can change it later.</div>
                </div>
              </form>
            </div>
            <div className="dash-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" form="add-hospital-form" className="btn btn-primary" disabled={creating}>
                {creating ? 'Creating…' : 'Create Hospital'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="owner-toast">{toast}</div>}
    </div>
  )
}
