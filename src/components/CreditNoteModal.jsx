import { useState } from 'react'
import AppIcon from './icons'
import { CREDIT_NOTE_REASONS, formatMoney } from '../lib/billingService'

// =====================================================================
// CreditNoteModal — issues a credit note against a finalized invoice.
//
// Props:
//   invoice    the invoice being credited
//   hospital   hospital context
//   profile    user profile
//   onIssue    async ({ amount, reasonCode, reasonText, refundMethod, refundReference }) => void
//   onClose    () => void
// =====================================================================

const REFUND_METHODS = [
  { value: 'none',          label: 'Reduce invoice balance (no refund)', description: 'Just reduce the invoice balance. Use when invoice was unpaid or partially paid.' },
  { value: 'wallet',         label: 'Credit patient wallet',                description: 'Add the credit to the patient wallet for future use.' },
  { value: 'cash',           label: 'Cash refund',                          description: 'Pay cash back to the patient from the cash drawer.' },
  { value: 'bank_transfer',  label: 'Bank transfer refund',                 description: 'Transfer the refund to the patient bank account.' },
]

export default function CreditNoteModal({ invoice, hospital, profile, onIssue, onClose }) {
  const [amount, setAmount] = useState('')
  const [reasonCode, setReasonCode] = useState('overcharge')
  const [reasonText, setReasonText] = useState('')
  const [refundMethod, setRefundMethod] = useState('none')
  const [refundReference, setRefundReference] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!invoice) return null

  const invoiceBalance = Number(invoice.balance || 0)
  const invoicePaid = Number(invoice.amount_paid || 0)
  const invoiceTotal = Number(invoice.grand_total || invoice.amount || 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setError('Amount must be greater than 0'); return }
    if (amt > invoiceTotal + 0.001) { setError(`Amount cannot exceed the invoice total (${formatMoney(invoiceTotal)})`); return }
    if (!reasonText.trim()) { setError('Reason text is required'); return }
    if ((refundMethod === 'cash' || refundMethod === 'bank_transfer') && amt > invoicePaid + 0.001) {
      setError(`Cash/bank refund cannot exceed the amount already paid (${formatMoney(invoicePaid)})`)
      return
    }
    setSaving(true)
    try {
      await onIssue({
        amount: amt,
        reasonCode,
        reasonText: reasonText.trim(),
        refundMethod,
        refundReference: refundReference.trim() || null,
      })
    } catch (err) {
      setError(err.message || 'Could not issue credit note')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card dash-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14 }}>
          <div>
            <div className="dash-modal-title" style={{ paddingBottom: 0 }}>Issue Credit Note</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
              Against invoice <strong style={{ color: 'var(--blue)', fontFamily: 'var(--font-mono, monospace)' }}>{invoice.invoice_number}</strong> for <strong>{invoice.patient_name}</strong>
            </div>
          </div>
          <button className="dash-icon-btn" onClick={onClose} aria-label="Close"><AppIcon name="close" size={18} /></button>
        </div>

        {/* Invoice summary */}
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)', marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 12 }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Invoice Total</div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, marginTop: 2 }}>{formatMoney(invoiceTotal)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Paid</div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--teal)', marginTop: 2 }}>{formatMoney(invoicePaid)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Balance</div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: invoiceBalance > 0 ? 'var(--danger)' : 'var(--teal)', marginTop: 2 }}>{formatMoney(invoiceBalance)}</div>
            </div>
          </div>
        </div>

        <div className="dash-modal-body">
          <form id="credit-note-form" onSubmit={handleSubmit}>
            {error && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

            <div className="field">
              <label>Amount (₦) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder={`Max: ${invoiceTotal.toFixed(2)}`}
                autoFocus
                required
                style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, fontSize: 16 }}
              />
            </div>

            <div className="field">
              <label>Reason Code *</label>
              <select value={reasonCode} onChange={e => setReasonCode(e.target.value)}>
                {CREDIT_NOTE_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Reason Details *</label>
              <textarea
                value={reasonText}
                onChange={e => setReasonText(e.target.value)}
                placeholder="Explain why this credit note is being issued…"
                rows={3}
                required
                style={{ width: '100%', padding: '8px 10px', fontSize: 12.5, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)', resize: 'vertical' }}
              />
            </div>

            <div className="field">
              <label>Refund Method *</label>
              <select value={refundMethod} onChange={e => setRefundMethod(e.target.value)}>
                {REFUND_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>
                {REFUND_METHODS.find(m => m.value === refundMethod)?.description}
              </div>
            </div>

            {(refundMethod === 'cash' || refundMethod === 'bank_transfer') && (
              <div className="field">
                <label>Reference (optional)</label>
                <input
                  value={refundReference}
                  onChange={e => setRefundReference(e.target.value)}
                  placeholder={refundMethod === 'cash' ? 'Cash drawer ref no.' : 'Bank transfer ref no.'}
                />
              </div>
            )}
          </form>
        </div>

        <div className="dash-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="credit-note-form" className="btn btn-primary" disabled={saving} style={{ background: 'var(--violet)' }}>
            {saving ? 'Posting…' : 'Post Credit Note'}
          </button>
        </div>
      </div>
    </div>
  )
}
