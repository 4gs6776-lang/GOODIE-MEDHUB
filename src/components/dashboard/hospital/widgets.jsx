import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'

// =====================================================================
// Small reusable pieces for the hospital overview. Nothing in here
// fetches data — every value arrives through props.
// =====================================================================

// ---- helpers -------------------------------------------------------
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  )
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  return reduced
}

// Watches the existing "light-mode" class on <html> (set by the app's
// theme toggle) so chart colours can follow the theme without a second
// theme system.
export function useThemeMode() {
  const read = () => (document.documentElement.classList.contains('light-mode') ? 'light' : 'dark')
  const [mode, setMode] = useState(read)
  useEffect(() => {
    const obs = new MutationObserver(() => setMode(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return mode
}

export const PALETTE = {
  dark: { blue: '#4169FF', cyan: '#20D9E8', purple: '#9333EA', pink: '#F044B8', amber: '#F5C451', green: '#34D399', grid: '#1B1B24', axis: '#92929D' },
  light: { blue: '#3052E0', cyan: '#0E8FA8', purple: '#7E22CE', pink: '#D6258F', amber: '#C98A0B', green: '#0F9F6E', grid: '#E4E7EE', axis: '#5E6675' },
}

export const nf = new Intl.NumberFormat('en-NG')
export const money = (n) => '₦' + nf.format(Math.round(Number(n || 0)))

// ---- animated number ----------------------------------------------
// Counts from what is currently shown to the real value. It only runs
// when the real value changes (not on every render), starts only once
// the data has loaded, and jumps straight to the value when the person
// prefers reduced motion.
export function useCountUp(target, ready, duration = 800) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(0)
  const shownRef = useRef(0)
  useEffect(() => {
    if (!ready) return undefined
    const to = Number.isFinite(Number(target)) ? Number(target) : 0
    if (reduced || to === shownRef.current) {
      shownRef.current = to
      setShown(to)
      return undefined
    }
    const from = shownRef.current
    const t0 = performance.now()
    let raf
    const step = (now) => {
      const p = Math.min((now - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      const v = Math.round(from + (to - from) * eased)
      shownRef.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ready, reduced, duration])
  return shown
}

export function AnimatedNumber({ value, ready, format = (n) => nf.format(n) }) {
  const v = useCountUp(value, ready)
  return <span className="hd-num">{ready ? format(v) : '—'}</span>
}

// ---- sparkline (draws the real series) ----------------------------
function smoothPath(points) {
  if (points.length < 2) return ''
  let d = `M${points[0][0]},${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0]},${p2[1]}`
  }
  return d
}

export function Sparkline({ data, color, width = 96, height = 30 }) {
  const values = (data || []).map((p) => p.value)
  if (values.length < 2 || values.every((v) => v === 0)) return null
  const max = Math.max(...values)
  const pad = 3
  const pts = values.map((v, i) => [
    pad + (i * (width - pad * 2)) / (values.length - 1),
    height - pad - (v / max) * (height - pad * 2),
  ])
  return (
    <svg className="hd-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={smoothPath(pts)} pathLength="1" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

// ---- glowing mini bars (reference: income / expense cards) ---------
export function GlowBars({ data, color, label }) {
  const values = (data || []).map((p) => p.value)
  const max = Math.max(0, ...values)
  if (!values.length || max === 0) return <div className="hd-bars-empty">No activity in this period</div>
  return (
    <div className="hd-bars" role="img" aria-label={label} style={{ '--bar': color }}>
      {values.map((v, i) => (
        <i key={i} style={{ height: `${Math.max(v === 0 ? 4 : 12, (v / max) * 100)}%`, '--i': i, opacity: v === 0 ? 0.22 : 1 }} />
      ))}
    </div>
  )
}

// ---- occupancy ring (reference: percentage ring) -------------------
export function Ring({ pct, colorA, colorB, size = 112, children }) {
  const r = 44
  const c = 2 * Math.PI * r
  const has = pct !== null && pct !== undefined
  const id = useRef(`g${Math.random().toString(36).slice(2, 8)}`).current
  return (
    <div className="hd-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colorA} />
            <stop offset="100%" stopColor={colorB} />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={r} className="hd-ring-track" />
        {has && (
          <circle cx="50" cy="50" r={r} className="hd-ring-val" stroke={`url(#${id})`}
            strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, pct) / 100)} transform="rotate(-90 50 50)" />
        )}
      </svg>
      <div className="hd-ring-center">{children}</div>
    </div>
  )
}

// ---- small UI atoms ------------------------------------------------
export function Skeleton({ w = '100%', h = 14, style }) {
  return <span className="hd-skel" style={{ width: w, height: h, ...style }} aria-hidden="true" />
}

export function Delta({ value }) {
  if (value === null || value === undefined) return null
  const up = value >= 0
  return <span className={`hd-delta ${up ? 'up' : 'down'}`} title="Last 7 days vs the 7 days before">{up ? '+' : '−'}{Math.abs(value)}%</span>
}

export function EmptyNote({ children }) {
  return <div className="hd-empty">{children}</div>
}

// ---- KPI card -------------------------------------------------------
export function KpiCard({ index = 0, label, value, ready, format, sub, tone = 'blue', spark, sparkColor, delta, wide, onClick, icon }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`hd-card hd-kpi hd-in ${wide ? 'wide' : ''} ${onClick ? 'is-link' : ''}`}
      style={{ '--i': index }} data-tone={tone} onClick={onClick} type={onClick ? 'button' : undefined}>
      <div className="hd-kpi-top">
        <span className="hd-label">{label}</span>
        {icon ? <span className="hd-kpi-icon">{icon}</span> : null}
      </div>
      <div className="hd-kpi-main">
        <div className="hd-kpi-value">
          {ready ? <AnimatedNumber value={value} ready={ready} format={format} /> : <Skeleton w={64} h={26} />}
        </div>
        {ready && spark ? <Sparkline data={spark} color={sparkColor} /> : null}
      </div>
      <div className="hd-kpi-foot">
        {ready ? <><span className="hd-sub">{sub}</span><Delta value={delta} /></> : <Skeleton w="60%" h={10} />}
      </div>
    </Tag>
  )
}

// ---- main activity chart -------------------------------------------
const fmtDay = (key) => {
  const d = new Date(`${key}T12:00:00`)
  return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.dataKey !== 'total')
  return (
    <div className="hd-tip">
      <div className="hd-tip-title">{label}</div>
      {rows.map((p) => (
        <div key={p.dataKey} className="hd-tip-row"><i style={{ background: p.color }} />{p.name}<b>{nf.format(p.value)}</b></div>
      ))}
    </div>
  )
}

export function ActivityChart({ series, loading, theme }) {
  const reduced = useReducedMotion()
  const colors = PALETTE[theme]
  const [off, setOff] = useState(() => new Set())
  const [animate, setAnimate] = useState(true)
  useEffect(() => { const t = setTimeout(() => setAnimate(false), 1500); return () => clearTimeout(t) }, [])

  // Only series that actually have data in this range get a line.
  const live = useMemo(() => series.filter((s) => s.points.some((p) => p.value > 0)), [series])
  const active = live.filter((s) => !off.has(s.key))

  const rows = useMemo(() => {
    if (!live.length) return []
    return live[0].points.map((p, i) => {
      const row = { label: fmtDay(p.key) }
      let total = 0
      live.forEach((s) => {
        row[s.key] = s.points[i].value
        if (!off.has(s.key)) total += s.points[i].value
      })
      row.total = total
      return row
    })
  }, [live, off])

  if (loading) return <Skeleton h={250} style={{ borderRadius: 12 }} />
  if (!live.length) return <EmptyNote>No recorded activity in this period yet. Lines appear here as soon as patients are registered, appointments booked or tests requested.</EmptyNote>

  const toggle = (key) => setOff((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const showAnim = animate && !reduced

  return (
    <>
      <div className="hd-chips" role="group" aria-label="Chart lines">
        {live.map((s) => (
          <button key={s.key} type="button" className={`hd-chip ${off.has(s.key) ? 'off' : ''}`} aria-pressed={!off.has(s.key)} onClick={() => toggle(s.key)}>
            <i style={{ background: colors[s.color] }} />{s.label}
          </button>
        ))}
      </div>
      <div className="hd-chart" role="img" aria-label={`Daily counts of ${active.map((s) => s.label).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={colors.grid} strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: colors.axis, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fill: colors.axis, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
            <YAxis yAxisId="vol" hide domain={[0, (max) => Math.max(1, max) * 4.5]} />
            <Tooltip content={<ChartTip />} cursor={{ stroke: colors.axis, strokeOpacity: 0.3 }} />
            <Bar yAxisId="vol" dataKey="total" name="All shown" fill={colors.purple} fillOpacity={0.28} radius={[3, 3, 0, 0]} isAnimationActive={showAnim} animationDuration={900} />
            {active.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colors[s.color]} strokeWidth={2.2}
                dot={false} activeDot={{ r: 4 }} isAnimationActive={showAnim} animationDuration={1200} animationEasing="ease-out" />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
