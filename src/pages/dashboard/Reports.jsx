import { useState, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import AppIcon from '../../components/icons'
import ModuleHistoryButton from '../../components/ModuleHistoryButton'
import {
  getDailyCollectionSummary,
  getOutstandingAging,
  getRevenueByDepartment,
  getClaimsStatusSummary,
  getExpenseVsRevenue,
  formatMoney,
  CLAIM_STATUSES,
} from '../../lib/billingService'
import { formatDateTime, getTimezone } from '../../lib/datetime'

// =====================================================================
// GOODIE-MEDHUB — Reports module (Phase 4 full rewrite)
//
// 6 financial reports:
//   1. Daily Collection Summary (by method, by cashier)
//   2. Outstanding Invoices & Aging (0-30, 31-60, 61-90, 90+)
//   3. Revenue by Department / Service
//   4. HMO Claims Status & Recovery
//   5. Patient Statements (links to PatientProfile)
//   6. Expense vs Revenue Overview (P&L)
// =====================================================================

const REPORTS = [
  { key: 'daily_collection', label: 'Daily Collection', icon: 'billing', description: 'Today\'s collections by method and cashier' },
  { key: 'aging',            label: 'Aging',            icon: 'clock',    description: 'Outstanding invoices by age (0-30, 31-60, 61-90, 90+ days)' },
  { key: 'revenue_dept',     label: 'Revenue by Dept',  icon: 'reports',  description: 'Revenue broken down by department / service category' },
  { key: 'claims_status',    label: 'Claims Status',    icon: 'insurance',description: 'HMO claims by status + recovery rate by provider' },
  { key: 'patient_statements', label: 'Patient Statements', icon: 'users', description: 'Generate patient account statements' },
  { key: 'expense_revenue', label: 'P&L Overview',      icon: 'billing', description: 'Profit & loss: revenue vs expenses with margin' },
]

export default function Reports(){
  const { hospital } = useAuth()
  const timezone = getTimezone(hospital)
  const [activeReport, setActiveReport] = useState('daily_collection')
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')

  // Default period: this month
  useMemo(() => {
    if (!periodFrom && !periodTo) {
      const now = new Date()
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      setPeriodFrom(first.toISOString().slice(0, 10))
      setPeriodTo(now.toISOString().slice(0, 10))
    }
  }, [periodFrom, periodTo])

  // Load all data needed for any report
  const { records: invoices, loading: loadingInv } = useOfflineTable('invoices', hospital?.id)
  const { records: payments, loading: loadingPay } = useOfflineTable('payments', hospital?.id)
  const { records: expenses, loading: loadingExp } = useOfflineTable('hospital_expenses', hospital?.id)
  const { records: claims, loading: loadingClaims } = useOfflineTable('insurance_claims', hospital?.id)
  const { records: billableCharges } = useOfflineTable('billable_charges', hospital?.id)

  const loading = loadingInv || loadingPay || loadingExp || loadingClaims

  // Period filter helper
  const filterByPeriod = (arr, dateField = 'created_at') => {
    if (!periodFrom && !periodTo) return arr
    const fromMs = periodFrom ? new Date(periodFrom).getTime() : 0
    const toMs = periodTo ? new Date(periodTo + 'T23:59:59').getTime() : Date.now()
    return arr.filter(x => {
      const ms = new Date(x[dateField] || x.created_at).getTime()
      return ms >= fromMs && ms <= toMs
    })
  }

  // Compute each report
  const dailyCollection = useMemo(() => getDailyCollectionSummary({ payments }), [payments])
  const aging = useMemo(() => getOutstandingAging({ invoices }), [invoices])
  const revenueByDept = useMemo(() => getRevenueByDepartment({
    billableCharges: filterByPeriod(billableCharges || [], 'created_at'),
    invoices, periodFrom, periodTo,
  }), [billableCharges, invoices, periodFrom, periodTo])
  const claimsStatus = useMemo(() => getClaimsStatusSummary({
    claims: filterByPeriod(claims || [], 'submitted_at'),
    periodFrom, periodTo,
  }), [claims, periodFrom, periodTo])
  const pnl = useMemo(() => getExpenseVsRevenue({
    invoices: filterByPeriod(invoices || []),
    expenses: filterByPeriod(expenses || [], 'paid_at'),
    periodFrom, periodTo,
  }), [invoices, expenses, periodFrom, periodTo])

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div className="billing-header-badge" style={{ background: 'rgba(118,87,232,0.14)', color: 'var(--violet)' }}>
          <AppIcon name="reports" size={21} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)' }}>Reports & Analytics</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
            Financial reports — daily collection, aging, revenue by department, HMO claims status, P&L overview.
          </div>
        </div>
        <ModuleHistoryButton moduleKey="billing" />
      </div>

      {/* Period filter — applies to most reports */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'end', flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: 11 }}>From</label>
          <input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6 }} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: 11 }}>To</label>
          <input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6 }} />
        </div>
      </div>

      {/* Report selector tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {REPORTS.map(r => (
          <button
            key={r.key}
            type="button"
            className={`btn ${activeReport === r.key ? 'btn-primary' : 'btn-ghost'}`}
            style={{ width: 'auto', padding: '8px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => setActiveReport(r.key)}
            title={r.description}
          >
            <AppIcon name={r.icon} size={14} /> {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 12.5 }}>Loading reports…</div>
      ) : (
        <>
          {/* ---- Report 1: Daily Collection Summary ---- */}
          {activeReport === 'daily_collection' && (
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <div className="dash-panel-title">Daily Collection Summary</div>
                  <div className="dash-panel-sub">Today's payments by method and cashier</div>
                </div>
                <button className="btn btn-ghost" style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }} onClick={() => window.print()}><AppIcon name="print" size={12} /> Print</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                <StatCard label="Total Collected" value={formatMoney(dailyCollection.totalAmount)} color="var(--teal)" />
                <StatCard label="Transactions" value={String(dailyCollection.totalCount)} color="var(--ivory)" />
                <StatCard label="Cashiers Active" value={String(dailyCollection.byCashier.length)} color="var(--violet)" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>By Method</div>
                  {dailyCollection.byMethod.length === 0 ? <EmptyRow /> : dailyCollection.byMethod.map(m => (
                    <div key={m.method} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-elevated)', marginBottom: 4, fontSize: 12.5 }}>
                      <span><strong>{m.method}</strong> <span style={{ color: 'var(--muted)' }}>· {m.count} txn(s)</span></span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--teal)' }}>{formatMoney(m.total)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>By Cashier</div>
                  {dailyCollection.byCashier.length === 0 ? <EmptyRow /> : dailyCollection.byCashier.map(c => (
                    <div key={c.cashierName} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-elevated)', marginBottom: 4, fontSize: 12.5 }}>
                      <span><strong>{c.cashierName}</strong> <span style={{ color: 'var(--muted)' }}>· {c.count} txn(s)</span></span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--teal)' }}>{formatMoney(c.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ---- Report 2: Aging ---- */}
          {activeReport === 'aging' && (
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <div className="dash-panel-title">Outstanding Invoices & Aging</div>
                  <div className="dash-panel-sub">All unpaid invoices bucketed by age</div>
                </div>
                <button className="btn btn-ghost" style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }} onClick={() => window.print()}><AppIcon name="print" size={12} /> Print</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                <StatCard label="Total Outstanding" value={formatMoney(aging.totalOutstanding)} color="var(--danger)" />
                <StatCard label="Outstanding Invoices" value={String(aging.totalInvoices)} color="var(--ivory)" />
                <StatCard label="90+ Days (Bad Debt Risk)" value={formatMoney(aging.buckets['90+'].total)} color="var(--danger)" />
                <StatCard label="90+ Days Count" value={String(aging.buckets['90+'].count)} color="var(--gold)" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                {Object.entries(aging.buckets).map(([key, b]) => (
                  <div key={key} style={{ padding: 12, borderRadius: 8, background: key === '90+' ? 'rgba(225,104,94,0.08)' : 'var(--bg-elevated)', border: `1px solid ${key === '90+' ? 'var(--danger)' : 'var(--line-soft)'}` }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{b.label}</div>
                    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 16, fontWeight: 700, marginTop: 4, color: key === '90+' ? 'var(--danger)' : 'var(--ivory)' }}>{formatMoney(b.total)}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{b.count} invoice(s)</div>
                  </div>
                ))}
              </div>
              <div className="dash-table-wrap">
                <table className="dash-full-table">
                  <thead><tr><th>Invoice #</th><th>Patient</th><th>Created</th><th>Age (days)</th><th>Total</th><th>Paid</th><th>Balance</th><th>Bucket</th></tr></thead>
                  <tbody>
                    {Object.values(aging.buckets).flatMap(b => b.invoices).sort((a, b) => b.ageDays - a.ageDays).slice(0, 50).map(inv => (
                      <tr key={inv.id}>
                        <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5 }}>{inv.invoice_number}</td>
                        <td style={{ fontWeight: 600 }}>{inv.patient_name}</td>
                        <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{new Date(inv.created_at).toLocaleDateString('en-NG')}</td>
                        <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: inv.ageDays > 90 ? 'var(--danger)' : inv.ageDays > 60 ? 'var(--gold)' : 'var(--ivory)' }}>{inv.ageDays}</td>
                        <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{formatMoney(inv.grand_total || inv.amount)}</td>
                        <td style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--teal)' }}>{formatMoney(inv.amount_paid)}</td>
                        <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--danger)' }}>{formatMoney(inv.balance)}</td>
                        <td>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                            background: inv.ageDays > 90 ? 'rgba(225,104,94,0.14)' : inv.ageDays > 60 ? 'rgba(201,169,97,0.14)' : inv.ageDays > 30 ? 'rgba(59,130,246,0.14)' : 'rgba(0,199,199,0.14)',
                            color: inv.ageDays > 90 ? 'var(--danger)' : inv.ageDays > 60 ? 'var(--gold)' : inv.ageDays > 30 ? 'var(--blue)' : 'var(--teal)',
                          }}>
                            {inv.ageDays <= 30 ? '0–30' : inv.ageDays <= 60 ? '31–60' : inv.ageDays <= 90 ? '61–90' : '90+'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---- Report 3: Revenue by Department ---- */}
          {activeReport === 'revenue_dept' && (
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <div className="dash-panel-title">Revenue by Department / Service</div>
                  <div className="dash-panel-sub">Charges grouped by category → department mapping</div>
                </div>
                <button className="btn btn-ghost" style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }} onClick={() => window.print()}><AppIcon name="print" size={12} /> Print</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                <StatCard label="Total Revenue" value={formatMoney(revenueByDept.totalRevenue)} color="var(--teal)" />
                <StatCard label="Total Charges" value={String(revenueByDept.totalCount)} color="var(--ivory)" />
                <StatCard label="Departments" value={String(revenueByDept.byDepartment.length)} color="var(--violet)" />
              </div>
              <div className="dash-table-wrap">
                <table className="dash-full-table">
                  <thead><tr><th>Department</th><th>Charges</th><th>Revenue</th><th>% of Total</th></tr></thead>
                  <tbody>
                    {revenueByDept.byDepartment.map(d => (
                      <tr key={d.department}>
                        <td style={{ fontWeight: 700 }}>{d.department}</td>
                        <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{d.count}</td>
                        <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--teal)' }}>{formatMoney(d.total)}</td>
                        <td style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--muted)' }}>
                          {revenueByDept.totalRevenue > 0 ? ((d.total / revenueByDept.totalRevenue) * 100).toFixed(1) : '0'}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---- Report 4: HMO Claims Status ---- */}
          {activeReport === 'claims_status' && (
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <div className="dash-panel-title">HMO Claims Status & Recovery</div>
                  <div className="dash-panel-sub">Claims by status + recovery rate by provider</div>
                </div>
                <button className="btn btn-ghost" style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }} onClick={() => window.print()}><AppIcon name="print" size={12} /> Print</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                <StatCard label="Total Claimed" value={formatMoney(claimsStatus.totalClaimed)} color="var(--ivory)" />
                <StatCard label="Total Approved" value={formatMoney(claimsStatus.totalApproved)} color="var(--teal)" />
                <StatCard label="Total Paid" value={formatMoney(claimsStatus.totalPaid)} color="var(--mint)" />
                <StatCard label="Total Shortfall" value={formatMoney(claimsStatus.totalShortfall)} color="var(--danger)" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>By Status</div>
                  {claimsStatus.byStatus.length === 0 ? <EmptyRow /> : claimsStatus.byStatus.map(s => {
                    const statusMeta = CLAIM_STATUSES.find(c => c.value === s.status) || { color: 'var(--muted)' }
                    return (
                      <div key={s.status} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-elevated)', marginBottom: 4, fontSize: 12.5 }}>
                        <span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: `${statusMeta.color}22`, color: statusMeta.color, textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 8 }}>{s.status}</span>
                          {s.count} claim(s)
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                          <strong>{formatMoney(s.claimed)}</strong>
                          {s.paid > 0 && <span style={{ color: 'var(--mint)' }}> · paid {formatMoney(s.paid)}</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>By Provider (Recovery Rate)</div>
                  {claimsStatus.byProvider.length === 0 ? <EmptyRow /> : claimsStatus.byProvider.map(p => (
                    <div key={p.provider} style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--bg-elevated)', marginBottom: 4, fontSize: 12.5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>{p.provider}</strong>
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--teal)' }}>{formatMoney(p.paid)} / {formatMoney(p.claimed)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {p.count} claim(s) · recovery {p.claimed > 0 ? ((p.paid / p.claimed) * 100).toFixed(0) : 0}%
                        {p.shortfall > 0 && <span style={{ color: 'var(--danger)' }}> · shortfall {formatMoney(p.shortfall)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ---- Report 5: Patient Statements ---- */}
          {activeReport === 'patient_statements' && (
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <div className="dash-panel-title">Patient Statements</div>
                  <div className="dash-panel-sub">Generate printable account statements for patients</div>
                </div>
              </div>
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13, lineHeight: 1.6 }}>
                To generate a patient statement:
                <ol style={{ textAlign: 'left', maxWidth: 480, margin: '16px auto', paddingLeft: 20 }}>
                  <li>Open <strong>Patients</strong> from the sidebar</li>
                  <li>Click the patient's name to open their profile</li>
                  <li>Click the <strong>"Statement"</strong> tab</li>
                  <li>Adjust the date range + click <strong>"Print Statement"</strong></li>
                </ol>
                The statement shows opening balance, all invoices + payments + credit notes in the period, and closing balance — with a printable PDF including the hospital logo.
              </div>
            </div>
          )}

          {/* ---- Report 6: P&L Overview ---- */}
          {activeReport === 'expense_revenue' && (
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <div className="dash-panel-title">Profit & Loss Overview</div>
                  <div className="dash-panel-sub">Revenue vs expenses for the selected period</div>
                </div>
                <button className="btn btn-ghost" style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }} onClick={() => window.print()}><AppIcon name="print" size={12} /> Print</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                <StatCard label="Revenue (collected)" value={formatMoney(pnl.revenue)} color="var(--teal)" />
                <StatCard label="Invoiced" value={formatMoney(pnl.invoiced)} color="var(--ivory)" />
                <StatCard label="Outstanding" value={formatMoney(pnl.outstanding)} color="var(--gold)" />
                <StatCard label="Expenses" value={formatMoney(pnl.totalExpenses)} color="var(--danger)" />
              </div>
              <div style={{ padding: 16, borderRadius: 8, background: pnl.netProfit >= 0 ? 'rgba(0,199,199,0.08)' : 'rgba(225,104,94,0.08)', border: `1px solid ${pnl.netProfit >= 0 ? 'var(--teal-border)' : 'rgba(225,104,94,0.25)'}`, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Net Profit / (Loss)</div>
                    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 24, fontWeight: 800, marginTop: 4, color: pnl.netProfit >= 0 ? 'var(--teal)' : 'var(--danger)' }}>
                      {pnl.netProfit >= 0 ? '+' : ''}{formatMoney(pnl.netProfit)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Margin</div>
                    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 18, fontWeight: 700, marginTop: 4, color: pnl.margin >= 0 ? 'var(--teal)' : 'var(--danger)' }}>
                      {pnl.margin.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Expenses by Category</div>
                {pnl.expensesByCategory.length === 0 ? <EmptyRow text="No expenses in this period." /> : pnl.expensesByCategory.map(c => (
                  <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-elevated)', marginBottom: 4, fontSize: 12.5 }}>
                    <span><strong>{c.category}</strong> <span style={{ color: 'var(--muted)' }}>· {c.count} expense(s)</span></span>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--danger)' }}>{formatMoney(c.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 18, fontWeight: 700, marginTop: 4, color: color || 'var(--ivory)' }}>{value}</div>
    </div>
  )
}

function EmptyRow({ text = 'No data.' }) {
  return <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>{text}</div>
}
