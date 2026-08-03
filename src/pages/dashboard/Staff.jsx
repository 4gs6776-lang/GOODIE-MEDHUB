import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff`

const ROLE_LABELS = { admin: 'Admin', doctor: 'Doctor', nurse: 'Nurse', front_desk: 'Front Desk', staff: 'Staff' }

export default function Staff(){
  const { profile, hospital, session } = useAuth()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [toast, setToast] = useState(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('nurse')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')

  async function loadStaff(){
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setStaff(data || [])
    setLoading(false)
  }

  useEffect(() => { loadStaff() }, [])

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleCreate(e){
    e.preventDefault()
    setFormError('')
    if (!fullName || !email || !password) {
      setFormError('Please fill in every field.')
      return
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.')
      return
    }

    setCreating(true)
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ fullName, email, password, role }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Could not add staff member')

      setShowModal(false)
      setFullName(''); setEmail(''); setPassword(''); setRole('nurse')
      showToast(`${fullName} added`)
      loadStaff()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(member){
    if (!confirm(`Remove ${member.full_name} from your hospital?`)) return
    const { error } = await supabase.from('profiles').delete().eq('id', member.id)
    if (!error) {
      showToast(`${member.full_name} removed`)
      loadStaff()
    } else {
      showToast(error.message)
    }
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <>
      <div className="dash-panel">
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Staff</div>
            <div className="dash-panel-sub">{staff.length} member{staff.length !== 1 ? 's' : ''} at {hospital?.name || 'your hospital'}</div>
          </div>
          {isAdmin && (
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Add Staff</button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : staff.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No staff yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {staff.map(member => (
              <div key={member.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(150deg,var(--blue),#2a5cc9)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                      {member.full_name} {member.id === profile?.id && <span style={{ color: 'var(--muted)', fontWeight: 500 }}>(you)</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{ROLE_LABELS[member.role] || member.role}</div>
                  </div>
                </div>
                {isAdmin && member.id !== profile?.id && (
                  <button
                    onClick={() => handleDelete(member)}
                    style={{ background: 'var(--danger-soft)', border: '1px solid rgba(225,104,94,0.35)', color: 'var(--danger)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}
                    title="Remove"
                  >✕</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>Add Staff Member</div>
            {formError && <div className="error-box">{formError}</div>}
            <form onSubmit={handleCreate}>
              <div className="field">
                <label>Full Name</label>
                <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Nurse Adaeze" />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="staff@hospital.com" />
              </div>
              <div className="field">
                <label>Password</label>
                <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="Set a password for them" />
                <div className="field-hint">Share this with them — they can change it later.</div>
              </div>
              <div className="field">
                <label>Role</label>
                <select value={role} onChange={e => setRole(e.target.value)}>
                  <option value="doctor">Doctor</option>
                  <option value="nurse">Nurse</option>
                  <option value="front_desk">Front Desk</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating…' : 'Add Staff'}</button>
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
    </>
  )
}
