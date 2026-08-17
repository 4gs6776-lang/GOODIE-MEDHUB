import { useState, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'

const STATUS_STYLES = {
  paid: { bg: 'rgba(46, 204, 113, 0.15)', color: '#2ecc71', label: 'Paid' },
  unpaid: { bg: 'rgba(235, 87, 87, 0.15)', color: '#eb5757', label: 'Unpaid' },
  partial: { bg: 'rgba(242, 201, 76, 0.15)', color: '#f2c94c', label: 'Partially Paid' },
  pending: { bg: 'rgba(76, 141, 255, 0.15)', color: '#4c8dff', label: 'Pending' },
  cancelled: { bg: 'rgba(107, 114, 128, 0.15)', color: '#6b7280', label: 'Cancelled' },
  refunded: { bg: 'rgba(139, 124, 246, 0.15)', color: '#8b7cf6', label: 'Refunded' },
}

const PAYMENT_METHODS = ['Cash', 'POS', 'Bank Transfer', 'Card', 'HMO', 'Insurance', 'Other']

export default function Billing() {
  const { hospital } = useAuth()
  const { records: invoices, loading, isOnline, pendingCount } = useOfflineTable('invoices', hospital?.id)
  
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [toast, setToast] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // Calculate KPIs
  const kpis = useMemo(() => {
    const todayStr = new Date().toDateString()
    const thisMonth = new Date().getMonth()

    const todaysRevenue = invoices
      .filter(inv => new Date(inv.created_at).toDateString() === todayStr)
      .reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0)

    const monthRevenue = invoices
      .filter(inv => new Date(inv.created_at).getMonth() === thisMonth)
      .reduce((sum, inv) => sum + Number(inv.amount_paid || 0), 0)

    const outstanding = invoices
      .filter(inv => inv.status !== 'paid' && inv.status !== 'cancelled')
      .reduce((sum, inv) => sum + Number(inv.balance || 0), 0)

    const total = invoices.length
    const paid = invoices.filter(inv => inv.status === 'paid').length
    const unpaid = invoices.filter(inv => inv.status === 'unpaid').length
    const partial = invoices.filter(inv => inv.status === 'partial').length

    return { todaysRevenue, monthRevenue, outstanding, total, paid, unpaid, partial }
  }, [invoices])

  // Chart Data: Paid vs Outstanding
  const paidVsOutstanding = useMemo(() => {
    const paidTotal = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.grand_total || 0), 0)
    const outstandingTotal = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + Number(i.balance || 0), 0)
    const total = paidTotal + outstandingTotal
    const paidPct = total > 0 ? (paidTotal / total) * 100 : 0
    const outPct = total > 0 ? 100 - paidPct : 0
    return { paidTotal, outstandingTotal, paidPct, outPct }
  }, [invoices])

  // Chart Data: Payment Methods
  const methodBreakdown = useMemo(() => {
    const methods = {}
    PAYMENT_METHODS.forEach(m => methods[m] = 0)
    invoices.forEach(inv => {
      const method = inv.payment_method || 'Cash'
      if (methods[method] !== undefined) {
        methods[method] += Number(inv.amount_paid || 0)
      } else {
        methods['Other'] += Number(inv.amount_paid || 0)
      }
    })
    const maxVal = Math.max(...Object.values(methods), 1)
    return Object.entries(methods).map(([method, amount]) => ({ method, amount, pct: (amount / maxVal) * 100 }))
  }, [invoices])

  // Filter Invoices
  const filteredInvoices = useMemo(() => {
    return invoices
      .filter(inv => {
        const matchesSearch = !search || 
          String(inv.patient_name || '').toLowerCase().includes(search.toLowerCase()) ||
          String(inv.invoice_number || '').toLowerCase().includes(search.toLowerCase())
        const matchesStatus = statusFilter === 'all' || inv.status === statusFilter
        return matchesSearch && matchesStatus
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [invoices, search, statusFilter])

  function formatMoney(n) {
    return '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function getInvoiceNumber(inv) {
    return inv.invoice_number || `INV-${String(inv.id).slice(-6).toUpperCase()}`
  }

  return (
    <>
      {/* Header & KPIs */}
      <div className="dash-panel" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)' }}>Billing & Invoices</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)', display: 'inline-block' }} />
              {isOnline ? 'System Online' : 'Offline Mode'} {pendingCount > 0 ? ` · ${pendingCount} syncing` : ''}
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: 'auto', padding: '10px 18px' }} onClick={() => setShowCreateModal(true)}>
            + Create Invoice
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <KpiCard title="Today's Revenue" value={formatMoney(kpis.todaysRevenue)} icon="💵" color="var(--teal)" />
          <KpiCard title="This Month" value={formatMoney(kpis.monthRevenue)} icon="📈" color="var(--blue)" />
          <KpiCard title="Outstanding" value={formatMoney(kpis.outstanding)} icon="⚠️" color="var(--danger)" />
          <KpiCard title="Total Invoices" value={kpis.total} icon="📄" color="var(--muted)" />
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 20 }}>
        {/* Paid vs Outstanding Donut */}
        <div className="dash-panel" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>Revenue: Paid vs Outstanding</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ 
              width: 120, 
              height: 120, 
              borderRadius: '50%', 
              background: `conic-gradient(var(--teal) ${paidVsOutstanding.paidPct}%, rgba(235, 87, 87, 0.3) ${paidVsOutstanding.paidPct}% 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>PAID</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--teal)' }}>{paidVsOutstanding.paidPct.toFixed(0)}%</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 10, height: 10, background: 'var(--teal)', borderRadius: 3 }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Collected</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--teal)' }}>{formatMoney(paidVsOutstanding.paidTotal)}</div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 10, height: 10, background: 'rgba(235, 87, 87, 0.3)', borderRadius: 3 }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Outstanding</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--danger)' }}>{formatMoney(paidVsOutstanding.outstandingTotal)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Methods Bar Chart */}
        <div className="dash-panel" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>Payment Methods</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {methodBreakdown.map(({ method, amount, pct }) => (
              <div key={method}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{method}</span>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{formatMoney(amount)}</span>
                </div>
                <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--teal), var(--blue))', borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="dash-panel">
        <div className="dash-panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Invoice Management</div>
          
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input 
              className="dash-filter" 
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', minWidth: 200 }}
              placeholder="Search patient or invoice #..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select 
              className="dash-filter" 
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)' }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partially Paid</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading financial records…</div>
        ) : filteredInvoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
            No invoices found. Click "Create Invoice" to generate your first one.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-full-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Patient</th>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map(inv => {
                  const status = inv.status || 'unpaid'
                  const style = STATUS_STYLES[status] || STATUS_STYLES.unpaid
                  const date = new Date(inv.created_at).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
                  
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue)' }}>
                        {getInvoiceNumber(inv)}
                      </td>
                      <td>{inv.patient_name || '—'}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{date}</td>
                      <td style={{ fontWeight: 700 }}>{formatMoney(inv.grand_total || inv.amount)}</td>
                      <td style={{ color: 'var(--teal)' }}>{formatMoney(inv.amount_paid || 0)}</td>
                      <td style={{ color: Number(inv.balance || 0) > 0 ? 'var(--danger)' : 'var(--muted)' }}>
                        {formatMoney(inv.balance || (Number(inv.grand_total || inv.amount) - Number(inv.amount_paid || 0)))}
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{inv.payment_method || 'Cash'}</td>
                      <td>
                        <span style={{ 
                          fontSize: 10.5, 
                          fontWeight: 700, 
                          padding: '4px 10px', 
                          borderRadius: 20, 
                          background: style.bg, 
                          color: style.color 
                        }}>
                          {style.label}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-ghost" style={{ width: 'auto', padding: '4px 12px', fontSize: 11, border: '1px solid var(--line)' }}>
                          Actions
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Placeholder for Create Invoice Modal (Phase 3) */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 600, textAlign: 'center' }}>
            <div style={{ padding: 40 }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Phase 3 Coming Soon</div>
              <div style={{ color: 'var(--muted)', marginBottom: 24 }}>The 3-Step Create Invoice Workflow (Patient Search ➔ Items & Services ➔ Review & Payment) will be built in the next phase.</div>
              <button className="btn btn-primary" onClick={() => setShowCreateModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60 }}>
          {toast}
        </div>
      )}
    </>
  )
}

function KpiCard({ title, value, icon, color }) {
  return (
    <div style={{ 
      background: 'var(--bg-elevated)', 
      border: '1px solid var(--line)', 
      borderRadius: 14, 
      padding: 16, 
      display: 'flex', 
      alignItems: 'center', 
      gap: 14 
    }}>
      <div style={{ 
        width: 48, 
        height: 48, 
        minWidth: 48, 
        borderRadius: 12, 
        background: `${color}15`, 
        color: color, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        fontSize: 20 
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{value}</div>
      </div>
    </div>
  )
}