import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'
import { useRealtimeAlert } from '../../lib/useRealtimeAlert'
import { supabase } from '../../lib/supabaseClient'
import CashierWorkspace from '../../components/CashierWorkspace'
import { usePagination } from '../../lib/usePagination'
import Pagination from '../../components/common/Pagination'
import SearchInput from '../../components/common/SearchInput'
import AppIcon from '../../components/icons'
import { writeAudit } from '../../lib/audit'
import { formatDateTimeSec, getTimezone } from '../../lib/datetime'

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

export default function Billing({ initialSearch = '' }) {
  const { profile, hospital } = useAuth()
  const timezone = getTimezone(hospital)
  const { records: invoices, updateRecord: updateInvoice, loading, isOnline, pendingCount } = useOfflineTable('invoices', hospital?.id)
  const { records: billableCharges, syncFromServer: syncCharges } = useOfflineTable('billable_charges', hospital?.id)
  // Wallet transactions — for the Transactions tab + wallet credit on reversal
  const { records: walletTxns, addRecord: addWalletTxn, loading: txnsLoading } = useOfflineTable('patient_wallet_transactions', hospital?.id)
  // Payments — for the Payments tab
  const { records: payments, updateRecord: updatePayment } = useOfflineTable('payments', hospital?.id)
  // Patient wallets — needed for wallet credit on reversal
  const { records: walletRecords } = useOfflineTable('patient_wallets', hospital?.id)
  // Patients — needed to resolve patient names for wallet txns + payments
  const { records: patients } = useOfflineTable('patients', hospital?.id)
  // Staff — to resolve "received_by" and "reversed_by" names
  const { records: staff } = useOfflineTable('profiles', hospital?.id)

  const [toast, setToast] = useState(null)
  const [search, setSearch] = useState(initialSearch)
  useEffect(() => { if (initialSearch) setSearch(initialSearch) }, [initialSearch])
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [activeTab, setActiveTab] = useState('queue')  // 'queue' | 'transactions' | 'payments'
  const [txnTypeFilter, setTxnTypeFilter] = useState('all')  // 'all' | 'deposit' | 'charge' | 'refund' | 'adjustment'
  const [txnSearch, setTxnSearch] = useState('')
  const [payMethodFilter, setPayMethodFilter] = useState('all')
  const [paySearch, setPaySearch] = useState('')
  const [payStatusFilter, setPayStatusFilter] = useState('active')  // 'active' | 'reversed' | 'all'

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

  // Global Pagination Rule — the patient billing queue can grow past a
  // screenful during busy periods (many patients with pending charges
  // waiting for cashier review at once), so only the current page's
  // rows are rendered into the table. Page size 10 to match Insurance,
  // the other billing-adjacent module.
  const {
    pageItems: pagedQueue, currentPage, setCurrentPage, pageSize, setPageSize,
    totalPages, totalItems, startIndex, endIndex,
  } = usePagination(patientQueue, { pageSize: 10, resetKey: search })

  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()

  // ---- Wallet transactions filter + pagination ----------------------
  const filteredTxns = useMemo(() => {
    let arr = [...walletTxns].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    if (txnTypeFilter !== 'all') {
      arr = arr.filter(t => t.type === txnTypeFilter)
    }
    if (txnSearch.trim()) {
      const q = txnSearch.trim().toLowerCase()
      arr = arr.filter(t => {
        const pName = patients.find(p => p.id === t.patient_id)?.full_name || t.performed_by_name || ''
        return (
          String(t.patient_id || '').toLowerCase().includes(q) ||
          pName.toLowerCase().includes(q) ||
          String(t.reference || '').toLowerCase().includes(q) ||
          String(t.notes || '').toLowerCase().includes(q) ||
          String(t.method || '').toLowerCase().includes(q)
        )
      })
    }
    return arr
  }, [walletTxns, txnTypeFilter, txnSearch, patients])

  const txnStats = useMemo(() => {
    const todayStr = new Date().toDateString()
    const today = walletTxns.filter(t => new Date(t.created_at).toDateString() === todayStr)
    const depositsToday = today.filter(t => t.type === 'deposit').reduce((s, t) => s + Number(t.amount || 0), 0)
    const chargesToday = today.filter(t => t.type === 'charge').reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0)
    const refundsToday = today.filter(t => t.type === 'refund').reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0)
    return { depositsToday, chargesToday, refundsToday, totalToday: walletTxns.length }
  }, [walletTxns])

  const {
    pageItems: pagedTxns, currentPage: txnPage, setCurrentPage: setTxnPage, pageSize: txnPageSize, setPageSize: setTxnPageSize,
    totalPages: txnTotalPages, totalItems: txnTotalItems, startIndex: txnStart, endIndex: txnEnd,
  } = usePagination(filteredTxns, { pageSize: 20, resetKey: `${txnTypeFilter}|${txnSearch}` })

  // ---- Payments filter + pagination -----------------------------------
  const filteredPayments = useMemo(() => {
    let arr = [...payments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    // Status filter
    if (payStatusFilter === 'active') {
      arr = arr.filter(p => p.status !== 'reversed')
    } else if (payStatusFilter === 'reversed') {
      arr = arr.filter(p => p.status === 'reversed')
    }
    // Method filter
    if (payMethodFilter !== 'all') {
      arr = arr.filter(p => (p.method || 'Cash') === payMethodFilter)
    }
    // Search
    if (paySearch.trim()) {
      const q = paySearch.trim().toLowerCase()
      arr = arr.filter(p => {
        const pName = patients.find(pt => pt.id === p.patient_id)?.full_name || p.patient_name || ''
        const inv = invoices.find(i => i.id === p.invoice_id)
        return (
          pName.toLowerCase().includes(q) ||
          String(p.reference_number || '').toLowerCase().includes(q) ||
          String(p.method || '').toLowerCase().includes(q) ||
          (inv?.invoice_number || '').toLowerCase().includes(q)
        )
      })
    }
    return arr
  }, [payments, payStatusFilter, payMethodFilter, paySearch, patients, invoices])

  const payStats = useMemo(() => {
    const active = payments.filter(p => p.status !== 'reversed')
    const reversed = payments.filter(p => p.status === 'reversed')
    const todayStr = new Date().toDateString()
    const todayActive = active.filter(p => new Date(p.created_at).toDateString() === todayStr)
    const todayTotal = todayActive.reduce((s, p) => s + Number(p.amount || 0), 0)
    return {
      activeCount: active.length,
      reversedCount: reversed.length,
      todayCount: todayActive.length,
      todayTotal,
    }
  }, [payments])

  const {
    pageItems: pagedPayments, currentPage: payPage, setCurrentPage: setPayPage, pageSize: payPageSize, setPageSize: setPayPageSize,
    totalPages: payTotalPages, totalItems: payTotalItems, startIndex: payStart, endIndex: payEnd,
  } = usePagination(filteredPayments, { pageSize: 20, resetKey: `${payStatusFilter}|${payMethodFilter}|${paySearch}` })

  // ---- Reverse a payment ----------------------------------------------
  // Q1=a: void the payment (status = 'reversed'), keep the row for audit.
  // Q2=b: any billing-role user (billing + admin + owner) can reverse.
  // Q4=a: if the payment was from the wallet, credit the wallet back.
  // Q5=a: require a reason.
  async function handleReversePayment(payment) {
    const canReverse = profile && ['admin', 'owner', 'billing'].includes(profile.role)
    if (!canReverse) {
      showToast('Your role cannot reverse payments.')
      return
    }

    // Resolve names for the confirmation dialog
    const patientName = patients.find(p => p.id === payment.patient_id)?.full_name || payment.patient_name || 'patient'
    const inv = invoices.find(i => i.id === payment.invoice_id)

    const reason = prompt(
      `Reverse this payment?\n\n` +
      `Patient: ${patientName}\n` +
      `Amount: ${formatMoney(payment.amount)}\n` +
      `Method: ${payment.method || 'Cash'}\n` +
      `Reference: ${payment.reference_number || '—'}\n` +
      (inv ? `Invoice: ${inv.invoice_number || '—'}\n` : '') +
      `\nThis will mark the payment as reversed and adjust the invoice.\n` +
      `The payment record is kept for audit — it is NOT deleted.\n\n` +
      `Enter a reason (required):`
    )
    if (!reason || !reason.trim()) return

    try {
      // 1. Void the payment
      await updatePayment(payment.id, {
        status: 'reversed',
        reversed_by: profile.id,
        reversed_by_name: profile.full_name,
        reversed_at: new Date().toISOString(),
        reversal_reason: reason.trim(),
      })

      // 2. Adjust the invoice: amount_paid -= payment.amount, balance += payment.amount
      if (inv) {
        const newPaid = Math.max(0, Number(inv.amount_paid || 0) - Number(payment.amount || 0))
        const newBal = Math.max(0, Number(inv.grand_total || inv.amount || 0) - newPaid)
        const newStatus = newBal <= 0.001 ? 'paid' : (newPaid > 0 ? 'partial' : 'unpaid')
        await updateInvoice(inv.id, {
          amount_paid: newPaid,
          balance: newBal,
          status: newStatus,
        })

        // 3. If the payment was from the wallet, credit the wallet back (Q4=a)
        if (payment.method === 'Wallet') {
          const wallet = walletRecords.find(w => w.patient_id === payment.patient_id)
          if (wallet) {
            const newWalletBalance = Number(wallet.balance || 0) + Number(payment.amount || 0)
            await addWalletTxn({
              hospital_id: hospital.id,
              patient_id: payment.patient_id,
              wallet_id: wallet.id,
              type: 'adjustment',
              amount: Number(payment.amount || 0),
              balance_after: newWalletBalance,
              method: 'Wallet',
              invoice_id: inv.id,
              performed_by: profile.id,
              performed_by_name: profile.full_name,
              notes: `Reversal of wallet payment — ${reason.trim()}`,
            })
          }
        }
      }

      writeAudit({
        hospitalId: hospital.id, actor: profile,
        action: 'payment.reversed',
        entityType: 'payment', entityId: payment.id,
        patientId: payment.patient_id || null,
        summary: `Reversed payment of ${formatMoney(payment.amount)} (${payment.method || 'Cash'}) for ${patientName} — reason: ${reason.trim()}`,
        metadata: {
          payment_id: payment.id,
          invoice_id: inv?.id || null,
          amount: payment.amount,
          method: payment.method,
          reason: reason.trim(),
        },
      })

      showToast(`Payment of ${formatMoney(payment.amount)} reversed for ${patientName}`)
    } catch (err) {
      showToast(err.message || 'Could not reverse the payment.')
    }
  }

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

      {/* ---- Tab switcher: Queue / Wallet Transactions / Payments ---- */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { key: 'queue', label: 'Patient Queue', icon: 'users' },
          { key: 'transactions', label: 'Wallet Transactions', icon: 'billing' },
          { key: 'payments', label: 'Payments', icon: 'billing' },
        ].map(t => (
          <button
            key={t.key}
            type="button"
            className={`btn ${activeTab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            style={{ width: 'auto', padding: '8px 14px', fontSize: 12.5 }}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
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

      {/* Queue (only shown when activeTab === 'queue') */}
      {activeTab === 'queue' && (
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
          <>
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
                  {pagedQueue.map(p => (
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

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              itemLabel="patients in queue"
            />
          </>
        )}
      </div>
      )}

      {/* ---- Transactions tab ---- */}
      {activeTab === 'transactions' && (
        <>
          {/* Mini-stats */}
          <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}><AppIcon name="arrowUp" size={18} /></div>
              <div>
                <div className="dash-stat-label">Deposits Today</div>
                <div className="dash-stat-value" style={{ fontSize: 16 }}>{formatMoney(txnStats.depositsToday)}</div>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'rgba(225,104,94,0.14)', color: 'var(--danger)' }}><AppIcon name="arrowDown" size={18} /></div>
              <div>
                <div className="dash-stat-label">Charges Today</div>
                <div className="dash-stat-value" style={{ fontSize: 16 }}>{formatMoney(txnStats.chargesToday)}</div>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }}><AppIcon name="arrowDown" size={18} /></div>
              <div>
                <div className="dash-stat-label">Refunds Today</div>
                <div className="dash-stat-value" style={{ fontSize: 16 }}>{formatMoney(txnStats.refundsToday)}</div>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'rgba(118,87,232,0.14)', color: 'var(--violet)' }}><AppIcon name="billing" size={18} /></div>
              <div>
                <div className="dash-stat-label">Total Transactions</div>
                <div className="dash-stat-value" style={{ fontSize: 16 }}>{walletTxns.length}</div>
              </div>
            </div>
          </div>

          <div className="dash-panel">
            <div className="dash-panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div className="dash-panel-title">Wallet Transactions</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>Every deposit, charge, refund, and adjustment — append-only ledger.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select value={txnTypeFilter} onChange={e => setTxnTypeFilter(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border, var(--line))', background: 'var(--bg-elevated)', color: 'var(--ivory)', fontSize: 12.5 }}>
                  <option value="all">All types</option>
                  <option value="deposit">Deposits</option>
                  <option value="charge">Charges</option>
                  <option value="refund">Refunds</option>
                  <option value="adjustment">Adjustments</option>
                </select>
                <SearchInput value={txnSearch} onChange={setTxnSearch} placeholder="Search patient, ref, notes…" style={{ minWidth: 200, maxWidth: 320 }} />
              </div>
            </div>

            {txnsLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 12.5 }}>Loading transactions…</div>
            ) : filteredTxns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 12.5 }}>
                {txnSearch || txnTypeFilter !== 'all' ? 'No transactions match these filters.' : 'No wallet transactions yet. Deposits made on the patient profile will appear here.'}
              </div>
            ) : (
              <>
                <div className="dash-table-wrap">
                  <table className="dash-full-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Patient</th>
                        <th>Type</th>
                        <th>Method</th>
                        <th>Reference</th>
                        <th>Amount</th>
                        <th>Balance After</th>
                        <th>By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedTxns.map(t => {
                        const amount = Number(t.amount || 0)
                        const isCredit = amount > 0
                        const patientName = patients.find(p => p.id === t.patient_id)?.full_name || '—'
                        const typeColor = t.type === 'deposit' ? 'var(--teal)' :
                                          t.type === 'refund' ? 'var(--gold)' :
                                          t.type === 'charge' ? 'var(--danger)' :
                                          'var(--violet)'
                        return (
                          <tr key={t.id}>
                            <td style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatDateTimeSec(t.created_at, timezone)}</td>
                            <td style={{ fontWeight: 700 }}>{patientName}</td>
                            <td>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                                background: `${typeColor}22`, color: typeColor,
                                textTransform: 'uppercase', letterSpacing: 0.5,
                              }}>
                                {t.type}
                              </span>
                            </td>
                            <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{t.method || '—'}</td>
                            <td style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>{t.reference || '—'}</td>
                            <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: isCredit ? 'var(--teal)' : 'var(--danger)' }}>
                              {isCredit ? '+' : ''}{formatMoney(amount)}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--muted)' }}>{formatMoney(t.balance_after)}</td>
                            <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{t.performed_by_name || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  currentPage={txnPage}
                  totalPages={txnTotalPages}
                  totalItems={txnTotalItems}
                  startIndex={txnStart}
                  endIndex={txnEnd}
                  pageSize={txnPageSize}
                  onPageChange={setTxnPage}
                  onPageSizeChange={setTxnPageSize}
                  itemLabel="transactions"
                />
              </>
            )}
          </div>
        </>
      )}

      {/* ---- Payments tab ---- */}
      {activeTab === 'payments' && (
        <>
          {/* Mini-stats */}
          <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}><AppIcon name="billing" size={18} /></div>
              <div>
                <div className="dash-stat-label">Active Payments</div>
                <div className="dash-stat-value" style={{ fontSize: 16 }}>{payStats.activeCount}</div>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'rgba(225,104,94,0.14)', color: 'var(--danger)' }}><AppIcon name="arrowDown" size={18} /></div>
              <div>
                <div className="dash-stat-label">Reversed Payments</div>
                <div className="dash-stat-value" style={{ fontSize: 16 }}>{payStats.reversedCount}</div>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'rgba(0,199,199,0.10)', color: 'var(--teal)' }}><AppIcon name="clock" size={18} /></div>
              <div>
                <div className="dash-stat-label">Today's Collections</div>
                <div className="dash-stat-value" style={{ fontSize: 16 }}>{formatMoney(payStats.todayTotal)}</div>
                <div className="dash-stat-delta">{payStats.todayCount} payment(s) today</div>
              </div>
            </div>
          </div>

          <div className="dash-panel">
            <div className="dash-panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div className="dash-panel-title">Payment Records</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>Every payment recorded — cash, POS, bank transfer, wallet, and reversed entries.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select value={payStatusFilter} onChange={e => setPayStatusFilter(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)', fontSize: 12.5 }}>
                  <option value="active">Active only</option>
                  <option value="reversed">Reversed only</option>
                  <option value="all">All payments</option>
                </select>
                <select value={payMethodFilter} onChange={e => setPayMethodFilter(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)', fontSize: 12.5 }}>
                  <option value="all">All methods</option>
                  <option value="Cash">Cash</option>
                  <option value="POS">POS</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Card">Card</option>
                  <option value="Wallet">Wallet</option>
                  <option value="HMO">HMO</option>
                </select>
                <SearchInput value={paySearch} onChange={setPaySearch} placeholder="Search patient, ref, invoice…" style={{ minWidth: 200, maxWidth: 320 }} />
              </div>
            </div>

            {filteredPayments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 12.5 }}>
                {paySearch || payMethodFilter !== 'all' || payStatusFilter !== 'active' ? 'No payments match these filters.' : 'No payments recorded yet. When the cashier records a payment via an invoice, it will appear here.'}
              </div>
            ) : (
              <>
                <div className="dash-table-wrap">
                  <table className="dash-full-table">
                    <thead>
                      <tr>
                        <th>Date / Time</th>
                        <th>Patient</th>
                        <th>Invoice #</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Reference</th>
                        <th>Received By</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedPayments.map(p => {
                        const patientName = patients.find(pt => pt.id === p.patient_id)?.full_name || p.patient_name || '—'
                        const inv = invoices.find(i => i.id === p.invoice_id)
                        const receivedBy = staff.find(s => s.id === p.received_by)?.full_name || '—'
                        const reversedBy = staff.find(s => s.id === p.reversed_by)?.full_name
                        const isReversed = p.status === 'reversed'
                        return (
                          <tr key={p.id} style={{ opacity: isReversed ? 0.5 : 1 }}>
                            <td style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatDateTimeSec(p.created_at, timezone)}</td>
                            <td style={{ fontWeight: 700 }}>{patientName}</td>
                            <td style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>{inv?.invoice_number || '—'}</td>
                            <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: isReversed ? 'var(--muted)' : 'var(--teal)' }}>{formatMoney(p.amount)}</td>
                            <td>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                                background: p.method === 'Cash' ? 'rgba(0,199,199,0.14)' :
                                            p.method === 'POS' ? 'rgba(59,130,246,0.14)' :
                                            p.method === 'Bank Transfer' ? 'rgba(118,87,232,0.14)' :
                                            p.method === 'Wallet' ? 'rgba(0,199,199,0.10)' :
                                            'rgba(154,170,183,0.14)',
                                color: p.method === 'Cash' ? 'var(--teal)' :
                                       p.method === 'POS' ? 'var(--blue)' :
                                       p.method === 'Bank Transfer' ? 'var(--violet)' :
                                       p.method === 'Wallet' ? 'var(--teal)' :
                                       'var(--muted)',
                              }}>
                                {p.method || 'Cash'}
                              </span>
                            </td>
                            <td style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>{p.reference_number || '—'}</td>
                            <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{receivedBy}</td>
                            <td>
                              {isReversed ? (
                                <span style={{
                                  fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                                  background: 'rgba(240,79,95,0.14)', color: 'var(--danger)',
                                  textTransform: 'uppercase', letterSpacing: 0.5,
                                }} title={`Reversed by ${reversedBy || '—'} on ${p.reversed_at ? new Date(p.reversed_at).toLocaleString('en-NG') : '—'}\nReason: ${p.reversal_reason || '—'}`}>
                                  Reversed
                                </span>
                              ) : (
                                <span style={{
                                  fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                                  background: 'rgba(0,199,199,0.14)', color: 'var(--teal)',
                                  textTransform: 'uppercase', letterSpacing: 0.5,
                                }}>
                                  Active
                                </span>
                              )}
                            </td>
                            <td>
                              {!isReversed && profile && ['admin', 'owner', 'billing'].includes(profile.role) && (
                                <button
                                  className="btn btn-ghost"
                                  style={{ width: 'auto', padding: '4px 10px', fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                  onClick={() => handleReversePayment(p)}
                                  title="Reverse this payment"
                                >
                                  Reverse
                                </button>
                              )}
                              {isReversed && (
                                <span style={{ fontSize: 10, color: 'var(--muted-dim)', fontStyle: 'italic' }}>
                                  {p.reversal_reason ? `"${p.reversal_reason}"` : ''}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  currentPage={payPage}
                  totalPages={payTotalPages}
                  totalItems={payTotalItems}
                  startIndex={payStart}
                  endIndex={payEnd}
                  pageSize={payPageSize}
                  onPageChange={setPayPage}
                  onPageSizeChange={setPayPageSize}
                  itemLabel="payments"
                />
              </>
            )}
          </div>
        </>
      )}

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
