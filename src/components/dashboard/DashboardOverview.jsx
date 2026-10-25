import { useState, useMemo, useEffect, useRef } from 'react'
import { useOfflineTable } from '../../lib/useOfflineTable'
import AppIcon from '../icons'
import { formatWeekdayDate, formatTime, formatDateTime, getTimezone, dayKeyInZone, todayKeyInZone } from '../../lib/datetime'
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
  teal: '#20D9E8', cyan: '#4169FF', emerald: '#34D399',
  violet: '#9333EA', pink: '#F044B8', gold: '#F5C451', danger: '#F87171',
  navy: '#050505', midnight: '#0B0B0F', muted: '#92929D',
}

const DATE_RANGES = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: 'month', label: 'This Month' },
  { value: 'lastmonth', label: 'Last Month' },
  { value: 'year', label: 'This Year' },
]

function getRangeBounds(range, referenceDate = new Date()) {
  const now = new Date(referenceDate)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today.getTime() + 86400000)
  switch (range) {
    case '7d': return { start: new Date(today.getTime() - 6 * 86400000), end: tomorrow }
    case '30d': return { start: new Date(today.getTime() - 29 * 86400000), end: tomorrow }
    case 'month': return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: tomorrow }
    case 'lastmonth': return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1) }
    case 'year': return { start: new Date(now.getFullYear(), 0, 1), end: tomorrow }
    default: return { start: new Date(today.getTime() - 6 * 86400000), end: tomorrow }
  }
}

function isWithin(dateValue, start, end) {
  if (!dateValue) return false
  const date = new Date(dateValue)
  return !Number.isNaN(date.getTime()) && date >= start && date < end
}

const formatMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const tooltipStyle = {
  backgroundColor: 'var(--bg-card)', border: '1px solid var(--line)',
  borderRadius: 10, fontSize: 12, color: 'var(--ivory)', padding: '10px 14px',
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

export default function DashboardOverview({ hospital, profile }) {
  const timezone = getTimezone(hospital)
  const [dateRange, setDateRange] = useState('7d')
  const [rangeKey, setRangeKey] = useState(0)
  const [now, setNow] = useState(() => new Date())

  // Refresh the dashboard's notion of 'today' while it remains open. This keeps
  // date-based metrics accurate across midnight without requiring a page reload.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const rangeBounds = useMemo(() => getRangeBounds(dateRange, now), [dateRange, now])

  const { records: patients, loading: loadingPatients } = useOfflineTable('patients', hospital?.id)
  const { records: beds, loading: loadingBeds } = useOfflineTable('beds', hospital?.id)
  const { records: vitals, loading: loadingVitals } = useOfflineTable('patient_vitals', hospital?.id)
  const { records: appointments, loading: loadingAppts } = useOfflineTable('appointments', hospital?.id)
  const { records: invoices, loading: loadingInvoices } = useOfflineTable('invoices', hospital?.id)

  const loading = loadingPatients || loadingBeds || loadingVitals || loadingAppts || loadingInvoices
  const activePatients = useMemo(() => patients.filter(p => !p.deleted_at), [patients])
  const occupiedBeds = useMemo(() => beds.filter(b => b.status === 'occupied'), [beds])
  const queueCounts = useMemo(() => ({
    waiting: activePatients.filter(p => p.queue_status === 'waiting').length,
    consultation: activePatients.filter(p => p.queue_status === 'in_consultation').length,
    laboratory: activePatients.filter(p => p.queue_status === 'in_lab').length,
    discharged: activePatients.filter(p => p.queue_status === 'discharged').length,
  }), [activePatients])
  // Appointment dates are evaluated in the hospital's configured timezone,
  // not the device's timezone, so staff see the same 'today' as the hospital.
  const todayKey = todayKeyInZone(timezone)
  const todayAppointments = useMemo(() => appointments.filter(a =>
    dayKeyInZone(a.appointment_time, timezone) === todayKey &&
    !['cancelled', 'canceled'].includes(String(a.status || '').toLowerCase())
  ), [appointments, timezone, todayKey])

  // Metrics use existing records only. Approved requests are not added to occupied beds,
  // because they may represent the same admission before/after bed allocation.
  const kpis = useMemo(() => {
    const total = activePatients.length
    const admissionsCount = occupiedBeds.length
    const dischargedCount = queueCounts.discharged
    const periodInvoices = invoices.filter(i => isWithin(i.created_at, rangeBounds.start, rangeBounds.end) && (i.status === 'paid' || i.status === 'partial'))
    const revenue = periodInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_paid || 0), 0)
    const current = activePatients.filter(p => isWithin(p.created_at, rangeBounds.start, rangeBounds.end)).length
    const duration = rangeBounds.end.getTime() - rangeBounds.start.getTime()
    const prevStart = new Date(rangeBounds.start.getTime() - duration)
    const prev = activePatients.filter(p => isWithin(p.created_at, prevStart, rangeBounds.start)).length
    const growthPct = prev > 0 ? Math.round(((current - prev) / prev) * 100) : current > 0 ? null : 0
    const bedTotal = beds.length
    const occupancyPct = bedTotal > 0 ? Math.round((admissionsCount / bedTotal) * 100) : null
    return { total, admissions: admissionsCount, discharged: dischargedCount, revenue, currentPatients: current, growthPct, occupied: admissionsCount, bedTotal, occupancyPct, periodPaidInvoices: periodInvoices.length }
  }, [activePatients, occupiedBeds, queueCounts, invoices, rangeBounds, beds])

  // The chart uses daily buckets for short periods and monthly buckets for year-to-date.
  const patientGrowthAreaData = useMemo(() => {
    const { start, end } = rangeBounds
    const buckets = []
    if (dateRange === 'year') {
      for (let d = new Date(start.getFullYear(), 0, 1); d < end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
        buckets.push({ start: d, end: next < end ? next : end, date: d.toLocaleDateString('en-NG', { month: 'short' }) })
      }
    } else {
      for (let d = new Date(start); d < end; d = new Date(d.getTime() + 86400000)) {
        const next = new Date(d.getTime() + 86400000)
        buckets.push({ start: d, end: next, date: d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) })
      }
    }
    return buckets.map(bucket => ({
      date: bucket.date,
      patients: activePatients.filter(p => isWithin(p.created_at, bucket.start, bucket.end)).length,
    }))
  }, [activePatients, dateRange, rangeBounds])

  const bedData = useMemo(() => [
    { name: 'Occupied', value: beds.filter(b => b.status === 'occupied').length, color: COLORS.gold },
    { name: 'Available', value: beds.filter(b => b.status === 'available').length, color: COLORS.teal },
    { name: 'Cleaning', value: beds.filter(b => b.status === 'cleaning').length, color: COLORS.violet },
    { name: 'Reserved', value: beds.filter(b => b.status === 'reserved').length, color: COLORS.cyan },
  ].filter(d => d.value > 0), [beds])

  const consultData = useMemo(() => {
    const completed = vitals.filter(v => v.status === 'completed').length
    const total = vitals.length
    return { completed, total, pct: total > 0 ? Math.round((completed / total) * 100) : 0 }
  }, [vitals])

  const flowData = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const next = new Date(d.getTime() + 86400000)
      days.push({
        day: d.toLocaleDateString('en-NG', { weekday: 'short' }),
        registrations: activePatients.filter(p => isWithin(p.created_at, d, next)).length,
        visits: vitals.filter(v => isWithin(v.recorded_at || v.created_at, d, next)).length,
      })
    }
    return days
  }, [activePatients, vitals, now])

  const trendsData = useMemo(() => {
    const cats = ['personal', 'family', 'emergency', 'anc', 'hmo']
    const labels = { personal: 'Personal', family: 'Family', emergency: 'Emergency', anc: 'ANC', hmo: 'HMO' }
    const colors = { personal: COLORS.cyan, family: COLORS.emerald, emergency: COLORS.pink, anc: COLORS.violet, hmo: COLORS.gold }
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
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
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
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
  const upcoming = useMemo(() => appointments.filter(a => a.appointment_time && new Date(a.appointment_time) > now && a.status === 'scheduled').sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time)).slice(0, 5), [appointments, now])

  function handleRangeChange(e) { setDateRange(e.target.value); setRangeKey(k => k + 1) }

  // ---- Loading skeleton with shimmer ----
  if (loading) {
    return (
      <>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map(i => <div key={i} className="gm-shimmer" style={{ flex: '1 1 200px', height: 120, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--line)', position: 'relative', overflow: 'hidden' }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="gm-shimmer" style={{ height: 280, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--line)', position: 'relative', overflow: 'hidden' }} />)}
        </div>
        <style>{`.gm-shimmer::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(32,217,232,0.07),transparent);animation:gm-sweep 1.5s ease-in-out infinite}@keyframes gm-sweep{from{transform:translateX(-100%)}to{transform:translateX(100%)}}@media(prefers-reduced-motion:reduce){.gm-shimmer::after{animation:none}}`}</style>
      </>
    )
  }

  return (
    <>
      {/* Refined motion: entrance transitions, not continuous floating */}
      <style>{`
        @keyframes gm-enter { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gm-fade { from { opacity: 0; } to { opacity: 1; } }
        .gm-enter { animation: gm-enter 520ms cubic-bezier(0.22,1,0.36,1) both; }
        .gm-fade { animation: gm-fade 420ms ease-out both; }
        .gm-kpi-card, .gm-chart-card { transition: border-color 220ms ease, box-shadow 220ms ease, transform 220ms ease, background-color 220ms ease; }
        .gm-kpi-card:hover, .gm-chart-card:hover { transform: translateY(-2px); }
        .gm-kpi-card:focus-within, .gm-chart-card:focus-within { outline: 2px solid var(--teal); outline-offset: 2px; }
        .gm-select { transition: border-color 180ms ease, box-shadow 180ms ease; }
        .gm-select:hover { border-color: rgba(32,217,232,0.42) !important; }
        .gm-select:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
        .gm-row { transition: background-color 160ms ease, border-color 160ms ease; }
        .gm-flow-stage { min-width: 0; padding: 14px 15px; border: 1px solid var(--line); background: var(--bg-card); border-radius: 10px; }
        .gm-flow-value { font-size: 23px; line-height: 1.15; font-weight: 800; letter-spacing: -0.7px; color: var(--ivory); }
        .gm-flow-label { font-size: 10px; margin-top: 6px; text-transform: uppercase; letter-spacing: .9px; color: var(--muted); font-weight: 700; }
        .gm-section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.4px; color: var(--muted); font-weight: 750; }
        @media (max-width: 650px) { .gm-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; } .gm-flow-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } .gm-flow-value { font-size: 20px; } }
        @media (prefers-reduced-motion: reduce) {
          .gm-enter, .gm-fade { animation: none !important; opacity: 1; transform: none; }
          .gm-kpi-card, .gm-chart-card, .gm-select, .gm-row { transition: none !important; }
          .gm-kpi-card:hover, .gm-chart-card:hover { transform: none; }
        }
      `}</style>

      {/* ---- Date Header + Range Filter ---- */}
      <section className="gm-fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--ivory)' }}>{formatWeekdayDate(new Date(), timezone)}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{formatTime(new Date(), timezone)} · {hospital?.name || 'Your Hospital'}</div>
        </div>
        <select className="gm-select" value={dateRange} onChange={handleRangeChange} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(0,214,201,0.2)', background: 'var(--bg-card)', color: 'var(--ivory)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
          {DATE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </section>

      {/* Operational KPIs: staggered entrance + actual values */}
      <section className="gm-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
        <KPICard label="Registered Patients" target={kpis.total} icon="users" color={COLORS.cyan} delay={0} delta={`${kpis.currentPatients.toLocaleString()} new in selected period`} positive={true} format={v => v.toLocaleString()} />
        <KPICard label="Today's Appointments" target={todayAppointments.length} icon="calendar" color={COLORS.teal} delay={65} delta={`${upcoming.length} upcoming scheduled`} positive={true} format={v => v.toLocaleString()} />
        <KPICard label="Current Admissions" target={kpis.admissions} icon="bed" color={COLORS.violet} delay={130} delta={kpis.bedTotal ? `${kpis.occupancyPct}% of ${kpis.bedTotal} beds occupied` : 'Bed capacity not configured'} positive={true} format={v => v.toLocaleString()} />
        <KPICard label="Patients Waiting" target={queueCounts.waiting} icon="clock" color={COLORS.gold} delay={195} delta="Current reception queue" positive={true} format={v => v.toLocaleString()} />
        <KPICard label="In Consultation" target={queueCounts.consultation} icon="activity" color={COLORS.emerald} delay={260} delta="Current patient queue" positive={true} format={v => v.toLocaleString()} />
        <KPICard label="Revenue Recorded" target={kpis.revenue} icon="billing" color={COLORS.violet} delay={325} delta={`${DATE_RANGES.find(r => r.value === dateRange)?.label || 'Selected period'} · ${kpis.periodPaidInvoices} paid/partial invoices`} positive={true} format={formatMoney} />
      </section>

      {/* Patient flow snapshot, based on statuses used by the existing reception and doctor workflows */}
      <section style={{ marginBottom: 18 }}>
        <div className="gm-section-label" style={{ marginBottom: 10 }}>Patient flow · current queue</div>
        <div className="gm-flow-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          {[
            { label: 'Waiting', value: queueCounts.waiting, color: COLORS.gold },
            { label: 'In consultation', value: queueCounts.consultation, color: COLORS.cyan },
            { label: 'In laboratory', value: queueCounts.laboratory, color: COLORS.violet },
            { label: 'Discharged', value: queueCounts.discharged, color: COLORS.emerald },
          ].map((stage, index) => <div key={stage.label} className="gm-flow-stage gm-enter" style={{ animationDelay: `${360 + index * 55}ms`, borderTop: `2px solid ${stage.color}` }}><div className="gm-flow-value">{stage.value.toLocaleString()}</div><div className="gm-flow-label">{stage.label}</div></div>)}
        </div>
      </section>

      {/* Main analytics panel */}
      <PatientGrowthChart data={patientGrowthAreaData} currentCount={kpis.currentPatients} growthPct={kpis.growthPct} rangeKey={rangeKey} dateRange={dateRange} onRangeChange={handleRangeChange} />

      {/* ---- Charts Grid ---- */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 14, marginBottom: 20, marginTop: 16 }}>
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
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" style={{ fill: 'var(--ivory)', fontSize: 28, fontWeight: 800 }}>{consultData.pct}%</text>
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted-dim)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-dim)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted)', fontSize: 11 }} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted-dim)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-dim)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted)', fontSize: 11 }} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted-dim)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-dim)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--muted)', fontSize: 11 }} cursor={{ fill: 'rgba(0,214,201,0.06)' }} />
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
        <div className={`dash-panel gm-enter`} style={{ animationDelay: '700ms', borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--line)' }}>
          <div className="dash-panel-head"><div><div className="dash-panel-title">Recent Patients</div><div className="dash-panel-sub">Latest registrations</div></div></div>
          {recentPatients.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No patients registered yet.</div> : (
            <div className="dash-table-wrap">
              <table className="dash-full-table"><thead><tr><th>Patient</th><th>Age</th><th>Gender</th><th>Registered</th></tr></thead>
                <tbody>{recentPatients.map(p => <tr key={p.id} className="gm-row" onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,214,201,0.03)'} onMouseLeave={e => e.currentTarget.style.background = ''}><td style={{ fontWeight: 700 }}>{p.full_name}</td><td>{p.age || '—'}</td><td>{p.gender || '—'}</td><td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{formatDateTime(p.created_at, timezone)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>

        <div className={`dash-panel gm-enter`} style={{ animationDelay: '770ms', borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--line)' }}>
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
      className={`gm-chart-card ${mounted ? 'gm-enter' : ''}`}
      style={{
        borderRadius: 16, padding: 20, marginBottom: 16,
        background: 'var(--bg-card)',
        border: '1px solid var(--line)',
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
            {growthPct !== null && <span style={{ marginLeft: 10, color: growthPct >= 0 ? COLORS.emerald : COLORS.danger, fontWeight: 700 }}>
              {growthPct >= 0 ? '↑' : '↓'} {Math.abs(growthPct)}% vs previous period
            </span>}
          </div>
        </div>
        <select
          className="gm-select"
          value={dateRange}
          onChange={onRangeChange}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(0,214,201,0.2)', background: 'var(--bg-card)', color: 'var(--ivory)', fontSize: 11.5, cursor: 'pointer', outline: 'none' }}
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
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis dataKey="date" stroke="var(--muted-dim)" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis stroke="var(--muted-dim)" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
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

  return (
    <div
      className={`gm-kpi-card ${mounted ? 'gm-enter' : ''}`}
      style={{
        borderRadius: 16, padding: 18, position: 'relative', overflow: 'hidden',
        background: 'var(--bg-card)',
        border: '1px solid var(--line)',
        opacity: mounted ? undefined : 0,
        animationDelay: mounted ? `${delay}ms` : undefined,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color + '55'; e.currentTarget.style.boxShadow = `0 12px 32px ${color}15` }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = '' }}
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
  return (
    <div
      className={`gm-chart-card ${mounted ? 'gm-enter' : ''}`}
      style={{
        borderRadius: 16, padding: 18,
        gridColumn: wide ? '1 / -1' : undefined,
        background: 'var(--bg-card)',
        border: '1px solid var(--line)',
        opacity: mounted ? undefined : 0,
        animationDelay: mounted ? `${delay || 0}ms` : undefined,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--teal-border)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = '' }}
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
