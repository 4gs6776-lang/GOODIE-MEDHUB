import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOfflineTable } from '../lib/useOfflineTable'
import AppIcon from './icons'
import { writeAudit } from '../lib/audit'
import { formatDateTimeSec, getTimezone } from '../lib/datetime'

// =====================================================================
// GOODIE-MEDHUB — PatientWallet
//
// Shown on the patient profile. Three things:
//   1. Big balance display + a "wallet actions" row (Add Deposit,
//      Refund, Adjust)
//   2. Recent transactions (last 10) — clickable to expand details
//   3. Modals for each action type
//
// The wallet balance is the patient_wallets.balance column, which is
// kept in sync by a trigger whenever a transaction is inserted. App
// code can also write transactions directly (the cashier workspace
// does this at invoice-generation time) and the trigger keeps the
// balance correct.
//
// RLS guards every access. hospital-scoped via current_hospital_id().
// =====================================================================

const METHODS = ['Cash', 'POS', 'Bank Transfer', 'Card', 'HMO', 'Other']

export default function PatientWallet({ patient }) {
  const { profile, hospital } = useAuth()
  const timezone = getTimezone(hospital)

  const { records: wallets, addRecord: addWallet, updateRecord: updateWallet } = useOfflineTable('patient_wallets', hospital?.id)
  const { records: allTxns, addRecord: addTxn } = useOfflineTable('patient_wallet_transactions', hospital?.id)

  const [showAddDeposit, setShowAddDeposit] = useState(false)
  const [showRefund, setShowRefund] = useState(false)
  const [showAdjust, setShowAdjust] = useState(false)
  const [expandedTxn, setExpandedTxn] = useState(null)
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // ---- Find this patient's wallet (if any) --------------------------
  const wallet = useMemo(() => {
    return wallets.find(w => w.patient_id === patient?.id) || null
  }, [wallets, patient?.id])

  const balance = Number(wallet?.balance || 0)

  // ---- Find this patient's transactions (newest first) --------------
  const patientTxns = useMemo(() => {
    return allTxns
      .filter(t => t.patient_id === patient?.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10)
  }, [allTxns, patient?.id])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function formatMoney(n) {
    const v = Number(n || 0)
    const sign = v < 0 ? '-' : ''
    return sign + '₦' + Math.abs(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // ---- HMO patients don't use the wallet (per Q6 = a) ----------------
  const isHmoPatient = patient?.hmo_provider && patient?.hmo_provider !== 'Self-Pay (No HMO)' && patient?.category === 'hmo'

  // ---- Role check — who can act on the wallet? ----------------------
  const canDeposit = profile && ['admin', 'owner', 'doctor', 'nurse', 'front_desk', 'billing'].includes(profile.role)
  const canRefund = profile && ['admin', 'owner'].includes(profile.role)
  const canAdjust = profile && ['admin', 'owner'].includes(profile.role)

  // ---- Ensure wallet row exists before recording a txn ---------------
  // The wallets table has UNIQUE(patient_id) — but we still need to
  // handle the race where two staff both click "Add Deposit" at the
  // same moment. The wallet is fetched via useOfflineTable's records,
  // so we check the local cache first.
  async function ensureWallet() {
    if (wallet) return wallet
    const newWallet = await addWallet({
      hospital_id: hospital.id,
      patient_id: patient.id,
      balance: 0,
      currency: 'NGN',
    })
    return newWallet
  }

  // ---- Add Deposit ---------------------------------------------------
  async function handleDeposit(e) {
    e.preventDefault()
    setFormError('')

    const amount = parseFloat(depositAmount)
    if (isNaN(amount) || amount <= 0) {
      setFormError('Enter a valid amount (greater than 0).')
      return
    }
    if (!depositMethod) {
      setFormError('Pick a payment method.')
      return
    }

    setSaving(true)
    try {
      const w = await ensureWallet()
      const balanceAfter = balance + amount
      await addTxn({
        hospital_id: hospital.id,
        patient_id: patient.id,
        wallet_id: w.id,
        type: 'deposit',
        amount: amount,
        balance_after: balanceAfter,
        method: depositMethod,
        reference: depositRef.trim() || null,
        performed_by: profile.id,
        performed_by_name: profile.full_name,
        notes: depositNotes.trim() || null,
      })
      writeAudit({
        hospitalId: hospital.id, actor: profile,
        action: 'wallet.deposit',
        entityType: 'patient_wallet', entityId: w.id,
        patientId: patient.id,
        summary: `Deposit of ${formatMoney(amount)} (${depositMethod}) for ${patient.full_name}`,
        metadata: { amount, method: depositMethod, reference: depositRef || null, balance_after: balanceAfter },
      })
      showToast(`Deposit of ${formatMoney(amount)} recorded`)
      setShowAddDeposit(false)
      setDepositAmount(''); setDepositMethod('Cash'); setDepositRef(''); setDepositNotes('')
    } catch (err) {
      setFormError(err.message || 'Could not record the deposit.')
    } finally {
      setSaving(false)
    }
  }

  // ---- Refund ---------------------------------------------------------
  async function handleRefund(e) {
    e.preventDefault()
    setFormError('')

    const amount = parseFloat(refundAmount)
    if (isNaN(amount) || amount <= 0) {
      setFormError('Enter a valid refund amount.')
      return
    }
    if (amount > balance + 0.001) {
      setFormError(`Refund amount exceeds the wallet balance (${formatMoney(balance)}).`)
      return
    }
    if (!refundReason.trim()) {
      setFormError('A reason is required for refunds.')
      return
    }

    setSaving(true)
    try {
      const w = await ensureWallet()
      const balanceAfter = balance - amount
      await addTxn({
        hospital_id: hospital.id,
        patient_id: patient.id,
        wallet_id: w.id,
        type: 'refund',
        amount: -amount,
        balance_after: balanceAfter,
        method: refundMethod,
        performed_by: profile.id,
        performed_by_name: profile.full_name,
        notes: refundReason.trim(),
      })
      writeAudit({
        hospitalId: hospital.id, actor: profile,
        action: 'wallet.refund',
        entityType: 'patient_wallet', entityId: w.id,
        patientId: patient.id,
        summary: `Refund of ${formatMoney(amount)} to ${patient.full_name}`,
        metadata: { amount, method: refundMethod, reason: refundReason, balance_after: balanceAfter },
      })
      showToast(`Refund of ${formatMoney(amount)} recorded`)
      setShowRefund(false)
      setRefundAmount(''); setRefundMethod('Cash'); setRefundReason('')
    } catch (err) {
      setFormError(err.message || 'Could not record the refund.')
    } finally {
      setSaving(false)
    }
  }

  // ---- Adjustment (admin correction) --------------------------------
  async function handleAdjust(e) {
    e.preventDefault()
    setFormError('')

    const amount = parseFloat(adjustAmount)
    if (isNaN(amount) || amount === 0) {
      setFormError('Enter a non-zero amount (positive or negative).')
      return
    }
    if (!adjustReason.trim()) {
      setFormError('A reason is required for adjustments.')
      return
    }
    const newBalance = balance + amount
    if (newBalance < -0.001) {
      setFormError(`Adjustment would put the wallet negative (new balance would be ${formatMoney(newBalance)}).`)
      return
    }

    setSaving(true)
    try {
      const w = await ensureWallet()
      await addTxn({
        hospital_id: hospital.id,
        patient_id: patient.id,
        wallet_id: w.id,
        type: 'adjustment',
        amount: amount,
        balance_after: newBalance,
        performed_by: profile.id,
        performed_by_name: profile.full_name,
        notes: adjustReason.trim(),
      })
      writeAudit({
        hospitalId: hospital.id, actor: profile,
        action: 'wallet.adjustment',
        entityType: 'patient_wallet', entityId: w.id,
        patientId: patient.id,
        summary: `Wallet adjustment of ${formatMoney(amount)} for ${patient.full_name}`,
        metadata: { amount, reason: adjustReason, balance_after: newBalance },
      })
      showToast(`Adjustment of ${formatMoney(amount)} recorded`)
      setShowAdjust(false)
      setAdjustAmount(''); setAdjustReason('')
    } catch (err) {
      setFormError(err.message || 'Could not record the adjustment.')
    } finally {
      setSaving(false)
    }
  }

  // ---- Form state (declared here to keep the handlers above simple) -
  const [depositAmount, setDepositAmount] = useState('')
  const [depositMethod, setDepositMethod] = useState('Cash')
  const [depositRef, setDepositRef] = useState('')
  const [depositNotes, setDepositNotes] = useState('')

  const [refundAmount, setRefundAmount] = useState('')
  const [refundMethod, setRefundMethod] = useState('Cash')
  const [refundReason, setRefundReason] = useState('')

  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')

  // ---- Render --------------------------------------------------------

  if (isHmoPatient) {
    return (
      <div style={{
        padding: 16, borderRadius: 10,
        background: 'rgba(118,87,232,0.06)', border: '1px solid rgba(118,87,232,0.25)',
        color: 'var(--muted)', fontSize: 13, lineHeight: 1.5,
      }}>
        <strong style={{ color: 'var(--violet)' }}>Wallet not used:</strong>{' '}
        This patient is registered as an HMO patient. Their bills go straight
        to the HMO claim flow — deposits and wallet deductions do not apply.
      </div>
    )
  }

  return (
    <>
      {/* ---- Balance card ---- */}
      <div style={{
        padding: 18, borderRadius: 12,
        background: balance > 0 ? 'linear-gradient(135deg, rgba(0,199,199,0.10), rgba(0,199,199,0.04))' : 'var(--bg-elevated)',
        border: balance > 0 ? '1px solid var(--teal-border)' : '1px solid var(--line)',
        marginBottom: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              Wallet Balance
            </div>
            <div style={{
              fontSize: 28, fontWeight: 800,
              color: balance > 0 ? 'var(--teal)' : balance < 0 ? 'var(--danger)' : 'var(--ivory)',
              fontFamily: 'var(--font-mono, monospace)',
            }}>
              {formatMoney(balance)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {wallet ? `Wallet ID: ${wallet.id.slice(0, 8)}…` : 'No wallet yet — deposits will create one automatically'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canDeposit && (
              <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 14px', fontSize: 12 }} onClick={() => { setFormError(''); setShowAddDeposit(true) }}>
                <AppIcon name="plus" size={14} /> Add Deposit
              </button>
            )}
            {canRefund && balance > 0 && (
              <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 14px', fontSize: 12, borderColor: 'var(--gold)', color: 'var(--gold)' }} onClick={() => { setFormError(''); setShowRefund(true) }}>
                <AppIcon name="arrowDown" size={14} /> Refund
              </button>
            )}
            {canAdjust && (
              <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 14px', fontSize: 12 }} onClick={() => { setFormError(''); setShowAdjust(true) }}>
                Adjust
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---- Recent transactions ---- */}
      <div style={{
        padding: 14, borderRadius: 10,
        background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)',
      }}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 1,
          color: 'var(--teal)', textTransform: 'uppercase', marginBottom: 10,
        }}>
          Recent Transactions {patientTxns.length > 0 && `(${patientTxns.length})`}
        </div>

        {patientTxns.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--muted)', fontStyle: 'italic', padding: '8px 0' }}>
            No wallet transactions yet. Add a deposit to get started.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {patientTxns.map(t => {
              const amount = Number(t.amount || 0)
              const isCredit = amount > 0
              const typeColor = t.type === 'deposit' ? 'var(--teal)' :
                                t.type === 'refund' ? 'var(--gold)' :
                                t.type === 'charge' ? 'var(--danger)' :
                                'var(--violet)'
              const expanded = expandedTxn === t.id
              return (
                <div
                  key={t.id}
                  style={{
                    padding: '8px 10px', borderRadius: 6,
                    background: expanded ? 'var(--bg-card)' : 'transparent',
                    border: `1px solid ${expanded ? 'var(--line)' : 'transparent'}`,
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onClick={() => setExpandedTxn(expanded ? null : t.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                        background: `${typeColor}22`, color: typeColor,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                      }}>
                        {t.type}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {formatDateTimeSec(t.created_at, timezone)}
                      </span>
                      {t.method && (
                        <span style={{ fontSize: 10, color: 'var(--muted-dim)' }}>· {t.method}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, fontSize: 12.5,
                        color: isCredit ? 'var(--teal)' : 'var(--danger)',
                      }}>
                        {isCredit ? '+' : ''}{formatMoney(amount)}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--muted)',
                      }}>
                        → {formatMoney(t.balance_after)}
                      </span>
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line-soft)', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                      {t.performed_by_name && <div><strong>By:</strong> {t.performed_by_name}</div>}
                      {t.reference && <div><strong>Reference:</strong> {t.reference}</div>}
                      {t.notes && <div><strong>Notes:</strong> {t.notes}</div>}
                      {t.invoice_id && <div><strong>Invoice:</strong> {t.invoice_id.slice(0, 8)}…</div>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ---- Add Deposit modal ---- */}
      {showAddDeposit && (
        <ModalShell title="Add Deposit" onClose={() => setShowAddDeposit(false)}>
          <form onSubmit={handleDeposit}>
            {formError && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{formError}</div>}
            <div className="field">
              <label>Amount (₦) *</label>
              <input type="number" min="0.01" step="0.01" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="e.g. 20000" autoFocus required />
            </div>
            <div className="field">
              <label>Payment Method *</label>
              <select value={depositMethod} onChange={e => setDepositMethod(e.target.value)}>
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Reference (optional)</label>
              <input value={depositRef} onChange={e => setDepositRef(e.target.value)} placeholder="e.g. transfer ref, POS receipt no." />
            </div>
            <div className="field">
              <label>Notes (optional)</label>
              <input value={depositNotes} onChange={e => setDepositNotes(e.target.value)} placeholder="e.g. initial deposit for consultation + labs" />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddDeposit(false)} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Record Deposit'}</button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* ---- Refund modal ---- */}
      {showRefund && (
        <ModalShell title="Issue Refund" onClose={() => setShowRefund(false)}>
          <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 6, background: 'rgba(232,184,46,0.08)', border: '1px solid rgba(232,184,46,0.25)', fontSize: 12, color: 'var(--gold)' }}>
            Current wallet balance: <strong>{formatMoney(balance)}</strong>
          </div>
          <form onSubmit={handleRefund}>
            {formError && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{formError}</div>}
            <div className="field">
              <label>Refund Amount (₦) *</label>
              <input type="number" min="0.01" step="0.01" max={balance} value={refundAmount} onChange={e => setRefundAmount(e.target.value)} placeholder={`Max: ${balance.toFixed(2)}`} autoFocus required />
            </div>
            <div className="field">
              <label>Refund Method *</label>
              <select value={refundMethod} onChange={e => setRefundMethod(e.target.value)}>
                {METHODS.filter(m => m !== 'HMO').map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Reason *</label>
              <input value={refundReason} onChange={e => setRefundReason(e.target.value)} placeholder="e.g. patient returned unused drugs" required />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowRefund(false)} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ background: 'var(--gold)', color: '#000' }}>{saving ? 'Saving…' : 'Issue Refund'}</button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* ---- Adjustment modal ---- */}
      {showAdjust && (
        <ModalShell title="Manual Adjustment" onClose={() => setShowAdjust(false)}>
          <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 6, background: 'rgba(118,87,232,0.08)', border: '1px solid rgba(118,87,232,0.25)', fontSize: 12, color: 'var(--violet)' }}>
            Current wallet balance: <strong>{formatMoney(balance)}</strong>. Use positive number to add, negative to subtract.
          </div>
          <form onSubmit={handleAdjust}>
            {formError && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{formError}</div>}
            <div className="field">
              <label>Adjustment Amount (₦) *</label>
              <input type="number" step="0.01" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="e.g. 5000 or -2000" autoFocus required />
            </div>
            <div className="field">
              <label>Reason *</label>
              <input value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="e.g. correction — duplicate deposit recorded" required />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowAdjust(false)} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Apply Adjustment'}</button>
            </div>
          </form>
        </ModalShell>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)',
          padding: '10px 18px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, zIndex: 100,
          maxWidth: '85vw', textAlign: 'center',
        }}>
          {toast}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------
// ModalShell — shared chrome for the three modals
// ---------------------------------------------------------------------

function ModalShell({ title, onClose, children }) {
  return (
    <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card dash-modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="dash-modal-title">{title}</div>
        <div className="dash-modal-body">{children}</div>
      </div>
    </div>
  )
}
