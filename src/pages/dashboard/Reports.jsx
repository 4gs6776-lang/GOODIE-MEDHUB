import { useAuth } from '../../context/AuthContext'
import { useOfflineTable } from '../../lib/useOfflineTable'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Reports(){
  const { hospital } = useAuth()
  const { records: patients, loading: loadingPatients } = useOfflineTable('patients', hospital?.id)
  const { records: invoices, loading: loadingInvoices } = useOfflineTable('invoices', hospital?.id)
  const { records: labTests, loading: loadingLab } = useOfflineTable('lab_tests', hospital?.id)
  const { records: scans, loading: loadingRadiology } = useOfflineTable('radiology_scans', hospital?.id)
  const { records: claims, loading: loadingInsurance } = useOfflineTable('insurance_claims', hospital?.id)

  const loading = loadingPatients || loadingInvoices || loadingLab || loadingRadiology || loadingInsurance

  function formatMoney(n){
    return '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })
  }

  const revenueCollected = invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.amount), 0)
  const revenueOutstanding = invoices.filter(i => i.status === 'unpaid').reduce((sum, i) => sum + Number(i.amount), 0)

  // Revenue collected per day for the last 7 days, based on paid invoices.
  const today = new Date()
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (6 - i))
    return d
  })
  const dailyRevenue = last7.map(day => {
    return invoices
      .filter(i => i.status === 'paid' && i.created_at && new Date(i.created_at).toDateString() === day.toDateString())
      .reduce((sum, i) => sum + Number(i.amount), 0)
  })
  const maxDaily = Math.max(1, ...dailyRevenue)

  const labCompleted = labTests.filter(t => t.status === 'completed').length
  const labPending = labTests.length - labCompleted
  const radiologyCompleted = scans.filter(s => s.status === 'completed').length
  const radiologyPending = scans.length - radiologyCompleted
  const claimsApproved = claims.filter(c => c.status === 'approved').length
  const claimsRejected = claims.filter(c => c.status === 'rejected').length
  const claimsPending = claims.length - claimsApproved - claimsRejected

  const GOOD = '#22D3EE'
  const w = 500, h = 140, padTop = 14, padBottom = 26
  const usableH = h - padTop - padBottom
  const stepX = w / (dailyRevenue.length - 1)
  const points = dailyRevenue.map((v, i) => ({
    x: i * stepX,
    y: padTop + (usableH - (v / maxDaily) * usableH),
  }))
  const areaPath = `M${points[0].x},${h - padBottom} ` + points.map(p => `L${p.x},${p.y}`).join(' ') + ` L${points[points.length - 1].x},${h - padBottom} Z`

  return (
    <>
      <div className="dash-stats">
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Revenue Collected</div>
            <div className="dash-stat-value" style={{ fontSize: 17 }}>{formatMoney(revenueCollected)}</div>
            <div className="dash-stat-delta" style={{ color: revenueOutstanding > 0 ? 'var(--gold)' : 'var(--teal)' }}>{formatMoney(revenueOutstanding)} outstanding</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6.3 7-6.3s7 2.8 7 6.3"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Total Patients</div>
            <div className="dash-stat-value">{patients.length}</div>
            <div className="dash-stat-delta">Live count</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(139,124,246,0.14)', color: 'var(--violet)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M12 13v5M9.5 15.5h5"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Lab + Radiology Pending</div>
            <div className="dash-stat-value">{labPending + radiologyPending}</div>
            <div className="dash-stat-delta">across both departments</div>
          </div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon" style={{ background: 'rgba(225,104,94,0.14)', color: 'var(--danger)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
          </div>
          <div>
            <div className="dash-stat-label">Claims Pending</div>
            <div className="dash-stat-value">{claimsPending}</div>
            <div className="dash-stat-delta" style={{ color: 'var(--gold)' }}>{claimsRejected} rejected</div>
          </div>
        </div>
      </div>

      <div className="dash-row dash-row-2">
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Revenue Collected — Last 7 Days</div>
              <div className="dash-panel-sub">Paid invoices, by day</div>
            </div>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
          ) : (
            <>
              <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', display: 'block' }}>
                <line x1="0" y1={padTop} x2={w} y2={padTop} stroke="rgba(255,255,255,0.05)" />
                <line x1="0" y1={padTop + usableH / 2} x2={w} y2={padTop + usableH / 2} stroke="rgba(255,255,255,0.05)" />
                <path d={areaPath} fill={GOOD} opacity="0.06" />
                {points.slice(0, -1).map((p, i) => (
                  <line key={i} x1={p.x} y1={p.y} x2={points[i + 1].x} y2={points[i + 1].y} stroke={GOOD} strokeWidth="3" strokeLinecap="round" />
                ))}
                {points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="4" fill={GOOD} stroke="var(--bg-card)" strokeWidth="2" />
                ))}
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10.5, color: 'var(--muted)' }}>
                {last7.map((d, i) => <span key={i}>{DAY_LABELS[d.getDay()]}</span>)}
              </div>
            </>
          )}
        </div>

        <div className="dash-panel">
          <div className="dash-panel-head"><div className="dash-panel-title">Module Activity</div></div>
          <ul className="dash-legend">
            <li><span className="dash-legend-name"><span className="dash-legend-dot" style={{ background: 'var(--teal)' }} />Lab Tests Completed</span><span className="dash-legend-val">{labCompleted}</span></li>
            <li><span className="dash-legend-name"><span className="dash-legend-dot" style={{ background: 'var(--gold)' }} />Lab Tests Pending</span><span className="dash-legend-val">{labPending}</span></li>
            <li><span className="dash-legend-name"><span className="dash-legend-dot" style={{ background: 'var(--teal)' }} />Radiology Completed</span><span className="dash-legend-val">{radiologyCompleted}</span></li>
            <li><span className="dash-legend-name"><span className="dash-legend-dot" style={{ background: 'var(--gold)' }} />Radiology Pending</span><span className="dash-legend-val">{radiologyPending}</span></li>
            <li><span className="dash-legend-name"><span className="dash-legend-dot" style={{ background: 'var(--teal)' }} />Claims Approved</span><span className="dash-legend-val">{claimsApproved}</span></li>
            <li><span className="dash-legend-name"><span className="dash-legend-dot" style={{ background: 'var(--danger)' }} />Claims Rejected</span><span className="dash-legend-val">{claimsRejected}</span></li>
          </ul>
        </div>
      </div>
    </>
  )
}
