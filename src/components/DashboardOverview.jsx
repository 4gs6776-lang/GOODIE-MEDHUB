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
// GOODIE-MEDHUB — Premium Gradient Dashboard
//
// Multi-color gradients + glass effects + animated lighting + floating cards
// All real data. No new dependencies. No database changes.
// =====================================================================

const C = {
  navy: '#071522', midnight: '#0B1F33', cyan: '#20D9FF', teal: '#00D6C9',
  emerald: '#10D9A0', violet: '#8067FF', blue: '#4287FF', gold: '#E8B82E',
  danger: '#F04F5F', muted: '#2A3A46',
}

const DATE_RANGES = [
  { value: '7d', label: 'Last 7 Days' }, { value: '30d', label: 'Last 30 Days' },
  { value: 'month', label: 'This Month' }, { value: 'lastmonth', label: 'Last Month' },
  { value: 'year', label: 'This Year' },
]

function getStartDate(r) {
  const n = new Date()
  switch (r) {
    case '7d': return new Date(n.getTime() - 7 * 864e5)
    case '30d': return new Date(n.getTime() - 30 * 864e5)
    case 'month': return new Date(n.getFullYear(), n.getMonth(), 1)
    case 'lastmonth': return new Date(n.getFullYear(), n.getMonth() - 1, 1)
    case 'year': return new Date(n.getFullYear(), 0, 1)
    default: return new Date(n.getTime() - 7 * 864e5)
  }
}

const fmtMoney = n => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const ttStyle = { backgroundColor: '#070F14', border: '1px solid rgba(0,214,201,0.2)', borderRadius: 10, fontSize: 12, color: '#F1F6FA', padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }

// ---- Hooks ----
function useCountUp(target, dur = 800) {
  const [v, setV] = useState(0)
  const raf = useRef(null)
  const prev = useRef(0)
  useEffect(() => {
    const red = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (red || target === 0) { setV(target); prev.current = target; return }
    if (prev.current === target) return
    prev.current = target
    const s = performance.now()
    const a = n => { const e = n - s; const p = Math.min(e / dur, 1); setV(Math.round(target * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf.current = requestAnimationFrame(a) }
    raf.current = requestAnimationFrame(a)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [target, dur])
  return v
}

function useStagger(d) {
  const [m, setM] = useState(false)
  useEffect(() => {
    const r = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (r) { setM(true); return }
    const t = setTimeout(() => setM(true), d)
    return () => clearTimeout(t)
  }, [d])
  return m
}

// ---- Floating class round-robin ----
const FLOATS = ['fv1', 'fv2', 'fv3', 'fv4', 'fv5', 'fr1']
let _i = 0
const nf = () => { const c = FLOATS[_i % FLOATS.length]; _i++; return c }

export default function DashboardOverview({ hospital, profile }) {
  const tz = getTimezone(hospital)
  const [dr, setDr] = useState('7d')
  const [rk, setRk] = useState(0)
  const sd = useMemo(() => getStartDate(dr), [dr])
  const now = new Date()

  const { records: patients, loading: lP } = useOfflineTable('patients', hospital?.id)
  const { records: beds, loading: lB } = useOfflineTable('beds', hospital?.id)
  const { records: vitals, loading: lV } = useOfflineTable('patient_vitals', hospital?.id)
  const { records: appts, loading: lA } = useOfflineTable('appointments', hospital?.id)
  const { records: invs, loading: lI } = useOfflineTable('invoices', hospital?.id)
  const { records: admis, loading: lAd } = useOfflineTable('admission_requests', hospital?.id)
  const loading = lP || lB || lV || lA || lI

  const k = useMemo(() => {
    const ap = patients.filter(p => !p.deleted_at)
    const occ = beds.filter(b => b.status === 'occupied').length
    const appr = admis.filter(a => a.status === 'approved').length
    const cln = beds.filter(b => b.status === 'cleaning').length
    const dis = ap.filter(p => p.queue_status === 'discharged').length
    const paid = invs.filter(i => i.status === 'paid' || i.status === 'partial')
    const rev = paid.reduce((s, i) => s + Number(i.amount_paid || 0), 0)
    const cur = ap.filter(p => new Date(p.created_at) >= sd).length
    const pe = dr === '7d' ? new Date(now.getTime() - 14 * 864e5) : dr === '30d' ? new Date(now.getTime() - 60 * 864e5) : new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const pend = dr === '7d' ? new Date(now.getTime() - 7 * 864e5) : dr === '30d' ? new Date(now.getTime() - 30 * 864e5) : new Date(now.getFullYear(), now.getMonth(), 0)
    const prev = ap.filter(p => { const d = new Date(p.created_at); return d >= pe && d <= pend }).length
    const gp = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? 100 : 0
    return { total: ap.length, adm: occ + appr, dis: cln + dis, rev, cur, gp, occ }
  }, [patients, beds, admis, invs, sd, dr, now])

  const pgData = useMemo(() => {
    const days = dr === 'year' ? 30 : dr === 'month' || dr === 'lastmonth' ? 30 : 7
    const a = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 864e5)
      const dk = d.toDateString()
      a.push({ date: d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }), patients: patients.filter(p => new Date(p.created_at).toDateString() === dk && !p.deleted_at).length })
    }
    return a
  }, [patients, dr, now])

  const bedData = useMemo(() => [
    { name: 'Occupied', value: beds.filter(b => b.status === 'occupied').length, color: C.gold },
    { name: 'Available', value: beds.filter(b => b.status === 'available').length, color: C.teal },
    { name: 'Cleaning', value: beds.filter(b => b.status === 'cleaning').length, color: C.violet },
    { name: 'Reserved', value: beds.filter(b => b.status === 'reserved').length, color: C.blue },
  ].filter(d => d.value > 0), [beds])

  const cd = useMemo(() => { const c = vitals.filter(v => v.status === 'completed').length; const t = vitals.length; return { c, t, p: t > 0 ? Math.round((c / t) * 100) : 0 } }, [vitals])

  const flow = useMemo(() => {
    const a = []
    for (let i = 6; i >= 0; i--) { const d = new Date(now.getTime() - i * 864e5); const dk = d.toDateString()
      a.push({ day: d.toLocaleDateString('en-NG', { weekday: 'short' }), reg: patients.filter(p => new Date(p.created_at).toDateString() === dk && !p.deleted_at).length, vis: vitals.filter(v => new Date(v.recorded_at || v.created_at).toDateString() === dk).length }) }
    return a
  }, [patients, vitals, now])

  const trends = useMemo(() => {
    const cs = ['personal', 'family', 'emergency', 'anc', 'hmo']
    const lb = { personal: 'Personal', family: 'Family', emergency: 'Emergency', anc: 'ANC', hmo: 'HMO' }
    const cl = { personal: C.teal, family: C.emerald, emergency: C.danger, anc: C.violet, hmo: C.blue }
    const a = []
    for (let i = 6; i >= 0; i--) { const d = new Date(now.getTime() - i * 864e5); const dk = d.toDateString(); const dd = { day: d.toLocaleDateString('en-NG', { weekday: 'short' }) }
      for (const c of cs) { const pids = patients.filter(p => p.category === c).map(p => p.id); dd[c] = vitals.filter(v => new Date(v.recorded_at || v.created_at).toDateString() === dk && pids.includes(v.patient_id)).length }
      a.push(dd) }
    return { data: a, cs, lb, cl }
  }, [patients, vitals, now])

  const vis = useMemo(() => {
    const a = []; const ns = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    for (let i = 6; i >= 0; i--) { const d = new Date(now.getTime() - i * 864e5); const dk = d.toDateString()
      a.push({ day: ns[d.getDay()], op: appts.filter(a => new Date(a.appointment_time).toDateString() === dk).length, ip: vitals.filter(v => new Date(v.recorded_at || v.created_at).toDateString() === dk).length }) }
    return a
  }, [appts, vitals, now])

  const rp = useMemo(() => [...patients].filter(p => !p.deleted_at).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6), [patients])
  const up = useMemo(() => appts.filter(a => new Date(a.appointment_time) > now && a.status === 'scheduled').sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time)).slice(0, 5), [appts, now])

  const hrc = e => { setDr(e.target.value); setRk(k => k + 1) }

  if (loading) {
    return (
      <>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map(i => <div key={i} className="gm-shimmer" style={{ flex: '1 1 200px', height: 120, borderRadius: 16, background: C.midnight, border: '1px solid rgba(0,214,201,0.08)', position: 'relative', overflow: 'hidden' }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="gm-shimmer" style={{ height: 280, borderRadius: 16, background: C.midnight, border: '1px solid rgba(0,214,201,0.08)', position: 'relative', overflow: 'hidden' }} />)}
        </div>
        <style>{`.gm-shimmer::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(0,214,201,0.04),transparent);animation:gm-sw 1.5s ease-in-out infinite}@keyframes gm-sw{from{transform:translateX(-100%)}to{transform:translateX(100%)}}@media(prefers-reduced-motion:reduce){.gm-shimmer::after{animation:none}}`}</style>
      </>
    )
  }

  return (
    <>
      <style>{`
        /* ---- Entrance ---- */
        @keyframes gm-e { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes gm-fi { from { opacity: 0; } to { opacity: 1; } }
        .gm-e { animation: gm-e 500ms cubic-bezier(0.22,1,0.36,1) both; }
        .gm-fi { animation: gm-fi 500ms ease-out both; }

        /* ---- Floating animations (faster: 5-9s) ---- */
        .fv1 { animation: fva 6s ease-in-out infinite; }
        .fv2 { animation: fha 7s ease-in-out infinite; }
        .fv3 { animation: fda 8s ease-in-out infinite; }
        .fv4 { animation: fvb 5s ease-in-out infinite; }
        .fv5 { animation: fdb 9s ease-in-out infinite; }
        .fr1 { animation: fra 10s ease-in-out infinite; }
        @keyframes fva { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes fha { 0%,100%{transform:translateX(0)} 33%{transform:translateX(8px)} 66%{transform:translateX(-6px)} }
        @keyframes fda { 0%,100%{transform:translate(0,0)} 25%{transform:translate(6px,-8px)} 50%{transform:translate(-5px,-5px)} 75%{transform:translate(-8px,6px)} }
        @keyframes fvb { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes fdb { 0%,100%{transform:translate(0,0)} 30%{transform:translate(5px,-10px)} 60%{transform:translate(-7px,-3px)} }
        @keyframes fra { 0%,100%{transform:translateY(0)} 30%{transform:translateY(-16px)} 60%{transform:translateY(-8px)} }

        /* ---- Animated gradient backgrounds (slowly shifting) ---- */
        @keyframes gm-shift { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        .gm-grad-anim { background-size: 200% 200%; animation: gm-shift 8s ease-in-out infinite; }

        /* ---- Moving light reflection ---- */
        .gm-glass::before {
          content: ''; position: absolute; top: 0; left: -100%; width: 60%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.025), transparent);
          animation: gm-sweep-light 7s ease-in-out infinite;
          pointer-events: none; z-index: 1;
        }
        @keyframes gm-sweep-light { 0%,100%{left:-100%} 50%{left:200%} }

        /* ---- Pulsing glow ---- */
        @keyframes gm-pulse-glow { 0%,100%{opacity:0.3} 50%{opacity:0.6} }

        /* ---- Hover ---- */
        .gm-kpi-card { transition: border-color 0.3s, box-shadow 0.3s; }
        .gm-kpi-card:hover { box-shadow: 0 12px 40px rgba(0,214,201,0.12); }
        .gm-chart-card { transition: border-color 0.3s, box-shadow 0.3s; }
        .gm-chart-card:hover { box-shadow: 0 8px 28px rgba(0,214,201,0.08); }

        .gm-select { transition: border-color 0.2s, box-shadow 0.2s; }
        .gm-select:hover { border-color: rgba(0,214,201,0.35); }
        .gm-select:focus { border-color: var(--teal); box-shadow: 0 0 0 3px rgba(0,214,201,0.1); }
        .gm-row { transition: background 0.15s, border-color 0.15s; }

        .gm-kpi-card, .gm-chart-card { will-change: transform; }

        @media (prefers-reduced-motion: reduce) {
          .gm-e, .gm-fi { animation: none !important; opacity: 1; transform: none; }
          .fv1,.fv2,.fv3,.fv4,.fv5,.fr1 { animation: none !important; }
          .gm-grad-anim { animation: none !important; }
          .gm-glass::before { animation: none !important; }
          .gm-kpi-card, .gm-chart-card, .gm-select, .gm-row { transition: none; }
          .gm-shimmer::after { animation: none; }
        }
      `}</style>

      {/* ---- Date Header ---- */}
      <section className="gm-fi" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--ivory)' }}>{formatWeekdayDate(new Date(), tz)}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{formatTime(new Date(), tz)} · {hospital?.name || 'Your Hospital'}</div>
        </div>
        <select className="gm-select" value={dr} onChange={hrc} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(0,214,201,0.2)', background: C.midnight, color: 'var(--ivory)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
          {DATE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </section>

      {/* ---- KPI Cards ---- */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        <KPICard label="Total Patients" target={k.total} icon="users" gradFrom={C.midnight} gradTo={C.navy} accent={C.teal} delay={0} delta={`${k.gp >= 0 ? '+' : ''}${k.gp}%`} positive={k.gp >= 0} fmt={v => v.toLocaleString()} />
        <KPICard label="Admissions" target={k.adm} icon="bed" gradFrom={C.midnight} gradTo={C.navy} accent={C.violet} delay={70} delta={`${k.occ} beds occupied`} positive={true} fmt={v => v.toString()} />
        <KPICard label="Discharged" target={k.dis} icon="check" gradFrom={C.midnight} gradTo={C.navy} accent={C.emerald} delay={140} delta="Recently discharged" positive={true} fmt={v => v.toString()} />
        <KPICard label="Revenue" target={k.rev} icon="billing" gradFrom={C.midnight} gradTo={C.navy} accent={C.gold} delay={210} delta={`${invs.filter(i => i.status === 'paid').length} paid`} positive={true} fmt={fmtMoney} />
      </section>

      {/* ---- Patient Growth (glowing area chart) ---- */}
      <PatientGrowthChart data={pgData} count={k.cur} growth={k.gp} rk={rk} dr={dr} onRange={hrc} />

      {/* ---- Charts Grid ---- */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20, marginTop: 16 }}>
        <ChartCard title="Bed Occupancy" subtitle={`${beds.length} total · ${beds.filter(b => b.status === 'occupied').length} occupied`} delay={350} accent={C.cyan} gradFrom={C.midnight} gradTo={C.navy}>
          {beds.length === 0 ? <Empty text="No beds configured." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart><Pie data={bedData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" isAnimationActive animationDuration={700} animationBegin={200}>{bedData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie>
                <Tooltip contentStyle={ttStyle} /><Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11, color: 'var(--muted)', paddingTop: 8 }} /></PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Consultation Success" subtitle={`${cd.c} of ${cd.t} completed`} delay={420} accent={C.emerald} gradFrom={C.midnight} gradTo={C.navy}>
          {cd.t === 0 ? <Empty text="No consultations recorded yet." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <RadialBarChart cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" barSize={18} data={[{ name: 'Completed', value: cd.p, fill: C.teal }]} startAngle={90} endAngle={90 + (cd.p / 100) * 360} isAnimationActive animationDuration={700}>
                <RadialBar background={{ fill: C.muted }} dataKey="value" cornerRadius={12} isAnimationActive animationDuration={700} />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" style={{ fill: '#F1F6FA', fontSize: 28, fontWeight: 800 }}>{cd.p}%</text>
              </RadialBarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Patient Flow" subtitle="Last 7 days" wide delay={490} accent={C.teal} gradFrom={C.midnight} gradTo={C.navy}>
          {flow.every(d => d.reg === 0 && d.vis === 0) ? <Empty text="No patient activity." /> : (
            <ResponsiveContainer width="100%" height={240} key={`fl-${rk}`}>
              <AreaChart data={flow} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs><linearGradient id="tG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.teal} stopOpacity={0.4} /><stop offset="100%" stopColor={C.teal} stopOpacity={0} /></linearGradient>
                <linearGradient id="eG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.emerald} stopOpacity={0.3} /><stop offset="100%" stopColor={C.emerald} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#17252F" vertical={false} />
                <XAxis dataKey="day" stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={ttStyle} labelStyle={{ color: '#9AAAB7', fontSize: 11 }} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area type="monotone" dataKey="reg" name="New Patients" stroke={C.teal} strokeWidth={2} fill="url(#tG)" isAnimationActive animationDuration={700} animationBegin={200} />
                <Area type="monotone" dataKey="vis" name="Visits" stroke={C.emerald} strokeWidth={2} fill="url(#eG)" isAnimationActive animationDuration={700} animationBegin={400} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Consultation Trends" subtitle="By category — 7 days" wide delay={560} accent={C.violet} gradFrom={C.midnight} gradTo={C.navy}>
          {trends.data.every(d => trends.cs.every(c => (d[c] || 0) === 0)) ? <Empty text="No consultation data." /> : (
            <ResponsiveContainer width="100%" height={240} key={`tr-${rk}`}>
              <LineChart data={trends.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#17252F" vertical={false} />
                <XAxis dataKey="day" stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={ttStyle} labelStyle={{ color: '#9AAAB7', fontSize: 11 }} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                {trends.cs.map((cat, i) => <Line key={cat} type="monotone" dataKey={cat} name={trends.lb[cat]} stroke={trends.cl[cat]} strokeWidth={2} dot={{ r: 3, fill: trends.cl[cat] }} activeDot={{ r: 5 }} connectNulls isAnimationActive animationDuration={700} animationBegin={200 + i * 80} />)}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Weekly Visits" subtitle="Outpatient vs Inpatient" wide delay={630} accent={C.blue} gradFrom={C.midnight} gradTo={C.navy}>
          {vis.every(d => d.op === 0 && d.ip === 0) ? <Empty text="No visit data." /> : (
            <ResponsiveContainer width="100%" height={240} key={`vs-${rk}`}>
              <BarChart data={vis} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#17252F" vertical={false} />
                <XAxis dataKey="day" stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#9AAAB7" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={ttStyle} labelStyle={{ color: '#9AAAB7', fontSize: 11 }} cursor={{ fill: 'rgba(0,214,201,0.06)' }} /><Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="op" name="Outpatient" fill={C.teal} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive animationDuration={700} animationBegin={200} />
                <Bar dataKey="ip" name="Inpatient" fill={C.violet} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive animationDuration={700} animationBegin={400} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </section>

      {/* ---- Bottom cards (rise + return) ---- */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className={`dash-panel gm-e fr1 gm-glass`} style={{ animationDelay: '700ms', borderRadius: 16, background: `linear-gradient(135deg, ${C.midnight}, ${C.navy})`, border: '1px solid rgba(0,214,201,0.1)', position: 'relative', overflow: 'hidden' }}>
          <div className="dash-panel-head"><div><div className="dash-panel-title">Recent Patients</div><div className="dash-panel-sub">Latest registrations</div></div></div>
          {rp.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No patients registered yet.</div> : (
            <div className="dash-table-wrap"><table className="dash-full-table"><thead><tr><th>Patient</th><th>Age</th><th>Gender</th><th>Registered</th></tr></thead>
              <tbody>{rp.map(p => <tr key={p.id} className="gm-row" onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,214,201,0.03)'} onMouseLeave={e => e.currentTarget.style.background = ''}><td style={{ fontWeight: 700 }}>{p.full_name}</td><td>{p.age || '—'}</td><td>{p.gender || '—'}</td><td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{formatDateTime(p.created_at, tz)}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>

        <div className={`dash-panel gm-e fdb gm-glass`} style={{ animationDelay: '770ms', borderRadius: 16, background: `linear-gradient(135deg, ${C.midnight}, ${C.navy})`, border: '1px solid rgba(0,214,201,0.1)', position: 'relative', overflow: 'hidden' }}>
          <div className="dash-panel-head"><div><div className="dash-panel-title">Upcoming Appointments</div><div className="dash-panel-sub">Scheduled visits</div></div></div>
          {up.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No upcoming appointments.</div> : (
            <div style={{ padding: '4px 0 12px' }}>{up.map((a, i) => (
              <div key={a.id || i} className="gm-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', marginBottom: 6, borderRadius: 8, background: C.navy, border: '1px solid rgba(0,214,201,0.06)' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,214,201,0.15)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(0,214,201,0.06)'}>
                <div><div style={{ fontWeight: 700, fontSize: 13 }}>{a.patient_name || 'Patient'}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.reason || a.appointment_type || 'Appointment'}</div></div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, fontWeight: 700, color: C.teal }}>{formatTime(a.appointment_time, tz)}</div><div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{formatDateTime(a.appointment_time, tz)}</div></div>
              </div>))}
            </div>
          )}
        </div>
      </section>

      <footer style={{ marginTop: 30, padding: '16px 0', borderTop: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted-dim)' }}>
        <span>© {new Date().getFullYear()} {hospital?.name || 'G-MedHub'}. All rights reserved.</span><span>HMS v2.0.0</span>
      </footer>
    </>
  )
}

// =====================================================================
// PatientGrowthChart — glowing area chart
// =====================================================================
function PatientGrowthChart({ data, count, growth, rk, dr, onRange }) {
  const m = useStagger(280)
  const total = data.reduce((s, d) => s + d.patients, 0)
  return (
    <div className={`gm-chart-card gm-glass ${m ? 'gm-e' : ''} fv1`} style={{
      borderRadius: 16, padding: 20, marginBottom: 16,
      background: `linear-gradient(135deg, ${C.navy}, ${C.midnight})`,
      border: '1px solid rgba(0,214,201,0.12)',
      opacity: m ? undefined : 0, animationDelay: m ? '280ms' : undefined,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Animated radial glow */}
      <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: '50%', background: `radial-gradient(circle, ${C.teal}15, transparent 70%)`, animation: 'gm-pulse-glow 6s ease-in-out infinite', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, position: 'relative', zIndex: 2 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ivory)' }}>Patient Growth</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
            <span style={{ color: C.teal, fontWeight: 700 }}>{total}</span> new patients
            <span style={{ marginLeft: 10, color: growth >= 0 ? C.emerald : C.danger, fontWeight: 700 }}>{growth >= 0 ? '↑' : '↓'} {Math.abs(growth)}%</span>
          </div>
        </div>
        <select className="gm-select" value={dr} onChange={onRange} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(0,214,201,0.2)', background: C.midnight, color: 'var(--ivory)', fontSize: 11.5, cursor: 'pointer', outline: 'none' }}>
          {DATE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      {total === 0 ? <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-dim)', fontSize: 12.5, fontStyle: 'italic' }}>No patient registrations in this period.</div> : (
        <ResponsiveContainer width="100%" height={200} key={`pg-${rk}`}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id="pgG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.teal} stopOpacity={0.35} /><stop offset="50%" stopColor={C.cyan} stopOpacity={0.15} /><stop offset="100%" stopColor={C.teal} stopOpacity={0} /></linearGradient>
              <filter id="pgGlow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(23,37,47,0.5)" vertical={false} />
            <XAxis dataKey="date" stroke="#5C6B76" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis stroke="#5C6B76" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
            <Tooltip contentStyle={ttStyle} labelStyle={{ color: C.cyan, fontSize: 11 }} />
            <Area type="monotone" dataKey="patients" name="New Patients" stroke={C.teal} strokeWidth={2.5} fill="url(#pgG)" filter="url(#pgGlow)" dot={{ r: 3, fill: C.teal, stroke: C.cyan, strokeWidth: 1 }} activeDot={{ r: 6, fill: C.cyan, stroke: '#fff', strokeWidth: 2 }} isAnimationActive animationDuration={800} animationBegin={300} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// =====================================================================
// KPICard — multi-gradient + glass + floating + count-up
// =====================================================================
function KPICard({ label, target, icon, gradFrom, gradTo, accent, delta, positive, delay, fmt }) {
  const v = useCountUp(target)
  const m = useStagger(delay)
  const fc = useMemo(() => nf(), [])
  return (
    <div className={`gm-kpi-card gm-glass ${m ? 'gm-e' : ''} ${fc}`} style={{
      borderRadius: 16, padding: 18, position: 'relative', overflow: 'hidden',
      background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})`,
      border: `1px solid ${accent}22`,
      opacity: m ? undefined : 0, animationDelay: m ? `${delay}ms` : undefined,
    }} onMouseEnter={e => { e.currentTarget.style.borderColor = accent + '55'; e.currentTarget.style.boxShadow = `0 12px 40px ${accent}18` }} onMouseLeave={e => { e.currentTarget.style.borderColor = accent + '22'; e.currentTarget.style.boxShadow = '' }}>
      {/* Radial gradient glow */}
      <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: `radial-gradient(circle, ${accent}15, transparent 70%)`, animation: 'gm-pulse-glow 5s ease-in-out infinite', pointerEvents: 'none' }} />
      {/* Gradient icon */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, position: 'relative', zIndex: 2 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: `linear-gradient(135deg, ${accent}25, ${accent}10)`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${accent}20` }}>
          <AppIcon name={icon} size={18} style={{ color: accent }} />
        </div>
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, position: 'relative', zIndex: 2 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ivory)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.1, position: 'relative', zIndex: 2 }}>{fmt(v)}</div>
      <div style={{ fontSize: 10.5, marginTop: 5, fontWeight: 600, color: positive ? C.emerald : C.danger, display: 'flex', alignItems: 'center', gap: 3, opacity: v === target ? 1 : 0, transition: 'opacity 0.3s', position: 'relative', zIndex: 2 }}>
        <AppIcon name={positive ? 'arrowUp' : 'arrowDown'} size={11} /> {delta}
      </div>
    </div>
  )
}

// =====================================================================
// ChartCard — multi-gradient + glass + floating
// =====================================================================
function ChartCard({ title, subtitle, children, wide, delay, accent, gradFrom, gradTo }) {
  const m = useStagger(delay || 0)
  const fc = useMemo(() => wide ? 'fv1' : nf(), [wide])
  return (
    <div className={`gm-chart-card gm-glass ${m ? 'gm-e' : ''} ${fc}`} style={{
      borderRadius: 16, padding: 18, gridColumn: wide ? '1 / -1' : undefined,
      background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})`,
      border: `1px solid ${accent}1A`,
      opacity: m ? undefined : 0, animationDelay: m ? `${delay || 0}ms` : undefined,
      position: 'relative', overflow: 'hidden',
    }} onMouseEnter={e => { e.currentTarget.style.borderColor = accent + '33'; e.currentTarget.style.boxShadow = `0 8px 28px ${accent}12` }} onMouseLeave={e => { e.currentTarget.style.borderColor = accent + '1A'; e.currentTarget.style.boxShadow = '' }}>
      {/* Decorative gradient overlay */}
      <div style={{ position: 'absolute', top: 0, right: 0, width: 100, height: 100, background: `radial-gradient(circle at top right, ${accent}08, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ marginBottom: 12, position: 'relative', zIndex: 2 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ivory)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ position: 'relative', zIndex: 2 }}>{children}</div>
    </div>
  )
}

function Empty({ text }) {
  return <div className="gm-fi" style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-dim)', fontSize: 12.5, textAlign: 'center', fontStyle: 'italic' }}>{text}</div>
}
