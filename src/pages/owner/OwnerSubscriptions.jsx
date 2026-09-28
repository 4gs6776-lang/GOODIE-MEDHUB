import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getPendingPayments,
  approvePayment,
  rejectPayment,
  getAllBankAccounts,
  saveBankAccount,
  deleteBankAccount,
  formatMoney,
} from '../../lib/subscriptions'
import OwnerPlans from './OwnerPlans'
import OwnerSubscribers from './OwnerSubscribers'

// =====================================================================
// GOODIE-MEDHUB — Owner Portal: Subscriptions (Phase 6)
//
// Two jobs on this screen:
//   1. Review manual bank-transfer payments hospitals have submitted
//      — Approve (activates/renews the subscription) or Reject.
//   2. Manage the bank account details hospitals see when they pay.
//
// Every write here is additionally protected by RLS (only is_owner()
// can approve/reject/edit) — this UI is a convenience, not the actual
// security boundary.
// =====================================================================

const EMPTY_BANK_FORM = {
  bank_name: '', account_name: '', account_number: '',
  currency: 'NGN', instructions: '', active: true, sort_order: 0,
}

export default function OwnerSubscriptions() {
  const { profile } = useAuth()
  const [view, setView] = useState('payments')
  const [payments, setPayments] = useState([])
  const [banks, setBanks] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const [showBankModal, setShowBankModal] = useState(false)
  const [editingBankId, setEditingBankId] = useState(null)
  const [bankForm, setBankForm] = useState(EMPTY_BANK_FORM)
  const [bankSaving, setBankSaving] = useState(false)
  const [bankError, setBankError] = useState('')

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function loadAll() {
    setLoading(true)
    try {
      const [p, b] = await Promise.all([getPendingPayments(), getAllBankAccounts()])
      setPayments(p)
      setBanks(b)
    } catch (err) {
      showToast(err.message || 'Could not load subscription data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  async function handleApprove(payment) {
    if (!confirm(`Approve this payment of ${formatMoney(payment.amount, payment.currency)} from ${payment.hospital?.name}? This activates their subscription immediately.`)) return
    setBusyId(payment.id)
    try {
      await approvePayment(payment, profile)
      showToast('Payment approved — subscription renewed')
      loadAll()
    } catch (err) {
      showToast(err.message || 'Could not approve payment')
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject(payment) {
    const reason = prompt(`Reason for rejecting ${payment.hospital?.name}'s payment:`)
    if (reason === null) return
    setBusyId(payment.id)
    try {
      await rejectPayment(payment, reason, profile)
      showToast('Payment rejected')
      loadAll()
    } catch (err) {
      showToast(err.message || 'Could not reject payment')
    } finally {
      setBusyId(null)
    }
  }

  function openAddBank() {
    setEditingBankId(null)
    setBankForm(EMPTY_BANK_FORM)
    setBankError('')
    setShowBankModal(true)
  }

  function openEditBank(acc) {
    setEditingBankId(acc.id)
    setBankForm({
      bank_name: acc.bank_name,
      account_name: acc.account_name,
      account_number: acc.account_number,
      currency: acc.currency,
      instructions: acc.instructions || '',
      active: acc.active,
      sort_order: acc.sort_order,
    })
    setBankError('')
    setShowBankModal(true)
  }

  async function handleSaveBank(e) {
    e.preventDefault()
    setBankError('')
    if (!bankForm.bank_name.trim() || !bankForm.account_name.trim() || !bankForm.account_number.trim()) {
      setBankError('Bank name, account name and account number are required.')
      return
    }
    setBankSaving(true)
    try {
      await saveBankAccount(editingBankId, {
        bank_name: bankForm.bank_name.trim(),
        account_name: bankForm.account_name.trim(),
        account_number: bankForm.account_number.trim(),
        currency: bankForm.currency.trim().toUpperCase() || 'NGN',
        instructions: bankForm.instructions.trim() || null,
        active: bankForm.active,
        sort_order: Number(bankForm.sort_order) || 0,
      })
      setShowBankModal(false)
      showToast(editingBankId ? 'Bank account updated' : 'Bank account added')
      loadAll()
    } catch (err) {
      setBankError(err.message || 'Could not save bank account')
    } finally {
      setBankSaving(false)
    }
  }

  async function handleToggleBankActive(acc) {
    try {
      await saveBankAccount(acc.id, { active: !acc.active })
      loadAll()
    } catch (err) {
      showToast(err.message || 'Could not update bank account')
    }
  }

  async function handleDeleteBank(acc) {
    if (!confirm(`Delete "${acc.bank_name}" account details? Hospitals will no longer see this option.`)) return
    try {
      await deleteBankAccount(acc.id)
      showToast('Bank account deleted')
      loadAll()
    } catch (err) {
      showToast(err.message || 'Could not delete bank account')
    }
  }

  if (loading) {
    return <div className="owner-panel"><div className="owner-empty">Loading…</div></div>
  }

  return (
    <>
      <div className="owner-tabbar" style={{ flexWrap: 'wrap' }}>
        {[
          ['payments', payments.length > 0 ? `Payments (${payments.length})` : 'Payments'],
          ['subscribers', 'Subscribers'],
          ['plans', 'Plans'],
          ['banks', 'Bank Accounts'],
        ].map(([key, label]) => (
          <button key={key} className={`owner-tab ${view === key ? 'active' : ''}`} onClick={() => setView(key)}>
            {label}
          </button>
        ))}
      </div>

      {view === 'subscribers' && <OwnerSubscribers />}
      {view === 'plans' && <OwnerPlans />}

      {view === 'payments' && (
      <section className="owner-panel">
        <div className="owner-panel-head">
          <div className="owner-panel-title">
            Pending Payments{payments.length > 0 ? ` (${payments.length})` : ''}
          </div>
        </div>
        {payments.length === 0 ? (
          <div className="owner-empty">No payments waiting for review.</div>
        ) : (
          payments.map(p => (
            <div key={p.id} className="owner-list-row">
              <div className="owner-list-row-main">
                <div className="owner-list-row-title">
                  {p.hospital?.name || 'Unknown hospital'} — {p.plan?.name} ({p.billing_cycle})
                </div>
                <div className="owner-list-row-sub">
                  {formatMoney(p.amount, p.currency)} · Ref: {p.provider_reference || '—'} · Submitted {new Date(p.created_at).toLocaleString()}
                </div>
                {p.proof_note && <div className="owner-list-row-sub">Note: {p.proof_note}</div>}
              </div>
              <div className="owner-list-row-actions">
                <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busyId === p.id} onClick={() => handleApprove(p)}>
                  {busyId === p.id ? 'Working…' : 'Approve'}
                </button>
                <button className="btn btn-ghost" style={{ width: 'auto' }} disabled={busyId === p.id} onClick={() => handleReject(p)}>
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </section>
      )}

      {view === 'banks' && (
      <section className="owner-panel">
        <div className="owner-panel-head">
          <div className="owner-panel-title">Bank Accounts</div>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={openAddBank}>+ Add Account</button>
        </div>
        {banks.length === 0 ? (
          <div className="owner-empty">No bank accounts configured yet.</div>
        ) : (
          banks.map(acc => (
            <div key={acc.id} className="owner-list-row">
              <div className="owner-list-row-main">
                <div className="owner-list-row-title">{acc.bank_name} — {acc.account_number}</div>
                <div className="owner-list-row-sub">
                  {acc.account_name} · {acc.currency}{!acc.active ? ' · Inactive (hidden from hospitals)' : ''}
                </div>
              </div>
              <div className="owner-list-row-actions">
                <button className="owner-icon-btn owner-icon-btn-inline" onClick={() => handleToggleBankActive(acc)}>
                  {acc.active ? 'Deactivate' : 'Activate'}
                </button>
                <button className="owner-icon-btn owner-icon-btn-inline" onClick={() => openEditBank(acc)}>Edit</button>
                <button className="owner-icon-btn owner-icon-btn-inline owner-icon-btn-danger" onClick={() => handleDeleteBank(acc)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </section>
      )}

      {showBankModal && (
        <div className="dash-modal-backdrop" onClick={() => !bankSaving && setShowBankModal(false)}>
          <div className="card dash-modal" onClick={e => e.stopPropagation()}>
            <div className="dash-modal-title">{editingBankId ? 'Edit Bank Account' : 'Add Bank Account'}</div>
            <div className="dash-modal-body">
              {bankError && <div className="error-box">{bankError}</div>}
              <form id="bank-account-form" onSubmit={handleSaveBank}>
                <div className="field">
                  <label>Bank Name</label>
                  <input value={bankForm.bank_name} onChange={e => setBankForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="e.g. GTBank" />
                </div>
                <div className="dash-field-grid">
                  <div className="field">
                    <label>Account Name</label>
                    <input value={bankForm.account_name} onChange={e => setBankForm(f => ({ ...f, account_name: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Account Number</label>
                    <input value={bankForm.account_number} onChange={e => setBankForm(f => ({ ...f, account_number: e.target.value }))} />
                  </div>
                </div>
                <div className="dash-field-grid">
                  <div className="field">
                    <label>Currency</label>
                    <input value={bankForm.currency} onChange={e => setBankForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))} maxLength={3} />
                  </div>
                  <div className="field">
                    <label>Sort Order</label>
                    <input type="number" value={bankForm.sort_order} onChange={e => setBankForm(f => ({ ...f, sort_order: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label>Instructions (optional)</label>
                  <textarea rows={2} value={bankForm.instructions} onChange={e => setBankForm(f => ({ ...f, instructions: e.target.value }))} placeholder="e.g. Use hospital name as the transfer narration" />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
                  <input type="checkbox" checked={bankForm.active} onChange={e => setBankForm(f => ({ ...f, active: e.target.checked }))} />
                  Visible to hospitals
                </label>
              </form>
            </div>
            <div className="dash-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowBankModal(false)} disabled={bankSaving}>Cancel</button>
              <button type="submit" form="bank-account-form" className="btn btn-primary" disabled={bankSaving}>
                {bankSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="owner-toast">{toast}</div>}
    </>
  )
}
