import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'

const FN_CREATE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff`
const FN_UPDATE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-staff-login`

const ROLE_LABELS = { admin: 'Admin', doctor: 'Doctor', nurse: 'Nurse', front_desk: 'Front Desk', pharmacist: 'Pharmacist', lab: 'Laboratory', billing: 'Billing', staff: 'Staff' }

export default function Staff(){
  const { profile, hospital, session } = useAuth()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const [showAddModal, setShowAddModal] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('nurse')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')

  const [editTarget, setEditTarget] = useState(null)
  const [editEmail, setEditEmail] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState('')

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
      const res = await fetch(FN_CREATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ fullName, email, password, role }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Could not add staff member')

      setShowAddModal(false)
      setFullName(''); setEmail(''); setPassword(''); setRole('nurse')
      showToast(`${fullName} added`)
      loadStaff()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setCreating(false)
    }
  }

  function openEdit(member){
    setEditTarget(member)
    setEditEmail('')
    setEditPassword('')
    setEditError('')
  }

  async function handleEditSubmit(e){
    e.preventDefault()
    setEditError('')
    if (!editEmail && !editPassword) {
      setEditError('Enter a new email and/or new password.')
      return
    }
    if (editPassword && editPassword.length < 6) {
      setEditError('Password must be at least 6 characters.')
      return
    }
    setEditing(true)
    try {
      const res = await fetch(FN_UPDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ staffId: editTarget.id, newEmail: editEmail || undefined, newPassword: editPassword || undefined }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Could not update login')

      showToast(`${editTarget.full_name}'s login updated`)
      setEditTarget(null)
    } catch (err) {
      setEditError(err.message)
    } finally {
      setEditing(false)
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
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowAddModal(true)}>+ Add Staff</button>
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
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => openEdit(member)}
                      style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
                    >
                      Edit Login
                    </button>
                    {member.id !== profile?.id && (
                      <button
                        onClick={() => handleDelete(member)}
                        style={{ background: 'var(--danger-soft)', border: '1px solid rgba(225,104,94,0.35)', color: 'var(--danger)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}
                        title="Remove"
                      >✕</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
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
                  <option value="front_desk">Front Desk / Reception</option>
                  <option value="pharmacist">Pharmacist</option>
                  <option value="lab">Laboratory</option>
                  <option value="billing">Billing</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creating…' : 'Add Staff'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 4 }}>Edit Login</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 18 }}>{editTarget.full_name}</div>
            {editError && <div className="error-box">{editError}</div>}
            <form onSubmit={handleEditSubmit}>
              <div className="field">
                <label>New Email (optional)</label>
                <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="Leave blank to keep current email" />
              </div>
              <div className="field">
                <label>New Password (optional)</label>
                <input type="text" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Leave blank to keep current password" />
                <div className="field-hint">Useful if they forgot it — set a new one and share it with them.</div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditTarget(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={editing}>{editing ? 'Saving…' : 'Save Changes'}</button>
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
