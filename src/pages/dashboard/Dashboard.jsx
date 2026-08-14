import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import Billing from './Billing'
import Staff from './Staff'
import Appointments from './Appointments'
import { useOfflineTable, getAllSyncErrors, subscribeSyncErrors, flushTableQueue } from '../../lib/useOfflineTable';
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
import DutyRoster from './DutyRoster'
import IPD from './IPD'
import Admissions from './Admissions'
import Reception from './Reception'
import PatientProfile from '../../components/PatientProfile'

const NAV_ITEMS = [
  { key: 'overview', label: 'Dashboard', section: 'Main', icon: 'home' },
  { key: 'appointments', label: 'Appointments', section: 'Main', icon: 'calendar' },
  { key: 'patients', label: 'Patients', section: 'Main', icon: 'users' },
  { key: 'reception', label: 'Reception', section: 'Main', icon: 'reception' },
  { key: 'billing', label: 'Billing & Invoices', section: 'Main', icon: 'billing' },
  { key: 'laboratory', label: 'Laboratory', section: 'Main', icon: 'lab' },
  { key: 'pharmacy', label: 'Pharmacy', section: 'Main', icon: 'pharmacy' },
  { key: 'radiology', label: 'Radiology', section: 'Main', icon: 'radiology' },
  { key: 'inventory', label: 'Inventory', section: 'Main', icon: 'inventory' },
  { key: 'staff', label: 'Staff', section: 'Operations', icon: 'users' },
  { key: 'doctor', label: 'Doctor Workbench', section: 'Operations', icon: 'doctor' },
  { key: 'nursing', label: 'Nursing / Triage', section: 'Operations', icon: 'nurse' },
  { key: 'ipd', label: 'IPD Management', section: 'Operations', icon: 'bed' },
  { key: 'admissions', label: 'Admissions', section: 'Operations', icon: 'bed' },
  { key: 'insurance', label: 'Insurance / HMO', section: 'Operations', icon: 'insurance' },
  { key: 'reports', label: 'Reports', section: 'Operations', icon: 'reports' },
  { key: 'notifications', label: 'Reminders', section: 'Operations', icon: 'bell' },
  { key: 'roster', label: 'Duty Roster', section: 'Operations', icon: 'calendar' },
  { key: 'settings', label: 'Settings', section: 'Operations', icon: 'settings' },
]

