import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { useOfflineTable } from '../../lib/useOfflineTable'
import { writeAudit } from '../../lib/audit'
import AppIcon from '../../components/icons'

export default function Settings(){
  const { profile, hospital, session, signOut } = useAuth()
  const [toast, setToast] = useState(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // ---- Bank accounts (admin / owner only) ---------------------------
  // The hospital's bank accounts shown on the printed bill. Uses the
  // existing offline-first hook — same pattern as every other table.
  const { records: bankAccounts, addRecord: addBankAccount, updateRecord: updateBankAccount, deleteRecord: deleteBankAccount } = useOfflineTable('hospital_bank_accounts', hospital?.id)

  const canManageBank = profile?.role === 'admin' || profile?.role === 'owner'

  const [showBankModal, setShowBankModal] = useState(false)
  const [bankEditingId, setBankEditingId] = useState(null)
  const [bankName, setBankName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [sortCode, setSortCode] = useState('')
  const [bankNotes, setBankNotes] = useState('')
  const [bankActive, setBankActive] = useState(true)
  const [bankSaving, setBankSaving] = useState(false)
  const [bankError, setBankError] = useState('')

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function resetBankForm() {
    setBankEditingId(null)
    setBankName('')
    setAccountName('')
    setAccountNumber('')
    setSortCode('')
    setBankNotes('')
    setBankActive(true)
    setBankError('')
  }

  function openBankAdd() {
    resetBankForm()
    setShowBankModal(true)
  }

  function openBankEdit(account) {
    setBankEditingId(account.id)
    setBankName(account.bank_name || '')
    setAccountName(account.account_name || '')
    setAccountNumber(account.account_number || '')
    setSortCode(account.sort_code || '')
    setBankNotes(account.notes || '')
    setBankActive(account.active !== false)
    setBankError('')
    setShowBankModal(true)
  }

  async function handleBankSubmit(e) {
    e.preventDefault()
    setBankError('')

    if (!bankName.trim() || !accountName.trim() || !accountNumber.trim()) {
      setBankError('Bank name, account name, and account number are required.')
      return
    }
    if (!hospital?.id) {
      setBankError('Hospital is still loading.')
      return
    }
    if (!profile?.id) {
      setBankError('Your account is still loading.')
      return
    }

    setBankSaving(true)
    try {
      const payload = {
        bank_name: bankName.trim(),
        account_name: accountName.trim(),
        account_number: accountNumber.trim(),
        sort_code: sortCode.trim() || null,
        notes: bankNotes.trim() || null,
        active: bankActive,
      }

      if (bankEditingId) {
        await updateBankAccount(bankEditingId, payload)
        writeAudit({
          hospitalId: hospital.id, actor: profile,
          action: 'hospital_bank_account.updated',
          entityType: 'hospital_bank_account', entityId: bankEditingId,
          summary: `Updated bank account ${bankName} (${accountNumber})`,
          metadata: payload,
        })
        showToast('Bank account updated')
      } else {
        payload.hospital_id = hospital.id
        payload.sort_order = (bankAccounts || []).length
        const saved = await addBankAccount(payload)
        writeAudit({
          hospitalId: hospital.id, actor: profile,
          action: 'hospital_bank_account.created',
          entityType: 'hospital_bank_account', entityId: saved?.id || null,
          summary: `Added bank account ${bankName} (${accountNumber})`,
          metadata: payload,
        })
        showToast('Bank account added')
      }
      setShowBankModal(false)
      resetBankForm()
    } catch (err) {
      setBankError(err.message || 'Could not save the bank account.')
    } finally {
      setBankSaving(false)
    }
  }

  async function handleBankDelete(account) {
    if (!confirm(`Remove ${account.bank_name} account ${account.account_number}? It will no longer appear on printed bills.`)) return
    try {
      await deleteBankAccount(account.id)
      writeAudit({
        hospitalId: hospital.id, actor: profile,
        action: 'hospital_bank_account.deleted',
        entityType: 'hospital_bank_account', entityId: account.id,
        summary: `Deleted bank account ${account.bank_name} (${account.account_number})`,
        metadata: { bank_name: account.bank_name, account_number: account.account_number },
      })
      showToast('Bank account removed')
    } catch (err) {
      showToast(err.message)
    }
  }

  async function handleBankToggleActive(account) {
    const next = account.active === false
    try {
      await updateBankAccount(account.id, { active: next })
      writeAudit({
        hospitalId: hospital.id, actor: profile,
        action: next ? 'hospital_bank_account.activated' : 'hospital_bank_account.deactivated',
        entityType: 'hospital_bank_account', entityId: account.id,
        summary: `${next ? 'Activated' : 'Deactivated'} bank account ${account.bank_name} (${account.account_number})`,
        metadata: { active: next },
      })
      showToast(`${account.bank_name} ${next ? 'activated' : 'deactivated'}`)
    } catch (err) {
      showToast(err.message)
    }
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

      // Audit trail — password was changed. Records only the FACT that
      // it happened and who did it; never records the password itself,
      // the password length, or any derived value. Re-authentication
      // step is noted when it was performed.
      writeAudit({
        hospitalId: hospital?.id, actor: profile,
        action: 'user.password_changed',
        entityType: 'profile', entityId: profile?.id || null,
        summary: `${profile?.full_name || 'User'} changed their password${currentPassword ? ' (re-authenticated)' : ''}`,
        metadata: {
          user_id: profile?.id || null,
          re_authenticated: Boolean(currentPassword && session?.user?.email),
        },
      })

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

      {/* ---- Bank Account Details (admin / owner only) ---------------
          These accounts show on every printed bill so patients can pay
          by bank transfer. Multiple accounts allowed. */}
      <div className="dash-panel" style={{ marginTop: 20, maxWidth: 720 }}>
        <div className="dash-panel-head dash-panel-head-wrap">
          <div>
            <div className="dash-panel-title">Bank Account Details</div>
            <div className="dash-panel-sub">Shown on every printed bill so patients can pay by bank transfer</div>
          </div>
          {canManageBank && (
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openBankAdd}>+ Add Account</button>
          )}
        </div>

        {!canManageBank ? (
          <div style={{ padding: 14, fontSize: 13, color: 'var(--muted)', background: 'var(--bg-elevated)', borderRadius: 8 }}>
            Only hospital administrators can add or edit bank account details. Ask your admin to set them up.
          </div>
        ) : (bankAccounts || []).length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No bank accounts yet. Add one so patients can pay by bank transfer.
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openBankAdd}>
                <AppIcon name="plus" size={14} /> Add your first account
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {(bankAccounts || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(a => (
              <div
                key={a.id}
                style={{
                  padding: 14, borderRadius: 10,
                  background: a.active === false ? 'var(--bg-card)' : 'var(--bg-elevated)',
                  border: `1px solid ${a.active === false ? 'var(--line)' : 'var(--line-soft)'}`,
                  opacity: a.active === false ? 0.6 : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <strong style={{ fontSize: 13.5 }}>{a.bank_name}</strong>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                    background: a.active === false ? 'rgba(154,170,183,0.14)' : 'rgba(0,199,199,0.14)',
                    color: a.active === false ? 'var(--muted)' : 'var(--teal)',
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    {a.active === false ? 'Hidden' : 'Active'}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ivory)', lineHeight: 1.5 }}>
                  <div>{a.account_name}</div>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--blue)', fontSize: 13.5 }}>
                    {a.account_number}
                  </div>
                  {a.sort_code && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Sort: {a.sort_code}</div>}
                  {a.notes && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>{a.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <button className="btn btn-ghost" style={{ width: 'auto', padding: '5px 10px', fontSize: 11 }} onClick={() => openBankEdit(a)}>
                    Edit
                  </button>
                  <button className="btn btn-ghost" style={{ width: 'auto', padding: '5px 10px', fontSize: 11 }} onClick={() => handleBankToggleActive(a)}>
                    {a.active === false ? 'Activate' : 'Hide'}
                  </button>
                  <button className="btn btn-ghost" style={{ width: 'auto', padding: '5px 10px', fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => handleBankDelete(a)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Inline note for admins without accounts yet */}
        {canManageBank && (bankAccounts || []).length === 0 && (
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, background: 'rgba(232,184,46,0.06)', border: '1px solid rgba(232,184,46,0.25)', fontSize: 12, color: 'var(--gold)', lineHeight: 1.5 }}>
            <strong>Heads up:</strong> Until you add a bank account, the printed bill will not include any bank transfer details — only the standard totals.
          </div>
        )}
      </div>

      {/* ---- Bank account modal ---- */}
      {showBankModal && (
        <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowBankModal(false) }}>
          <div className="card dash-modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="dash-modal-title">{bankEditingId ? 'Edit Bank Account' : 'Add Bank Account'}</div>
            <div className="dash-modal-body">
              {bankError && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{bankError}</div>}
              <form id="bank-account-form" onSubmit={handleBankSubmit}>
                <div className="field">
                  <label>Bank Name *</label>
                  <input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. First Bank of Nigeria" autoFocus required />
                </div>
                <div className="field">
                  <label>Account Name *</label>
                  <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="e.g. GOODIE MED HUB Ltd" required />
                </div>
                <div className="field">
                  <label>Account Number *</label>
                  <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="e.g. 0123456789" required />
                </div>
                <div className="field">
                  <label>Sort Code (optional)</label>
                  <input value={sortCode} onChange={e => setSortCode(e.target.value)} placeholder="e.g. 011" />
                </div>
                <div className="field">
                  <label>Notes (optional)</label>
                  <input value={bankNotes} onChange={e => setBankNotes(e.target.value)} placeholder="e.g. Use patient name as narration" />
                </div>
                <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    id="bank-active"
                    checked={bankActive}
                    onChange={e => setBankActive(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: 'var(--teal)' }}
                  />
                  <label htmlFor="bank-active" style={{ margin: 0, fontSize: 13, color: 'var(--ivory)' }}>
                    Show on printed bill
                  </label>
                </div>
              </form>
            </div>
            <div className="dash-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { setShowBankModal(false); resetBankForm() }}>Cancel</button>
              <button type="submit" form="bank-account-form" className="btn btn-primary" disabled={bankSaving}>
                {bankSaving ? 'Saving…' : (bankEditingId ? 'Save Changes' : 'Add Account')}
              </button>
            </div>
          </div>
        </div>
      )}

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
