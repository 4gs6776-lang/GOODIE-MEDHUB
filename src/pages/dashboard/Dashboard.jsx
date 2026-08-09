import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import Billing from './Billing'
import Staff from './Staff'
import Appointments from './Appointments'
import { useOfflineTable, getAllSyncErrors, subscribeSyncErrors, flushTableQueue, skipStuckSyncItem } from '../../lib/useOfflineTable'
import Pharmacy from './Pharmacy'
import Laboratory from './Laboratory'
import Radiology from './Radiology'
import Insurance from './Insurance'
import Inventory from './Inventory'
import Reports from './Reports'
import Notifications from './Notifications'
import Settings from './Settings'
import DoctorWorkbench from './DoctorWorkbench'
import Nursing from './Nursing'
import IPD from './IPD'
import Reception from './Reception'
import PatientProfile from '../../components/PatientProfile'

const NAV_ITEMS = [
  { key: 'overview', label: 'Dashboard', section: 'Main' },
  { key: 'patients', label: 'Patient Management', section: 'Main' },
  { key: 'reception', label: 'Reception', section: 'Main' },
  { key: 'appointments', label: 'Appointments', section: 'Main' },
  { key: 'ipd', label: 'IPD Management', section: 'Main' },
  { key: 'billing', label: 'Billing & Invoices', section: 'Main' },
  { key: 'pharmacy', label: 'Pharmacy', section: 'Main' },
  { key: 'laboratory', label: 'Laboratory', section: 'Main' },
  { key: 'nursing', label: 'Nursing / Triage', section: 'Main' },
  { key: 'doctor', label: 'Doctor Workbench', section: 'Main' },
  { key: 'radiology', label: 'Radiology', section: 'Main' },
  { key: 'insurance', label: 'Insurance / HMO', section: 'Main' },
  { key: 'inventory', label: 'Inventory', section: 'Operations' },
  { key: 'staff', label: 'Staff', section: 'Operations' },
  { key: 'reports', label: 'Reports', section: 'Operations' },
  { key: 'notifications', label: 'Reminders', section: 'Operations' },
  { key: 'settings', label: 'Settings', section: 'Operations' },
]

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Dashboard(){
  const { profile, hospital, signOut } = useAuth()

  const [tab, setTab] = useState('overview')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [syncErrors, setSyncErrors] = useState(() => getAllSyncErrors())
  const [syncPanelOpen, setSyncPanelOpen] = useState(false)
  const [syncActionBusy, setSyncActionBusy] = useState(false)

  const { records: patients, loading, isOnline, pendingCount, addRecord, deleteRecord } = useOfflineTable('patients', hospital?.id)
  const [profilePatientId, setProfilePatientId] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [status, setStatus] = useState('stable')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const [pending, setPending] = useState(null)
  const pendingTimeoutRef = useRef(null)
  const pendingIntervalRef = useRef(null)

  // Overview summary data (real, pulled from the other modules)
  const [todayApptCount, setTodayApptCount] = useState(0)
  const [upcomingApptCount, setUpcomingApptCount] = useState(0)
  const [revenueCollected, setRevenueCollected] = useState(0)
  const [revenueOutstanding, setRevenueOutstanding] = useState(0)
  const [weeklyCounts, setWeeklyCounts] = useState([0, 0, 0, 0, 0, 0, 0])

  useEffect(() => { computeWeeklyCounts(patients) }, [patients])

  useEffect(() => subscribeSyncErrors(setSyncErrors), [])

  const stuckTables = Object.values(syncErrors)

  async function handleRetrySync(table){
    if (!hospital?.id) return
    setSyncActionBusy(true)
    try {
      await flushTableQueue(table, hospital.id)
      setSyncErrors(getAllSyncErrors())
    } finally {
      setSyncActionBusy(false)
    }
  }

  async function handleSkipStuck(table){
    if (!hospital?.id) return
    if (!confirm(`Skip the stuck item for "${table}"? The local record stays — only this one sync attempt is abandoned so the rest of the queue can proceed.`)) return
    setSyncActionBusy(true)
    try {
      await skipStuckSyncItem(table, hospital.id)
      setSyncErrors(getAllSyncErrors())
    } finally {
      setSyncActionBusy(false)
    }
  }

  function computeWeeklyCounts(patientList){
    const counts = [0, 0, 0, 0, 0, 0, 0]
    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(now.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    patientList.forEach(p => {
      const created = new Date(p.created_at)
      if (created >= sevenDaysAgo) {
        counts[created.getDay()] += 1
      }
    })
    setWeeklyCounts(counts)
  }

  async function loadOverviewSummary(){
    const now = new Date()
    const todayStr = now.toDateString()

    const { data: apptData } = await supabase.from('appointments').select('appointment_time, status')
    if (apptData) {
      setTodayApptCount(apptData.filter(a => new Date(a.appointment_time).toDateString() === todayStr).length)
      setUpcomingApptCount(apptData.filter(a => new Date(a.appointment_time) > now && a.status === 'scheduled').length)
    }

    const { data: invData } = await supabase.from('invoices').select('amount, status')
    if (invData) {
      setRevenueCollected(invData.filter(i => i.status === 'paid').reduce((sum, i) => sum + Number(i.amount), 0))
      setRevenueOutstanding(invData.filter(i => i.status === 'unpaid').reduce((sum, i) => sum + Number(i.amount), 0))
    }
  }

  useEffect(() => {
    loadOverviewSummary()
  }, [])

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleAdd(e){
    e.preventDefault()
    if (!name || !age) return
    if (!hospital || !profile) {
      showToast('Still loading your account — wait a moment and try again')
      return
    }
    setSaving(true)
    try {
      await addRecord({ full_name: name, age: parseInt(age, 10), status, created_by: profile.id })
      setShowModal(false)
      setName(''); setAge(''); setStatus('stable')
      showToast(isOnline ? `${name} added` : `${name} added — will sync when back online`)
    } catch (err) {
      showToast(err.message || 'Could not save patient')
    } finally {
      setSaving(false)
    }
  }

  function handleDelete(patient){
    if (pending) commitPendingDelete(pending.patient)
    let secondsLeft = 5
    setPending({ patient, secondsLeft })
    pendingIntervalRef.current = setInterval(() => {
      secondsLeft -= 1
      setPending(prev => prev ? { ...prev, secondsLeft } : prev)
      if (secondsLeft <= 0) clearInterval(pendingIntervalRef.current)
    }, 1000)
    pendingTimeoutRef.current = setTimeout(() => commitPendingDelete(patient), 5000)
  }

  async function commitPendingDelete(patient){
    clearTimeout(pendingTimeoutRef.current)
    clearInterval(pendingIntervalRef.current)
    setPending(null)
    await deleteRecord(patient.id)
  }

  function handleUndo(){
    if (!pending) return
    clearTimeout(pendingTimeoutRef.current)
    clearInterval(pendingIntervalRef.current)
    setPending(null)
    showToast(`${pending.patient.full_name} restored`)
  }

  const displayedPatients = pending ? patients.filter(p => p.id !== pending.patient.id) : patients

  if (profile?.role === 'owner') {
    window.location.href = '/owner'
    return null
  }

  if (hospital && hospital.status !== 'active') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 10 }}>
            {hospital.status === 'pending' ? 'Account pending approval' : 'Account suspended'}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13.5, marginBottom: 20 }}>
            {hospital.status === 'pending'
              ? "Your hospital's account is being reviewed. You'll be able to log in fully once it's approved."
              : 'Please contact the platform administrator for help.'}
          </div>
          <button className="btn btn-ghost" onClick={signOut}>Sign Out</button>
        </div>
      </div>
    )
  }

  const inReviewCount = patients.filter(p => p.status === 'review').length
  const maxWeekly = Math.max(...weeklyCounts, 1)
  function formatMoney(n){
    return '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 0 })
  }
  let currentSection = null

  return (
    <div className="dash-shell">
      <div className={`dash-overlay ${drawerOpen ? 'show' : ''}`} onClick={() => setDrawerOpen(false)} />

      <aside className={`dash-sidebar ${drawerOpen ? 'open' : ''}`}>
        <div className="dash-brand">
          <div className="dash-brand-mark">G</div>
          <div>
            <div className="dash-brand-name">{hospital?.name || 'Loading…'}</div>
            <div className="dash-brand-sub">G-MedHub</div>
          </div>
        </div>

        {NAV_ITEMS.map((item, i) => {
          const showLabel = item.section !== currentSection
          currentSection = item.section
          return (
            <div key={i}>
              {showLabel && <div className="dash-nav-label">{item.section}</div>}
              <div
                className={`dash-nav-item ${tab === item.key && item.key !== 'soon' ? 'active' : ''}`}
                onClick={() => { setTab(item.key); setDrawerOpen(false) }}
              >
                {item.label}
              </div>
            </div>
          )
        })}

        <div className="dash-foot">
          <div className="dash-foot-user">
            <div className="dash-foot-avatar" />
            <div>
              <div className="dash-foot-name">{profile?.full_name}</div>
              <div className="dash-foot-role">Admin</div>
            </div>
          </div>
          <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={signOut}>Sign Out</button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        <div className="dash-topbar">
          <div className="dash-burger" onClick={() => setDrawerOpen(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </div>
          <div className="dash-hospital-name">
            {{ overview: 'Dashboard', patients: 'Patient Management', appointments: 'Appointments', billing: 'Billing & Invoices', staff: 'Staff', pharmacy: 'Pharmacy', laboratory: 'Laboratory', nursing: 'Nursing / Triage', doctor: 'Doctor Workbench', radiology: 'Radiology', insurance: 'Insurance / HMO Claims', inventory: 'Inventory & Supplies', reports: 'Reports & Analytics', notifications: 'Reminders & Alerts', settings: 'Settings', ipd: 'IPD Management', reception: 'Reception' }[tab] || 'Dashboard'}
          </div>
          <div style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 20,
            background: isOnline ? 'var(--teal-soft)' : 'var(--danger-soft)',
            color: isOnline ? 'var(--teal)' : 'var(--danger)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? 'var(--teal)' : 'var(--danger)' }} />
            {isOnline ? 'Online' : 'Offline'}
            {pendingCount > 0 && ` · ${pendingCount} syncing`}
          </div>

          {stuckTables.length > 0 && (
            <div
              onClick={() => setSyncPanelOpen(o => !o)}
              style={{
                marginLeft: 10, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 20,
                background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger)',
              }}
            >
              ⚠ Sync stuck{stuckTables.length > 1 ? ` (${stuckTables.length})` : ''}
            </div>
          )}
        </div>

        {syncPanelOpen && stuckTables.length > 0 && (
          <div style={{
            margin: '0 24px', marginTop: -1, padding: 16, borderRadius: 12,
            background: 'var(--bg-elevated)', border: '1px solid var(--danger)',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--danger)' }}>
              Some records can't reach the server
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {stuckTables.map(err => (
                <div key={err.table} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--line-soft)' }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{err.table}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{err.queueLength} item{err.queueLength === 1 ? '' : 's'} waiting to sync</div>
                  <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6, fontFamily: 'monospace', wordBreak: 'break-word' }}>{err.message}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn btn-ghost" style={{ width: 'auto', padding: '5px 12px', fontSize: 11.5 }} disabled={syncActionBusy} onClick={() => handleRetrySync(err.table)}>
                      Retry
                    </button>
                    <button className="btn btn-ghost" style={{ width: 'auto', padding: '5px 12px', fontSize: 11.5, color: 'var(--danger)', borderColor: 'var(--danger)' }} disabled={syncActionBusy} onClick={() => handleSkipStuck(err.table)}>
                      Skip this item
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="dash-content">
          {tab === 'overview' && (
            <>
              <div className="dash-stats">
                <div className="dash-stat-card">
                  <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6.3 7-6.3s7 2.8 7 6.3"/></svg>
                  </div>
                  <div>
                    <div className="dash-stat-label">Total Patients</div>
                    <div className="dash-stat-value">{patients.length}</div>
                    <div className="dash-stat-delta">Live count</div>
                  </div>
                </div>
                <div className="dash-stat-card">
                  <div className="dash-stat-icon" style={{ background: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
                  </div>
                  <div>
                    <div className="dash-stat-label">In Review</div>
                    <div className="dash-stat-value">{inReviewCount}</div>
                    <div className="dash-stat-delta" style={{ color: 'var(--gold)' }}>Needs attention</div>
                  </div>
                </div>
                <div className="dash-stat-card">
                  <div className="dash-stat-icon" style={{ background: 'rgba(139,124,246,0.14)', color: 'var(--violet)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 3v3M16 3v3"/></svg>
                  </div>
                  <div>
                    <div className="dash-stat-label">Today's Appointments</div>
                    <div className="dash-stat-value">{todayApptCount}</div>
                    <div className="dash-stat-delta">{upcomingApptCount} upcoming</div>
                  </div>
                </div>
                <div className="dash-stat-card">
                  <div className="dash-stat-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  </div>
                  <div>
                    <div className="dash-stat-label">Revenue Collected</div>
                    <div className="dash-stat-value" style={{ fontSize: 17 }}>{formatMoney(revenueCollected)}</div>
                    <div className="dash-stat-delta" style={{ color: revenueOutstanding > 0 ? 'var(--gold)' : 'var(--teal)' }}>
                      {formatMoney(revenueOutstanding)} outstanding
                    </div>
                  </div>
                </div>
              </div>

              <div className="dash-row dash-row-2">
                <div className="dash-panel">
                  <div className="dash-panel-head">
                    <div>
                      <div className="dash-panel-title">Patients Registered — Last 7 Days</div>
                      <div className="dash-panel-sub">Cyan = rising, Red = falling — live data</div>
                    </div>
                  </div>
                  {(() => {
                    const GOOD = '#22D3EE'
                    const BAD = '#E1685E'
                    const w = 500, h = 140, padTop = 14, padBottom = 26
                    const usableH = h - padTop - padBottom
                    const stepX = w / (weeklyCounts.length - 1)
                    const points = weeklyCounts.map((c, i) => ({
                      x: i * stepX,
                      y: padTop + (usableH - (c / maxWeekly) * usableH),
                      count: c,
                    }))
                    const segments = []
                    for (let i = 0; i < points.length - 1; i++) {
                      const good = points[i + 1].count >= points[i].count
                      segments.push({ x1: points[i].x, y1: points[i].y, x2: points[i + 1].x, y2: points[i + 1].y, color: good ? GOOD : BAD })
                    }
                    const areaPath = `M${points[0].x},${h - padBottom} ` + points.map(p => `L${p.x},${p.y}`).join(' ') + ` L${points[points.length - 1].x},${h - padBottom} Z`
                    return (
                      <>
                        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', display: 'block' }}>
                          <line x1="0" y1={padTop} x2={w} y2={padTop} stroke="rgba(255,255,255,0.05)" />
                          <line x1="0" y1={padTop + usableH / 2} x2={w} y2={padTop + usableH / 2} stroke="rgba(255,255,255,0.05)" />
                          <path d={areaPath} fill="#22D3EE" opacity="0.06" />
                          {segments.map((s, i) => (
                            <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth="3" strokeLinecap="round" />
                          ))}
                          {points.map((p, i) => (
                            <circle key={i} cx={p.x} cy={p.y} r="4" fill={i === 0 ? GOOD : segments[i - 1].color} stroke="var(--bg-card)" strokeWidth="2" />
                          ))}
                        </svg>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10.5, color: 'var(--muted)' }}>
                          {DAY_LABELS.map((d, i) => <span key={i}>{d}</span>)}
                        </div>
                      </>
                    )
                  })()}
                </div>

                <div className="dash-panel">
                  <div className="dash-panel-head"><div className="dash-panel-title">Patient Status</div></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <div className="dash-donut-box">
                      <div style={{
                        width: '100%', height: '100%', borderRadius: '50%',
                        background: patients.length === 0
                          ? 'conic-gradient(var(--line-soft) 0% 100%)'
                          : `conic-gradient(var(--teal) 0% ${100 - (inReviewCount / patients.length * 100)}%, var(--gold) ${100 - (inReviewCount / patients.length * 100)}% 100%)`
                      }} />
                      <div className="dash-donut-center" style={{ background: 'radial-gradient(circle, var(--bg-card) 60%, transparent 61%)' }}>
                        <b>{patients.length}</b><span>Total</span>
                      </div>
                    </div>
                    <ul className="dash-legend" style={{ flex: 1 }}>
                      <li><span className="dash-legend-name"><span className="dash-legend-dot" style={{ background: 'var(--teal)' }} />Stable</span><span className="dash-legend-val">{patients.length - inReviewCount}</span></li>
                      <li><span className="dash-legend-name"><span className="dash-legend-dot" style={{ background: 'var(--gold)' }} />In Review</span><span className="dash-legend-val">{inReviewCount}</span></li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="dash-row dash-row-3">
                <div className="dash-panel">
                  <div className="dash-panel-head"><div className="dash-panel-title" style={{ fontSize: 14.5 }}>Recent Patients</div></div>
                  {patients.slice(0, 4).map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 13 }}>
                      <span>{p.full_name}</span>
                      <span style={{ color: p.status === 'stable' ? 'var(--teal)' : 'var(--gold)', fontWeight: 700, fontSize: 11.5 }}>
                        {p.status === 'stable' ? 'Stable' : 'In Review'}
                      </span>
                    </div>
                  ))}
                  {patients.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12.5, padding: '10px 0' }}>No patients yet</div>}
                </div>

                <div className="dash-panel">
                  <div className="dash-panel-head"><div className="dash-panel-title" style={{ fontSize: 14.5 }}>Billing Summary</div></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                        <span style={{ color: 'var(--muted)' }}>Collected</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>{formatMoney(revenueCollected)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                        <span style={{ color: 'var(--muted)' }}>Outstanding</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>{formatMoney(revenueOutstanding)}</span>
                      </div>
                    </div>
                    <div className="dash-bar-track">
                      <div className="dash-bar-fill" style={{
                        width: (revenueCollected + revenueOutstanding) > 0
                          ? `${(revenueCollected / (revenueCollected + revenueOutstanding)) * 100}%`
                          : '0%'
                      }} />
                    </div>
                    <div className="dash-qa-item" style={{ marginTop: 2 }} onClick={() => setTab('billing')}>
                      <div className="dash-qa-label" style={{ color: 'var(--teal)' }}>View all invoices →</div>
                    </div>
                  </div>
                </div>

                <div className="dash-panel">
                  <div className="dash-panel-head"><div className="dash-panel-title" style={{ fontSize: 14.5 }}>Quick Actions</div></div>
                  <div className="dash-qa-grid">
                    <div className="dash-qa-item" onClick={() => { setTab('patients'); setTimeout(() => setShowModal(true), 100) }}>
                      <div className="dash-qa-icon" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="7" r="3.5"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><path d="M18 8v6M15 11h6"/></svg>
                      </div>
                      <div className="dash-qa-label">New Patient</div>
                    </div>
                    <div className="dash-qa-item" onClick={() => setTab('appointments')}>
                      <div className="dash-qa-icon" style={{ background: 'rgba(139,124,246,0.14)', color: 'var(--violet)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M12 13v5M9.5 15.5h5"/></svg>
                      </div>
                      <div className="dash-qa-label">New Appointment</div>
                    </div>
                    <div className="dash-qa-item" onClick={() => setTab('billing')}>
                      <div className="dash-qa-icon" style={{ background: 'rgba(201,169,97,0.14)', color: 'var(--gold)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>
                      </div>
                      <div className="dash-qa-label">New Invoice</div>
                    </div>
                    <div className="dash-qa-item" onClick={() => setTab('staff')}>
                      <div className="dash-qa-icon" style={{ background: 'rgba(76,141,255,0.14)', color: 'var(--blue)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="7" r="3.5"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/></svg>
                      </div>
                      <div className="dash-qa-label">Manage Staff</div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'patients' && (
            <div className="dash-panel">
              <div className="dash-panel-head">
                <div>
                  <div className="dash-panel-title">All Patients</div>
                  <div className="dash-panel-sub">Only {hospital?.name || 'your hospital'} can see this list</div>
                </div>
                <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Add Patient</button>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
              ) : displayedPatients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No patients yet. Add your first one above.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Name', 'Age', 'Status', ''].map(h => (
                        <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedPatients.map(p => (
                      <tr key={p.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                        <td
                          onClick={() => setProfilePatientId(p.id)}
                          style={{ padding: 12, fontWeight: 700, cursor: 'pointer' }}
                          title="Click to open this patient's dashboard"
                        >
                          {p.full_name}
                        </td>
                        <td style={{ padding: 12 }}>{p.age}</td>
                        <td style={{ padding: 12 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                            background: p.status === 'stable' ? 'var(--teal-soft)' : 'rgba(201,169,97,0.14)',
                            color: p.status === 'stable' ? 'var(--teal)' : 'var(--gold)',
                          }}>
                            {p.status === 'stable' ? 'Stable' : 'In Review'}
                          </span>
                        </td>
                        <td style={{ padding: 12 }}>
                          <button
                            onClick={() => handleDelete(p)}
                            style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}
                            title="Delete"
                          >✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'billing' && <Billing />}

          {tab === 'staff' && <Staff />}

          {tab === 'appointments' && <Appointments />}

          {tab === 'pharmacy' && <Pharmacy />}

          {tab === 'laboratory' && <Laboratory />}

          {tab === 'nursing' && <Nursing />}

          {tab === 'doctor' && <DoctorWorkbench />}

          {tab === 'radiology' && <Radiology />}

          {tab === 'insurance' && <Insurance />}

          {tab === 'inventory' && <Inventory />}

          {tab === 'reports' && <Reports />}

          {tab === 'notifications' && <Notifications />}

          {tab === 'ipd' && <IPD />}
          
          {tab === 'reception' && <Reception />}

          {tab === 'settings' && <Settings />}
        </div>
      </main>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>Register Patient</div>
            <form onSubmit={handleAdd}>
              <div className="field">
                <label>Full Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chinedu Okafor" />
              </div>
              <div className="field">
                <label>Age</label>
                <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 34" />
              </div>
              <div className="field">
                <label>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="stable">Stable</option>
                  <option value="review">In Review</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Patient'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pending ? (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--danger)', color: 'var(--ivory)',
          padding: '12px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 60,
          display: 'flex', alignItems: 'center', gap: 14, maxWidth: '90vw',
        }}>
          <span>{pending.patient.full_name} removed ({pending.secondsLeft}s)</span>
          <button
            onClick={handleUndo}
            style={{ background: 'var(--teal)', color: '#00251F', border: 'none', borderRadius: 7, padding: '6px 12px', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', flexShrink: 0 }}
          >Undo</button>
        </div>
      ) : toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)',
          padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60, maxWidth: '85vw', textAlign: 'center',
        }}>
          {toast}
        </div>
      )}

      {profilePatientId && (
        <PatientProfile patientId={profilePatientId} onClose={() => setProfilePatientId(null)} />
      )}
    </div>
  )
}
