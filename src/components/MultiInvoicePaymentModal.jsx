import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import AppIcon from './icons'
import PatientAutocomplete from './common/PatientAutocomplete'
import { formatMoney, nextDocumentNumber, allocatePaymentAcrossInvoices } from '../lib/billingService'

// =====================================================================
// MultiInvoicePaymentModal — records ONE payment and splits it across
// multiple outstanding invoices for the same patient.
//
// Flow:
//   1. Pick the patient (PatientAutocomplete)
//   2. System shows all their outstanding invoices (finalized + balance > 0)
//   3. Enter total payment amount + method
//   4. Auto-allocate: split evenly OR "oldest first" button
//   5. Manual adjust if needed
//   6. Confirm → allocatePaymentAcrossInvoices() does the actual work
//
// Props:
//   hospital, profile, invoices (all), patients (all),
//   addAllocation, updateInvoice, writeAudit, onClose, onAllocated
//
// (We don't pass addPayment — we look it up via useOfflineTable
//  internally so this modal is self-contained.)
// =====================================================================

import { useOfflineTable } from '../lib/useOfflineTable'

const PAYMENT_METHODS = ['Cash', 'POS', 'Bank Transfer', 'Cheque', 'Wallet', 'Other']

export default function MultiInvoicePaymentModal({
  hospital, profile, invoices = [], patients = [],
  addAllocation, updateInvoice, writeAudit, onClose, onAllocated,
}) {
  // Get the payments addRecord from the hook (self-contained)
  const { addRecord: addPayment } = useOfflineTable('payments', hospital?.id)

  const [patientOption, setPatientOption] = useState(null)
  const [totalAmount, setTotalAmount] = useState('')
  const [method, setMethod] = useState('Cash')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [allocations, setAllocations] = useState({})  // { [invoice_id]: string amount }
  const [autoMode, setAutoMode] = useState('oldest_first')  // 'oldest_first' | 'manual'
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const patient = patientOption?.patient || null
  const patientId = patient?.id

  // Patient's outstanding invoices (finalized + balance > 0)
  const outstandingInvoices = useMemo(() => {
    if (!patientId) return []
    return (invoices || [])
      .filter(i =>
        i.patient_id === patientId &&
        i.draft_status === 'finalized' &&
        Number(i.balance || 0) > 0.001
      )
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))  // oldest first
  }, [invoices, patientId])

  // Total amount entered
  const totalAmt = parseFloat(totalAmount) || 0

  // Allocated total (what's already distributed across invoices)
  const allocatedTotal = useMemo(() => {
    return Object.values(allocations).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  }, [allocations])

  const unallocated = Math.max(0, totalAmt - allocatedTotal)

  // Auto-allocate using "oldest first" strategy
  function autoAllocate() {
    if (!totalAmt || totalAmt <= 0) {
      setError('Enter a total amount first')
      return
    }
    setError('')
    const newAllocs = {}
    let remaining = totalAmt
    for (const inv of outstandingInvoices) {
      if (remaining <= 0.001) break
      const balance = Number(inv.balance || 0)
      const thisAlloc = Math.min(balance, remaining)
      newAllocs[inv.id] = thisAlloc.toFixed(2)
      remaining -= thisAlloc
    }
    setAllocations(newAllocs)
    setAutoMode('oldest_first')
  }

  function clearAllocations() {
    setAllocations({})
    setAutoMode('manual')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!patientId) { setError('Pick a patient first'); return }
    if (!totalAmt || totalAmt <= 0) { setError('Enter a valid total amount'); return }
    if (Object.keys(allocations).length === 0) { setError('Allocate the payment across invoices (click "Auto-allocate" or enter amounts manually)'); return }
    if (Math.abs(allocatedTotal - totalAmt) > 0.01) {
      setError(`Allocated total (${formatMoney(allocatedTotal)}) does not match payment amount (${formatMoney(totalAmt)})`)
      return
    }

    setSaving(true)
    try {
      const result = await allocatePaymentAcrossInvoices({
        hospital, profile,
        patientId,
        patientName: patient.full_name,
        totalAmount: totalAmt,
        method,
        referenceNumber: referenceNumber.trim() || null,
        allocations: Object.entries(allocations).map(([invoice_id, amount]) => ({ invoice_id, amount: parseFloat(amount) })),
        addPayment, addAllocation, updateInvoice, invoices, writeAudit,
      })
      if (result.success) {
        onAllocated?.()
      } else {
        setError(result.error || 'Could not allocate payment')
      }
    } catch (err) {
      setError(err.message || 'Could not allocate payment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card dash-modal" style={{ maxWidth: 720, maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14 }}>
          <div>
            <div className="dash-modal-title" style={{ paddingBottom: 0 }}>Multi-Invoice Payment</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
              Record one payment and split it across multiple outstanding invoices for the same patient.
            </div>
          </div>
          <button className="dash-icon-btn" onClick={onClose} aria-label="Close"><AppIcon name="close" size={18} /></button>
        </div>

        <div className="dash-modal-body" style={{ overflowY: 'auto' }}>
          <form id="multi-pay-form" onSubmit={handleSubmit}>
            {error && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{error}</div>}

            {/* Patient picker */}
            <div className="field">
              <label>Patient *</label>
              <PatientAutocomplete
                patients={patients}
                value={patientOption}
                onChange={(opt) => { setPatientOption(opt); setAllocations({}) }}
                placeholder="Search patient by name, MRN or phone…"
                emptyText="No matching patient"
                ariaLabel="Patient"
              />
            </div>

            {/* Payment amount + method */}
            <div className="dash-field-grid">
              <div className="field">
                <label>Total Payment Amount (₦) *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={totalAmount}
                  onChange={e => { setTotalAmount(e.target.value); setAllocations({}) }}
                  placeholder="e.g. 50000"
                  required
                  style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, fontSize: 16 }}
                />
              </div>
              <div className="field">
                <label>Payment Method</label>
                <select value={method} onChange={e => setMethod(e.target.value)}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div className="field">
              <label>Reference Number (optional)</label>
              <input
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
                placeholder="POS ref, transfer ref, cheque no…"
              />
            </div>

            {/* Outstanding invoices for this patient */}
            {patientId && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Outstanding Invoices ({outstandingInvoices.length})
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }} onClick={autoAllocate} disabled={!totalAmt}>
                      Auto-allocate (oldest first)
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }} onClick={clearAllocations}>
                      Clear
                    </button>
                  </div>
                </div>

                {outstandingInvoices.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12.5, background: 'var(--bg-elevated)', borderRadius: 8 }}>
                    No outstanding invoices for this patient.
                  </div>
                ) : (
                  <div style={{ border: '1px solid var(--line)', borderRadius: 8, maxHeight: 280, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)' }}>
                        <tr>
                          <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid var(--line)' }}>Invoice</th>
                          <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid var(--line)' }}>Date</th>
                          <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--line)' }}>Balance</th>
                          <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--line)' }}>Allocate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outstandingInvoices.map(inv => (
                          <tr key={inv.id}>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--line-soft)' }}>
                              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, fontSize: 11.5 }}>{inv.invoice_number}</div>
                              <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{inv.invoice_type || 'outpatient'}</div>
                            </td>
                            <td style={{ padding: '8px', borderBottom: '1px solid var(--line-soft)', fontSize: 11, color: 'var(--muted)' }}>
                              {new Date(inv.created_at).toLocaleDateString('en-NG')}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--line-soft)', fontFamily: 'var(--font-mono, monospace)', color: 'var(--danger)' }}>
                              {formatMoney(inv.balance)}
                            </td>
                            <td style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid var(--line-soft)' }}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={allocations[inv.id] || ''}
                                onChange={e => setAllocations(prev => ({ ...prev, [inv.id]: e.target.value }))}
                                placeholder="0.00"
                                style={{ width: 100, padding: '4px 6px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--bg-card)', color: 'var(--ivory)' }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Allocation summary */}
                {totalAmt > 0 && (
                  <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                      <span style={{ color: 'var(--muted)' }}>Total Payment</span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>{formatMoney(totalAmt)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                      <span style={{ color: 'var(--muted)' }}>Allocated</span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', color: allocatedTotal === totalAmt ? 'var(--teal)' : 'var(--gold)' }}>{formatMoney(allocatedTotal)}</span>
                    </div>
                    {unallocated > 0.001 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--gold)' }}>
                        <span>Unallocated (becomes patient credit)</span>
                        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{formatMoney(unallocated)}</span>
                      </div>
                    )}
                    {unallocated <= 0.001 && allocatedTotal > 0 && (
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--line)', fontSize: 11, color: 'var(--teal)' }}>
                        ✓ Fully allocated — payment will close out {Object.values(allocations).filter(v => parseFloat(v) > 0).length} invoice(s)
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        <div className="dash-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="multi-pay-form" className="btn btn-primary" disabled={saving || !patientId || !totalAmt}>
            {saving ? 'Recording…' : `Record ${totalAmt ? formatMoney(totalAmt) : ''} Payment`}
          </button>
        </div>
      </div>
    </div>
  )
}
