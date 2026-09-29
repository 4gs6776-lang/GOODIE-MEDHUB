import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { getLimit } from '../../lib/planEntitlements'

// =====================================================================
// GOODIE-MEDHUB — Owner Portal: Usage (which hospitals are near their
// plan limits)
//
// For every hospital that has a subscription, shows how many patients and
// active staff it has against what its plan allows, worst first, so the
// owner can see who is about to hit a limit (an upsell chance) or is
// already over it (for example after a downgrade).
//
// READ-ONLY. Nothing here changes any data. Plan changes are done in the
// Subscribers tab ("Manage" jumps there).
//
// How the numbers are found: for each hospital with a limited plan we ask
// the database for a COUNT only (no patient data is downloaded):
//   - patients     = rows for that hospital that are not archived
//   - active staff = profiles for that hospital that are not deactivated
// This relies on the owner being allowed to read those tables for every
// hospital (the RLS policies in migration 003 allow it via is_owner()).
// A plan with no limit is shown as "Unlimited" and is not counted.
// A count that fails shows "—" and is never treated as "fine".
//
// Thresholds match the hospital admin's own warning bar: "near" is 90%
// or more of the limit, "reached" is 100% or more.
// =====================================================================

// ---- pure helpers (tested on their own; keep free of React) ----
const KINDS = [
  { kind: 'patients', label: 'Patients' },
  { kind: 'staff', label: 'Active staff' },
]

// How full is one limit?  reached | near | ok | unknown | unlimited
export function levelFor(used, limit) {
  if (limit === null) return 'unlimited'
  if (limit === 0) return 'reached'
  if (!Number.isFinite(used)) return 'unknown'
  if (used >= limit) return 'reached'
  if (used >= Math.ceil(limit * 0.9)) return 'near'
  return 'ok'
}

const RANK = { reached: 4, near: 3, unknown: 2, ok: 1, unlimited: 0 }

// Turns one subscription + its counts into a display row.
export function buildRow(sub, counts) {
  const limits = sub.plan?.limits || null
  const items = KINDS.map(({ kind, label }) => {
    const limit = getLimit(kind, { limits })
    const used = Number.isFinite(counts?.[kind]) ? counts[kind] : null
    const ratio = limit ? (used ?? 0) / limit : 0
    return {
      kind,
      label,
      limit,
      used,
      ratio,
      pct: limit ? Math.min(100, Math.round(ratio * 100)) : 0,
      level: levelFor(used, limit),
    }
  })
  const level = items.reduce(
    (worst, it) => (RANK[it.level] > RANK[worst] ? it.level : worst),
    'unlimited'
  )
  return {
    id: sub.id,
    hospitalId: sub.hospital_id,
    hospitalName: sub.hospital?.name || 'Unknown hospital',
    planName: sub.plan?.name || 'No plan',
    status: sub.status,
    items,
    level,
    worstRatio: Math.max(...items.map((i) => i.ratio)),
  }
}

// Most urgent first: reached, near, unknown, ok, unlimited. Within the
// same level, the fullest first.
export function sortRows(rows) {
  return [...rows].sort(
    (a, b) =>
      RANK[b.level] - RANK[a.level] ||
      b.worstRatio - a.worstRatio ||
      a.hospitalName.localeCompare(b.hospitalName)
  )
}
// ---- end pure helpers ----

const LEVEL_LABEL = { reached: 'Limit reached', near: 'Near limit', ok: 'OK', unknown: 'Unknown', unlimited: 'Unlimited' }
const LEVEL_COLOR = { reached: 'var(--danger)', near: 'var(--gold)', ok: 'var(--teal)', unknown: 'var(--muted)', unlimited: 'var(--muted)' }
const LEVEL_BG = {
  reached: 'var(--danger-soft)', near: 'rgba(201,169,97,0.14)', ok: 'var(--teal-soft)',
  unknown: 'rgba(128,128,128,0.14)', unlimited: 'rgba(128,128,128,0.14)',
}
const STATUS_LABEL = {
  trialing: 'Trial', active: 'Active', past_due: 'Past due', grace_period: 'Grace',
  expired: 'Expired', cancelled: 'Cancelled', suspended: 'Suspended',
}

async function countRows(query) {
  const { count, error } = await query
  if (error) throw error
  return count
}

