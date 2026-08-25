import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import Billing from './Billing'
import Staff from './Staff'
import Appointments from './Appointments'
import {
  useOfflineTable,
  getAllSyncErrors,
  subscribeSyncErrors,
  retryTableQueue,
  skipStuckSyncItem,
} from '../../lib/useOfflineTable';
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
import Messages from './Messages'

// Same option lists used in Reception's registration form, kept in sync
// so a patient added here has the exact same fields/choices available.
const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown']
const GENOTYPES = ['AA','AS','SS','AC']
const MARITAL_STATUSES = ['Single','Married','Widow','Widower','Divorced']
const RELIGIONS = ['Christianity','Islam','Traditional','Other']
const CATEGORIES = [
  { value: 'personal', label: 'Personal Folder' },
  { value: 'family', label: 'Family Folder' },
  { value: 'emergency', label: 'Emergency Folder' },
  { value: 'anc', label: 'ANC Folder' },
]
const NIGERIAN_STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT (Abuja)',
  'Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara',
  'Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers',
  'Sokoto','Taraba','Yobe','Zamfara',
]
const AFRICAN_COUNTRIES = [
  'Algeria','Angola','Benin','Botswana','Burkina Faso','Burundi','Cabo Verde',
  'Cameroon','Central African Republic','Chad','Comoros','Congo (Republic)',
  'Congo (DRC)','Djibouti','Egypt','Equatorial Guinea','Eritrea','Eswatini',
  'Ethiopia','Gabon','Gambia','Ghana','Guinea','Guinea-Bissau','Ivory Coast',
  'Kenya','Lesotho','Liberia','Libya','Madagascar','Malawi','Mali',
  'Mauritania','Mauritius','Morocco','Mozambique','Namibia','Niger',
  'Nigeria','Rwanda','Sao Tome and Principe','Senegal','Seychelles',
  'Sierra Leone','Somalia','South Africa','South Sudan','Sudan','Tanzania',
  'Togo','Tunisia','Uganda','Zambia','Zimbabwe',
]

const EMPTY_PATIENT_FORM = {
  surname: '', otherNames: '', phone: '', email: '', gender: '', maritalStatus: '',
  dateOfBirth: '', age: '', bloodGroup: '', genotype: '', nationality: '', stateOfOrigin: '',
  occupation: '', religion: '', category: '', homeAddress: '', ancSpecialPoint: '',
  ancDateOfBooking: '', ancIndication: '', ancLmp: '', ancEdd: '', ancHusbandName: '',
  ancHusbandOccupation: '', ancEmployer: '', nokName: '', nokRelationship: '',
  nokPhone: '', nokAddress: '',
}

function calculatePatientAge(dobStr) {
  if (!dobStr) return ''
  const dob = new Date(dobStr)
  if (Number.isNaN(dob.getTime())) return ''
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
  return age >= 0 ? String(age) : ''
}

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
  { key: 'messages', label: 'Messages', section: 'Operations', icon: 'chat' },
  { key: 'settings', label: 'Settings', section: 'Operations', icon: 'settings' },
]

const PAGE_TITLES = {
  overview: 'Dashboard', patients: 'Patient Management', appointments: 'Appointments',
  billing: 'Billing & Invoices', staff: 'Staff', pharmacy: 'Pharmacy', laboratory: 'Laboratory',
  nursing: 'Nursing / Triage', doctor: 'Doctor Workbench', radiology: 'Radiology',
  insurance: 'Insurance / HMO Claims', inventory: 'Inventory & Supplies', reports: 'Reports & Analytics',
  notifications: 'Reminders & Alerts', settings: 'Settings', ipd: 'IPD Management',
  reception: 'Reception', admissions: 'Admissions', roster: 'Duty Roster', messages: 'Messages',
}

