import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'

export default function Settings(){
  const { profile, hospital, session, signOut } = useAuth()
  const [toast, setToast] = useState(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handlePasswordChange(e){
    e.preventDefault()
    setFormError('')

    if (!newPassword || !confirmPassword) {
      setFormError('Please fill in the new password fields.')
      return
    }
    if (newPassword.length < 6) {
      setFormError('New password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setFormError('New password and confirmation do not match.')
      return
    }

    setSaving(true)
    try {
      // Re-authenticate with the current password before changing it, if the
      // user's email is available — protects against a hijacked open session.
      if (session?.user?.email && currentPassword) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: session.user.email,
          password: currentPassword,
        })
        if (signInError) {
          setFormError('Current password is incorrect.')
          setSaving(false)
          return
        }
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setFormError(error.message || 'Could not update password.')
        setSaving(false)
        return
      }

      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      showToast('Password updated')
    } catch (err) {
      setFormError(err.message || 'Could not update password.')
    } finally {
      setSaving(false)
    }
  }

  function roleLabel(role){
    if (!role) return 'Staff'
    return role.charAt(0).toUpperCase() + role.slice(1)
  }

  return (
    <>
      <div className="dash-row dash-row-2">
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Your Profile</div>
              <div className="dash-panel-sub">Account details</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Full Name</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{profile?.full_name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Email</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{session?.user?.email || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Role</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{roleLabel(profile?.role)}</div>
            </div>
          </div>
        </div>

        <div className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Hospital</div>
              <div className="dash-panel-sub">Organization details</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Hospital Name</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{hospital?.name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Account Status</div>
              <div style={{
                display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                background: hospital?.status === 'active' ? 'var(--teal-soft)' : 'rgba(201,169,97,0.14)',
                color: hospital?.status === 'active' ? 'var(--teal)' : 'var(--gold)',
              }}>
                {hospital?.status ? hospital.status.charAt(0).toUpperCase() + hospital.status.slice(1) : 'Unknown'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-panel" style={{ marginTop: 20, maxWidth: 460 }}>
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Change Password</div>
            <div className="dash-panel-sub">Update your account password</div>
          </div>
        </div>

        {formError && <div className="error-box">{formError}</div>}

        <form onSubmit={handlePasswordChange}>
          <div className="field">
            <label>Current Password</label>
            <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="field">
            <label>New Password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
          </div>
          <div className="field">
            <label>Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: 10 }}>
            {saving ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>

      <div className="dash-panel" style={{ marginTop: 20, maxWidth: 460 }}>
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">Session</div>
            <div className="dash-panel-sub">Sign out of this device</div>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={signOut}>Sign Out</button>
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
    </>
  )
}
