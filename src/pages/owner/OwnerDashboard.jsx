import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-hospital`

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

  const statusColor = { active: 'var(--teal)', pending: 'var(--gold)', suspended: 'var(--danger)' }
  const statusBg = { active: 'var(--teal-soft)', pending: 'rgba(201,169,97,0.14)', suspended: 'var(--danger-soft)' }

  return (
    <div style={{ minHeight: '100vh', padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 700, marginBottom: 4 }}>
            Platform Owner
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500 }}>All Hospitals</h1>
        </div>
        <button className="btn btn-ghost" style={{ width: 'auto' }} onClick={signOut}>Sign Out</button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>
            {hospitals.length} Hospital{hospitals.length !== 1 ? 's' : ''}
          </div>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>
            + Add Hospital
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : hospitals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No hospitals yet. Add the first one above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {hospitals.map(h => (
              <div key={h.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <Link to={`/owner/hospitals/${h.id}`} style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{h.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{h.subdomain}</div>
                </Link>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Link
                    to={`/owner/hospitals/${h.id}`}
                    className="btn btn-ghost"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                  >
                    View
                  </Link>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                    background: statusBg[h.status], color: statusColor[h.status], textTransform: 'capitalize',
                  }}>
                    {h.status}
                  </span>
                  <select
                    value={h.subscription_tier}
                    onChange={e => updateTier(h.id, e.target.value)}
                    style={{ background: 'var(--bg-elevated)', color: 'var(--ivory)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontSize: 12.5 }}
                  >
                    <option value="tier1">Tier 1</option>
                    <option value="tier2">Tier 2</option>
                    <option value="tier3">Tier 3</option>
                  </select>
                  <button
                    onClick={() => toggleStatus(h)}
                    style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
                  >
                    {h.status === 'active' ? 'Suspend' : 'Activate'}
                  </button>
                  <button
                    onClick={() => deleteHospital(h)}
                    style={{ background: 'var(--danger-soft)', border: '1px solid rgba(225,104,94,0.35)', color: 'var(--danger)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}
                    title="Delete"
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>Add Hospital</div>
            {formError && <div className="error-box">{formError}</div>}
            <form onSubmit={handleCreate}>
              <div className="field">
                <label>Hospital Name</label>
                <input value={hospitalName} onChange={e => setHospitalName(e.target.value)} placeholder="e.g. Hallel Hospital & Maternity" />
              </div>
              <div className="field">
                <label>Admin Full Name</label>
                <input value={adminFullName} onChange={e => setAdminFullName(e.target.value)} placeholder="e.g. Dr. Jane Doe" />
              </div>
              <div className="field">
                <label>Admin Email</label>
                <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@hospital.com" />
              </div>
              <div className="field">
                <label>Admin Password</label>
                <input type="text" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Set a password for them (share it securely)" />
                <div className="field-hint">Share this with the hospital — they can change it later.</div>
              </div>
              <div className="field">
                <label>Subscription Tier</label>
                <select value={tier} onChange={e => setTier(e.target.value)}>
                  <option value="tier1">Tier 1</option>
                  <option value="tier2">Tier 2</option>
                  <option value="tier3">Tier 3</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating…' : 'Create Hospital'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

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

