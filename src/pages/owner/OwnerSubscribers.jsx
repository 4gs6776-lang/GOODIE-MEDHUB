import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  getAllSubscriptions,
  getActivePlans,
  extendSubscription,
  changeSubscriptionPlan,
  suspendSubscription,
  cancelSubscription,
  reactivateSubscription,
} from '../../lib/subscriptions'

// =====================================================================
// GOODIE-MEDHUB — Owner Portal: Subscribers (Phase 7)
//
// Every hospital's subscription in one list, with the owner-only
// actions: extend, change plan, suspend, cancel, reactivate.
// Each action is audited (writeAudit) and sends the hospital an
// in-app notification — see lib/subscriptions.js.
//
// Note: "Suspend" here affects the SUBSCRIPTION only. The separate
// hospital account switch on the Hospitals tab is untouched (they are
// independent by design).
// =====================================================================

const STATUS_LABEL = {
  trialing: 'Trial', active: 'Active', past_due: 'Past due', grace_period: 'Grace',
  expired: 'Expired', cancelled: 'Cancelled', suspended: 'Suspended',
}
const STATUS_COLOR = {
  trialing: 'var(--gold)', active: 'var(--teal)', past_due: 'var(--gold)', grace_period: 'var(--gold)',
  expired: 'var(--danger)', cancelled: 'var(--danger)', suspended: 'var(--danger)',
}
const STATUS_BG = {
  trialing: 'rgba(201,169,97,0.14)', active: 'var(--teal-soft)', past_due: 'rgba(201,169,97,0.14)',
  grace_period: 'rgba(201,169,97,0.14)', expired: 'var(--danger-soft)', cancelled: 'var(--danger-soft)',
  suspended: 'var(--danger-soft)',
}

