import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOfflineTable } from '../lib/useOfflineTable'
import AppIcon from './icons'
import { getDailyCollectionSummary, formatMoney } from '../lib/billingService'

// =====================================================================
// <EndOfDayReconciliationModal> — cashier end-of-shift reconciliation.
//
// Shows today's payments grouped by method + by cashier. Cashier
// counts the cash drawer, enters the actual amount, system computes
// the variance (expected - actual).
//
// Usage:
//   <EndOfDayReconciliationModal onClose={...} />
// =====================================================================

export default function EndOfDayReconciliationModal({ onClose }) {
  const { profile, hospital } = useAuth()
  const { records: payments, addRecord: addReconciliation } = useOfflineTable('cashier_reconciliations', hospital?.id)

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [cashierFilter, setCashierFilter] = useState('all')  // 'all' | 'me'
  const [actualCash, setActualCash] = useState('')
  const [actualPOS, setActualPOS] = useState('')
  const [actualTransfer, setActualTransfer] = useState('')
  const [actualCheque, setActualCheque] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const summary = useMemo(() => {
    const dateObj = selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date()
    const s = getDailyCollectionSummary({ payments, date: dateObj })
    // Optionally filter to just the current cashier
    if (cashierFilter === 'me') {
      const myByMethod = s.byMethod.filter(() => true) // method totals are global; we'd need to re-compute
      const myByCashier = s.byCashier.filter(c => c.cashierName === profile?.full_name)
      const myTotal = myByCashier.reduce((sum, c) => sum + c.total, 0)
      const myCount = myByCashier.reduce((sum, c) => sum + c.count, 0)
      // For method breakdown, recompute filtered
      const myPayments = (payments || []).filter(p =>
        p.status !== 'reversed' &&
        new Date(p.created_at).toDateString() === dateObj.toDateString() &&
        (p.recorded_by_name || p.received_by_name) === profile?.full_name
      )
      const myByMethodMap = {}
      for (const p of myPayments) {
        const m = p.method || 'Cash'
        if (!myByMethodMap[m]) myByMethodMap[m] = { method: m, count: 0, total: 0 }
        myByMethodMap[m].count++
        myByMethodMap[m].total += Number(p.amount || 0)
      }
      return {
        byMethod: Object.values(myByMethodMap),
        byCashier: myByCashier,
        totalCount: myCount,
        totalAmount: myTotal,
      }
    }
    return s
  }, [payments, selectedDate, cashierFilter, profile?.full_name])

  const expectedCash = summary.byMethod.find(m => m.method === 'Cash')?.total || 0
  const expectedPOS = summary.byMethod.find(m => m.method === 'POS')?.total || 0
  const expectedTransfer = summary.byMethod.find(m => m.method === 'Bank Transfer')?.total || 0
  const expectedCheque = summary.byMethod.find(m => m.method === 'Cheque')?.total || 0

  const actualCashNum = parseFloat(actualCash) || 0
  const actualPOSNum = parseFloat(actualPOS) || 0
  const actualTransferNum = parseFloat(actualTransfer) || 0
  const actualChequeNum = parseFloat(actualCheque) || 0

  const cashVariance = actualCashNum - expectedCash
  const posVariance = actualPOSNum - expectedPOS
  const transferVariance = actualTransferNum - expectedTransfer
  const chequeVariance = actualChequeNum - expectedCheque
  const totalVariance = actualCashNum + actualPOSNum + actualTransferNum + actualChequeNum - summary.totalAmount

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      // Note: cashier_reconciliations table doesn't exist yet (Phase 4+ would add it).
      // For now, we just show the report — the cashier can print it.
      // If you want to persist reconciliations, run a migration to add the table.
      window.print()  // opens print dialog
      onClose()
    } catch (err) {
      alert(err.message || 'Could not save reconciliation')
    } finally {
      setSaving(false)
    }
  }

  function VarianceCell({ variance }) {
    const color = Math.abs(variance) < 0.01 ? 'var(--teal)' : variance > 0 ? 'var(--gold)' : 'var(--danger)'
    const sign = variance > 0 ? '+' : ''
    return (
      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color }}>
        {sign}{formatMoney(variance)}
      </span>
    )
  }

  return (
    <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card dash-modal" style={{ maxWidth: 720, maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, flexShrink: 0 }}>
          <div>
            <div className="dash-modal-title" style={{ paddingBottom: 0 }}>End of Day Reconciliation</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
              Count the cash drawer + verify other methods match expected totals. Variances are flagged for review.
            </div>
          </div>
          <button className="dash-icon-btn" onClick={onClose} aria-label="Close"><AppIcon name="close" size={18} /></button>
        </div>

        <div className="dash-modal-body" style={{ overflowY: 'auto' }}>
          {/* Date + cashier filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'end' }}>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontSize: 11 }}>Date</label>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontSize: 11 }}>Filter</label>
              <select value={cashierFilter} onChange={e => setCashierFilter(e.target.value)} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6 }}>
                <option value="all">All cashiers</option>
                <option value="me">Just me ({profile?.full_name?.split(' ')[0] || 'You'})</option>
              </select>
            </div>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Total Collected</div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 18, fontWeight: 700, marginTop: 4, color: 'var(--teal)' }}>{formatMoney(summary.totalAmount)}</div>
            </div>
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Transactions</div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 18, fontWeight: 700, marginTop: 4 }}>{summary.totalCount}</div>
            </div>
            <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Cashiers</div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 18, fontWeight: 700, marginTop: 4 }}>{summary.byCashier.length}</div>
            </div>
          </div>

          {/* Reconciliation table */}
          <div style={{ border: '1px solid var(--line)', borderRadius: 8, marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ background: 'var(--bg-card)' }}>
                <tr>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Method</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Expected</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actual (counted)</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Variance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '6px 10px', borderTop: '1px solid var(--line-soft)', fontWeight: 700 }}>Cash</td>
                  <td style={{ padding: '6px 10px', borderTop: '1px solid var(--line-soft)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>{formatMoney(expectedCash)}</td>
                  <td style={{ padding: '4px 10px', borderTop: '1px solid var(--line-soft)' }}>
                    <input type="number" min="0" step="0.01" value={actualCash} onChange={e => setActualCash(e.target.value)} placeholder="0.00" style={{ width: 100, padding: '4px 6px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--bg-card)', color: 'var(--ivory)' }} />
                  </td>
                  <td style={{ padding: '6px 10px', borderTop: '1px solid var(--line-soft)', textAlign: 'right' }}><VarianceCell variance={cashVariance} /></td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 10px', borderTop: '1px solid var(--line-soft)', fontWeight: 700 }}>POS</td>
                  <td style={{ padding: '6px 10px', borderTop: '1px solid var(--line-soft)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>{formatMoney(expectedPOS)}</td>
                  <td style={{ padding: '4px 10px', borderTop: '1px solid var(--line-soft)' }}>
                    <input type="number" min="0" step="0.01" value={actualPOS} onChange={e => setActualPOS(e.target.value)} placeholder="0.00" style={{ width: 100, padding: '4px 6px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--bg-card)', color: 'var(--ivory)' }} />
                  </td>
                  <td style={{ padding: '6px 10px', borderTop: '1px solid var(--line-soft)', textAlign: 'right' }}><VarianceCell variance={posVariance} /></td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 10px', borderTop: '1px solid var(--line-soft)', fontWeight: 700 }}>Bank Transfer</td>
                  <td style={{ padding: '6px 10px', borderTop: '1px solid var(--line-soft)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>{formatMoney(expectedTransfer)}</td>
                  <td style={{ padding: '4px 10px', borderTop: '1px solid var(--line-soft)' }}>
                    <input type="number" min="0" step="0.01" value={actualTransfer} onChange={e => setActualTransfer(e.target.value)} placeholder="0.00" style={{ width: 100, padding: '4px 6px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--bg-card)', color: 'var(--ivory)' }} />
                  </td>
                  <td style={{ padding: '6px 10px', borderTop: '1px solid var(--line-soft)', textAlign: 'right' }}><VarianceCell variance={transferVariance} /></td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 10px', borderTop: '1px solid var(--line-soft)', fontWeight: 700 }}>Cheque</td>
                  <td style={{ padding: '6px 10px', borderTop: '1px solid var(--line-soft)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>{formatMoney(expectedCheque)}</td>
                  <td style={{ padding: '4px 10px', borderTop: '1px solid var(--line-soft)' }}>
                    <input type="number" min="0" step="0.01" value={actualCheque} onChange={e => setActualCheque(e.target.value)} placeholder="0.00" style={{ width: 100, padding: '4px 6px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--bg-card)', color: 'var(--ivory)' }} />
                  </td>
                  <td style={{ padding: '6px 10px', borderTop: '1px solid var(--line-soft)', textAlign: 'right' }}><VarianceCell variance={chequeVariance} /></td>
                </tr>
                <tr style={{ background: 'var(--bg-card)' }}>
                  <td style={{ padding: '8px 10px', borderTop: '2px solid var(--line)', fontWeight: 800 }}>TOTAL</td>
                  <td style={{ padding: '8px 10px', borderTop: '2px solid var(--line)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', fontWeight: 800 }}>{formatMoney(summary.totalAmount)}</td>
                  <td style={{ padding: '8px 10px', borderTop: '2px solid var(--line)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', fontWeight: 800 }}>{formatMoney(actualCashNum + actualPOSNum + actualTransferNum + actualChequeNum)}</td>
                  <td style={{ padding: '8px 10px', borderTop: '2px solid var(--line)', textAlign: 'right' }}>
                    <VarianceCell variance={totalVariance} />
                    {Math.abs(totalVariance) > 100 && (
                      <div style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 700, marginTop: 2 }}>⚠ Significant variance</div>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* By cashier breakdown */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>By Cashier</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {summary.byCashier.map(c => (
                <div key={c.cashierName} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-elevated)', fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>{c.cashierName}</span>
                  <span style={{ color: 'var(--muted)' }}>{c.count} txn(s) · <strong style={{ color: 'var(--teal)' }}>{formatMoney(c.total)}</strong></span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="field">
            <label>Notes (optional — e.g. "Variance due to POS terminal settlement delay")</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)', resize: 'vertical' }} />
          </div>
        </div>

        <div className="dash-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            <AppIcon name="print" size={14} /> {saving ? 'Generating…' : 'Print Reconciliation'}
          </button>
        </div>
      </div>
    </div>
  )
}
