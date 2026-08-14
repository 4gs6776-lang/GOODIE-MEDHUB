import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
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

const COMMON_ACCESS = ['overview', 'roster', 'notifications', 'settings']

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
    building: <><path d="M4 21V5l8-3 8 3v16"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/></>,
    arrowUp: <><path d="m6 15 6-6 6 6"/></>,
    arrowDown: <><path d="m6 9 6 6 6-6"/></>,
    phone: <><path d="M6 3h3l2 5-2 2a14 14 0 0 0 5 5l2-2 5 2v3c0 1-1 2-2 2C10 20 4 14 4 5c0-1 1-2 2-2Z"/></>,
  }
  return <svg {...common}>{paths[name] || paths.home}</svg>
}

export default function Dashboard(){
  const { profile, hospital, signOut } = useAuth()

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

  const [activeMenu, setActiveMenu] = useState(null)
  const headerMenuRef = useRef(null)

  const { records: patients, isOnline } = useOfflineTable('patients', hospital?.id)

  const [profilePatientId, setProfilePatientId] = useState(null)
  const [toast, setToast] = useState(null)

  // Live Stats State
  const [todayApptCount, setTodayApptCount] = useState(0)
  const [upcomingApptCount, setUpcomingApptCount] = useState(0)
  const [todayRevenue, setTodayRevenue] = useState(0)
  const [pendingBillsCount, setPendingBillsCount] = useState(0)
  const [pendingBillsAmount, setPendingBillsAmount] = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [pendingLabCount, setPendingLabCount] = useState(0)
  const [appointments, setAppointments] = useState([])
  const [deptStats, setDeptStats] = useState({ Outpatient: 0, Emergency: 0, Laboratory: 0, Pharmacy: 0, Radiology: 0, IPD: 0 })
  const [search, setSearch] = useState('')

  useEffect(() => subscribeSyncErrors(setSyncErrors), [])
  useEffect(() => {
    if (allowedKeys && !allowedKeys.includes(tab)) setTab('overview')
  }, [allowedKeys, tab])

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

  // Real Database Queries for Overview Dashboard
  const loadOverviewSummary = useCallback(async () => {
    if (!hospital?.id) return

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()

    // 1. Appointments Data
    const { data: apptData } = await supabase
      .from('appointments')
      .select('*')
      .eq('hospital_id', hospital.id)

    if (apptData) {
      setAppointments(apptData)
      const todayCount = apptData.filter(a => {
        const time = new Date(a.appointment_time || a.created_at)
        return time >= new Date(todayStart) && time <= new Date(todayEnd)
      }).length
      const upcomingCount = apptData.filter(a => new Date(a.appointment_time) > now && a.status === 'scheduled').length

      setTodayApptCount(todayCount)
      setUpcomingApptCount(upcomingCount)
    }

    // 2. Billing / Invoices Real Calculations
    const { data: invData } = await supabase
      .from('invoices')
      .select('amount, status, created_at, paid_amount')
      .eq('hospital_id', hospital.id)

    if (invData) {
      // Revenue Collected Today
      const todayRev = invData
        .filter(i => (i.status === 'paid' || i.status === 'partially_paid') && new Date(i.created_at) >= new Date(todayStart))
        .reduce((sum, i) => sum + Number(i.paid_amount || i.amount || 0), 0)

      // Unpaid Bills
      const pendingInvoices = invData.filter(i => i.status === 'unpaid' || i.status === 'partially_paid')
      const pendingSum = pendingInvoices.reduce((sum, i) => sum + (Number(i.amount || 0) - Number(i.paid_amount || 0)), 0)

      setTodayRevenue(todayRev)
      setPendingBillsCount(pendingInvoices.length)
      setPendingBillsAmount(pendingSum)
    }

    // 3. Low Stock Inventory & Lab Requests
    const { count: lowStock } = await supabase
      .from('inventory')
      .select('*', { count: 'exact', head: true })
      .eq('hospital_id', hospital.id)
      .lt('quantity', 10)

    setLowStockCount(lowStock || 0)

    const { count: pendingLabs } = await supabase
      .from('lab_requests')
      .select('*', { count: 'exact', head: true })
      .eq('hospital_id', hospital.id)
      .eq('status', 'pending')

    setPendingLabCount(pendingLabs || 0)

    // 4. Department Counts Breakdown based on actual patients/records
    if (patients && patients.length > 0) {
      const counts = { Outpatient: 0, Emergency: 0, Laboratory: 0, Pharmacy: 0, Radiology: 0, IPD: 0 }
      patients.forEach(p => {
        const dept = p.department || 'Outpatient'
        if (counts[dept] !== undefined) counts[dept] += 1
        else counts.Outpatient += 1
      })
      setDeptStats(counts)
    }
  }, [hospital?.id, patients])

  useEffect(() => {
    loadOverviewSummary()
  }, [loadOverviewSummary])

  function formatMoney(n){
    return '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 })
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

          {/* Top Bar Notifications & Popovers */}
          <div className="dash-top-actions" ref={headerMenuRef} style={{ position: 'relative' }}>
            <button 
              className="dash-icon-btn" 
              title="Toggle Theme" 
              onClick={() => document.body.classList.toggle('light-mode')}
            >
              <Icon name="moon" size={18}/>
            </button>

            {/* Notifications Menu */}
            <div style={{ position: 'relative' }}>
              <button 
                className="dash-icon-btn dash-notify" 
                title="Notifications"
                onClick={() => setActiveMenu(activeMenu === 'notifs' ? null : 'notifs')}
              >
                <Icon name="bell" size={18}/>
                {lowStockCount + pendingLabCount > 0 && <span>{lowStockCount + pendingLabCount}</span>}
              </button>

              {activeMenu === 'notifs' && (
                <div className="dash-popover-menu">
                  <div className="dash-popover-header">System Alerts</div>
                  <div className="dash-popover-body">
                    {lowStockCount > 0 && (
                      <div className="dash-popover-item">⚠️ <strong>{lowStockCount} inventory items</strong> are low on stock.</div>
                    )}
                    {pendingLabCount > 0 && (
                      <div className="dash-popover-item">🔬 <strong>{pendingLabCount} laboratory tests</strong> pending processing.</div>
                    )}
                    {lowStockCount === 0 && pendingLabCount === 0 && (
                      <div className="dash-popover-item">All systems normal. No alerts.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Messages / Pending Tasks */}
            <div style={{ position: 'relative' }}>
              <button 
                className="dash-icon-btn dash-notify dash-message" 
                title="Pending Tasks"
                onClick={() => setActiveMenu(activeMenu === 'messages' ? null : 'messages')}
              >
                <Icon name="billing" size={18}/>
                {pendingBillsCount > 0 && <span>{pendingBillsCount}</span>}
              </button>

              {activeMenu === 'messages' && (
                <div className="dash-popover-menu">
                  <div className="dash-popover-header">Pending Billing Tasks</div>
                  <div className="dash-popover-body">
                    {pendingBillsCount > 0 ? (
                      <div className="dash-popover-item">💳 <strong>{pendingBillsCount} unpaid invoices</strong> outstanding ({formatMoney(pendingBillsAmount)}).</div>
                    ) : (
                      <div className="dash-popover-item">No pending invoice actions.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="dash-hospital-selector">
              <Icon name="building" size={17}/>
              <span>{hospital?.name || 'Hallel Hospital'}</span>
            </div>
          </div>
        </header>

        <div className="dash-content">
          {tab === 'overview' && (
            <>
              <section className="dash-welcome">
                <div>
                  <h1>Welcome back, {profile?.full_name ? `${profile.full_name}` : 'Doctor'} <span>👋</span></h1>
                  <p>Here is your live real-time dashboard status for {hospital?.name || 'your hospital'}.</p>
                </div>
                <div className="dash-date-card">
                  <Icon name="calendar" size={18}/>
                  <div>
                    <strong>{new Date().toLocaleDateString('en-NG',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</strong>
                    <span>{new Date().toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                </div>
              </section>

              {/* REAL STAT CARDS */}
              <section className="dash-stats premium-stats">
                <div className="dash-stat-card premium-stat teal-stat">
                  <div className="dash-stat-top">
                    <div className="dash-stat-icon"><Icon name="users" size={20}/></div>
                  </div>
                  <div className="dash-stat-label">Total Patients</div>
                  <div className="dash-stat-value">{patients.length.toLocaleString()}</div>
                  <div className="dash-stat-delta positive"><Icon name="arrowUp" size={12}/> Live database count</div>
                </div>

                <div className="dash-stat-card premium-stat violet-stat">
                  <div className="dash-stat-top">
                    <div className="dash-stat-icon"><Icon name="calendar" size={20}/></div>
                  </div>
                  <div className="dash-stat-label">Appointments Today</div>
                  <div className="dash-stat-value">{todayApptCount}</div>
                  <div className="dash-stat-delta positive"><Icon name="arrowUp" size={12}/> {upcomingApptCount} upcoming scheduled</div>
                </div>

                <div className="dash-stat-card premium-stat gold-stat">
                  <div className="dash-stat-top">
                    <div className="dash-stat-icon money-icon">₦</div>
                  </div>
                  <div className="dash-stat-label">Today's Revenue</div>
                  <div className="dash-stat-value">{formatMoney(todayRevenue)}</div>
                  <div className="dash-stat-delta positive"><Icon name="arrowUp" size={12}/> Real-time payments today</div>
                </div>

                <div className="dash-stat-card premium-stat red-stat">
                  <div className="dash-stat-top">
                    <div className="dash-stat-icon"><Icon name="billing" size={20}/></div>
                  </div>
                  <div className="dash-stat-label">Pending Invoices</div>
                  <div className="dash-stat-value">{pendingBillsCount}</div>
                  <div className="dash-stat-delta negative"><Icon name="arrowDown" size={12}/> {formatMoney(pendingBillsAmount)} outstanding</div>
                </div>
              </section>

              <section className="dash-main-grid">
                {/* Real Department Activity Breakdown */}
                <div className="dash-panel dash-department">
                  <div className="dash-panel-head">
                    <div className="dash-panel-title">Patient Department Distribution</div>
                  </div>
                  <div className="dash-dept-content">
                    <div className="dash-dept-list" style={{ width: '100%' }}>
                      {[
                        ['Outpatient', '#00C7C7', deptStats.Outpatient],
                        ['Emergency', '#E8B82E', deptStats.Emergency],
                        ['Laboratory', '#3B82F6', deptStats.Laboratory],
                        ['Pharmacy', '#7657E8', deptStats.Pharmacy],
                        ['Radiology', '#2E7D75', deptStats.Radiology],
                        ['IPD / Ward', '#6A8F91', deptStats.IPD],
                      ].map(([label, color, count]) => (
                        <div className="dash-dept-row" key={label}>
                          <span><i style={{ background: color, display:'inline-block', width:10, height:10, borderRadius:'50%', marginRight:8 }}/>{label}</span>
                          <b>{count} patients</b>
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
                      <div className="dash-empty-state" style={{ padding: '20px', textStyle: 'muted' }}>No upcoming appointments found</div>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}

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
    </div>
  )
}