const COMMON_ACCESS = ['overview', 'roster', 'notifications', 'messages', 'settings']
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
    sun: <><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrowUp: <><path d="m6 15 6-6 6 6"/></>,
    arrowDown: <><path d="m6 9 6 6 6-6"/></>,
    building: <><path d="M4 21V5l8-3 8 3v16"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    phone: <><path d="M6 3h3l2 5-2 2a14 14 0 0 0 5 5l2-2 5 2v3c0 1-1 2-2 2C10 20 4 14 4 5c0-1 1-2 2-2Z"/></>,
    chat: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></>,
  }
  return <svg {...common}>{paths[name] || paths.home}</svg>
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let intervalId
    const msToNextSecond = 1000 - (Date.now() % 1000)
    const timeoutId = setTimeout(() => {
      setNow(new Date())
      intervalId = setInterval(() => setNow(new Date()), 1000)
    }, msToNextSecond)
    return () => {
      clearTimeout(timeoutId)
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  const timeFormatter = useMemo(() => new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }), [])
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Lagos', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), [])
  const timeStr = timeFormatter.format(now)
  const dateStr = dateFormatter.format(now)

  return (
    <div className="dash-live-clock" title="Nigeria Time (WAT, UTC+1)">
      <div className="dash-live-clock-icon"><Icon name="clock" size={15} /></div>
      <div className="dash-live-clock-text">
        <div className="dash-live-clock-time"><span key={timeStr} className="dash-clock-tick">{timeStr}</span></div>
        <div className="dash-live-clock-date">{dateStr}</div>
      </div>
    </div>
  )
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
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('gmedhub-theme') === 'light' ? 'light' : 'dark' } catch { return 'dark' }
  })

  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', theme === 'light')
    try { localStorage.setItem('gmedhub-theme', theme) } catch {}
  }, [theme])

  function toggleTheme(){ setTheme(current => current === 'light' ? 'dark' : 'light') }

  const [syncErrors, setSyncErrors] = useState([])
  const [syncPanelOpen, setSyncPanelOpen] = useState(false)
  const [syncActionBusy, setSyncActionBusy] = useState(false)

  const [activeMenu, setActiveMenu] = useState(null)
  const headerMenuRef = useRef(null)

  const { records: patients, loading, isOnline, pendingCount, addRecord, deleteRecord } = useOfflineTable('patients', hospital?.id)
  
  // NEW: Fetch patient vitals to determine who was attended today
  const { records: vitals } = useOfflineTable('patient_vitals', hospital?.id)

  const [profilePatientId, setProfilePatientId] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_PATIENT_FORM)
  const [status, setStatus] = useState('stable')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const [todayApptCount, setTodayApptCount] = useState(0)
  const [upcomingApptCount, setUpcomingApptCount] = useState(0)
  const [revenueCollected, setRevenueCollected] = useState(0)
  const [revenueOutstanding, setRevenueOutstanding] = useState(0)
  const [pendingBillCount, setPendingBillCount] = useState(0)
  const [invoicesList, setInvoicesList] = useState([])
  const [weeklyCounts, setWeeklyCounts] = useState([0,0,0,0,0,0,0])
  const [appointments, setAppointments] = useState([])
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState(null)
  const pendingTimeoutRef = useRef(null)
  const pendingIntervalRef = useRef(null)

  const [todayDuty, setTodayDuty] = useState([])
  const [loadingDuty, setLoadingDuty] = useState(true)

  const { records: inventoryItems } = useOfflineTable('inventory_items', hospital?.id)
  const { records: labTests } = useOfflineTable('lab_tests', hospital?.id)
  const { records: allMessages } = useOfflineTable('messages', hospital?.id)

  useEffect(() => computeWeeklyCounts(patients), [patients])
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

  const stuckTables = useMemo(() => {
    if (!Array.isArray(syncErrors)) return [];
    const groups = {};
    syncErrors.forEach(err => {
      const table = err.table_name || 'Unknown table';
      if (!groups[table]) {
        groups[table] = { table, queueLength: 0, message: err._syncErrorMessage || 'Unknown error' };
      }
      groups[table].queueLength += 1;
    });
    return Object.values(groups);
  }, [syncErrors])

  async function handleRetrySync(table){
    if (!hospital?.id) return
    setSyncActionBusy(true)
    try {
      await retryTableQueue(table)
      setSyncErrors(await getAllSyncErrors())
    } finally {
      setSyncActionBusy(false)
    }
  }

  async function handleSkipStuck(table){
    if (!hospital?.id) return
    if (!confirm(`Discard ALL stuck items for "${table}"?\n\nThese changes will NOT reach the database. The local copies stay on this device marked as discarded, and the rest of the queue can proceed.`)) return
    setSyncActionBusy(true)
    try {
      const errorsToSkip = syncErrors.filter(err => err.table_name === table)
      for (const err of errorsToSkip) {
        await skipStuckSyncItem(err.id)
      }
      setSyncErrors(await getAllSyncErrors())
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

    const { data: invData } = await supabase.from('invoices').select('amount, status, created_at')
    if (invData) {
      setInvoicesList(invData)
      setRevenueCollected(invData.filter(i => i.status === 'paid').reduce((sum,i) => sum + Number(i.amount || 0),0))
      const unpaid = invData.filter(i => i.status === 'unpaid')
      setRevenueOutstanding(unpaid.reduce((sum,i) => sum + Number(i.amount || 0),0))
      setPendingBillCount(unpaid.length)
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

      const { data: roster } = await supabase.from('rosters').select('id').eq('hospital_id', hospital.id).eq('month', month).eq('year', year).is('department', null).maybeSingle()
      if (!roster) { setTodayDuty([]); return }

      const { data: entries } = await supabase.from('roster_entries').select('staff_id, shift_code').eq('roster_id', roster.id).eq('roster_date', todayKey)
      if (!entries || entries.length === 0) { setTodayDuty([]); return }

      const staffIds = entries.map(e => e.staff_id)
      const { data: staffData } = await supabase.from('profiles').select('id, full_name, role').in('id', staffIds)

      const combined = entries.map(e => {
        const staffMember = (staffData || []).find(s => s.id === e.staff_id)
        return staffMember ? { name: staffMember.full_name, role: staffMember.role, shift: e.shift_code } : null
      }).filter(Boolean).filter(e => e.shift && e.shift !== 'OFF')

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

  function setField(field, value) {
    setForm(current => ({ ...current, [field]: value }))
  }

  function handleDobChange(value) {
    setForm(current => ({ ...current, dateOfBirth: value, age: calculatePatientAge(value) }))
  }

  async function handleAdd(e){
    e.preventDefault()
    const surname = form.surname.trim()
    const otherNames = form.otherNames.trim()
    const fullName = `${surname} ${otherNames}`.trim()
    if (!surname) return
    if (!hospital || !profile) {
      showToast('Still loading your account — wait a moment and try again')
      return
    }
    setSaving(true)
    try {
      const isAnc = form.category === 'anc'
      await addRecord({
        full_name: fullName,
        surname,
        other_names: otherNames || null,
        age: form.age ? parseInt(form.age, 10) : null,
        gender: form.gender || null,
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        marital_status: form.maritalStatus || null,
        date_of_birth: form.dateOfBirth || null,
        blood_group: form.bloodGroup || null,
        genotype: form.genotype || null,
        nationality: form.nationality?.trim() || null,
        state_of_origin: form.stateOfOrigin || null,
        occupation: form.occupation?.trim() || null,
        religion: form.religion || null,
        category: form.category || null,
        address: form.homeAddress?.trim() || null,
        anc_special_point: isAnc ? form.ancSpecialPoint?.trim() || null : null,
        anc_date_of_booking: isAnc ? form.ancDateOfBooking || null : null,
        anc_indication: isAnc ? form.ancIndication?.trim() || null : null,
        anc_lmp: isAnc ? form.ancLmp || null : null,
        anc_edd: isAnc ? form.ancEdd || null : null,
        anc_husband_name: isAnc ? form.ancHusbandName?.trim() || null : null,
        anc_husband_occupation: isAnc ? form.ancHusbandOccupation?.trim() || null : null,
        anc_employer: isAnc ? form.ancEmployer?.trim() || null : null,
        emergency_contact_name: form.nokName?.trim() || null,
        emergency_contact_phone: form.nokPhone?.trim() || null,
        next_of_kin_relationship: form.nokRelationship?.trim() || null,
        next_of_kin_address: form.nokAddress?.trim() || null,
        status,
        created_by: profile.id,
      })
      setShowModal(false)
      setForm(EMPTY_PATIENT_FORM)
      setStatus('stable')
      showToast(isOnline ? `${fullName} added` : `${fullName} added — will sync when back online`)
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
  const filteredPatients = displayedPatients.filter(p =>
    !search.trim() || String(p.full_name || '').toLowerCase().includes(search.trim().toLowerCase())
  )

  // NEW: Calculate Patients Attended Today
  const todayStr = new Date().toDateString()
  const patientsSeenToday = useMemo(() => {
    const seenIds = new Set(vitals.filter(v => new Date(v.created_at).toDateString() === todayStr).map(v => v.patient_id))
    return patients.filter(p => seenIds.has(p.id))
  }, [vitals, patients, todayStr])

  function formatMoney(n){
    return '₦' + Number(n || 0).toLocaleString('en-NG',{minimumFractionDigits:0})
  }

  function formatDateTime(value){
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
  }

  function appointmentName(a){
    return a.patient_name || a.patient || a.full_name || a.name || 'Patient'
  }

  function appointmentReason(a){
    return a.department || a.reason || a.type || a.service || 'General Consultation'
  }

  const lowStockItems = useMemo(() => {
    return (inventoryItems || []).filter(i => {
      const qty = Number(i.quantity)
      const reorder = Number(i.reorder_level ?? 10)
      return !Number.isNaN(qty) && qty <= reorder
    })
  }, [inventoryItems])

  const isSameDay = (a, b) => a && b && new Date(a).toDateString() === new Date(b).toDateString()

  const readyLabTests = useMemo(() => {
    const today = new Date()
    return (labTests || [])
      .filter(t => t.status === 'completed' && isSameDay(t.completed_at || t.updated_at, today))
      .sort((a,b) => new Date(b.completed_at || b.updated_at) - new Date(a.completed_at || a.updated_at))
  }, [labTests])

  const notificationItems = useMemo(() => {
    const items = []
    if (lowStockItems.length > 0) {
      const names = lowStockItems.slice(0,2).map(i => i.name).filter(Boolean).join(', ')
      items.push({
        icon: '⚠️',
        text: <>Low stock: <strong>{lowStockItems.length} item{lowStockItems.length === 1 ? '' : 's'}</strong>{names ? ` (${names}${lowStockItems.length > 2 ? '…' : ''})` : ''} need reordering.</>,
      })
    }
    readyLabTests.slice(0,3).forEach(t => {
      items.push({ icon: '📌', text: <>Lab result ready for <strong>{t.patient_name || 'patient'}</strong> ({t.test_name || 'test'}).</> })
    })
    if (todayApptCount > 0) {
      items.push({ icon: '📅', text: <><strong>{todayApptCount}</strong> appointment{todayApptCount === 1 ? '' : 's'} scheduled for today.</> })
    }
    return items
  }, [lowStockItems, readyLabTests, todayApptCount])

  const recentMessageCount = useMemo(() => {
    if (!profile?.id) return 0
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    return (allMessages || []).filter(m =>
      m.sender_id !== profile.id &&
      (m.channel_type === 'department' || m.recipient_id === profile.id) &&
      new Date(m.created_at).getTime() >= cutoff
    ).length
  }, [allMessages, profile?.id])

  const upcoming = appointments
    .filter(a => {
      const d = new Date(a.appointment_time)
      return !Number.isNaN(d.getTime()) && d >= new Date()
    })
    .sort((a,b) => new Date(a.appointment_time) - new Date(b.appointment_time))
    .slice(0,5)

  // Smooth Catmull-Rom spline through a set of points — used for the patient trend chart
  function smoothPath(points){
    if (points.length < 2) return ''
    let d = `M ${points[0].x} ${points[0].y}`
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? i : i - 1]
      const p1 = points[i]
      const p2 = points[i + 1]
      const p3 = points[i + 2 < points.length ? i + 2 : i + 1]
      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6
      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
    }
    return d
  }

  // Real patient-registration & appointment-visit trend for the current month
  const patientTrend = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear(), month = now.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const newByDay = new Array(daysInMonth + 1).fill(0)
    const returningByDay = new Array(daysInMonth + 1).fill(0)

    patients.forEach(p => {
      const d = new Date(p.created_at)
      if (d.getFullYear() === year && d.getMonth() === month) newByDay[d.getDate()] += 1
    })
    appointments.forEach(a => {
      const d = new Date(a.appointment_time)
      if (d.getFullYear() === year && d.getMonth() === month) returningByDay[d.getDate()] += 1
    })

    const rawMax = Math.max(1, ...newByDay, ...returningByDay)
    const niceMax = Math.max(4, Math.ceil(rawMax / 4) * 4)
    const chartLeft = 35, chartRight = 610, chartBottom = 225, chartTop = 40, baselineY = 237

    const xFor = day => chartLeft + ((day - 1) / (daysInMonth - 1 || 1)) * (chartRight - chartLeft)
    const yFor = value => baselineY - (value / niceMax) * (baselineY - chartTop)

    const newPoints = []
    const returningPoints = []
    for (let day = 1; day <= daysInMonth; day++) {
      newPoints.push({ x: xFor(day), y: yFor(newByDay[day]) })
      returningPoints.push({ x: xFor(day), y: yFor(returningByDay[day]) })
    }

    const newLine = smoothPath(newPoints)
    const returningLine = smoothPath(returningPoints)
    const newArea = `${newLine} L${chartRight} ${chartBottom} L${chartLeft} ${chartBottom} Z`
    const returningArea = `${returningLine} L${chartRight} ${chartBottom} L${chartLeft} ${chartBottom} Z`

    const tickDays = [...new Set([1, 5, 10, 15, 20, 25, daysInMonth].filter(d => d <= daysInMonth))]
    const monthLabel = now.toLocaleDateString('en-US', { month: 'short' })
    const xLabels = tickDays.map(d => `${monthLabel} ${d}`)
    const yLabels = [niceMax, niceMax * 0.75, niceMax * 0.5, niceMax * 0.25, 0]

    return { newLine, returningLine, newArea, returningArea, xLabels, yLabels }
  }, [patients, appointments])

  // Real patient-category breakdown (this app files patients under folders rather than
  // clinical departments, so this reflects the folder categories actually on record)
  const categoryBreakdown = useMemo(() => {
    const labels = { personal: 'Personal', family: 'Family', emergency: 'Emergency', anc: 'ANC' }
    const colors = { personal: 'var(--teal)', family: 'var(--violet)', emergency: 'var(--danger)', anc: 'var(--gold)', other: 'var(--blue)' }
    const counts = { personal: 0, family: 0, emergency: 0, anc: 0, other: 0 }
    patients.forEach(p => {
      counts[labels[p.category] ? p.category : 'other'] += 1
    })
    const total = patients.length || 1
    const rows = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({ key, label: labels[key] || 'Other', color: colors[key], count, pct: (count / total) * 100 }))

    let cumulative = 0
    const gradientStops = rows.map(r => {
      const start = cumulative
      cumulative += r.pct
      return `${r.color} ${start.toFixed(1)}% ${cumulative.toFixed(1)}%`
    }).join(', ')

    return { rows, gradientStops: gradientStops || 'var(--line) 0% 100%' }
  }, [patients])

  // Real daily paid-invoice revenue for the current month
  const revenueTrend = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear(), month = now.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const byDay = new Array(daysInMonth + 1).fill(0)

    invoicesList.forEach(inv => {
      if (inv.status !== 'paid') return
      const d = new Date(inv.created_at)
      if (d.getFullYear() === year && d.getMonth() === month) byDay[d.getDate()] += Number(inv.amount || 0)
    })

    const thisMonthTotal = byDay.reduce((a,b) => a+b, 0)
    const lastMonthDate = new Date(year, month - 1, 1)
    const lastMonthTotal = invoicesList
      .filter(inv => inv.status === 'paid')
      .filter(inv => {
        const d = new Date(inv.created_at)
        return d.getFullYear() === lastMonthDate.getFullYear() && d.getMonth() === lastMonthDate.getMonth()
      })
      .reduce((sum, inv) => sum + Number(inv.amount || 0), 0)

    const changePct = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : null
    const max = Math.max(1, ...byDay.slice(1))
    const bars = byDay.slice(1).map(v => Math.max(2, (v / max) * 100))
    const tickDays = [1, 8, 15, 22, daysInMonth].filter((d,i,arr) => arr.indexOf(d) === i && d <= daysInMonth)
    const monthLabel = now.toLocaleDateString('en-US', { month: 'short' })

    return { bars, thisMonthTotal, changePct, xLabels: tickDays.map(d => `${monthLabel} ${d}`) }
  }, [invoicesList])

  // Most recently registered patients, for the Recent Patients panel
  const recentPatients = useMemo(() => {
    return [...patients]
      .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 6)
  }, [patients])

  function initials(name){
    return String(name || '?').trim().split(/\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase()
  }

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
          <div className="dash-brand-mark">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.8 8.6c0 5-6.2 9.4-8.3 10.8a1 1 0 0 1-1 0C9.4 18 3.2 13.6 3.2 8.6a4.9 4.9 0 0 1 8.8-3 4.9 4.9 0 0 1 8.8 3Z"/>
              <path d="M4 12h3l1.5-3L11 15l1.8-6L14 12h6"/>
            </svg>
          </div>
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
            <span>Emergency Line</span>
            <Icon name="phone" size={15}/>
          </div>
          <strong>{hospital?.phone || hospital?.Mr Goodnews || '+2348148364233'}</strong>
          <small>Software Developer</small>
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

            <LiveClock />

            {/* 1. Theme Toggle */}
            <button 
              className="dash-icon-btn" 
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              onClick={toggleTheme}
            >
              <Icon name={theme === 'light' ? 'sun' : 'moon'} size={18}/>
            </button>

            {/* 2. Notifications Bell Popover */}
            <div style={{ position: 'relative' }}>
              <button 
                className="dash-icon-btn dash-notify" 
                title="Notifications"
                onClick={() => setActiveMenu(activeMenu === 'notifs' ? null : 'notifs')}
              >
                <Icon name="bell" size={18}/>
                {notificationItems.length > 0 && <span>{notificationItems.length}</span>}
              </button>

              {activeMenu === 'notifs' && (
                <div className="dash-popover-menu">
                  <div className="dash-popover-header">Notifications ({notificationItems.length})</div>
                  <div className="dash-popover-body">
                    {notificationItems.length > 0 ? notificationItems.map((n, i) => (
                      <div className="dash-popover-item" key={i}>{n.icon} {n.text}</div>
                    )) : (
                      <div className="dash-popover-item" style={{ color: 'var(--muted)' }}>You're all caught up — nothing needs attention right now.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Messages */}
            <button
              className="dash-icon-btn dash-notify dash-message"
              title="Messages"
              onClick={() => { setTab('messages'); setActiveMenu(null) }}
            >
              <Icon name="chat" size={18}/>
              {recentMessageCount > 0 && <span>{recentMessageCount > 9 ? '9+' : recentMessageCount}</span>}
            </button>

            <div className="dash-hospital-selector">
              <Icon name="building" size={17}/>
              <span>{hospital?.name || 'Your Hospital'}</span>
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
                  <div className="dash-stat-value">{pendingBillCount.toLocaleString()}</div>
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
                          <stop offset="0%" stopColor="#45EBE4" stopOpacity=".28"/>
                          <stop offset="100%" stopColor="#45EBE4" stopOpacity="0"/>
                        </linearGradient>
                        <linearGradient id="violetArea" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#9C82FF" stopOpacity=".22"/>
                          <stop offset="100%" stopColor="#9C82FF" stopOpacity="0"/>
                        </linearGradient>
                      </defs>
                      {[45,95,145,195].map(y => <line key={y} x1="0" x2="620" y1={y} y2={y} className="chart-grid-line"/>)}
                      {patientTrend.yLabels.map((label,i) => (
                        <text key={i} x={label === 0 ? 7 : 4} y={[48,98,148,198,237][i]}>{Math.round(label)}</text>
                      ))}
                      <path className="chart-area-teal" d={patientTrend.newArea}/>
                      <path className="chart-area-violet" d={patientTrend.returningArea}/>
                      <path className="chart-line-teal" d={patientTrend.newLine}/>
                      <path className="chart-line-violet" d={patientTrend.returningLine}/>
                    </svg>
                    <div className="chart-x-labels">{patientTrend.xLabels.map(x => <span key={x}>{x}</span>)}</div>
                  </div>
                </div>

                <div className="dash-panel dash-department">
                  <div className="dash-panel-head">
                    <div>
                      <div className="dash-panel-title">Patient Categories</div>
                      <div className="dash-panel-sub">By record folder</div>
                    </div>
                  </div>
                  <div className="dash-dept-content">
                    <div className="dash-donut" style={{background:`conic-gradient(${categoryBreakdown.gradientStops})`}}>
                      <div><span>Total</span><strong>{patients.length}</strong></div>
                    </div>
                    <div className="dash-dept-list">
                      {categoryBreakdown.rows.length > 0 ? categoryBreakdown.rows.map(r => (
                        <div className="dash-dept-row" key={r.key}>
                          <span><i style={{background:r.color}}/>{r.label}</span>
                          <b>{r.count} ({r.pct.toFixed(1)}%)</b>
                        </div>
                      )) : (
                        <div className="dash-empty-state">No patients on record yet</div>
                      )}
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

                <div className="dash-panel dash-recent">
                  <div className="dash-panel-head">
                    <div>
                      <div className="dash-panel-title">Recent Patients</div>
                      <div className="dash-panel-sub">Latest registrations</div>
                    </div>
                    <button className="dash-view-all" onClick={() => setTab('patients')}>View all</button>
                  </div>
                  {recentPatients.length > 0 ? (
                    <div className="dash-table-wrap">
                      <table className="dash-patient-table">
                        <thead>
                          <tr>
                            <th>Patient</th><th>Age</th><th>Gender</th><th>Contact</th><th>Folder</th><th>Registered</th><th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentPatients.map(p => (
                            <tr key={p.id}>
                              <td>
                                <div className="dash-patient-name">
                                  <span>{initials(p.full_name)}</span>
                                  {p.full_name || 'Unnamed'}
                                </div>
                              </td>
                              <td>{p.age || '—'}</td>
                              <td>{p.gender || '—'}</td>
                              <td>{p.phone || '—'}</td>
                              <td>{CATEGORIES.find(c => c.value === p.category)?.label.replace(' Folder','') || 'Other'}</td>
                              <td>{formatDateTime(p.created_at)}</td>
                              <td>
                                <button className="dash-more" onClick={() => { setTab('patients'); setProfilePatientId(p.id) }}>
                                  <Icon name="more" size={15}/>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="dash-empty-state">No patients registered yet</div>
                  )}
                </div>

                <div className="dash-panel dash-revenue">
                  <div className="dash-panel-head">
                    <div>
                      <div className="dash-panel-title">Revenue Overview</div>
                      <div className="dash-panel-sub">Paid invoices, this month</div>
                    </div>
                    <select className="dash-filter"><option>This Month</option></select>
                  </div>
                  <strong className="dash-revenue-total">{formatMoney(revenueTrend.thisMonthTotal)}</strong>
                  <span className="dash-revenue-change" style={revenueTrend.changePct !== null && revenueTrend.changePct < 0 ? {color:'var(--danger)'} : undefined}>
                    {revenueTrend.changePct === null ? 'No data from last month yet' : `${revenueTrend.changePct >= 0 ? '+' : ''}${revenueTrend.changePct.toFixed(1)}% from last month`}
                  </span>
                  <div className="dash-bars">
                    {revenueTrend.bars.map((h,i) => <i key={i} style={{height: `${h}%`}}/>)}
                  </div>
                  <div className="dash-bar-labels">{revenueTrend.xLabels.map(x => <span key={x}>{x}</span>)}</div>
                </div>
              </section>

              <footer className="dash-footer">
                <span>© {new Date().getFullYear()} {hospital?.name || 'G-MedHub'}. All rights reserved.</span>
                <span>HMS v2.0.0</span>
              </footer>
            </>
          )}

          {/* Other tab routing components */}
          {tab === 'appointments' && <Appointments />}
          {tab === 'patients' && (
            profilePatientId ? (
              <PatientProfile patientId={profilePatientId} onClose={() => setProfilePatientId(null)} />
            ) : (
              <>
                {/* NEW: ATTENDED TODAY SECTION */}
                {patientsSeenToday.length > 0 && (
                  <div className="dash-panel" style={{ marginBottom: 16, borderColor: 'var(--teal)' }}>
                    <div className="dash-panel-head">
                      <div>
                        <div className="dash-panel-title" style={{ color: 'var(--teal)', fontSize: 14 }}>Attended Today ({patientsSeenToday.length})</div>
                        <div className="dash-panel-sub">Quick access to patients seen today</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, padding: '0 16px 16px', flexWrap: 'wrap' }}>
                      {patientsSeenToday.map(p => (
                        <div 
                          key={p.id} 
                          onClick={() => setProfilePatientId(p.id)} 
                          style={{ 
                            padding: '8px 14px', 
                            background: 'var(--bg-elevated)', 
                            border: '1px solid var(--teal)', 
                            borderRadius: 20, 
                            cursor: 'pointer', 
                            fontSize: 13, 
                            fontWeight: 700, 
                            color: 'var(--teal)' 
                          }}
                        >
                          {p.full_name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="dash-panel">
                  <div className="dash-panel-head dash-panel-head-wrap">
                    <div>
                      <div className="dash-panel-title">All Patients</div>
                      <div className="dash-panel-sub">{hospital?.name || 'your hospital'}</div>
                    </div>
                    <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>+ Add Patient</button>
                  </div>

                  {loading ? (
                    <div className="dash-empty-state">Loading…</div>
                  ) : filteredPatients.length === 0 ? (
                    <div className="dash-empty-state">
                      {search.trim() ? `No patients match "${search}".` : 'No patients yet. Add your first one above.'}
                    </div>
                  ) : (
                    <div className="dash-table-wrap">
                      <table className="dash-full-table">
                        <thead><tr><th>Name</th><th>Age</th><th>Status</th><th>Registered</th><th></th></tr></thead>
                        <tbody>
                          {filteredPatients.map(p => (
                            <tr key={p.id}>
                              <td onClick={() => setProfilePatientId(p.id)} style={{ cursor: 'pointer', fontWeight: 700 }}>{p.full_name}</td>
                              <td>{p.age}</td>
                              <td><span className={`dash-status ${p.status === 'review' ? 'review' : 'stable'}`}>{p.status === 'review' ? 'In Review' : 'Stable'}</span></td>
                              <td style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatDateTime(p.created_at)}</td>
                              <td><button className="dash-delete" onClick={() => handleDelete(p)}>✕</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )
          )}
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
          {tab === 'messages' && <Messages />}
          {tab === 'settings' && <Settings />}

        </div>
      </main>

      {showModal && (
        <div className="dash-modal-backdrop">
          <div className="card dash-modal">
            <div className="dash-modal-title">Register Patient</div>
            <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
              <div className="dash-modal-body">
                <div className="dash-field-grid">
                  <div className="field"><label>Surname</label><input value={form.surname} onChange={e => setField('surname', e.target.value)} placeholder="e.g. Okafor"/></div>
                  <div className="field"><label>Other Names</label><input value={form.otherNames} onChange={e => setField('otherNames', e.target.value)} placeholder="e.g. Chinedu"/></div>

                  <div className="field"><label>Phone</label><input value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="e.g. 08012345678"/></div>
                  <div className="field"><label>Email</label><input type="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="optional"/></div>

                  <div className="field">
                    <label>Gender</label>
                    <select value={form.gender} onChange={e => setField('gender', e.target.value)}>
                      <option value="">—</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Marital Status</label>
                    <select value={form.maritalStatus} onChange={e => setField('maritalStatus', e.target.value)}>
                      <option value="">—</option>
                      {MARITAL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="field"><label>Date of Birth</label><input type="date" value={form.dateOfBirth} onChange={e => handleDobChange(e.target.value)}/></div>
                  <div className="field"><label>Age</label><input value={form.age} readOnly placeholder="Auto-calculated" style={{ opacity: 0.75 }}/></div>

                  <div className="field">
                    <label>Blood Group</label>
                    <select value={form.bloodGroup} onChange={e => setField('bloodGroup', e.target.value)}>
                      <option value="">—</option>
                      {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Genotype</label>
                    <select value={form.genotype} onChange={e => setField('genotype', e.target.value)}>
                      <option value="">—</option>
                      {GENOTYPES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>

                  <div className="field">
                    <label>Nationality</label>
                    <select value={form.nationality} onChange={e => setField('nationality', e.target.value)}>
                      <option value="">—</option>
                      {AFRICAN_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>State of Origin</label>
                    <select value={form.stateOfOrigin} onChange={e => setField('stateOfOrigin', e.target.value)}>
                      <option value="">—</option>
                      {NIGERIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div className="field"><label>Occupation</label><input value={form.occupation} onChange={e => setField('occupation', e.target.value)} placeholder="e.g. Trader"/></div>
                  <div className="field">
                    <label>Religion</label>
                    <select value={form.religion} onChange={e => setField('religion', e.target.value)}>
                      <option value="">—</option>
                      {RELIGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>

                  <div className="field">
                    <label>Category / Folder</label>
                    <select value={form.category} onChange={e => setField('category', e.target.value)}>
                      <option value="">—</option>
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Status</label>
                    <select value={status} onChange={e => setStatus(e.target.value)}>
                      <option value="stable">Stable</option>
                      <option value="review">In Review</option>
                    </select>
                  </div>
                </div>

                <div className="field"><label>Home Address</label><input value={form.homeAddress} onChange={e => setField('homeAddress', e.target.value)} placeholder="e.g. 12 Aba Road, Port Harcourt"/></div>

                {form.category === 'anc' && (
                  <>
                    <div className="dash-modal-title" style={{ fontSize: 14, marginTop: 6 }}>ANC Details</div>
                    <div className="dash-field-grid">
                      <div className="field"><label>Special Point</label><input value={form.ancSpecialPoint} onChange={e => setField('ancSpecialPoint', e.target.value)}/></div>
                      <div className="field"><label>Date of Booking</label><input type="date" value={form.ancDateOfBooking} onChange={e => setField('ancDateOfBooking', e.target.value)}/></div>
                      <div className="field"><label>Indication</label><input value={form.ancIndication} onChange={e => setField('ancIndication', e.target.value)}/></div>
                      <div className="field"><label>LMP</label><input type="date" value={form.ancLmp} onChange={e => setField('ancLmp', e.target.value)}/></div>
                      <div className="field"><label>EDD</label><input type="date" value={form.ancEdd} onChange={e => setField('ancEdd', e.target.value)}/></div>
                      <div className="field"><label>Husband's Name</label><input value={form.ancHusbandName} onChange={e => setField('ancHusbandName', e.target.value)}/></div>
                      <div className="field"><label>Husband's Occupation</label><input value={form.ancHusbandOccupation} onChange={e => setField('ancHusbandOccupation', e.target.value)}/></div>
                      <div className="field"><label>Employer</label><input value={form.ancEmployer} onChange={e => setField('ancEmployer', e.target.value)}/></div>
                    </div>
                  </>
                )}

                <div className="dash-modal-title" style={{ fontSize: 14, marginTop: 6 }}>Next of Kin</div>
                <div className="dash-field-grid">
                  <div className="field"><label>Name</label><input value={form.nokName} onChange={e => setField('nokName', e.target.value)}/></div>
                  <div className="field"><label>Relationship</label><input value={form.nokRelationship} onChange={e => setField('nokRelationship', e.target.value)}/></div>
                  <div className="field"><label>Phone</label><input value={form.nokPhone} onChange={e => setField('nokPhone', e.target.value)}/></div>
                  <div className="field"><label>Address</label><input value={form.nokAddress} onChange={e => setField('nokAddress', e.target.value)}/></div>
                </div>
              </div>

              <div className="dash-modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Patient'}</button></div>
            </form>
          </div>
        </div>
      )}

      {pending ? (
        <div className="dash-toast dash-undo-toast">
          <span>{pending.patient.full_name} removed ({pending.secondsLeft}s)</span>
          <button onClick={handleUndo}>Undo</button>
        </div>
      ) : toast && (
        <div className="dash-toast">{toast}</div>
      )}

      {/* Popover Menu Styling */}
      <style>{`
        .dash-popover-menu {
          position: absolute;
          top: 42px;
          right: 0;
          width: 280px;
          background: var(--bg-elevated);
          border: 1px solid var(--line);
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
          z-index: 100;
          overflow: hidden;
        }
        .dash-popover-header {
          padding: 10px 14px;
          font-size: 12px;
          font-weight: 600;
          background: var(--bg-card-hover);
          border-bottom: 1px solid var(--line);
          color: var(--ivory);
        }
        .dash-popover-body {
          max-height: 220px;
          overflow-y: auto;
        }
        .dash-popover-item {
          padding: 10px 14px;
          font-size: 12px;
          border-bottom: 1px solid var(--line);
          color: var(--muted);
          line-height: 1.4;
        }
        .dash-popover-item:last-child {
          border-bottom: none;
        }
      `}</style>

    </div>
  )
}
