import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import Billing from './Billing'
import Staff from './Staff'
import Appointments from './Appointments'
import { useOfflineTable } from '../../lib/useOfflineTable'
import Pharmacy from './Pharmacy'
import Laboratory from './Laboratory'
import IPD from './IPD'
import Reception from './Reception'

const NAV_ITEMS = [
  { key: 'overview', label: 'Dashboard', section: 'Main' },
  { key: 'patients', label: 'Patient Management', section: 'Main' },
  { key: 'reception', label: 'Reception', section: 'Main' },
  { key: 'appointments', label: 'Appointments', section: 'Main' },
  { key: 'ipd', label: 'IPD Management', section: 'Main' },
  { key: 'billing', label: 'Billing & Invoices', section: 'Main' },
  { key: 'pharmacy', label: 'Pharmacy', section: 'Main' },
  { key: 'laboratory', label: 'Laboratory', section: 'Main' },
  { key: 'staff', label: 'Staff', section: 'Operations' },
  { key: 'soon', label: 'Reports', section: 'Operations' },
  { key: 'soon', label: 'Settings', section: 'Operations' },
]

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Dashboard(){
  const { profile, hospital, signOut } = useAuth()

  const [tab, setTab] = useState('overview')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { records: patients, loading, isOnline, pendingCount, addRecord, deleteRecord } = useOfflineTable('patients', hospital?.id)
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
            {{ overview: 'Dashboard', patients: 'Patient Management', appointments: 'Appointments', billing: 'Billing & Invoices', staff: 'Staff', pharmacy: 'Pharmacy', laboratory: 'Laboratory', ipd: 'IPD Management', reception: 'Reception' }[tab] || 'Dashboard'}
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
        </div>

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
                      import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import Billing from './Billing'
import Staff from './Staff'
import Appointments from './Appointments'
import { useOfflineTable } from '../../lib/useOfflineTable'
import Pharmacy from './Pharmacy'
import Laboratory from './Laboratory'
import IPD from './IPD'
import Reception from './Reception'

const NAV_ITEMS = [
  { key: 'overview', label: 'Dashboard', section: 'Main' },
  { key: 'patients', label: 'Patient Management', section: 'Main' },
  { key: 'reception', label: 'Reception', section: 'Main' },
  { key: 'appointments', label: 'Appointments', section: 'Main' },
  { key: 'ipd', label: 'IPD Management', section: 'Main' },
  { key: 'billing', label: 'Billing & Invoices', section: 'Main' },
  { key: 'pharmacy', label: 'Pharmacy', section: 'Main' },
  { key: 'laboratory', label: 'Laboratory', section: 'Main' },
  { key: 'staff', label: 'Staff', section: 'Operations' },
  { key: 'soon', label: 'Reports', section: 'Operations' },
  { key: 'soon', label: 'Settings', section: 'Operations' },
]

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Dashboard(){
  const { profile, hospital, signOut } = useAuth()

  const [tab, setTab] = useState('overview')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { records: patients, loading, isOnline, pendingCount, addRecord, deleteRecord } = useOfflineTable('patients', hospital?.id)
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
            {{ overview: 'Dashboard', patients: 'Patient Management', appointments: 'Appointments', billing: 'Billing & Invoices', staff: 'Staff', pharmacy: 'Pharmacy', laboratory: 'Laboratory', ipd: 'IPD Management', reception: 'Reception' }[tab] || 'Dashboard'}
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
        </div>

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
