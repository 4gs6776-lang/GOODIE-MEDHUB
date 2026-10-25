import { useState, useMemo, useEffect, useRef } from 'react'
import { useOfflineTable } from '../../lib/useOfflineTable'
import AppIcon from '../icons'
import { formatWeekdayDate, formatTime, formatDateTime, getTimezone, dayKeyInZone, todayKeyInZone } from '../../lib/datetime'
import {
  PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Legend,
  RadialBarChart, RadialBar, CartesianGrid
} from 'recharts'

// =====================================================================
// GOODIE-MEDHUB — Premium Animated Dashboard Overview (Second-Pass Polish)
//
// Animation system:
//   - useCountUp: RAF-based number animation with easeOutCubic
//   - useStaggeredMount: sequential card reveals with CSS keyframes
//   - Recharts built-in: isAnimationActive + animationDuration + animationBegin
//   - Chart re-animation: key prop bump on date range change
//   - Shimmer skeleton: CSS gradient sweep
//   - prefers-reduced-motion: all animations disabled, instant values
//   - Consistent easing: cubic-bezier(0.22, 1, 0.36, 1) throughout
//
// No Framer Motion. No new dependencies. Pure CSS + Recharts + custom hooks.
// =====================================================================

const CHART_COLORS = {
  teal: '#00C7C7', mint: '#18D99B', gold: '#E8B82E',
  violet: '#7657E8', blue: '#3B82F6', danger: '#F04F5F',
  muted: '#2A3A46', bg: '#0C151D',
}

const DATE_RANGES = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'lastmonth', label: 'Last Month' },
  { value: 'year', label: 'This Year' },
]

// ---- Animation timing constants (coordinated across the dashboard) ----
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
const CARD_ENTER_MS = 550
const STAGGER_MS = 70
const CHART_ANIM_MS = 700
const COUNT_UP_MS = 900

function getStartDate(range) {
  const now = new Date()
  switch (range) {
    case '7d': return new Date(now.getTime() - 7 * 86400000)
    case '30d': return new Date(now.getTime() - 30 * 86400000)
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1)
    case 'lastmonth': return new Date(now.getFullYear(), now.getMonth() - 1, 1)
    case 'year': return new Date(now.getFullYear(), 0, 1)
    default: return new Date(now.getTime() - 7 * 86400000)
  }
}

function getPrevStartDate(range) {
  const now = new Date()
  switch (range) {
    case '7d': return new Date(now.getTime() - 14 * 86400000)
    case '30d': return new Date(now.getTime() - 60 * 86400000)
    case 'month': return new Date(now.getFullYear(), now.getMonth() - 1, 1)
    case 'lastmonth': return new Date(now.getFullYear(), now.getMonth() - 2, 1)
    case 'year': return new Date(now.getFullYear() - 1, 0, 1)
    default: return new Date(now.getTime() - 14 * 86400000)
  }
}

function getPrevEndDate(range) {
  const now = new Date()
  switch (range) {
    case '7d': return new Date(now.getTime() - 7 * 86400000)
    case '30d': return new Date(now.getTime() - 30 * 86400000)
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
    case 'lastmonth': return new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59)
    case 'year': return new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59)
    default: return new Date(now.getTime() - 7 * 86400000)
  }
}

const formatMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const tooltipStyle = {
  backgroundColor: '#0A131A', border: '1px solid #1B2B35',
  borderRadius: 8, fontSize: 12, color: '#F1F6FA', padding: '8px 12px',
}

// =====================================================================
// useCountUp — animates a number from 0 to target on mount.
// Uses requestAnimationFrame + easeOutCubic for smooth deceleration.
// Respects prefers-reduced-motion (instant if reduced).
// Does NOT restart on unrelated re-renders — only when target changes.
// =====================================================================
function useCountUp(target, duration = COUNT_UP_MS) {
  const [value, setValue] = useState(0)
  const rafRef = useRef(null)
  const targetRef = useRef(0)

  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || target === 0) { setValue(target); targetRef.current = target; return }

    // Don't restart if the target hasn't changed
    if (targetRef.current === target) return
    targetRef.current = target

    const start = performance.now()
    const animate = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // easeOutCubic
      setValue(Math.round(target * eased))
      if (progress < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return value
}

