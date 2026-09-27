import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useHospital } from '../../context/HospitalContext'
import {
  getActivePlans,
  getMySubscription,
  getActiveBankAccounts,
  getMyPayments,
  estimatePrice,
  formatMoney,
  submitManualPayment,
} from '../../lib/subscriptions'

// =====================================================================
// GOODIE-MEDHUB — Hospital Subscription page (Phase 6)
//
// Shows the hospital's current plan/status, lets an admin pay by bank
// transfer for a plan, and lists past payment submissions. Every
// number shown before submitting is an ESTIMATE — the real amount is
// always calculated by the database once the payment is submitted
// (see lib/subscriptions.js and migration 009 for why that's safe).
//
// This page does NOT yet block any other part of the app when a
// subscription is expired/suspended — that enforcement is a separate,
// later step. For now it's the visibility + payment layer.
// =====================================================================

const STATUS_LABEL = {
  trialing: 'Free Trial', active: 'Active', past_due: 'Payment Due',
  grace_period: 'Grace Period', expired: 'Expired', cancelled: 'Cancelled', suspended: 'Suspended',
}
const STATUS_COLOR = {
  trialing: 'var(--gold)', active: 'var(--teal)', past_due: 'var(--gold)',
  grace_period: 'var(--gold)', expired: 'var(--danger)', cancelled: 'var(--danger)', suspended: 'var(--danger)',
}
const STATUS_BG = {
  trialing: 'rgba(201,169,97,0.14)', active: 'var(--teal-soft)', past_due: 'rgba(201,169,97,0.14)',
  grace_period: 'rgba(201,169,97,0.14)', expired: 'var(--danger-soft)', cancelled: 'var(--danger-soft)', suspended: 'var(--danger-soft)',
}
const PAY_STATUS_LABEL = { submitted: 'Under Review', verified: 'Verified', rejected: 'Rejected', failed: 'Failed' }
const PAY_STATUS_COLOR = { submitted: 'var(--gold)', verified: 'var(--teal)', rejected: 'var(--danger)', failed: 'var(--danger)' }
const PAY_STATUS_BG = { submitted: 'rgba(201,169,97,0.14)', verified: 'var(--teal-soft)', rejected: 'var(--danger-soft)', failed: 'var(--danger-soft)' }