const PAGE_TITLES = {
  overview: 'Dashboard',
  patients: 'Patient Management',
  appointments: 'Appointments',
  billing: 'Billing & Invoices',
  staff: 'Staff',
  pharmacy: 'Pharmacy',
  laboratory: 'Laboratory',
  nursing: 'Nursing / Triage',
  doctor: 'Doctor Workbench',
  radiology: 'Radiology',
  insurance: 'Insurance / HMO Claims',
  inventory: 'Inventory & Supplies',
  reports: 'Reports & Analytics',
  notifications: 'Reminders & Alerts',
  settings: 'Settings',
  ipd: 'IPD Management',
  reception: 'Reception',
  admissions: 'Admissions',
  roster: 'Duty Roster',
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Every role can always reach these, regardless of department.
const COMMON_ACCESS = ['overview', 'roster', 'notifications', 'settings']

// Which modules each department can see. Admin/owner always see everything
const ROLE_ACCESS = {
  doctor: [...COMMON_ACCESS, 'patients', 'appointments', 'doctor', 'ipd', 'admissions'],
  nurse: [...COMMON_ACCESS, 'patients', 'appointments', 'nursing', 'ipd', 'admissions'],
  front_desk: [...COMMON_ACCESS, 'patients', 'reception', 'appointments', 'insurance', 'admissions'],
  pharmacist: [...COMMON_ACCESS, 'patients', 'pharmacy', 'inventory'],
  lab: [...COMMON_ACCESS, 'patients', 'laboratory', 'radiology'],
  billing: [...COMMON_ACCESS, 'patients', 'billing', 'insurance'],
}
const FULL_ACCESS_ROLES = ['admin', 'owner']
const ROLE_LABELS = { admin: 'Admin', owner: 'Owner', doctor: 'Doctor', nurse: 'Nurse', front_desk: 'Front Desk', pharmacist: 'Pharmacist', lab: 'Laboratory', billing: 'Billing', staff: 'Staff' }

const SHIFT_STYLE = {
  M: { background: 'rgba(201,169,97,0.16)', color: 'var(--gold)' },
  N: { background: 'rgba(76,141,255,0.16)', color: 'var(--blue)' },
  OFF: { background: 'rgba(255,255,255,0.04)', color: 'var(--muted)' },
  LEAVE: { background: 'rgba(225,104,94,0.12)', color: 'var(--danger)' },
  'ON CALL': { background: 'rgba(139,124,246,0.14)', color: 'var(--violet)' },
  TRAINING: { background: 'var(--teal-soft)', color: 'var(--teal)' },
}

function Icon({ name, size = 18, strokeWidth = 1.8 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const paths = {
    home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 9h18"/></>,
    users: <><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.6 3-6.5 7-6.5s7 2.9 7 6.5"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6.2M18 14c2.4.8 4 2.9 4 6"/></>,
    reception: <><path d="M4 11h16v9H4z"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><path d="M9 15h6"/></>,
    billing: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></>,
    lab: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M8 15h8"/></>,
    pharmacy: <><path d="M4 8h16v12H4z"/><path d="M8 8V5h8v3M12 11v6M9 14h6"/></>,
    radiology: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v5M5 16l5-2M19 16l-5-2"/></>,
    inventory: <><path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/></>,
    doctor: <><circle cx="12" cy="7" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/><path d="M18 10v4M16 12h4"/></>,
    nurse: <><circle cx="12" cy="7" r="3"/><path d="M5 21a7 7 0 0 1 14 0"/><path d="M12 13v5M9.5 15.5h5"/></>,
    bed: <><path d="M3 18v-8M3 15h18v6M6 15V9a2 2 0 0 1 2-2h4a3 3 0 0 1 3 3v5M15 15V9h3a3 3 0 0 1 3 3v3"/></>,
    insurance: <><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-4"/></>,
    reports: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/><path d="M3 6h4M13 3h4M19 10h3"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V20h-2.6v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6v-2.6h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V5h2.6v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v2.6h-.1a1.7 1.7 0 0 0-1.6 1Z"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    moon: <path d="M20.5 15.5A8 8 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrowUp: <><path d="m6 15 6-6 6 6"/></>,
    arrowDown: <><path d="m6 9 6 6 6-6"/></>,
    building: <><path d="M4 21V5l8-3 8 3v16"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    phone: <><path d="M6 3h3l2 5-2 2a14 14 0 0 0 5 5l2-2 5 2v3c0 1-1 2-2 2C10 20 4 14 4 5c0-1 1-2 2-2Z"/></>,
  }
  return <svg {...common}>{paths[name] || paths.home}</svg>
}

export default function Dashboard(){
  const { profile, hospital, signOut } = useAuth()

  // null = full access (admin/owner); otherwise an array of allowed nav keys.
  const allowedKeys = useMemo(() => {
    if (FULL_ACCESS_ROLES.includes(profile?.role)) return null
    return ROLE_ACCESS[profile?.role] || COMMON_ACCESS
  }, [profile?.role])
  const visibleNavItems = allowedKeys ? NAV_ITEMS.filter(item => allowedKeys.includes(item.key)) : NAV_ITEMS

  const [tab, setTab] = useState('overview')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [syncErrors, setSyncErrors] = useState(() => getAllSyncErrors())
  const [syncPanelOpen, setSyncPanelOpen] = useState(false)
  const [syncActionBusy, setSyncActionBusy] = useState(false)

  // Top header popover states
  const [activeMenu, setActiveMenu] = useState(null) // 'notifs' | 'messages' | null
  const headerMenuRef = useRef(null)

  const { records: patients, loading, isOnline, pendingCount, addRecord, deleteRecord } = useOfflineTable('patients', hospital?.id)

  const [profilePatientId, setProfilePatientId] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [status, setStatus] = useState('stable')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const [todayApptCount, setTodayApptCount] = useState(0)
  const [upcomingApptCount, setUpcomingApptCount] = useState(0)
  const [revenueCollected, setRevenueCollected] = useState(0)
  const [revenueOutstanding, setRevenueOutstanding] = useState(0)
  const [weeklyCounts, setWeeklyCounts] = useState([0,0,0,0,0,0,0])
  const [appointments, setAppointments] = useState([])
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState(null)
  const pendingTimeoutRef = useRef(null)
  const pendingIntervalRef = useRef(null)

  const [todayDuty, setTodayDuty] = useState([])
  const [loadingDuty, setLoadingDuty] = useState(true)

  useEffect(() => computeWeeklyCounts(patients), [patients])
  useEffect(() => subscribeSyncErrors(setSyncErrors), [])
  useEffect(() => {
    if (allowedKeys && !allowedKeys.includes(tab)) setTab('overview')
  }, [allowedKeys, tab])

  // Close top header popovers when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target)) {
        setActiveMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
    const counts = [0,0,0,0,0,0,0]
    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(now.getDate() - 6)
    sevenDaysAgo.setHours(0,0,0,0)

    patientList.forEach(p => {
      const created = new Date(p.created_at)
      if (!Number.isNaN(created.getTime()) && created >= sevenDaysAgo) counts[created.getDay()] += 1
    })
    setWeeklyCounts(counts)
  }

  async function loadOverviewSummary(){
    const now = new Date()
    const todayStr = now.toDateString()

    const { data: apptData } = await supabase.from('appointments').select('*')
    if (apptData) {
      setAppointments(apptData)
      setTodayApptCount(apptData.filter(a => new Date(a.appointment_time).toDateString() === todayStr).length)
      setUpcomingApptCount(apptData.filter(a => new Date(a.appointment_time) > now && a.status === 'scheduled').length)
    }

    const { data: invData } = await supabase.from('invoices').select('amount, status')
    if (invData) {
      setRevenueCollected(invData.filter(i => i.status === 'paid').reduce((sum,i) => sum + Number(i.amount || 0),0))
      setRevenueOutstanding(invData.filter(i => i.status === 'unpaid').reduce((sum,i) => sum + Number(i.amount || 0),0))
    }
  }

  async function loadTodayDuty(){
    if (!hospital?.id) return
    setLoadingDuty(true)
    try {
      const now = new Date()
      const month = now.getMonth() + 1
      const year = now.getFullYear()
      const todayKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')

      const { data: roster } = await supabase
        .from('rosters')
        .select('id')
        .eq('hospital_id', hospital.id)
        .eq('month', month)
        .eq('year', year)
        .is('department', null)
        .maybeSingle()

      if (!roster) { setTodayDuty([]); return }

      const { data: entries } = await supabase
        .from('roster_entries')
        .select('staff_id, shift_code')
        .eq('roster_id', roster.id)
        .eq('roster_date', todayKey)

      if (!entries || entries.length === 0) { setTodayDuty([]); return }

      const staffIds = entries.map(e => e.staff_id)
      const { data: staffData } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('id', staffIds)

      const combined = entries
        .map(e => {
          const staffMember = (staffData || []).find(s => s.id === e.staff_id)
          return staffMember ? { name: staffMember.full_name, role: staffMember.role, shift: e.shift_code } : null
        })
        .filter(Boolean)
        .filter(e => e.shift && e.shift !== 'OFF')

      setTodayDuty(combined)
    } catch {
      setTodayDuty([])
    } finally {
      setLoadingDuty(false)
    }
  }

  useEffect(() => {
    if (hospital?.id) {
      loadOverviewSummary()
      loadTodayDuty()
    }
  }, [hospital?.id])

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
      await addRecord({
        full_name:name,
        age:parseInt(age,10),
        status,
        created_by:profile.id
      })
      setShowModal(false)
      setName('')
      setAge('')
      setStatus('stable')
      showToast(isOnline ? `${name} added` : `${name} added — will sync when back online`)
    } catch(err){
      showToast(err.message || 'Could not save patient')
    } finally {
      setSaving(false)
    }
  }

  function handleDelete(patient){
    if (pending) commitPendingDelete(pending.patient)
    let secondsLeft = 5
    setPending({patient,secondsLeft})
    pendingIntervalRef.current = setInterval(() => {
      secondsLeft -= 1
      setPending(prev => prev ? {...prev,secondsLeft} : prev)
      if(secondsLeft <= 0) clearInterval(pendingIntervalRef.current)
    },1000)
    pendingTimeoutRef.current = setTimeout(() => commitPendingDelete(patient),5000)
  }

  async function commitPendingDelete(patient){
    clearTimeout(pendingTimeoutRef.current)
    clearInterval(pendingIntervalRef.current)
    setPending(null)
    await deleteRecord(patient.id)
  }

  function handleUndo(){
    if(!pending) return
    clearTimeout(pendingTimeoutRef.current)
    clearInterval(pendingIntervalRef.current)
    setPending(null)
    showToast(`${pending.patient.full_name} restored`)
  }

  const displayedPatients = pending ? patients.filter(p => p.id !== pending.patient.id) : patients

  function formatMoney(n){
    return '₦' + Number(n || 0).toLocaleString('en-NG',{minimumFractionDigits:0})
  }

  function appointmentName(a){
    return a.patient_name || a.patient || a.full_name || a.name || 'Patient'
  }

  function appointmentReason(a){
    return a.department || a.reason || a.type || a.service || 'General Consultation'
  }

  const upcoming = appointments
    .filter(a => {
      const d = new Date(a.appointment_time)
      return !Number.isNaN(d.getTime()) && d >= new Date()
    })
    .sort((a,b) => new Date(a.appointment_time) - new Date(b.appointment_time))
    .slice(0,5)

  if(profile?.role === 'owner'){
    window.location.href = '/owner'
    return null
  }

  if(profile && profile.active === false){
    return (
      <div className="dash-account-state">
        <div className="card">
          <div className="dash-state-title">Account deactivated</div>
          <div className="dash-state-text">
            Your access has been deactivated by an administrator at {hospital?.name || 'your hospital'}. Contact them if you believe this is a mistake.
          </div>
          <button className="btn btn-ghost" onClick={signOut}>Sign Out</button>
        </div>
      </div>
    )
  }

  if(hospital && hospital.status !== 'active'){
    return (
      <div className="dash-account-state">
        <div className="card">
          <div className="dash-state-title">
            {hospital.status === 'pending' ? 'Account pending approval' : 'Account suspended'}
          </div>
          <div className="dash-state-text">
            {hospital.status === 'pending'
              ? "Your hospital's account is being reviewed. You'll be able to log in fully once it's approved."
              : 'Please contact the platform administrator for help.'}
          </div>
          <button className="btn btn-ghost" onClick={signOut}>Sign Out</button>
        </div>
      </div>
    )
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

        <nav className="dash-nav">
          {visibleNavItems.map((item,i) => {
            const showLabel = item.section !== currentSection
            currentSection = item.section
            return (
              <div key={i}>
                {showLabel && <div className="dash-nav-label">{item.section}</div>}
                <div
                  className={`dash-nav-item ${tab === item.key ? 'active' : ''}`}
                  onClick={() => { setTab(item.key); setDrawerOpen(false) }}
                >
                  <Icon name={item.icon} size={17}/>
                  <span>{item.label}</span>
                </div>
              </div>
            )
          })}
        </nav>

        <div className="dash-emergency">
          <div className="dash-emergency-head">
            <span>Master Goodnews</span>
            <Icon name="phone" size={15}/>
          </div>
          <strong>+2348148364233</strong>
          <small>The Builder</small>
        </div>

        <div className="dash-foot">
          <div className="dash-foot-user">
            <div className="dash-foot-avatar">
              {(profile?.full_name || 'D').charAt(0).toUpperCase()}
            </div>
            <div className="dash-foot-user-info">
              <div className="dash-foot-name">{profile?.full_name || 'Administrator'}</div>
              <div className="dash-foot-role">{ROLE_LABELS[profile?.role] || 'Staff'}</div>
            </div>
            <span className="dash-foot-chevron">⌄</span>
          </div>
          <button className="btn btn-ghost dash-signout" onClick={signOut}>Sign Out</button>
        </div>
      </aside>

      <main className="dash-main">
        {/* Top Header Bar */}
        <header className="dash-topbar">
          <div className="dash-burger" onClick={() => setDrawerOpen(true)}>
            <Icon name="menu" size={21}/>
          </div>

          <div className="dash-search">
            <Icon name="search" size={17}/>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search patients, invoices, appointments..."
            />
            <kbd>⌘ K</kbd>
          </div>

          {/* Interactive Actions Icons & Popovers */}
          <div className="dash-top-actions" ref={headerMenuRef} style={{ position: 'relative' }}>
            
            {/* 1. Theme Toggle */}
            <button 
              className="dash-icon-btn" 
              title="Toggle Theme" 
              onClick={() => document.body.classList.toggle('light-mode')}
            >
              <Icon name="moon" size={18}/>
            </button>

            {/* 2. Notifications Bell Popover */}
            <div style={{ position: 'relative' }}>
              <button 
                className="dash-icon-btn dash-notify" 
                title="Notifications"
                onClick={() => setActiveMenu(activeMenu === 'notifs' ? null : 'notifs')}
              >
                <Icon name="bell" size={18}/>
                <span>8</span>
              </button>

              {activeMenu === 'notifs' && (
                <div className="dash-popover-menu">
                  <div className="dash-popover-header">Notifications (8)</div>
                  <div className="dash-popover-body">
                    <div className="dash-popover-item">⚠️ <strong>8 inventory items</strong> are low on stock.</div>
                    <div className="dash-popover-item">📌 Lab results ready for Samuel O.</div>
                    <div className="dash-popover-item">📅 2 appointments scheduled for today.</div>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Messages / Tasks Document Popover */}
            <div style={{ position: 'relative' }}>
              <button 
                className="dash-icon-btn dash-notify dash-message" 
                title="Pending Documents & Tasks"
                onClick={() => setActiveMenu(activeMenu === 'messages' ? null : 'messages')}
              >
                <Icon name="billing" size={18}/>
                <span>4</span>
              </button>

              {activeMenu === 'messages' && (
                <div className="dash-popover-menu">
                  <div className="dash-popover-header">Pending Clinical Tasks (4)</div>
                  <div className="dash-popover-body">
                    <div className="dash-popover-item">📝 2 prescriptions pending approval</div>
                    <div className="dash-popover-item">💳 2 invoices waiting payment</div>
                  </div>
                </div>
              )}
            </div>

            <div className="dash-hospital-selector">
              <Icon name="building" size={17}/>
              <span>{hospital?.name || 'Hallel Hospital'}</span>
              <span className="dash-chevron">⌄</span>
            </div>
          </div>
        </header>

        <div className="dash-content">
          {stuckTables.length > 0 && (
            <div className="dash-sync-alert">
              <div>
                <strong>⚠ Sync needs attention</strong>
                <span>{stuckTables.length} table{stuckTables.length > 1 ? 's' : ''} has pending records.</span>
              </div>
              <button onClick={() => setSyncPanelOpen(v => !v)}>Review</button>
            </div>
          )}

          {syncPanelOpen && stuckTables.length > 0 && (
            <div className="dash-sync-panel">
              <div className="dash-panel-title">Sync queue</div>
              {stuckTables.map(err => (
                <div className="dash-sync-item" key={err.table}>
                  <div>
                    <strong>{err.table}</strong>
                    <small>{err.queueLength} item{err.queueLength === 1 ? '' : 's'} waiting</small>
                    <code>{err.message}</code>
                  </div>
                  <div>
                    <button className="btn btn-ghost" disabled={syncActionBusy} onClick={() => handleRetrySync(err.table)}>Retry</button>
                    <button className="btn btn-ghost dash-danger-btn" disabled={syncActionBusy} onClick={() => handleSkipStuck(err.table)}>Skip</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'overview' && (
            <>
              <section className="dash-welcome">
                <div>
                  <h1>Welcome back, {profile?.full_name ? `Dr. ${profile.full_name.replace(/^Dr\.\s*/i,'')}` : 'Doctor'} <span>👋</span></h1>
                  <p>Here's what's happening at {hospital?.name || 'your hospital'} today.</p>
                </div>
                <div className="dash-date-card">
                  <Icon name="calendar" size={18}/>
                  <div>
                    <strong>{new Date().toLocaleDateString('en-NG',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</strong>
                    <span>{new Date().toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                </div>
              </section>

              <section className="dash-stats premium-stats">
                <div className="dash-stat-card premium-stat teal-stat">
                  <div className="dash-stat-top">
                    <div className="dash-stat-icon"><Icon name="users" size={20}/></div>
                    <svg className="dash-mini-chart" viewBox="0 0 90 38"><path d="M2 28 C12 18 18 31 28 23 S40 6 50 22 S64 29 72 14 S82 19 88 12"/></svg>
                  </div>
                  <div className="dash-stat-label">Total Patients</div>
                  <div className="dash-stat-value">{patients.length.toLocaleString()}</div>
                  <div className="dash-stat-delta positive"><Icon name="arrowUp" size={12}/> Live patient count</div>
                </div>

                <div className="dash-stat-card premium-stat violet-stat">
                  <div className="dash-stat-top">
                    <div className="dash-stat-icon"><Icon name="calendar" size={20}/></div>
                    <svg className="dash-mini-chart" viewBox="0 0 90 38"><path d="M2 27 C12 22 15 10 25 18 S38 29 48 16 S61 8 70 22 S80 24 88 11"/></svg>
                  </div>
                  <div className="dash-stat-label">Appointments</div>
                  <div className="dash-stat-value">{todayApptCount}</div>
                  <div className="dash-stat-delta positive"><Icon name="arrowUp" size={12}/> {upcomingApptCount} upcoming</div>
                </div>

                <div className="dash-stat-card premium-stat gold-stat">
                  <div className="dash-stat-top">
                    <div className="dash-stat-icon money-icon">₦</div>
                    <svg className="dash-mini-chart" viewBox="0 0 90 38"><path d="M2 29 C10 27 16 30 24 21 S36 26 44 28 S54 7 64 22 S76 16 88 10"/></svg>
                  </div>
                  <div className="dash-stat-label">Today's Revenue</div>
                  <div className="dash-stat-value">{formatMoney(revenueCollected)}</div>
                  <div className="dash-stat-delta positive"><Icon name="arrowUp" size={12}/> Collected to date</div>
                </div>

                <div className="dash-stat-card premium-stat red-stat">
                  <div className="dash-stat-top">
                    <div className="dash-stat-icon"><Icon name="billing" size={20}/></div>
                    <svg className="dash-mini-chart" viewBox="0 0 90 38"><path d="M2 17 C13 12 20 22 30 18 S45 28 56 19 S72 25 88 12"/></svg>
                  </div>
                  <div className="dash-stat-label">Pending Bills</div>
                  <div className="dash-stat-value">{Math.max(0, Math.round(revenueOutstanding > 0 ? revenueOutstanding / 10000 : 0))}</div>
                  <div className="dash-stat-delta negative"><Icon name="arrowDown" size={12}/> {formatMoney(revenueOutstanding)} outstanding</div>
                </div>
              </section>

              <section className="dash-main-grid">
                <div className="dash-panel dash-patient-chart">
                  <div className="dash-panel-head">
                    <div>
                      <div className="dash-panel-title">Patient Overview</div>
                      <div className="dash-chart-legend">
                        <span><i className="legend-teal"/> New Patients</span>
                        <span><i className="legend-violet"/> Returning Patients</span>
                      </div>
                    </div>
                    <select className="dash-filter"><option>This Month</option><option>Last Month</option><option>This Year</option></select>
                  </div>
                  <div className="dash-large-chart">
                    <svg viewBox="0 0 620 250" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="tealArea" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#00C7C7" stopOpacity=".28"/>
                          <stop offset="100%" stopColor="#00C7C7" stopOpacity="0"/>
                        </linearGradient>
                        <linearGradient id="violetArea" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#7657E8" stopOpacity=".22"/>
                          <stop offset="100%" stopColor="#7657E8" stopOpacity="0"/>
                        </linearGradient>
                      </defs>
                      {[45,95,145,195].map(y => <line key={y} x1="0" x2="620" y1={y} y2={y} className="chart-grid-line"/>)}
                      <text x="4" y="48">80</text><text x="4" y="98">60</text><text x="4" y="148">40</text><text x="4" y="198">20</text><text x="7" y="237">0</text>
                      <path className="chart-area-teal" d="M35 180 C55 110 72 150 91 155 S122 128 140 137 S164 92 183 126 S210 95 230 152 S257 177 276 88 S302 105 319 123 S341 42 359 83 S385 57 405 122 S432 152 449 103 S474 126 492 94 S516 58 537 96 S567 78 610 106 L610 225 L35 225 Z"/>
                      <path className="chart-area-violet" d="M35 174 C55 104 72 143 91 154 S121 119 140 132 S165 106 183 139 S210 111 230 168 S255 176 276 148 S301 127 319 145 S341 126 359 140 S383 124 405 155 S432 169 449 144 S475 160 492 130 S516 144 537 126 S570 112 610 135 L610 225 L35 225 Z"/>
                      <path className="chart-line-teal" d="M35 180 C55 110 72 150 91 155 S122 128 140 137 S164 92 183 126 S210 95 230 152 S257 177 276 88 S302 105 319 123 S341 42 359 83 S385 57 405 122 S432 152 449 103 S474 126 492 94 S516 58 537 96 S567 78 610 106"/>
                      <path className="chart-line-violet" d="M35 174 C55 104 72 143 91 154 S121 119 140 132 S165 106 183 139 S210 111 230 168 S255 176 276 148 S301 127 319 145 S341 126 359 140 S383 124 405 155 S432 169 449 144 S475 160 492 130 S516 144 537 126 S570 112 610 135"/>
                    </svg>
                    <div className="chart-x-labels">{['Aug 1','Aug 5','Aug 10','Aug 15','Aug 20','Aug 25','Aug 30'].map(x => <span key={x}>{x}</span>)}</div>
                  </div>
                </div>

                <div className="dash-panel dash-department">
                  <div className="dash-panel-head">
                    <div className="dash-panel-title">Department Activity</div>
                  </div>
                  <div className="dash-dept-content">
                    <div className="dash-donut" style={{background:'conic-gradient(#7657E8 0 25%, #E8B82E 25% 41%, #3B82F6 41% 55%, #00C7C7 55% 67%, #2E7D75 67% 78%, #00A6A6 78% 100%)'}}>
                      <div><span>Total</span><strong>{Math.max(0, patients.length)}</strong></div>
                    </div>
                    <div className="dash-dept-list">
                      {[
                        ['Outpatient','#00C7C7',Math.round(patients.length*.25)],
                        ['Maternity','#7657E8',Math.round(patients.length*.21)],
                        ['Laboratory','#E8B82E',Math.round(patients.length*.16)],
                        ['Pharmacy','#3B82F6',Math.round(patients.length*.14)],
                        ['Radiology','#2E7D75',Math.round(patients.length*.12)],
                        ['Other','#6A8F91',Math.round(patients.length*.11)],
                      ].map(([label,color,count]) => (
                        <div className="dash-dept-row" key={label}>
                          <span><i style={{background:color}}/>{label}</span>
                          <b>{count}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="dash-panel dash-appointments">
                  <div className="dash-panel-head">
                    <div className="dash-panel-title">Upcoming Appointments</div>
                    <button className="dash-view-all" onClick={() => setTab('appointments')}>View all</button>
                  </div>
                  <div className="dash-appt-list">
                    {upcoming.length > 0 ? upcoming.map((a,i) => {
                      const d = new Date(a.appointment_time)
                      return (
                        <div className="dash-appt-row" key={a.id || i}>
                          <strong>{d.toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}</strong>
                          <div><b>{appointmentName(a)}</b><span>{appointmentReason(a)}</span></div>
                          <em className={a.status || 'scheduled'}>{a.status || 'Scheduled'}</em>
                        </div>
                      )
                    }) : (
                      <div className="dash-empty-state">No upcoming appointments recorded yet</div>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}

          {/* Other tab routing components */}
          {tab === 'appointments' && <Appointments />}
          {tab === 'patients' && <PatientProfile patientId={profilePatientId} onBack={() => setProfilePatientId(null)} />}
          {tab === 'reception' && <Reception />}
          {tab === 'billing' && <Billing />}
          {tab === 'laboratory' && <Laboratory />}
          {tab === 'pharmacy' && <Pharmacy />}
          {tab === 'radiology' && <Radiology />}
          {tab === 'inventory' && <Inventory />}
          {tab === 'staff' && <Staff />}
          {tab === 'doctor' && <DoctorWorkbench />}
          {tab === 'nursing' && <Nursing />}
          {tab === 'ipd' && <IPD />}
          {tab === 'admissions' && <Admissions />}
          {tab === 'insurance' && <Insurance />}
          {tab === 'reports' && <Reports />}
          {tab === 'notifications' && <Notifications />}
          {tab === 'roster' && <DutyRoster />}
          {tab === 'settings' && <Settings />}

        </div>
      </main>

      {/* Popover Menu Styling */}
      <style>{`
        .dash-popover-menu {
          position: absolute;
          top: 42px;
          right: 0;
          width: 280px;
          background: #0f172a;
          border: 1px solid #1f2937;
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
          z-index: 100;
          overflow: hidden;
        }
        .dash-popover-header {
          padding: 10px 14px;
          font-size: 12px;
          font-weight: 600;
          background: #1e293b;
          border-bottom: 1px solid #1f2937;
          color: #f3f4f6;
        }
        .dash-popover-body {
          max-height: 220px;
          overflow-y: auto;
        }
        .dash-popover-item {
          padding: 10px 14px;
          font-size: 12px;
          border-bottom: 1px solid #1f2937;
          color: #cbd5e1;
          line-height: 1.4;
        }
        .dash-popover-item:last-child {
          border-bottom: none;
        }
      `}</style>

    </div>
  )
}
