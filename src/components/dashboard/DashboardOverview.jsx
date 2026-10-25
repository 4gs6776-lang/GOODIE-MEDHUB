import { useState, useMemo, useEffect, useRef } from 'react'
import { useOfflineTable } from '../../lib/useOfflineTable'
import AppIcon from '../icons'
import { formatWeekdayDate, formatTime, formatDateTime, getTimezone } from '../../lib/datetime'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, BarChart, Bar, Legend,
  RadialBarChart, RadialBar, CartesianGrid
} from 'recharts'

// =====================================================================
// GOODIE-MEDHUB — Advanced Premium Dashboard
// 
// Features:
//   - Patient Growth: glowing area chart (replaces doughnut)
//   - Gradient card backgrounds with glass-like highlights
//   - Faster floating animations (4-8s KPI, 6-10s charts)
//   - Bottom cards rise upward + return in continuous loops
//   - Recharts built-in chart animations
//   - prefers-reduced-motion support
//   - All real data from existing tables — no fabricated stats
// =====================================================================

const COLORS = {
  teal: '#00D6C9', cyan: '#20D9FF', emerald: '#10D9A0',
  violet: '#8067FF', gold: '#E8B82E', danger: '#F04F5F',
  navy: '#071522', midnight: '#0B1F33', muted: '#2A3A46',
}

const DATE_RANGES = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'lastmonth', label: 'Last Month' },
  { value: 'year', label: 'This Year' },
]

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

const formatMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const tooltipStyle = {
  backgroundColor: '#070F14', border: '1px solid rgba(0,214,201,0.2)',
  borderRadius: 10, fontSize: 12, color: '#F1F6FA', padding: '10px 14px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
}

// =====================================================================
// useCountUp — animates from 0 to target with easeOutCubic
// =====================================================================
function useCountUp(target, duration = 800) {
  const [value, setValue] = useState(0)
  const rafRef = useRef(null)
  const targetRef = useRef(0)

  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || target === 0) { setValue(target); targetRef.current = target; return }
    if (targetRef.current === target) return
    targetRef.current = target

    const start = performance.now()
    const animate = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased))
      if (progress < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])
  return value
}

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

// =====================================================================
// Floating animation class assignment (round-robin)
// =====================================================================
const FLOAT_CLASSES = ['float-vert-a', 'float-horz-a', 'float-diag-a', 'float-vert-b', 'float-diag-b', 'float-rise-a']
let _floatIdx = 0
function nextFloat() { const c = FLOAT_CLASSES[_floatIdx % FLOAT_CLASSES.length]; _floatIdx++; return c }

