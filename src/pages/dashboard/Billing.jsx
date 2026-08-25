import { useState, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import { useRealtimeAlert } from '../../lib/useRealtimeAlert'
import CashierWorkspace from '../../components/CashierWorkspace'

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const paths = {
    billing: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.6 3-6.5 7-6.5s7 2.9 7 6.5" /><path d="M16 5.5a3.2 3.2 0 0 1 0 6.2M18 14c2.4.8 4 2.9 4 6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    arrowUp: <path d="m6 15 6-6 6 6" />,
    arrowRight: <path d="m9 18 6-6-6-6" />,
  }
  return <svg {...common}>{paths[name] || paths.billing}</svg>
}

const SPARK = "M2 27 C12 22 15 10 25 18 S38 29 48 16 S61 8 70 22 S80 24 88 11"

export default function Billing() {
  const { profile, hospital } = useAuth()
  const { records: invoices, loading, isOnline, pendingCount } = useOfflineTable('invoices', hospital?.id)
  const { records: billableCharges, syncFromServer: syncCharges } = useOfflineTable('billable_charges', hospital?.id)

  const [toast, setToast] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState(null)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000) }
  const formatMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Live alert — the instant Pharmacy, Lab, or any module sends a new
  // charge, the cashier sees it immediately without refreshing.
  useRealtimeAlert('billable_charges', hospital?.id, (newRow) => {
    showToast(`New ${newRow.category || 'charge'} added for ${newRow.patient_name || 'a patient'} (${formatMoney(newRow.total)})`)
    syncCharges()
  })

  const kpis = useMemo(() => {
    const tStr = new Date().toDateString()
    const tRev = invoices.filter(i => new Date(i.created_at).toDateString() === tStr).reduce((s, i) => s + Number(i.amount_paid || 0), 0)
    const out = invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + Number(i.balance || 0), 0)

    const pendingCharges = billableCharges.filter(c => c.status === 'pending')
    const pendingTotal = pendingCharges.reduce((s, c) => s + Number(c.total || 0), 0)

    return { tRev, out, pendingTotal, pendingCount: pendingCharges.length }
  }, [invoices, billableCharges])

  const patientQueue = useMemo(() => {
    const pendingCharges = billableCharges.filter(c => c.status === 'pending')
    const queue = {}

    pendingCharges.forEach(c => {
      if (!queue[c.patient_id]) {
        queue[c.patient_id] = { id: c.patient_id, name: c.patient_name, items: 0, total: 0 }
      }
      queue[c.patient_id].items += 1
      queue[c.patient_id].total += Number(c.total || 0)
    })

    let queueArr = Object.values(queue).sort((a, b) => b.total - a.total)

    if (search.trim()) {
      queueArr = queueArr.filter(p => String(p.name || '').toLowerCase().includes(search.toLowerCase()))
    }

    return queueArr
  }, [billableCharges, search])

  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div className="billing-header-badge"><Icon name="billing" size={21} /></div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)' }}>Cashier Dashboard</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 7 }}>
            <span className={`billing-live-dot ${isOnline ? '' : 'offline'}`} />
            {isOnline ? 'System Online' : 'Offline Mode'}{pendingCount > 0 ? ` · ${pendingCount} syncing` : ''}
          </div>
        </div>
      </div>

      {/* KPI stats — same premium system as the main dashboard */}
      <section className="dash-stats premium-stats" style={{ marginBottom: 20 }}>
        <div className="dash-stat-card premium-stat teal-stat">
          <div className="dash-stat-top">
            <div className="dash-stat-icon money-icon">₦</div>
            <svg className="dash-mini-chart" viewBox="0 0 90 38"><path d={SPARK} /></svg>
          </div>
          <div className="dash-stat-label">Today's Collections</div>
          <div className="dash-stat-value">{formatMoney(kpis.tRev)}</div>
          <div className="dash-stat-delta positive"><Icon name="arrowUp" size={12} /> Collected today</div>
        </div>

        <div className="dash-stat-card premium-stat gold-stat">
          <div className="dash-stat-top">
            <div className="dash-stat-icon"><Icon name="clock" size={20} /></div>
            <svg className="dash-mini-chart" viewBox="0 0 90 38"><path d={SPARK} /></svg>
          </div>
          <div className="dash-stat-label">Pending Charges</div>
          <div className="dash-stat-value">{formatMoney(kpis.pendingTotal)}</div>
          <div className="dash-stat-delta positive">{kpis.pendingCount} awaiting billing</div>
        </div>

        <div className="dash-stat-card premium-stat red-stat">
          <div className="dash-stat-top">
            <div className="dash-stat-icon"><Icon name="alert" size={20} /></div>
            <svg className="dash-mini-chart" viewBox="0 0 90 38"><path d={SPARK} /></svg>
          </div>
          <div className="dash-stat-label">Outstanding Invoices</div>
          <div className="dash-stat-value">{formatMoney(kpis.out)}</div>
          <div className="dash-stat-delta negative">Unpaid balance</div>
        </div>

        <div className="dash-stat-card premium-stat violet-stat">
          <div className="dash-stat-top">
            <div className="dash-stat-icon"><Icon name="users" size={20} /></div>
            <svg className="dash-mini-chart" viewBox="0 0 90 38"><path d={SPARK} /></svg>
          </div>
          <div className="dash-stat-label">Patients in Queue</div>
          <div className="dash-stat-value">{patientQueue.length}</div>
          <div className="dash-stat-delta positive">Ready for checkout</div>
        </div>
      </section>

      {/* Queue */}
      <div className="dash-panel">
        <div className="dash-panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="dash-panel-title">Patient Billing Queue</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>Patients with automatically generated charges waiting for review.</div>
          </div>
          <div className="dash-search" style={{ maxWidth: 260 }}>
            <Icon name="search" size={15} />
            <input placeholder="Search patient name…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 12.5 }}>Loading billing queue…</div>
        ) : patientQueue.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 12.5 }}>
            No pending charges. When Pharmacy or Inventory dispenses an item, the patient will appear here automatically.
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-full-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Pending Items</th>
                  <th>Pending Total</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {patientQueue.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div className="dash-patient-name">
                        <span>{initials(p.name)}</span>
                        {p.name}
                      </div>
                    </td>
                    <td>{p.items} item{p.items !== 1 ? 's' : ''}</td>
                    <td style={{ fontWeight: 700, color: 'var(--gold)' }}>{formatMoney(p.total)}</td>
                    <td>
                      <span className="dash-status" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
                        AWAITING REVIEW
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-primary"
                        style={{ width: 'auto', padding: '7px 14px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={() => setSelectedPatient({ id: p.id, name: p.name })}
                      >
                        Open Billing <Icon name="arrowRight" size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedPatient && (
        <CashierWorkspace
          patientId={selectedPatient.id}
          patientName={selectedPatient.name}
          hospital={hospital}
          profile={profile}
          onClose={() => setSelectedPatient(null)}
        />
      )}

      {toast && <div className="billing-toast">{toast}</div>}
    </>
  )
}
