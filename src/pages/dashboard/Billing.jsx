import { useState, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import CashierWorkspace from '../../components/CashierWorkspace'

export default function Billing() {
  const { profile, hospital } = useAuth()
  const { records: invoices, loading, isOnline, pendingCount } = useOfflineTable('invoices', hospital?.id)
  const { records: billableCharges } = useOfflineTable('billable_charges', hospital?.id)
  
  const [toast, setToast] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState(null) // NEW: For Cashier Workspace

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000) }
  const formatMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

  return (
    <>
      <div className="dash-panel" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)' }}>Cashier Dashboard</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)' }} />
              {isOnline ? 'System Online' : 'Offline Mode'} {pendingCount > 0 ? ` · ${pendingCount} syncing` : ''}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <KpiCard title="Today's Collections" value={formatMoney(kpis.tRev)} icon="💵" color="var(--teal)" />
          <KpiCard title="Pending Charges" value={formatMoney(kpis.pendingTotal)} icon="⏳" color="var(--gold)" />
          <KpiCard title="Outstanding Invoices" value={formatMoney(kpis.out)} icon="⚠️" color="var(--danger)" />
          <KpiCard title="Patients in Queue" value={patientQueue.length} icon="👥" color="var(--blue)" />
        </div>
      </div>

      <div className="dash-panel">
        <div className="dash-panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Patient Billing Queue</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Patients with automatically generated charges waiting for review.</div>
          </div>
          <input 
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', minWidth: 200 }}
            placeholder="Search patient name..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading billing queue…</div>
        ) : patientQueue.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
            No pending charges. When Pharmacy or Inventory dispenses an item, the patient will appear here automatically.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-full-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Pending Items</th>
                  <th>Pending Total</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {patientQueue.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 700 }}>{p.name}</td>
                    <td>{p.items} item(s)</td>
                    <td style={{ fontWeight: 700, color: 'var(--gold)' }}>{formatMoney(p.total)}</td>
                    <td>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'rgba(242,201,76,0.15)', color: '#f2c94c' }}>
                        AWAITING REVIEW
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-primary" style={{ width: 'auto', padding: '6px 14px', fontSize: 12 }} onClick={() => setSelectedPatient({ id: p.id, name: p.name })}>
                        Open Billing
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* NEW: Render the Cashier Workspace */}
      {selectedPatient && (
        <CashierWorkspace 
          patientId={selectedPatient.id} 
          patientName={selectedPatient.name} 
          hospital={hospital} 
          profile={profile} 
          onClose={() => setSelectedPatient(null)} 
        />
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
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 48, height: 48, minWidth: 48, borderRadius: 12, background: `${color}15`, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{value}</div>
      </div>
    </div>
  )
}
// --- END OF FILE ---