async function loadUsage() {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, hospital_id, status, hospital:hospitals(name), plan:subscription_plans(name, slug, limits)')
  if (error) throw error
  const subs = data || []

  // A few hospitals at a time, so a big list never floods the database.
  const rows = []
  for (let i = 0; i < subs.length; i += 6) {
    const batch = await Promise.all(
      subs.slice(i, i + 6).map(async (sub) => {
        const limits = sub.plan?.limits || null
        const counts = { patients: null, staff: null }

        if (getLimit('patients', { limits }) !== null) {
          try {
            counts.patients = await countRows(
              supabase.from('patients').select('id', { count: 'exact', head: true })
                .eq('hospital_id', sub.hospital_id).is('deleted_at', null)
            )
          } catch {}
        }
        if (getLimit('staff', { limits }) !== null) {
          try {
            counts.staff = await countRows(
              supabase.from('profiles').select('id', { count: 'exact', head: true })
                .eq('hospital_id', sub.hospital_id).or('active.is.null,active.eq.true')
            )
          } catch {}
        }
        return buildRow(sub, counts)
      })
    )
    rows.push(...batch)
  }
  return sortRows(rows)
}

export default function OwnerUsage({ onManage }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('attention') // 'attention' | 'all'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRows(await loadUsage())
    } catch (err) {
      setError(err.message || 'Could not load usage')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => {
    const c = { reached: 0, near: 0, ok: 0, unlimited: 0, unknown: 0 }
    rows.forEach((r) => { c[r.level] += 1 })
    return c
  }, [rows])

  const visible = filter === 'all' ? rows : rows.filter((r) => r.level === 'reached' || r.level === 'near')

  if (loading) return <div className="owner-panel"><div className="owner-empty">Counting patients and staff…</div></div>

  return (
    <>
      <section className="owner-stats">
        <div className="owner-stat-card">
          <div className="owner-stat-value" style={{ color: 'var(--danger)' }}>{counts.reached}</div>
          <div className="owner-stat-label">Limit reached</div>
        </div>
        <div className="owner-stat-card">
          <div className="owner-stat-value" style={{ color: 'var(--gold)' }}>{counts.near}</div>
          <div className="owner-stat-label">Near limit (90%+)</div>
        </div>
        <div className="owner-stat-card">
          <div className="owner-stat-value" style={{ color: 'var(--teal)' }}>{counts.ok}</div>
          <div className="owner-stat-label">Comfortable</div>
        </div>
        <div className="owner-stat-card">
          <div className="owner-stat-value">{counts.unlimited}</div>
          <div className="owner-stat-label">Unlimited</div>
        </div>
      </section>

      <section className="owner-panel">
        <div className="owner-panel-head">
          <div className="owner-panel-title">
            {filter === 'all' ? `All hospitals (${rows.length})` : `Needs attention (${visible.length})`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost"
              style={{ width: 'auto' }}
              onClick={() => setFilter(filter === 'all' ? 'attention' : 'all')}
            >
              {filter === 'all' ? 'Show only near/over' : 'Show all'}
            </button>
            <button className="btn btn-ghost" style={{ width: 'auto' }} onClick={load}>Refresh</button>
          </div>
        </div>

        {error && <div className="error-box" style={{ margin: 12 }}>{error}</div>}

        {!error && visible.length === 0 ? (
          <div className="owner-empty">
            {rows.length === 0
              ? 'No subscriptions yet.'
              : 'No hospital is near or over its plan limits.'}
          </div>
        ) : (
          visible.map((r) => (
            <div key={r.id} className="owner-list-row" style={{ alignItems: 'flex-start' }}>
              <div className="owner-list-row-main">
                <div className="owner-list-row-title">{r.hospitalName}</div>
                <div className="owner-list-row-sub">
                  {r.planName} · {STATUS_LABEL[r.status] || r.status}
                </div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 10 }}>
                  {r.items.map((it) => (
                    <div key={it.kind} style={{ minWidth: 140, flex: '1 1 140px' }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>
                        {it.label}
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                        {it.limit === null ? 'Unlimited' : `${it.used ?? '—'} / ${it.limit}`}
                        {it.limit !== null && it.used > it.limit ? ' (over)' : ''}
                      </div>
                      {it.limit !== null && (
                        <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', marginTop: 5, overflow: 'hidden' }}>
                          <div style={{ width: `${it.pct}%`, height: '100%', background: LEVEL_COLOR[it.level] }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="owner-list-row-actions">
                <span className="owner-status-pill" style={{ background: LEVEL_BG[r.level], color: LEVEL_COLOR[r.level] }}>
                  {LEVEL_LABEL[r.level]}
                </span>
                {onManage && (
                  <button className="owner-icon-btn owner-icon-btn-inline" onClick={onManage}>Manage</button>
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </>
  )
}