// =====================================================================
// useStaggeredMount — returns true after a delay for staggered entrance.
// =====================================================================
function useStaggeredMount(delay) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { setMounted(true); return }
    const t = setTimeout(() => setMounted(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return mounted
}

export default function DashboardOverview({ hospital, profile }) {
  const timezone = getTimezone(hospital)
  const [dateRange, setDateRange] = useState('7d')
  const [rangeKey, setRangeKey] = useState(0) // bump to retrigger chart animations

  const { records: patients, loading: loadingPatients } = useOfflineTable('patients', hospital?.id)
  const { records: beds, loading: loadingBeds } = useOfflineTable('beds', hospital?.id)
  const { records: vitals, loading: loadingVitals } = useOfflineTable('patient_vitals', hospital?.id)
  const { records: appointments, loading: loadingAppts } = useOfflineTable('appointments', hospital?.id)
  const { records: invoices, loading: loadingInvoices } = useOfflineTable('invoices', hospital?.id)
  const { records: admissions, loading: loadingAdmissions } = useOfflineTable('admission_requests', hospital?.id)

  const loading = loadingPatients || loadingBeds || loadingVitals || loadingAppts || loadingInvoices
  const startDate = useMemo(() => getStartDate(dateRange), [dateRange])
  const prevStartDate = useMemo(() => getPrevStartDate(dateRange), [dateRange])
  const prevEndDate = useMemo(() => getPrevEndDate(dateRange), [dateRange])
  const now = new Date()

  // ---- KPI calculations ----
  const kpis = useMemo(() => {
    const activePatients = patients.filter(p => !p.deleted_at)
    const totalPatients = activePatients.length
    const occupiedBeds = beds.filter(b => b.status === 'occupied').length
    const approvedAdmissions = admissions.filter(a => a.status === 'approved').length
    const totalAdmissions = occupiedBeds + approvedAdmissions
    const cleaningBeds = beds.filter(b => b.status === 'cleaning').length
    const dischargedPatients = activePatients.filter(p => p.queue_status === 'discharged').length
    const totalDischarged = cleaningBeds + dischargedPatients
    const paidInvoices = invoices.filter(i => i.status === 'paid' || i.status === 'partial')
    const totalRevenue = paidInvoices.reduce((sum, i) => sum + Number(i.amount_paid || 0), 0)
    const prevPeriodPatients = activePatients.filter(p => { const d = new Date(p.created_at); return d >= prevStartDate && d <= prevEndDate }).length
    const currentPeriodPatients = activePatients.filter(p => { const d = new Date(p.created_at); return d >= startDate }).length
    const growthPct = prevPeriodPatients > 0 ? Math.round(((currentPeriodPatients - prevPeriodPatients) / prevPeriodPatients) * 100) : currentPeriodPatients > 0 ? 100 : 0
    return { totalPatients, totalAdmissions, totalDischarged, totalRevenue, currentPeriodPatients, growthPct, occupiedBeds }
  }, [patients, beds, admissions, invoices, startDate, prevStartDate, prevEndDate])

  // ---- Chart data (unchanged from existing implementation) ----
  const patientGrowthData = useMemo(() => {
    const current = patients.filter(p => { const d = new Date(p.created_at); return d >= startDate && !p.deleted_at }).length
    const previous = patients.filter(p => { const d = new Date(p.created_at); return d >= prevStartDate && d <= prevEndDate && !p.deleted_at }).length
    return [{ name: 'This Period', value: current, color: CHART_COLORS.teal }, { name: 'Previous Period', value: previous, color: CHART_COLORS.muted }]
  }, [patients, startDate, prevStartDate, prevEndDate])

  const bedOccupancyData = useMemo(() => {
    return [
      { name: 'Occupied', value: beds.filter(b => b.status === 'occupied').length, color: CHART_COLORS.gold },
      { name: 'Available', value: beds.filter(b => b.status === 'available').length, color: CHART_COLORS.teal },
      { name: 'Cleaning', value: beds.filter(b => b.status === 'cleaning').length, color: CHART_COLORS.violet },
      { name: 'Reserved', value: beds.filter(b => b.status === 'reserved').length, color: CHART_COLORS.blue },
    ].filter(d => d.value > 0)
  }, [beds])

  const consultationData = useMemo(() => {
    const completed = vitals.filter(v => v.status === 'completed').length
    const total = vitals.length
    return { completed, total, pct: total > 0 ? Math.round((completed / total) * 100) : 0 }
  }, [vitals])

  const patientFlowData = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      const dk = d.toDateString()
      days.push({
        day: d.toLocaleDateString('en-NG', { weekday: 'short' }),
        registrations: patients.filter(p => new Date(p.created_at).toDateString() === dk && !p.deleted_at).length,
        visits: vitals.filter(v => new Date(v.recorded_at || v.created_at).toDateString() === dk).length,
      })
    }
    return days
  }, [patients, vitals, now])

  const consultationTrendsData = useMemo(() => {
    const cats = ['personal', 'family', 'emergency', 'anc', 'hmo']
    const labels = { personal: 'Personal', family: 'Family', emergency: 'Emergency', anc: 'ANC', hmo: 'HMO' }
    const colors = { personal: CHART_COLORS.teal, family: CHART_COLORS.mint, emergency: CHART_COLORS.danger, anc: CHART_COLORS.violet, hmo: CHART_COLORS.blue }
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      const dk = d.toDateString()
      const dayData = { day: d.toLocaleDateString('en-NG', { weekday: 'short' }) }
      for (const c of cats) {
        const pids = patients.filter(p => p.category === c).map(p => p.id)
        dayData[c] = vitals.filter(v => new Date(v.recorded_at || v.created_at).toDateString() === dk && pids.includes(v.patient_id)).length
      }
      days.push(dayData)
    }
    return { data: days, cats, labels, colors }
  }, [patients, vitals, now])

  const weeklyVisitsData = useMemo(() => {
    const days = []
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      const dk = d.toDateString()
      days.push({
        day: names[d.getDay()],
        outpatient: appointments.filter(a => new Date(a.appointment_time).toDateString() === dk).length,
        inpatient: vitals.filter(v => new Date(v.recorded_at || v.created_at).toDateString() === dk).length,
      })
    }
    return days
  }, [appointments, vitals, now])

  const recentPatients = useMemo(() => {
    return [...patients].filter(p => !p.deleted_at).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6)
  }, [patients])

  const upcomingAppointments = useMemo(() => {
    return appointments.filter(a => new Date(a.appointment_time) > now && a.status === 'scheduled')
      .sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time)).slice(0, 5)
  }, [appointments, now])

  // ---- Handle date range change with chart re-animation ----
  function handleRangeChange(e) {
    setDateRange(e.target.value)
    setRangeChanged(k => k + 1)
  }
  const [rangeChanged, setRangeChanged] = useState(0)

  // ---- Loading skeleton with shimmer ----
  if (loading) {
    return (
      <>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="gm-skeleton" style={{ flex: '1 1 200px', height: 120, borderRadius: 14, background: 'var(--bg-elevated)', border: '1px solid var(--line)', position: 'relative', overflow: 'hidden' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="gm-skeleton" style={{ height: 280, borderRadius: 14, background: 'var(--bg-elevated)', border: '1px solid var(--line)', position: 'relative', overflow: 'hidden' }} />
          ))}
        </div>
        <style>{`
          .gm-skeleton::after {
            content: ''; position: absolute; inset: 0;
            background: linear-gradient(90deg, transparent, rgba(0,199,199,0.05), transparent);
            animation: gm-shimmer 1.6s ease-in-out infinite;
          }
          @keyframes gm-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
          @media (prefers-reduced-motion: reduce) { .gm-skeleton::after { animation: none; } }
        `}</style>
      </>
    )
  }

  return (
    <>
      {/* ---- Inject all animation CSS ---- */}
      <style>{`
        @keyframes gm-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gm-fade-in { from { opacity: 0; } to { opacity: 1; } }
        .gm-enter { animation: gm-fade-up ${CARD_ENTER_MS}ms ${EASING} both; }
        .gm-fade { animation: gm-fade-in ${CARD_ENTER_MS}ms ease-out both; }
        .gm-kpi { transition: transform 0.2s ${EASING}, border-color 0.2s ease, box-shadow 0.25s ease; }
        .gm-kpi:hover { transform: translateY(-3px); box-shadow: 0 8px 28px rgba(0,199,199,0.07); }
        .gm-chart { transition: border-color 0.2s ease; }
        .gm-chart:hover { border-color: rgba(0,199,199,0.18) !important; }
        .gm-select { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        .gm-select:hover { border-color: rgba(0,199,199,0.3); }
        .gm-select:focus { border-color: var(--teal); box-shadow: 0 0 0 3px rgba(0,199,199,0.1); }
        .gm-row { transition: background 0.15s ease, border-color 0.15s ease; }
        @media (prefers-reduced-motion: reduce) {
          .gm-enter, .gm-fade { animation: none !important; opacity: 1; transform: none; }
          .gm-kpi, .gm-chart, .gm-select, .gm-row { transition: none; }
          .gm-skeleton::after { animation: none; }
        }
      `}</style>

      {/* ---- Date Header + Range Filter ---- */}
      <section className="gm-fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--ivory)' }}>{formatWeekdayDate(new Date(), timezone)}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{formatTime(new Date(), timezone)} · {hospital?.name || 'Your Hospital'}</div>
        </div>
        <select className="gm-select" value={dateRange} onChange={handleRangeChange} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--teal-border)', background: 'var(--bg-elevated)', color: 'var(--ivory)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
          {DATE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </section>

      {/* ---- KPI Cards (staggered entrance + count-up) ---- */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        <KPICard label="Total Patients" target={kpis.totalPatients} icon="users" color={CHART_COLORS.teal} delay={0} delta={`${kpis.growthPct >= 0 ? '+' : ''}${kpis.growthPct}% vs last period`} deltaPositive={kpis.growthPct >= 0} format={v => v.toLocaleString()} />
        <KPICard label="Admissions" target={kpis.totalAdmissions} icon="bed" color={CHART_COLORS.violet} delay={STAGGER_MS} delta={`${kpis.occupiedBeds || 0} beds occupied`} deltaPositive={true} format={v => v.toString()} />
        <KPICard label="Discharged" target={kpis.totalDischarged} icon="check" color={CHART_COLORS.mint} delay={STAGGER_MS * 2} delta="Recently discharged" deltaPositive={true} format={v => v.toString()} />
        <KPICard label="Revenue" target={kpis.totalRevenue} icon="billing" color={CHART_COLORS.gold} delay={STAGGER_MS * 3} delta={`${invoices.filter(i => i.status === 'paid').length} paid invoices`} deltaPositive={true} format={formatMoney} />
      </section>

      {/* ---- Charts Grid ---- */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
        {/* Chart 1: Patient Growth */}
        <ChartCard title="Patient Growth" subtitle={`New patients: ${kpis.currentPeriodPatients} this period`} delay={STAGGER_MS * 4}>
          {patientGrowthData.every(d => d.value === 0) ? <EmptyState text="No patient registrations in this period yet." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={patientGrowthData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" isAnimationActive animationDuration={CHART_ANIM_MS} animationBegin={200}>
                  {patientGrowthData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11, color: 'var(--muted)', paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Chart 2: Bed Occupancy */}
        <ChartCard title="Bed Occupancy" subtitle={`${beds.length} total beds · ${beds.filter(b => b.status === 'occupied').length} occupied`} delay={STAGGER_MS * 5}>
          {beds.length === 0 ? <EmptyState text="No beds configured. Set up beds in IPD Management." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={bedOccupancyData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ value }) => value} labelLine={false} isAnimationActive animationDuration={CHART_ANIM_MS} animationBegin={300}>
                  {bedOccupancyData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11, color: 'var(--muted)', paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Chart 3: Consultation Success */}
        <ChartCard title="Consultation Success" subtitle={`${consultationData.completed} of ${consultationData.total} completed`} delay={STAGGER_MS * 6}>
          {consultationData.total === 0 ? <EmptyState text="No consultations recorded yet." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <RadialBarChart cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" barSize={18} data={[{ name: 'Completed', value: consultationData.pct, fill: CHART_COLORS.teal }]} startAngle={90} endAngle={90 + (consultationData.pct / 100) * 360} isAnimationActive animationDuration={CHART_ANIM_MS}>
                <RadialBar background={{ fill: CHART_COLORS.muted }} dataKey="value" cornerRadius={12} isAnimationActive animationDuration={CHART_ANIM_MS} />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" style={{ fill: '#F1F6FA', fontSize: 28, fontWeight: 800 }}>{consultationData.pct}%</text>
              </RadialBarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Chart 4: Patient Flow */}
        <ChartCard title="Patient Flow" subtitle="Last 7 days — registrations vs visits" wide delay={STAGGER_MS * 7}>
          {patientFlowData.every(d => d.registrations === 0 && d.visits === 0) ? <EmptyState text="No patient activity in the last 7 days." /> : (
            <ResponsiveContainer width="100%" height={240} key={`flow-${rangeChanged}`}>
              <AreaChart data={patientFlowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="tealAG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART_COLORS.teal} stopOpacity={0.4} /><stop offset="100%" stopColor={CHART_COLORS.teal} stopOpacity={0} /></linearGradient>
                  <linearGradient id="mintAG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART_COLORS.mint} stopOpacity={0.3} /><stop offset="100%" stopColor={CHART_COLORS.mint} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#17252F" vertical={false} />
                <XAxis dataKey="day" stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#9AAAB7', fontSize: 11 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="registrations" name="New Patients" stroke={CHART_COLORS.teal} strokeWidth={2} fill="url(#tealAG)" isAnimationActive animationDuration={CHART_ANIM_MS} animationBegin={200} />
                <Area type="monotone" dataKey="visits" name="Visits" stroke={CHART_COLORS.mint} strokeWidth={2} fill="url(#mintAG)" isAnimationActive animationDuration={CHART_ANIM_MS} animationBegin={400} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Chart 5: Consultation Trends */}
        <ChartCard title="Consultation Trends" subtitle="By patient category — last 7 days" wide delay={STAGGER_MS * 8}>
          {consultationTrendsData.data.every(d => consultationTrendsData.cats.every(c => (d[c] || 0) === 0)) ? <EmptyState text="No consultation data for the last 7 days." /> : (
            <ResponsiveContainer width="100%" height={240} key={`trends-${rangeChanged}`}>
              <LineChart data={consultationTrendsData.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#17252F" vertical={false} />
                <XAxis dataKey="day" stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#9AAAB7', fontSize: 11 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                {consultationTrendsData.cats.map((cat, i) => (
                  <Line key={cat} type="monotone" dataKey={cat} name={consultationTrendsData.labels[cat]} stroke={consultationTrendsData.colors[cat]} strokeWidth={2} dot={{ r: 3, fill: consultationTrendsData.colors[cat] }} activeDot={{ r: 5 }} connectNulls isAnimationActive animationDuration={CHART_ANIM_MS} animationBegin={200 + i * 80} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Chart 6: Weekly Visits */}
        <ChartCard title="Weekly Visits" subtitle="Outpatient vs Inpatient — last 7 days" wide delay={STAGGER_MS * 9}>
          {weeklyVisitsData.every(d => d.outpatient === 0 && d.inpatient === 0) ? <EmptyState text="No visit data for the last 7 days." /> : (
            <ResponsiveContainer width="100%" height={240} key={`visits-${rangeChanged}`}>
              <BarChart data={weeklyVisitsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#17252F" vertical={false} />
                <XAxis dataKey="day" stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#9AAAB7', fontSize: 11 }} cursor={{ fill: 'rgba(0,199,199,0.06)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="outpatient" name="Outpatient" fill={CHART_COLORS.teal} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive animationDuration={CHART_ANIM_MS} animationBegin={200} />
                <Bar dataKey="inpatient" name="Inpatient" fill={CHART_COLORS.violet} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive animationDuration={CHART_ANIM_MS} animationBegin={400} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </section>

      {/* ---- Recent Patients + Upcoming Appointments ---- */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="dash-panel gm-enter" style={{ animationDelay: `${STAGGER_MS * 10}ms` }}>
          <div className="dash-panel-head"><div><div className="dash-panel-title">Recent Patients</div><div className="dash-panel-sub">Latest registrations</div></div></div>
          {recentPatients.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No patients registered yet.</div> : (
            <div className="dash-table-wrap">
              <table className="dash-full-table">
                <thead><tr><th>Patient</th><th>Age</th><th>Gender</th><th>Registered</th></tr></thead>
                <tbody>
                  {recentPatients.map(p => (
                    <tr key={p.id} className="gm-row" onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,199,199,0.03)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td style={{ fontWeight: 700 }}>{p.full_name}</td>
                      <td>{p.age || '—'}</td>
                      <td>{p.gender || '—'}</td>
                      <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{formatDateTime(p.created_at, timezone)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="dash-panel gm-enter" style={{ animationDelay: `${STAGGER_MS * 11}ms` }}>
          <div className="dash-panel-head"><div><div className="dash-panel-title">Upcoming Appointments</div><div className="dash-panel-sub">Scheduled visits</div></div></div>
          {upcomingAppointments.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No upcoming appointments.</div> : (
            <div style={{ padding: '4px 0 12px' }}>
              {upcomingAppointments.map((a, i) => (
                <div key={a.id || i} className="gm-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', marginBottom: 6, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,199,199,0.15)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line-soft)'}>
                  <div><div style={{ fontWeight: 700, fontSize: 13 }}>{a.patient_name || 'Patient'}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.reason || a.appointment_type || 'Appointment'}</div></div>
                  <div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>{formatTime(a.appointment_time, timezone)}</div><div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{formatDateTime(a.appointment_time, timezone)}</div></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer style={{ marginTop: 30, padding: '16px 0', borderTop: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted-dim)' }}>
        <span>© {new Date().getFullYear()} {hospital?.name || 'G-MedHub'}. All rights reserved.</span>
        <span>HMS v2.0.0</span>
      </footer>
    </>
  )
}

// =====================================================================
// KPICard — count-up animation + staggered entrance + hover lift
// =====================================================================
function KPICard({ label, target, icon, color, delta, deltaPositive, delay, format }) {
  const animatedValue = useCountUp(target)
  const mounted = useStaggeredMount(delay)

  return (
    <div className={`gm-kpi ${mounted ? 'gm-enter' : ''}`} style={{
      borderRadius: 14, background: 'var(--bg-elevated)', border: '1px solid var(--line)',
      padding: 18, position: 'relative', overflow: 'hidden',
      opacity: mounted ? undefined : 0, animationDelay: mounted ? `${delay}ms` : undefined,
    }}>
      <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: color + '11', filter: 'blur(20px)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: color + '1A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AppIcon name={icon} size={20} style={{ color }} />
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ivory)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.1 }}>{format(animatedValue)}</div>
      <div style={{ fontSize: 11, marginTop: 6, fontWeight: 600, color: deltaPositive ? 'var(--mint)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4, opacity: animatedValue === target ? 1 : 0, transition: 'opacity 0.3s ease' }}>
        <AppIcon name={deltaPositive ? 'arrowUp' : 'arrowDown'} size={12} />
        {delta}
      </div>
    </div>
  )
}

// =====================================================================
// ChartCard — staggered entrance + hover border glow
// =====================================================================
function ChartCard({ title, subtitle, children, wide, delay }) {
  const mounted = useStaggeredMount(delay || 0)
  return (
    <div className={`gm-chart ${mounted ? 'gm-enter' : ''}`} style={{
      borderRadius: 14, background: 'var(--bg-elevated)', border: '1px solid var(--line)',
      padding: 18, gridColumn: wide ? '1 / -1' : undefined,
      opacity: mounted ? undefined : 0, animationDelay: mounted ? `${delay || 0}ms` : undefined,
    }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ivory)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

// =====================================================================
// EmptyState
// =====================================================================
function EmptyState({ text }) {
  return <div className="gm-fade" style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-dim)', fontSize: 12.5, textAlign: 'center', fontStyle: 'italic' }}>{text}</div>
}