export default function DashboardOverview({ hospital, profile }) {
  const timezone = getTimezone(hospital)
  const [dateRange, setDateRange] = useState('7d')
  const [rangeKey, setRangeKey] = useState(0)

  const { records: patients, loading: loadingPatients } = useOfflineTable('patients', hospital?.id)
  const { records: beds, loading: loadingBeds } = useOfflineTable('beds', hospital?.id)
  const { records: vitals, loading: loadingVitals } = useOfflineTable('patient_vitals', hospital?.id)
  const { records: appointments, loading: loadingAppts } = useOfflineTable('appointments', hospital?.id)
  const { records: invoices, loading: loadingInvoices } = useOfflineTable('invoices', hospital?.id)
  const { records: admissions, loading: loadingAdmissions } = useOfflineTable('admission_requests', hospital?.id)

  const loading = loadingPatients || loadingBeds || loadingVitals || loadingAppts || loadingInvoices
  const startDate = useMemo(() => getStartDate(dateRange), [dateRange])
  const now = new Date()

  // ---- KPI calculations ----
  const kpis = useMemo(() => {
    const active = patients.filter(p => !p.deleted_at)
    const total = active.length
    const occupied = beds.filter(b => b.status === 'occupied').length
    const approved = admissions.filter(a => a.status === 'approved').length
    const admissionsCount = occupied + approved
    const cleaning = beds.filter(b => b.status === 'cleaning').length
    const discharged = active.filter(p => p.queue_status === 'discharged').length
    const dischargedCount = cleaning + discharged
    const paid = invoices.filter(i => i.status === 'paid' || i.status === 'partial')
    const revenue = paid.reduce((s, i) => s + Number(i.amount_paid || 0), 0)
    const current = active.filter(p => new Date(p.created_at) >= startDate).length
    const prevEnd = dateRange === '7d' ? new Date(now.getTime() - 7 * 86400000) :
                    dateRange === '30d' ? new Date(now.getTime() - 30 * 86400000) :
                    new Date(now.getFullYear(), now.getMonth(), 0)
    const prevStart = dateRange === '7d' ? new Date(now.getTime() - 14 * 86400000) :
                      dateRange === '30d' ? new Date(now.getTime() - 60 * 86400000) :
                      new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prev = active.filter(p => { const d = new Date(p.created_at); return d >= prevStart && d <= prevEnd }).length
    const growthPct = prev > 0 ? Math.round(((current - prev) / prev) * 100) : current > 0 ? 100 : 0
    return { total, admissions: admissionsCount, discharged: dischargedCount, revenue, currentPatients: current, growthPct, occupied }
  }, [patients, beds, admissions, invoices, startDate, dateRange, now])

  // ---- Patient Growth area chart data (daily for selected range) ----
  const patientGrowthAreaData = useMemo(() => {
    const days = dateRange === 'year' ? 30 : dateRange === 'month' || dateRange === 'lastmonth' ? 30 : 7
    const arr = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      const dk = d.toDateString()
      const count = patients.filter(p => new Date(p.created_at).toDateString() === dk && !p.deleted_at).length
      arr.push({
        date: d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }),
        patients: count,
      })
    }
    return arr
  }, [patients, dateRange, now])

  // ---- Other chart data (same as before) ----
  const bedData = useMemo(() => {
    return [
      { name: 'Occupied', value: beds.filter(b => b.status === 'occupied').length, color: COLORS.gold },
      { name: 'Available', value: beds.filter(b => b.status === 'available').length, color: COLORS.teal },
      { name: 'Cleaning', value: beds.filter(b => b.status === 'cleaning').length, color: COLORS.violet },
      { name: 'Reserved', value: beds.filter(b => b.status === 'reserved').length, color: COLORS.cyan },
    ].filter(d => d.value > 0)
  }, [beds])

  const consultData = useMemo(() => {
    const completed = vitals.filter(v => v.status === 'completed').length
    const total = vitals.length
    return { completed, total, pct: total > 0 ? Math.round((completed / total) * 100) : 0 }
  }, [vitals])

  const flowData = useMemo(() => {
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

  const trendsData = useMemo(() => {
    const cats = ['personal', 'family', 'emergency', 'anc', 'hmo']
    const labels = { personal: 'Personal', family: 'Family', emergency: 'Emergency', anc: 'ANC', hmo: 'HMO' }
    const colors = { personal: COLORS.teal, family: COLORS.emerald, emergency: COLORS.danger, anc: COLORS.violet, hmo: COLORS.cyan }
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

  const visitsData = useMemo(() => {
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

  const recentPatients = useMemo(() => [...patients].filter(p => !p.deleted_at).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6), [patients])
  const upcoming = useMemo(() => appointments.filter(a => new Date(a.appointment_time) > now && a.status === 'scheduled').sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time)).slice(0, 5), [appointments, now])

  function handleRangeChange(e) { setDateRange(e.target.value); setRangeKey(k => k + 1) }

  // ---- Loading skeleton with shimmer ----
  if (loading) {
    return (
      <>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map(i => <div key={i} className="gm-shimmer" style={{ flex: '1 1 200px', height: 120, borderRadius: 16, background: COLORS.midnight, border: '1px solid rgba(0,214,201,0.08)', position: 'relative', overflow: 'hidden' }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="gm-shimmer" style={{ height: 280, borderRadius: 16, background: COLORS.midnight, border: '1px solid rgba(0,214,201,0.08)', position: 'relative', overflow: 'hidden' }} />)}
        </div>
        <style>{`.gm-shimmer::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(0,214,201,0.04),transparent);animation:gm-sweep 1.5s ease-in-out infinite}@keyframes gm-sweep{from{transform:translateX(-100%)}to{transform:translateX(100%)}}@media(prefers-reduced-motion:reduce){.gm-shimmer::after{animation:none}}`}</style>
      </>
    )
  }

  return (
    <>
      {/* ---- All animation + styling CSS ---- */}
      <style>{`
        /* ---- Entrance animations ---- */
        @keyframes gm-enter { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gm-fade { from { opacity: 0; } to { opacity: 1; } }
        .gm-enter { animation: gm-enter 500ms cubic-bezier(0.22,1,0.36,1) both; }
        .gm-fade { animation: gm-fade 500ms ease-out both; }

        /* ---- Faster floating animations ---- */
        .float-vert-a { animation: fva 6s ease-in-out infinite; }
        .float-horz-a { animation: fha 7s ease-in-out infinite; }
        .float-diag-a { animation: fda 8s ease-in-out infinite; }
        .float-vert-b { animation: fvb 5s ease-in-out infinite; }
        .float-diag-b { animation: fdb 9s ease-in-out infinite; }
        .float-rise-a { animation: fra 10s ease-in-out infinite; }

        @keyframes fva { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes fha { 0%,100% { transform: translateX(0); } 33% { transform: translateX(8px); } 66% { transform: translateX(-6px); } }
        @keyframes fda { 0%,100% { transform: translate(0,0); } 25% { transform: translate(6px,-8px); } 50% { transform: translate(-5px,-5px); } 75% { transform: translate(-8px,6px); } }
        @keyframes fvb { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes fdb { 0%,100% { transform: translate(0,0); } 30% { transform: translate(5px,-10px); } 60% { transform: translate(-7px,-3px); } }
        @keyframes fra { 0%,100% { transform: translateY(0); } 30% { transform: translateY(-16px); } 60% { transform: translateY(-8px); } }

        .gm-kpi-card { will-change: transform; }
        .gm-chart-card { will-change: transform; }

        /* ---- Card hover ---- */
        .gm-kpi-card { transition: border-color 0.2s, box-shadow 0.25s; }
        .gm-kpi-card:hover { box-shadow: 0 12px 32px rgba(0,214,201,0.1); }
        .gm-chart-card { transition: border-color 0.2s, box-shadow 0.25s; }
        .gm-chart-card:hover { box-shadow: 0 8px 24px rgba(0,214,201,0.08); }

        /* ---- Date select ---- */
        .gm-select { transition: border-color 0.2s, box-shadow 0.2s; }
        .gm-select:hover { border-color: rgba(0,214,201,0.35); }
        .gm-select:focus { border-color: var(--teal); box-shadow: 0 0 0 3px rgba(0,214,201,0.1); }

        /* ---- Table row ---- */
        .gm-row { transition: background 0.15s; }

        /* ---- Reduced motion ---- */
        @media (prefers-reduced-motion: reduce) {
          .gm-enter, .gm-fade { animation: none !important; opacity: 1; transform: none; }
          .float-vert-a, .float-horz-a, .float-diag-a, .float-vert-b, .float-diag-b, .float-rise-a { animation: none !important; }
          .gm-kpi-card, .gm-chart-card, .gm-select, .gm-row { transition: none; }
          .gm-shimmer::after { animation: none; }
        }
      `}</style>

      {/* ---- Date Header + Range Filter ---- */}
      <section className="gm-fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--ivory)' }}>{formatWeekdayDate(new Date(), timezone)}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{formatTime(new Date(), timezone)} · {hospital?.name || 'Your Hospital'}</div>
        </div>
        <select className="gm-select" value={dateRange} onChange={handleRangeChange} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(0,214,201,0.2)', background: COLORS.midnight, color: 'var(--ivory)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
          {DATE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </section>

      {/* ---- KPI Cards (staggered + count-up + floating) ---- */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        <KPICard label="Total Patients" target={kpis.total} icon="users" color={COLORS.teal} delay={0} delta={`${kpis.growthPct >= 0 ? '+' : ''}${kpis.growthPct}%`} positive={kpis.growthPct >= 0} format={v => v.toLocaleString()} />
        <KPICard label="Admissions" target={kpis.admissions} icon="bed" color={COLORS.violet} delay={70} delta={`${kpis.occupied} beds occupied`} positive={true} format={v => v.toString()} />
        <KPICard label="Discharged" target={kpis.discharged} icon="check" color={COLORS.emerald} delay={140} delta="Recently discharged" positive={true} format={v => v.toString()} />
        <KPICard label="Revenue" target={kpis.revenue} icon="billing" color={COLORS.gold} delay={210} delta={`${invoices.filter(i => i.status === 'paid').length} paid`} positive={true} format={formatMoney} />
      </section>

      {/* ---- Patient Growth (upgraded glowing area chart) ---- */}
      <PatientGrowthChart data={patientGrowthAreaData} currentCount={kpis.currentPatients} growthPct={kpis.growthPct} rangeKey={rangeKey} dateRange={dateRange} onRangeChange={handleRangeChange} />

      {/* ---- Charts Grid ---- */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20, marginTop: 16 }}>
        {/* Bed Occupancy */}
        <ChartCard title="Bed Occupancy" subtitle={`${beds.length} total · ${beds.filter(b => b.status === 'occupied').length} occupied`} delay={350}>
          {beds.length === 0 ? <Empty text="No beds configured." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={bedData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" isAnimationActive animationDuration={700} animationBegin={200}>
                  {bedData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11, color: 'var(--muted)', paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Consultation Success */}
        <ChartCard title="Consultation Success" subtitle={`${consultData.completed} of ${consultData.total} completed`} delay={420}>
          {consultData.total === 0 ? <Empty text="No consultations recorded yet." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <RadialBarChart cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" barSize={18} data={[{ name: 'Completed', value: consultData.pct, fill: COLORS.teal }]} startAngle={90} endAngle={90 + (consultData.pct / 100) * 360} isAnimationActive animationDuration={700}>
                <RadialBar background={{ fill: COLORS.muted }} dataKey="value" cornerRadius={12} isAnimationActive animationDuration={700} />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" style={{ fill: '#F1F6FA', fontSize: 28, fontWeight: 800 }}>{consultData.pct}%</text>
              </RadialBarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Patient Flow */}
        <ChartCard title="Patient Flow" subtitle="Last 7 days" wide delay={490}>
          {flowData.every(d => d.registrations === 0 && d.visits === 0) ? <Empty text="No patient activity." /> : (
            <ResponsiveContainer width="100%" height={240} key={`flow-${rangeKey}`}>
              <AreaChart data={flowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="tealG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.teal} stopOpacity={0.4} /><stop offset="100%" stopColor={COLORS.teal} stopOpacity={0} /></linearGradient>
                  <linearGradient id="emeraldG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.emerald} stopOpacity={0.3} /><stop offset="100%" stopColor={COLORS.emerald} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#17252F" vertical={false} />
                <XAxis dataKey="day" stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#9AAAB7', fontSize: 11 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="registrations" name="New Patients" stroke={COLORS.teal} strokeWidth={2} fill="url(#tealG)" isAnimationActive animationDuration={700} animationBegin={200} />
                <Area type="monotone" dataKey="visits" name="Visits" stroke={COLORS.emerald} strokeWidth={2} fill="url(#emeraldG)" isAnimationActive animationDuration={700} animationBegin={400} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Consultation Trends */}
        <ChartCard title="Consultation Trends" subtitle="By category — 7 days" wide delay={560}>
          {trendsData.data.every(d => trendsData.cats.every(c => (d[c] || 0) === 0)) ? <Empty text="No consultation data." /> : (
            <ResponsiveContainer width="100%" height={240} key={`trends-${rangeKey}`}>
              <LineChart data={trendsData.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#17252F" vertical={false} />
                <XAxis dataKey="day" stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#9AAAB7', fontSize: 11 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                {trendsData.cats.map((cat, i) => (
                  <Line key={cat} type="monotone" dataKey={cat} name={trendsData.labels[cat]} stroke={trendsData.colors[cat]} strokeWidth={2} dot={{ r: 3, fill: trendsData.colors[cat] }} activeDot={{ r: 5 }} connectNulls isAnimationActive animationDuration={700} animationBegin={200 + i * 80} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Weekly Visits */}
        <ChartCard title="Weekly Visits" subtitle="Outpatient vs Inpatient" wide delay={630}>
          {visitsData.every(d => d.outpatient === 0 && d.inpatient === 0) ? <Empty text="No visit data." /> : (
            <ResponsiveContainer width="100%" height={240} key={`visits-${rangeKey}`}>
              <BarChart data={visitsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#17252F" vertical={false} />
                <XAxis dataKey="day" stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#9AAAB7', fontSize: 11 }} cursor={{ fill: 'rgba(0,214,201,0.06)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="outpatient" name="Outpatient" fill={COLORS.teal} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive animationDuration={700} animationBegin={200} />
                <Bar dataKey="inpatient" name="Inpatient" fill={COLORS.violet} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive animationDuration={700} animationBegin={400} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </section>

      {/* ---- Bottom cards (rise upward + return) ---- */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className={`dash-panel gm-enter float-rise-a`} style={{ animationDelay: '700ms', borderRadius: 16, background: `linear-gradient(135deg, ${COLORS.midnight}, ${COLORS.navy})`, border: '1px solid rgba(0,214,201,0.1)' }}>
          <div className="dash-panel-head"><div><div className="dash-panel-title">Recent Patients</div><div className="dash-panel-sub">Latest registrations</div></div></div>
          {recentPatients.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No patients registered yet.</div> : (
            <div className="dash-table-wrap">
              <table className="dash-full-table"><thead><tr><th>Patient</th><th>Age</th><th>Gender</th><th>Registered</th></tr></thead>
                <tbody>{recentPatients.map(p => <tr key={p.id} className="gm-row" onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,214,201,0.03)'} onMouseLeave={e => e.currentTarget.style.background = ''}><td style={{ fontWeight: 700 }}>{p.full_name}</td><td>{p.age || '—'}</td><td>{p.gender || '—'}</td><td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{formatDateTime(p.created_at, timezone)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>

        <div className={`dash-panel gm-enter float-diag-b`} style={{ animationDelay: '770ms', borderRadius: 16, background: `linear-gradient(135deg, ${COLORS.midnight}, ${COLORS.navy})`, border: '1px solid rgba(0,214,201,0.1)' }}>
          <div className="dash-panel-head"><div><div className="dash-panel-title">Upcoming Appointments</div><div className="dash-panel-sub">Scheduled visits</div></div></div>
          {upcoming.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No upcoming appointments.</div> : (
            <div style={{ padding: '4px 0 12px' }}>{upcoming.map((a, i) => (
              <div key={a.id || i} className="gm-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', marginBottom: 6, borderRadius: 8, background: COLORS.navy, border: '1px solid rgba(0,214,201,0.06)' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,214,201,0.15)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(0,214,201,0.06)'}>
                <div><div style={{ fontWeight: 700, fontSize: 13 }}>{a.patient_name || 'Patient'}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.reason || a.appointment_type || 'Appointment'}</div></div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, fontWeight: 700, color: COLORS.teal }}>{formatTime(a.appointment_time, timezone)}</div><div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{formatDateTime(a.appointment_time, timezone)}</div></div>
              </div>))}
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
// PatientGrowthChart — glowing area chart matching the screenshot
// =====================================================================
function PatientGrowthChart({ data, currentCount, growthPct, rangeKey, dateRange, onRangeChange }) {
  const mounted = useStaggeredMount(280)
  const totalCount = useCountUp(currentCount)
  const total = data.reduce((s, d) => s + d.patients, 0)

  return (
    <div
      className={`gm-chart-card ${mounted ? 'gm-enter' : ''} float-vert-a`}
      style={{
        borderRadius: 16, padding: 20, marginBottom: 16,
        background: `linear-gradient(135deg, ${COLORS.navy}, ${COLORS.midnight})`,
        border: '1px solid rgba(0,214,201,0.12)',
        opacity: mounted ? undefined : 0,
        animationDelay: mounted ? '280ms' : undefined,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ivory)' }}>Patient Growth</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
            <span style={{ color: COLORS.teal, fontWeight: 700 }}>{total}</span> new patients this period
            <span style={{ marginLeft: 10, color: growthPct >= 0 ? COLORS.emerald : COLORS.danger, fontWeight: 700 }}>
              {growthPct >= 0 ? '↑' : '↓'} {Math.abs(growthPct)}%
            </span>
          </div>
        </div>
        <select
          className="gm-select"
          value={dateRange}
          onChange={onRangeChange}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(0,214,201,0.2)', background: COLORS.midnight, color: 'var(--ivory)', fontSize: 11.5, cursor: 'pointer', outline: 'none' }}
        >
          {DATE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Glowing area chart */}
      {total === 0 ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-dim)', fontSize: 12.5, fontStyle: 'italic' }}>No patient registrations in this period.</div>
      ) : (
        <ResponsiveContainer width="100%" height={200} key={`pg-${rangeKey}`}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id="pgGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS.teal} stopOpacity={0.35} />
                <stop offset="50%" stopColor={COLORS.cyan} stopOpacity={0.15} />
                <stop offset="100%" stopColor={COLORS.teal} stopOpacity={0} />
              </linearGradient>
              <filter id="pgGlow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(23,37,47,0.5)" vertical={false} />
            <XAxis dataKey="date" stroke="#5C6B76" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis stroke="#5C6B76" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: COLORS.cyan, fontSize: 11 }} />
            <Area
              type="monotone"
              dataKey="patients"
              name="New Patients"
              stroke={COLORS.teal}
              strokeWidth={2.5}
              fill="url(#pgGradient)"
              filter="url(#pgGlow)"
              dot={{ r: 3, fill: COLORS.teal, stroke: COLORS.cyan, strokeWidth: 1 }}
              activeDot={{ r: 6, fill: COLORS.cyan, stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive
              animationDuration={800}
              animationBegin={300}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// =====================================================================
// KPICard — gradient bg + count-up + floating + hover glow
// =====================================================================
function KPICard({ label, target, icon, color, delta, positive, delay, format }) {
  const val = useCountUp(target)
  const mounted = useStaggeredMount(delay)
  const floatClass = useMemo(() => nextFloat(), [])

  return (
    <div
      className={`gm-kpi-card ${mounted ? 'gm-enter' : ''} ${floatClass}`}
      style={{
        borderRadius: 16, padding: 18, position: 'relative', overflow: 'hidden',
        background: `linear-gradient(135deg, ${COLORS.midnight}, ${COLORS.navy})`,
        border: `1px solid ${color}22`,
        opacity: mounted ? undefined : 0,
        animationDelay: mounted ? `${delay}ms` : undefined,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color + '55'; e.currentTarget.style.boxShadow = `0 12px 32px ${color}15` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = color + '22'; e.currentTarget.style.boxShadow = '' }}
    >
      <div style={{ position: 'absolute', top: -15, right: -15, width: 70, height: 70, borderRadius: '50%', background: color + '0D', filter: 'blur(18px)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AppIcon name={icon} size={18} style={{ color }} />
        </div>
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ivory)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.1 }}>{format(val)}</div>
      <div style={{ fontSize: 10.5, marginTop: 5, fontWeight: 600, color: positive ? COLORS.emerald : COLORS.danger, display: 'flex', alignItems: 'center', gap: 3, opacity: val === target ? 1 : 0, transition: 'opacity 0.3s' }}>
        <AppIcon name={positive ? 'arrowUp' : 'arrowDown'} size={11} /> {delta}
      </div>
    </div>
  )
}

// =====================================================================
// ChartCard — gradient bg + floating
// =====================================================================
function ChartCard({ title, subtitle, children, wide, delay }) {
  const mounted = useStaggeredMount(delay || 0)
  const floatClass = useMemo(() => wide ? 'float-vert-b' : nextFloat(), [wide])
  return (
    <div
      className={`gm-chart-card ${mounted ? 'gm-enter' : ''} ${floatClass}`}
      style={{
        borderRadius: 16, padding: 18,
        gridColumn: wide ? '1 / -1' : undefined,
        background: `linear-gradient(135deg, ${COLORS.midnight}, ${COLORS.navy})`,
        border: '1px solid rgba(0,214,201,0.1)',
        opacity: mounted ? undefined : 0,
        animationDelay: mounted ? `${delay || 0}ms` : undefined,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,214,201,0.2)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,214,201,0.08)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,214,201,0.1)'; e.currentTarget.style.boxShadow = '' }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ivory)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

function Empty({ text }) {
  return <div className="gm-fade" style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-dim)', fontSize: 12.5, textAlign: 'center', fontStyle: 'italic' }}>{text}</div>
}