// Formats a plain 'YYYY-MM-DD' date column without ever going through
// JS Date/timezone conversion — these are date-only columns, so there
// is no time-of-day to shift and no timezone bug to worry about.
function formatPlainDate(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d} ${months[m - 1]} ${y}`
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  const target = Date.UTC(y, m - 1, d)
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
  return Math.round((target - today) / 86400000)
}

export default function Subscription() {
  const { profile, hospital } = useAuth()
  const { facilities } = useHospital()
  const isAdmin = profile?.role === 'admin'
  const facilityCount = Math.max(facilities.filter(f => f.active).length, 1)

  const [subscription, setSubscription] = useState(null)
  const [plans, setPlans] = useState([])
  const [bankAccounts, setBankAccounts] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [toast, setToast] = useState(null)

  const [billingCycle, setBillingCycle] = useState('monthly')
  const [payModalPlan, setPayModalPlan] = useState(null)
  const [providerReference, setProviderReference] = useState('')
  const [proofNote, setProofNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  async function loadAll() {
    if (!hospital?.id) return
    setLoading(true)
    setLoadError('')
    try {
      const [sub, planList, banks, myPayments] = await Promise.all([
        getMySubscription(hospital.id),
        getActivePlans(),
        getActiveBankAccounts(),
        getMyPayments(hospital.id),
      ])
      setSubscription(sub)
      setPlans(planList)
      setBankAccounts(banks)
      setPayments(myPayments)
      if (sub?.billing_cycle) setBillingCycle(sub.billing_cycle)
    } catch (err) {
      setLoadError(err.message || 'Could not load subscription details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [hospital?.id])

  function openPayModal(plan) {
    setPayModalPlan(plan)
    setProviderReference('')
    setProofNote('')
    setFormError('')
  }

  async function handleSubmitPayment(e) {
    e.preventDefault()
    setFormError('')
    if (!providerReference.trim()) {
      setFormError('Enter the reference/description shown on your bank transfer.')
      return
    }
    setSubmitting(true)
    try {
      await submitManualPayment({
        subscription,
        plan: payModalPlan,
        billingCycle,
        providerReference: providerReference.trim(),
        proofNote: proofNote.trim(),
        actor: profile,
      })
      setPayModalPlan(null)
      showToast('Payment submitted — the owner will verify it shortly.')
      loadAll()
    } catch (err) {
      setFormError(err.message || 'Could not submit payment')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="dash-panel"><div className="dash-empty">Loading subscription…</div></div>
  }

  if (loadError) {
    return <div className="dash-panel"><div className="error-box">{loadError}</div></div>
  }

  if (!subscription) {
    return (
      <div className="dash-panel">
        <div className="dash-panel-title">No subscription found</div>
        <div className="dash-panel-sub" style={{ marginTop: 6 }}>
          Contact GOODIE-MEDHUB support — your hospital doesn't have a subscription record yet.
        </div>
      </div>
    )
  }

  const status = subscription.status
  const plan = subscription.plan
  const keyDate =
    status === 'trialing' ? subscription.trial_end :
    status === 'grace_period' ? subscription.grace_period_end :
    subscription.current_period_end
  const keyDateLabel =
    status === 'trialing' ? 'Trial ends' :
    status === 'grace_period' ? 'Grace period ends' :
    status === 'expired' || status === 'cancelled' || status === 'suspended' ? 'Period ended' :
    'Renews on'
  const daysLeft = daysUntil(keyDate)

  return (
    <>
      {/* ---- Current plan summary ---- */}
      <div className="dash-panel">
        <div className="dash-panel-head">
          <div>
            <div className="dash-panel-title">{plan?.name || 'Subscription'}</div>
            <div className="dash-panel-sub">
              {subscription.billing_cycle === 'yearly' ? 'Billed yearly' : 'Billed monthly'} · {hospital?.name}
            </div>
          </div>
          <div style={{
            fontSize: 11.5, fontWeight: 700, padding: '5px 14px', borderRadius: 20,
            background: STATUS_BG[status], color: STATUS_COLOR[status], textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            {STATUS_LABEL[status] || status}
          </div>
        </div>

        {(status === 'grace_period' || status === 'expired' || status === 'suspended' || status === 'cancelled') && (
          <div className="error-box" style={{ marginBottom: 16 }}>
            {status === 'grace_period' && `Your subscription expired. You have until ${formatPlainDate(subscription.grace_period_end)} to renew before some features are restricted.`}
            {status === 'expired' && 'Your subscription has expired. Renew below to restore full access.'}
            {status === 'suspended' && 'Your account has been suspended by GOODIE-MEDHUB. Contact support.'}
            {status === 'cancelled' && 'Your subscription is cancelled. Choose a plan below to reactivate.'}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{keyDateLabel}</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {formatPlainDate(keyDate)}
              {daysLeft !== null && daysLeft >= 0 && (status === 'trialing' || status === 'active' || status === 'past_due') && (
                <span style={{ color: 'var(--muted)', fontWeight: 600, fontSize: 12 }}> ({daysLeft} day{daysLeft === 1 ? '' : 's'} left)</span>
              )}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Facilities</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {facilityCount} / {plan?.included_facilities || 1} included
              {facilityCount > (plan?.included_facilities || 1) && (
                <span style={{ color: 'var(--muted)', fontWeight: 600, fontSize: 12 }}>
                  {' '}(+{formatMoney(subscription.billing_cycle === 'yearly' ? plan?.additional_facility_yearly_price : plan?.additional_facility_monthly_price, plan?.currency)}/{subscription.billing_cycle === 'yearly' ? 'yr' : 'mo'} per extra)
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 14 }}>
          Status last verified {subscription.last_verified_at ? new Date(subscription.last_verified_at).toLocaleString() : '—'}
        </div>
      </div>

      {/* ---- Plan selection / renewal (admin only) ---- */}
      {isAdmin ? (
        <div className="dash-panel" style={{ marginTop: 20 }}>
          <div className="dash-panel-head">
            <div>
              <div className="dash-panel-title">Renew or Change Plan</div>
              <div className="dash-panel-sub">Pay by bank transfer — the owner verifies it shortly after</div>
            </div>
            <div style={{ display: 'flex', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 10, padding: 3 }}>
              {['monthly', 'yearly'].map(cycle => (
                <button
                  key={cycle}
                  type="button"
                  onClick={() => setBillingCycle(cycle)}
                  style={{
                    border: 'none', cursor: 'pointer', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: billingCycle === cycle ? 'var(--teal)' : 'transparent',
                    color: billingCycle === cycle ? '#04211f' : 'var(--muted)',
                  }}
                >
                  {cycle === 'monthly' ? 'Monthly' : 'Yearly'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {plans.map(p => {
              const isCurrent = p.id === plan?.id && status === 'active'
              const price = estimatePrice(p, billingCycle, facilityCount)
              return (
                <div key={p.id} style={{
                  border: `1px solid ${isCurrent ? 'var(--teal-border)' : 'var(--line)'}`,
                  borderRadius: 12, padding: 18, background: isCurrent ? 'var(--teal-soft)' : 'var(--bg-elevated)',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', minHeight: 32 }}>{p.description}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    {formatMoney(price, p.currency)}
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>/{billingCycle === 'yearly' ? 'yr' : 'mo'}</span>
                  </div>
                  {facilityCount > (p.included_facilities || 1) && (
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Includes {p.included_facilities} facilit{p.included_facilities === 1 ? 'y' : 'ies'} + {facilityCount - p.included_facilities} extra</div>
                  )}
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--ivory)' }}>
                    {(Array.isArray(p.features) ? p.features : []).map((f, i) => (
                      <li key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <span style={{ color: 'var(--teal)' }}>✓</span> {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className={isCurrent ? 'btn btn-ghost' : 'btn btn-primary'}
                    style={{ marginTop: 8 }}
                    onClick={() => openPayModal(p)}
                  >
                    {isCurrent ? 'Renew this plan' : 'Pay by Bank Transfer'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="dash-panel" style={{ marginTop: 20 }}>
          <div className="dash-panel-sub">Contact your hospital admin to renew or change the subscription plan.</div>
        </div>
      )}

      {/* ---- Payment history ---- */}
      <div className="dash-panel" style={{ marginTop: 20 }}>
        <div className="dash-panel-head">
          <div className="dash-panel-title">Payment History</div>
        </div>
        {payments.length === 0 ? (
          <div className="dash-empty">No payments submitted yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <th style={{ padding: '0 12px 10px 0' }}>Date</th>
                  <th style={{ padding: '0 12px 10px 0' }}>Plan</th>
                  <th style={{ padding: '0 12px 10px 0' }}>Amount</th>
                  <th style={{ padding: '0 12px 10px 0' }}>Reference</th>
                  <th style={{ padding: '0 12px 10px 0' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: '10px 12px 10px 0', whiteSpace: 'nowrap' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 12px 10px 0' }}>{p.plan?.name || '—'} ({p.billing_cycle})</td>
                    <td style={{ padding: '10px 12px 10px 0', fontFamily: 'var(--font-mono)' }}>{formatMoney(p.amount, p.currency)}</td>
                    <td style={{ padding: '10px 12px 10px 0', color: 'var(--muted)' }}>{p.provider_reference || '—'}</td>
                    <td style={{ padding: '10px 12px 10px 0' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: PAY_STATUS_BG[p.status], color: PAY_STATUS_COLOR[p.status] }}>
                        {PAY_STATUS_LABEL[p.status] || p.status}
                      </span>
                      {p.status === 'rejected' && p.rejection_reason && (
                        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{p.rejection_reason}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Pay-by-bank-transfer modal ---- */}
      {payModalPlan && (
        <div className="dash-modal-backdrop" onClick={() => !submitting && setPayModalPlan(null)}>
          <div className="card dash-modal" onClick={e => e.stopPropagation()}>
            <div className="dash-modal-title">Pay by Bank Transfer</div>
            <div className="dash-modal-body">
              {formError && <div className="error-box">{formError}</div>}

              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{payModalPlan.name} — {billingCycle}</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {formatMoney(estimatePrice(payModalPlan, billingCycle, facilityCount), payModalPlan.currency)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Estimated total for {facilityCount} facilit{facilityCount === 1 ? 'y' : 'ies'}. The exact amount is confirmed once submitted.
                </div>
              </div>

              {bankAccounts.length === 0 ? (
                <div className="error-box">No bank account has been configured yet. Contact GOODIE-MEDHUB support.</div>
              ) : (
                bankAccounts.map(acc => (
                  <div key={acc.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{acc.bank_name}</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>{acc.account_name}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{acc.account_number}</div>
                    {acc.instructions && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>{acc.instructions}</div>}
                  </div>
                ))
              )}

              <form id="submit-payment-form" onSubmit={handleSubmitPayment}>
                <div className="field">
                  <label>Transfer Reference / Description</label>
                  <input
                    value={providerReference}
                    onChange={e => setProviderReference(e.target.value)}
                    placeholder="e.g. bank reference number, or date + amount you paid"
                  />
                </div>
                <div className="field">
                  <label>Note (optional)</label>
                  <textarea
                    rows={2}
                    value={proofNote}
                    onChange={e => setProofNote(e.target.value)}
                    placeholder="Anything else the owner should know about this payment"
                  />
                </div>
              </form>
            </div>
            <div className="dash-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPayModalPlan(null)} disabled={submitting}>Cancel</button>
              <button type="submit" form="submit-payment-form" className="btn btn-primary" disabled={submitting || bankAccounts.length === 0}>
                {submitting ? 'Submitting…' : 'I\'ve Made the Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)',
          padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60, maxWidth: '85vw', textAlign: 'center',
        }}>
          {toast}
        </div>
      )}
    </>
  )
}
