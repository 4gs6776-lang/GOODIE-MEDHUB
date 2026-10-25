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
// GOODIE-MEDHUB — Premium Dashboard Overview
//
// Self-contained component that loads its own data via useOfflineTable
// (read-only, RLS-protected) and renders:
//   - 4 KPI cards (Total Patients, Admissions, Discharged, Revenue)
//   - 6 charts (Patient Growth, Bed Occupancy, Consultation Success,
//     Patient Flow, Consultation Trends, Weekly Visits)
//   - Date range filter
//   - Loading skeletons + empty states
//
// All data comes from existing tables — no new queries, no migrations,
// no service-role access. Every chart shows real hospital data.
// =====================================================================

const CHART_COLORS = {
  teal: '#00C7C7',
  mint: '#18D99B',
  gold: '#E8B82E',
  violet: '#7657E8',
  blue: '#3B82F6',
  danger: '#F04F5F',
  muted: '#3A4A56',
  bg: '#0C151D',
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
    case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1)
    case 'lastmonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return start
    }
    case 'year': return new Date(now.getFullYear(), 0, 1)
    default: return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  }
}

function getPrevStartDate(range) {
  const now = new Date()
  switch (range) {
    case '7d': return new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    case '30d': return new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
    case 'month': return new Date(now.getFullYear(), now.getMonth() - 1, 1)
    case 'lastmonth': return new Date(now.getFullYear(), now.getMonth() - 2, 1)
    case 'year': return new Date(now.getFullYear() - 1, 0, 1)
    default: return new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  }
}

function getPrevEndDate(range) {
  const now = new Date()
  switch (range) {
    case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
    case 'lastmonth': return new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59)
    case 'year': return new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59)
    default: return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  }
}

const formatMoney = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const tooltipStyle = {
  backgroundColor: '#0A131A',
  border: '1px solid #1B2B35',
  borderRadius: 8,
  fontSize: 12,
  color: '#F1F6FA',
  padding: '8px 12px',
}