// Plain 'YYYY-MM-DD' -> '27 Oct 2026', with no timezone conversion
// (these are date-only columns).
function formatPlainDate(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d} ${months[m - 1]} ${y}`
}

function keyDateFor(sub) {
  if (sub.status === 'trialing') return { label: 'Trial ends', value: sub.trial_end }
  if (sub.status === 'grace_period') return { label: 'Grace ends', value: sub.grace_period_end }
  return { label: 'Period ends', value: sub.current_period_end }
}

export default function OwnerSubscribers() {
  const { profile } = useAuth()
  const [subs, setSubs] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const [planModalSub, setPlanModalSub] = useState(null)
  const [pickPlanId, setPickPlanId] = useState('')
  const [pickCycle, setPickCycle] = useState('monthly')

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function loadAll() {
    setLoading(true)
    try {
      const [s, p] = await Promise.all([getAllSubscriptions(), getActivePlans()])
      setSubs(s)
      setPlans(p)
    } catch (err) {
      showToast(err.message || 'Could not load subscriptions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // Runs one owner action with a busy lock, then refreshes the list.
  async function run(sub, fn, successMsg) {
    setBusyId(sub.id)
    try {
      await fn()
      showToast(successMsg)
      loadAll()
    } catch (err) {
      showToast(err.message || 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  function handleExtend(sub) {
    const label = sub.status === 'trialing' ? 'trial' : 'subscription'
    const input = prompt(`Extend ${sub.hospital?.name}'s ${label} by how many days?`, '30')
    if (input === null) return
    run(sub, () => extendSubscription(sub, input, profile), 'Extended')
  }

  function handleSuspend(sub) {
    if (!confirm(`Suspend ${sub.hospital?.name}'s subscription? They will be notified.`)) return
    run(sub, () => suspendSubscription(sub, profile), 'Subscription suspended')
  }

  function handleCancel(sub) {
    if (!confirm(`Cancel ${sub.hospital?.name}'s subscription? Their data is kept; they can reactivate by paying.`)) return
    run(sub, () => cancelSubscription(sub, profile), 'Subscription cancelled')
  }

  function handleReactivate(sub) {
    run(sub, () => reactivateSubscription(sub, profile), 'Subscription reactivated')
  }

  function openChangePlan(sub) {
    setPlanModalSub(sub)
    setPickPlanId(sub.plan_id)
    setPickCycle(sub.billing_cycle)
  }

  async function handleChangePlan(e) {
    e.preventDefault()
    const sub = planModalSub
    const plan = plans.find(p => p.id === pickPlanId)
    if (!plan) return
    setPlanModalSub(null)
    run(sub, () => changeSubscriptionPlan(sub, plan.id, pickCycle, plan.name, profile), 'Plan changed')
  }

  const counts = subs.reduce((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc }, {})

  if (loading) return <div className="owner-panel"><div className="owner-empty">Loading…</div></div>

  return (
    <>
      <section className="owner-stats">
        <div className="owner-stat-card">
          <div className="owner-stat-value" style={{ color: 'var(--teal)' }}>{counts.active || 0}</div>
          <div className="owner-stat-label">Active</div>
        </div>
        <div className="owner-stat-card">
          <div className="owner-stat-value" style={{ color: 'var(--gold)' }}>{(counts.trialing || 0)}</div>
          <div className="owner-stat-label">On Trial</div>
        </div>
        <div className="owner-stat-card">
          <div className="owner-stat-value" style={{ color: 'var(--gold)' }}>{(counts.grace_period || 0) + (counts.past_due || 0)}</div>
          <div className="owner-stat-label">Grace / Past Due</div>
        </div>
        <div className="owner-stat-card">
          <div className="owner-stat-value" style={{ color: 'var(--danger)' }}>{(counts.expired || 0) + (counts.cancelled || 0) + (counts.suspended || 0)}</div>
          <div className="owner-stat-label">Expired / Off</div>
        </div>
      </section>

      <section className="owner-panel">
        <div className="owner-panel-head">
          <div className="owner-panel-title">Subscribers ({subs.length})</div>
        </div>

        {subs.length === 0 ? (
          <div className="owner-empty">No subscriptions yet.</div>
        ) : (
          subs.map(s => {
            const kd = keyDateFor(s)
            const busy = busyId === s.id
            const isOff = s.status === 'suspended' || s.status === 'cancelled' || s.status === 'expired'
            return (
              <div key={s.id} className="owner-list-row">
                <div className="owner-list-row-main">
                  <div className="owner-list-row-title">{s.hospital?.name || 'Unknown hospital'}</div>
                  <div className="owner-list-row-sub">
                    {s.plan?.name || '—'} · {s.billing_cycle} · {kd.label} {formatPlainDate(kd.value)}
                  </div>
                </div>
                <div className="owner-list-row-actions">
                  <span className="owner-status-pill" style={{ background: STATUS_BG[s.status], color: STATUS_COLOR[s.status] }}>
                    {STATUS_LABEL[s.status] || s.status}
                  </span>
                  <button className="owner-icon-btn owner-icon-btn-inline" disabled={busy} onClick={() => handleExtend(s)}>Extend</button>
                  <button className="owner-icon-btn owner-icon-btn-inline" disabled={busy} onClick={() => openChangePlan(s)}>Change plan</button>
                  {isOff ? (
                    s.status !== 'expired' && (
                      <button className="owner-icon-btn owner-icon-btn-inline" disabled={busy} onClick={() => handleReactivate(s)}>Reactivate</button>
                    )
                  ) : (
                    <>
                      <button className="owner-icon-btn owner-icon-btn-inline" disabled={busy} onClick={() => handleSuspend(s)}>Suspend</button>
                      <button className="owner-icon-btn owner-icon-btn-inline owner-icon-btn-danger" disabled={busy} onClick={() => handleCancel(s)}>Cancel</button>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </section>

      {planModalSub && (
        <div className="dash-modal-backdrop" onClick={() => setPlanModalSub(null)}>
          <div className="card dash-modal" onClick={e => e.stopPropagation()}>
            <div className="dash-modal-title">Change plan — {planModalSub.hospital?.name}</div>
            <div className="dash-modal-body">
              <form id="change-plan-form" onSubmit={handleChangePlan}>
                <div className="field">
                  <label>Plan</label>
                  <select value={pickPlanId} onChange={e => setPickPlanId(e.target.value)}>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Billing Cycle</label>
                  <select value={pickCycle} onChange={e => setPickCycle(e.target.value)}>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                  <div className="field-hint">This changes the plan only. Dates and status stay as they are — use Extend to add time.</div>
                </div>
              </form>
            </div>
            <div className="dash-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPlanModalSub(null)}>Cancel</button>
              <button type="submit" form="change-plan-form" className="btn btn-primary">Change Plan</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="owner-toast">{toast}</div>}
    </>
  )
}