export default function DashboardOverview({ hospital, profile }) {
  const timezone = getTimezone(hospital)
  const [dateRange, setDateRange] = useState('7d')

  // ---- Data loading (all read-only, RLS-protected) ----
  const { records: patients, loading: loadingPatients } = useOfflineTable('patients', hospital?.id)
  const { records: beds, loading: loadingBeds } = useOfflineTable('beds', hospital?.id)
  const { records: vitals, loading: loadingVitals } = useOfflineTable('patient_vitals', hospital?.id)
  const { records: appointments, loading: loadingAppts } = useOfflineTable('appointments', hospital?.id)
  const { records: invoices, loading: loadingInvoices } = useOfflineTable('invoices', hospital?.id)
  const { records: admissions, loading: loadingAdmissions } = useOfflineTable('admission_requests', hospital?.id)

  const loading = loadingPatients || loadingBeds || loadingVitals || loadingAppts || loadingInvoices

  // ---- Date range computation ----
  const startDate = useMemo(() => getStartDate(dateRange), [dateRange])
  const prevStartDate = useMemo(() => getPrevStartDate(dateRange), [dateRange])
  const prevEndDate = useMemo(() => getPrevEndDate(dateRange), [dateRange])
  const now = new Date()

  // ---- KPI calculations ----
  const kpis = useMemo(() => {
    const activePatients = patients.filter(p => !p.deleted_at)
    const totalPatients = activePatients.length

    // Admissions = beds currently occupied + approved admission requests
    const occupiedBeds = beds.filter(b => b.status === 'occupied').length
    const approvedAdmissions = admissions.filter(a => a.status === 'approved').length
    const totalAdmissions = occupiedBeds + approvedAdmissions

    // Discharged = beds in 'cleaning' status (recently vacated) + patients with queue_status='discharged'
    const cleaningBeds = beds.filter(b => b.status === 'cleaning').length
    const dischargedPatients = activePatients.filter(p => p.queue_status === 'discharged').length
    const totalDischarged = cleaningBeds + dischargedPatients

    // Revenue = sum of amount_paid from paid/partial invoices
    const paidInvoices = invoices.filter(i => i.status === 'paid' || i.status === 'partial')
    const totalRevenue = paidInvoices.reduce((sum, i) => sum + Number(i.amount_paid || 0), 0)

    // Previous period patients (for growth calc)
    const prevPeriodPatients = activePatients.filter(p => {
      const d = new Date(p.created_at)
      return d >= prevStartDate && d <= prevEndDate
    }).length

    const currentPeriodPatients = activePatients.filter(p => {
      const d = new Date(p.created_at)
      return d >= startDate
    }).length

    const growthPct = prevPeriodPatients > 0
      ? Math.round(((currentPeriodPatients - prevPeriodPatients) / prevPeriodPatients) * 100)
      : currentPeriodPatients > 0 ? 100 : 0

    return {
      totalPatients,
      totalAdmissions,
      totalDischarged,
      totalRevenue,
      currentPeriodPatients,
      prevPeriodPatients,
      growthPct,
    }
  }, [patients, beds, admissions, invoices, startDate, prevStartDate, prevEndDate])

  // ---- Chart 1: Patient Growth (doughnut) ----
  const patientGrowthData = useMemo(() => {
    const current = patients.filter(p => {
      const d = new Date(p.created_at)
      return d >= startDate && !p.deleted_at
    }).length
    const previous = patients.filter(p => {
      const d = new Date(p.created_at)
      return d >= prevStartDate && d <= prevEndDate && !p.deleted_at
    }).length
    return [
      { name: 'This Period', value: current, color: CHART_COLORS.teal },
      { name: 'Previous Period', value: previous, color: CHART_COLORS.muted },
    ]
  }, [patients, startDate, prevStartDate, prevEndDate])

  // ---- Chart 2: Bed Occupancy (doughnut) ----
  const bedOccupancyData = useMemo(() => {
    const occupied = beds.filter(b => b.status === 'occupied').length
    const available = beds.filter(b => b.status === 'available').length
    const cleaning = beds.filter(b => b.status === 'cleaning').length
    const reserved = beds.filter(b => b.status === 'reserved').length
    return [
      { name: 'Occupied', value: occupied, color: CHART_COLORS.gold },
      { name: 'Available', value: available, color: CHART_COLORS.teal },
      { name: 'Cleaning', value: cleaning, color: CHART_COLORS.violet },
      { name: 'Reserved', value: reserved, color: CHART_COLORS.blue },
    ].filter(d => d.value > 0)
  }, [beds])

  // ---- Chart 3: Consultation Success (radial progress) ----
  const consultationData = useMemo(() => {
    const completed = vitals.filter(v => v.status === 'completed').length
    const total = vitals.length
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0
    return { completed, total, pct }
  }, [vitals])

  // ---- Chart 4: Patient Flow (area chart, last 7 days) ----
  const patientFlowData = useMemo(() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dayKey = d.toDateString()
      const newPatients = patients.filter(p => new Date(p.created_at).toDateString() === dayKey && !p.deleted_at).length
      const visits = vitals.filter(v => {
        const vd = new Date(v.recorded_at || v.created_at)
        return vd.toDateString() === dayKey
      }).length
      days.push({
        day: d.toLocaleDateString('en-NG', { weekday: 'short' }),
        date: d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }),
        registrations: newPatients,
        visits: visits,
      })
    }
    return days
  }, [patients, vitals, now])

  // ---- Chart 5: Consultation Trends (multi-line by patient category) ----
  const consultationTrendsData = useMemo(() => {
    const categories = ['personal', 'family', 'emergency', 'anc', 'hmo']
    const categoryLabels = { personal: 'Personal', family: 'Family', emergency: 'Emergency', anc: 'ANC', hmo: 'HMO' }
    const categoryColors = { personal: CHART_COLORS.teal, family: CHART_COLORS.mint, emergency: CHART_COLORS.danger, anc: CHART_COLORS.violet, hmo: CHART_COLORS.blue }

    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dayKey = d.toDateString()
      const dayData = { day: d.toLocaleDateString('en-NG', { weekday: 'short' }) }

      for (const cat of categories) {
        const patientIds = patients.filter(p => p.category === cat).map(p => p.id)
        const count = vitals.filter(v => {
          const vd = new Date(v.recorded_at || v.created_at)
          return vd.toDateString() === dayKey && patientIds.includes(v.patient_id)
        }).length
        dayData[cat] = count
      }
      days.push(dayData)
    }
    return { data: days, categories, categoryLabels, categoryColors }
  }, [patients, vitals, now])

  // ---- Chart 6: Weekly Visits (grouped bar) ----
  const weeklyVisitsData = useMemo(() => {
    const days = []
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dayKey = d.toDateString()
      const outpatient = appointments.filter(a => {
        const ad = new Date(a.appointment_time)
        return ad.toDateString() === dayKey
      }).length
      const inpatient = vitals.filter(v => {
        const vd = new Date(v.recorded_at || v.created_at)
        return vd.toDateString() === dayKey
      }).length
      days.push({
        day: dayNames[d.getDay()],
        outpatient,
        inpatient,
      })
    }
    return days
  }, [appointments, vitals, now])

  // ---- Recent patients (for the table at the bottom) ----
  const recentPatients = useMemo(() => {
    return [...patients]
      .filter(p => !p.deleted_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 6)
  }, [patients])

  // ---- Upcoming appointments ----
  const upcomingAppointments = useMemo(() => {
    return appointments
      .filter(a => new Date(a.appointment_time) > now && a.status === 'scheduled')
      .sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time))
      .slice(0, 5)
  }, [appointments, now])

  // ---- Loading skeleton ----
  if (loading) {
    return (
      <>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{
              flex: '1 1 200px', height: 120, borderRadius: 14,
              background: 'var(--bg-elevated)', border: '1px solid var(--line)',
              animation: 'gmedhub-pulse 1.5s ease-in-out infinite alternate',
            }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} style={{
              height: 280, borderRadius: 14, background: 'var(--bg-elevated)',
              border: '1px solid var(--line)',
              animation: 'gmedhub-pulse 1.5s ease-in-out infinite alternate',
            }} />
          ))}
        </div>
        <style>{`@keyframes gmedhub-pulse { from { opacity: 0.4; } to { opacity: 0.8; } }`}</style>
      </>
    )
  }

  return (
    <>
      {/* ---- Floating card animation CSS ---- */}
      <style>{`
        .float-gentle { animation: floatGentle 12s ease-in-out infinite; }
        .float-horizontal { animation: floatHorizontal 14s ease-in-out infinite; }
        .float-diagonal { animation: floatDiagonal 16s ease-in-out infinite; }
        .float-soft { animation: floatSoft 18s ease-in-out infinite; }
        .float-accent { animation: floatAccent 10s ease-in-out infinite; }

        @keyframes floatGentle {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes floatHorizontal {
          0%, 100% { transform: translateX(0px); }
          33% { transform: translateX(5px); }
          66% { transform: translateX(-4px); }
        }
        @keyframes floatDiagonal {
          0%, 100% { transform: translate(0px, 0px); }
          25% { transform: translate(4px, -5px); }
          50% { transform: translate(-3px, -3px); }
          75% { transform: translate(-5px, 4px); }
        }
        @keyframes floatSoft {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        @keyframes floatAccent {
          0%, 100% { transform: translate(0px, 0px); }
          30% { transform: translate(3px, -7px); }
          60% { transform: translate(-4px, -2px); }
        }

        .gm-kpi-card { will-change: transform; }
        .gm-chart-card { will-change: transform; }

        @media (prefers-reduced-motion: reduce) {
          .float-gentle, .float-horizontal, .float-diagonal, .float-soft, .float-accent {
            animation: none !important;
          }
        }
      `}</style>

      {/* ---- Date Header + Range Filter ---- */}
      <section className="dash-welcome" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--ivory)' }}>
            {formatWeekdayDate(new Date(), timezone)}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
            {formatTime(new Date(), timezone)} · {hospital?.name || 'Your Hospital'}
          </div>
        </div>
        <select
          value={dateRange}
          onChange={e => setDateRange(e.target.value)}
          style={{
            padding: '8px 14px', borderRadius: 10, border: '1px solid var(--teal-border)',
            background: 'var(--bg-elevated)', color: 'var(--ivory)',
            fontSize: 12.5, fontWeight: 600, cursor: 'pointer', outline: 'none',
          }}
        >
          {DATE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </section>

      {/* ---- KPI Cards ---- */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        <KPICard
          label="Total Patients"
          value={kpis.totalPatients.toLocaleString()}
          icon="users"
          color={CHART_COLORS.teal}
          delta={kpis.growthPct >= 0 ? `+${kpis.growthPct}% vs last period` : `${kpis.growthPct}% vs last period`}
          deltaPositive={kpis.growthPct >= 0}
        />
        <KPICard
          label="Admissions"
          value={kpis.totalAdmissions.toString()}
          icon="bed"
          color={CHART_COLORS.violet}
          delta={`${kpis.occupiedBeds || 0} beds occupied`}
          deltaPositive={true}
        />
        <KPICard
          label="Discharged"
          value={kpis.totalDischarged.toString()}
          icon="check"
          color={CHART_COLORS.mint}
          delta="Recently discharged"
          deltaPositive={true}
        />
        <KPICard
          label="Revenue"
          value={formatMoney(kpis.totalRevenue)}
          icon="billing"
          color={CHART_COLORS.gold}
          delta={`${invoices.filter(i => i.status === 'paid').length} paid invoices`}
          deltaPositive={true}
        />
      </section>

      {/* ---- Charts Grid (3 columns on desktop, 1 on mobile) ---- */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>

        {/* Chart 1: Patient Growth */}
        <ChartCard title="Patient Growth" subtitle={`New patients: ${kpis.currentPeriodPatients} this period`}>
          {patientGrowthData.every(d => d.value === 0) ? (
            <EmptyState text="No patient registrations in this period yet." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={patientGrowthData}
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {patientGrowthData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11, color: 'var(--muted)', paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Chart 2: Bed Occupancy */}
        <ChartCard title="Bed Occupancy" subtitle={`${beds.length} total beds · ${beds.filter(b => b.status === 'occupied').length} occupied`}>
          {beds.length === 0 ? (
            <EmptyState text="No beds configured. Set up beds in IPD Management." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={bedOccupancyData}
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ value }) => value}
                  labelLine={false}
                >
                  {bedOccupancyData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11, color: 'var(--muted)', paddingTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Chart 3: Consultation Success */}
        <ChartCard title="Consultation Success" subtitle={`${consultationData.completed} of ${consultationData.total} completed`}>
          {consultationData.total === 0 ? (
            <EmptyState text="No consultations recorded yet." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <RadialBarChart
                cx="50%" cy="50%"
                innerRadius="55%" outerRadius="85%"
                barSize={18}
                data={[{ name: 'Completed', value: consultationData.pct, fill: CHART_COLORS.teal }]}
                startAngle={90} endAngle={90 + (consultationData.pct / 100) * 360}
              >
                <RadialBar background={{ fill: CHART_COLORS.muted }} dataKey="value" cornerRadius={12} />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
                  style={{ fill: '#F1F6FA', fontSize: 28, fontWeight: 800 }}>
                  {consultationData.pct}%
                </text>
              </RadialBarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Chart 4: Patient Flow (area chart, 7 days) */}
        <ChartCard title="Patient Flow" subtitle="Last 7 days — registrations vs visits" wide>
          {patientFlowData.every(d => d.registrations === 0 && d.visits === 0) ? (
            <EmptyState text="No patient activity in the last 7 days." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={patientFlowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="tealAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.teal} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={CHART_COLORS.teal} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="mintAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.mint} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={CHART_COLORS.mint} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#17252F" vertical={false} />
                <XAxis dataKey="day" stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#9AAAB7', fontSize: 11 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="registrations" name="New Patients" stroke={CHART_COLORS.teal} strokeWidth={2} fill="url(#tealAreaGrad)" />
                <Area type="monotone" dataKey="visits" name="Visits" stroke={CHART_COLORS.mint} strokeWidth={2} fill="url(#mintAreaGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Chart 5: Consultation Trends (multi-line by patient category) */}
        <ChartCard title="Consultation Trends" subtitle="By patient category — last 7 days" wide>
          {consultationTrendsData.data.every(d => consultationTrendsData.categories.every(c => (d[c] || 0) === 0)) ? (
            <EmptyState text="No consultation data for the last 7 days." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={consultationTrendsData.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#17252F" vertical={false} />
                <XAxis dataKey="day" stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#9AAAB7', fontSize: 11 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                {consultationTrendsData.categories.map(cat => (
                  <Line
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    name={consultationTrendsData.categoryLabels[cat]}
                    stroke={consultationTrendsData.categoryColors[cat]}
                    strokeWidth={2}
                    dot={{ r: 3, fill: consultationTrendsData.categoryColors[cat] }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Chart 6: Weekly Visits (grouped bar) */}
        <ChartCard title="Weekly Visits" subtitle="Outpatient vs Inpatient — last 7 days" wide>
          {weeklyVisitsData.every(d => d.outpatient === 0 && d.inpatient === 0) ? (
            <EmptyState text="No visit data for the last 7 days." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weeklyVisitsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#17252F" vertical={false} />
                <XAxis dataKey="day" stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#9AAAB7', fontSize: 11 }} cursor={{ fill: 'rgba(0,199,199,0.06)' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="outpatient" name="Outpatient" fill={CHART_COLORS.teal} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="inpatient" name="Inpatient" fill={CHART_COLORS.violet} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </section>

      {/* ---- Recent Patients + Upcoming Appointments (bottom row) ---- */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* Recent Patients */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Recent Patients</div>
              <div className="dash-panel-sub">Latest registrations</div>
            </div>
          </div>
          {recentPatients.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No patients registered yet.
            </div>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-full-table">
                <thead><tr><th>Patient</th><th>Age</th><th>Gender</th><th>Registered</th></tr></thead>
                <tbody>
                  {recentPatients.map(p => (
                    <tr key={p.id}>
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

        {/* Upcoming Appointments */}
        <div className="dash-panel">
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Upcoming Appointments</div>
              <div className="dash-panel-sub">Scheduled visits</div>
            </div>
          </div>
          {upcomingAppointments.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No upcoming appointments.
            </div>
          ) : (
            <div style={{ padding: '4px 0 12px' }}>
              {upcomingAppointments.map((a, i) => (
                <div key={a.id || i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', marginBottom: 6, borderRadius: 8,
                  background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{a.patient_name || 'Patient'}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.reason || a.appointment_type || 'Appointment'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)' }}>{formatTime(a.appointment_time, timezone)}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{formatDateTime(a.appointment_time, timezone)}</div>
                  </div>
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
// KPICard — premium stat card with gradient icon, sparkline area
// =====================================================================

const FLOAT_CLASSES = ['float-gentle', 'float-horizontal', 'float-diagonal', 'float-accent']
let floatIdx = 0
function nextFloatClass() {
  const cls = FLOAT_CLASSES[floatIdx % FLOAT_CLASSES.length]
  floatIdx++
  return cls
}

function KPICard({ label, value, icon, color, delta, deltaPositive }) {
  const floatClass = useMemo(() => nextFloatClass(), [])
  return (
    <div
      className={`gm-kpi-card ${floatClass}`}
      style={{
        borderRadius: 14,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--line)',
        padding: 18,
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color + '44'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,199,199,0.08)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = '' }}
    >
      {/* Subtle gradient glow */}
      <div style={{
        position: 'absolute', top: -20, right: -20, width: 80, height: 80,
        borderRadius: '50%', background: color + '11', filter: 'blur(20px)',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12,
          background: color + '1A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <AppIcon name={icon} size={20} style={{ color }} />
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ivory)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{
        fontSize: 11, marginTop: 6, fontWeight: 600,
        color: deltaPositive ? 'var(--mint)' : 'var(--danger)',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <AppIcon name={deltaPositive ? 'arrowUp' : 'arrowDown'} size={12} />
        {delta}
      </div>
    </div>
  )
}

// =====================================================================
// ChartCard — wrapper for each chart with title + subtitle
// =====================================================================

function ChartCard({ title, subtitle, children, wide }) {
  const floatClass = useMemo(() => wide ? 'float-soft' : nextFloatClass(), [wide])
  return (
    <div
      className={`gm-chart-card ${floatClass}`}
      style={{
        borderRadius: 14,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--line)',
        padding: 18,
        gridColumn: wide ? '1 / -1' : undefined,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,199,199,0.2)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,199,199,0.06)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = '' }}
    >
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ivory)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}

// =====================================================================
// EmptyState — shown when a chart has no data
// =====================================================================

function EmptyState({ text }) {
  return (
    <div style={{
      height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--muted-dim)', fontSize: 12.5, textAlign: 'center', fontStyle: 'italic',
    }}>
      {text}
    </div>
  )
}
