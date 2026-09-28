import { supabase } from './supabaseClient'
import { writeAudit } from './audit'

// =====================================================================
// GOODIE-MEDHUB — Subscription system (Phase 6)
//
// Every piece of subscription logic used by BOTH the hospital-side
// Subscription page and the Owner Portal lives here, in one place —
// so nothing about plans, pricing or status is scattered or
// duplicated across components.
//
// IMPORTANT: estimatePrice() below is a PREVIEW only, shown to the
// hospital before they submit a payment. The real amount that ends up
// stored in `subscription_payments` is always recalculated by a
// database trigger (see migration 009) from the real plan price and
// the hospital's real facility count — never from anything sent by
// the browser. So even if this preview function were wrong, or
// someone tampered with it, it could not result in an incorrect
// amount being recorded.
// =====================================================================

// ---------------------------------------------------------------------
// Reads — used by the hospital-side Subscription page
// ---------------------------------------------------------------------

export async function getActivePlans() {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data || []
}

export async function getMySubscription(hospitalId) {
  if (!hospitalId) return null
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, plan:subscription_plans(*)')
    .eq('hospital_id', hospitalId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getActiveBankAccounts() {
  const { data, error } = await supabase
    .from('platform_bank_accounts')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data || []
}

export async function getMyPayments(hospitalId) {
  if (!hospitalId) return []
  const { data, error } = await supabase
    .from('subscription_payments')
    .select('*, plan:subscription_plans(name)')
    .eq('hospital_id', hospitalId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Preview-only price estimate — see the big comment at the top of
// this file for why this can never be used to cheat the real price.
export function estimatePrice(plan, billingCycle, facilityCount) {
  if (!plan) return 0
  const included = plan.included_facilities || 1
  const extra = Math.max((facilityCount || 1) - included, 0)
  if (billingCycle === 'yearly') {
    return Number(plan.yearly_price || 0) + extra * Number(plan.additional_facility_yearly_price || 0)
  }
  return Number(plan.monthly_price || 0) + extra * Number(plan.additional_facility_monthly_price || 0)
}

export function formatMoney(amount, currency = 'NGN') {
  const symbol = currency === 'NGN' ? '₦' : `${currency} `
  return symbol + Number(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ---------------------------------------------------------------------
// Hospital admin action: submit a manual bank-transfer payment.
// RLS (migration 009) enforces that only an 'admin' at this hospital
// can do this, and only with status forced to 'submitted' — no
// verification fields can be set from here even if someone tried.
// ---------------------------------------------------------------------
export async function submitManualPayment({ subscription, plan, billingCycle, providerReference, proofNote, actor }) {
  const payload = {
    subscription_id: subscription.id,
    hospital_id: subscription.hospital_id,
    plan_id: plan.id,
    billing_cycle: billingCycle,
    provider: 'manual_bank_transfer',
    provider_reference: providerReference || null,
    proof_note: proofNote || null,
  }
  const { data, error } = await supabase.from('subscription_payments').insert(payload).select().single()
  if (error) throw error

  await writeAudit({
    hospitalId: subscription.hospital_id,
    actor,
    action: 'subscription.payment_submitted',
    entityType: 'subscription_payment',
    entityId: data.id,
    summary: `${plan.name} (${billingCycle}) payment submitted for verification`,
    metadata: { plan_id: plan.id, billing_cycle: billingCycle },
  })

  return data
}

// ---------------------------------------------------------------------
// Owner-only actions. RLS backs every one of these up independently —
// these functions are a convenience, not the actual security boundary.
// ---------------------------------------------------------------------

export async function getPendingPayments() {
  const { data, error } = await supabase
    .from('subscription_payments')
    .select('*, hospital:hospitals(name), plan:subscription_plans(name)')
    .eq('status', 'submitted')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

// Adds one month/year to a date string, from whichever is later:
// today, or the subscription's current period end (so approving a
// payment early never throws away days the hospital already paid
// for). Known limitation: month-end dates (e.g. 31 Jan) roll over
// using JavaScript's normal date math, which can land a monthly
// renewal on the 2nd or 3rd of the following month in short months —
// acceptable for now, worth revisiting if it matters to you later.
function addInterval(dateStr, billingCycle) {
  const base = dateStr ? new Date(`${dateStr}T00:00:00Z`) : new Date()
  const d = new Date(base)
  if (billingCycle === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1)
  else d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export async function approvePayment(payment, actor) {
  const today = new Date().toISOString().slice(0, 10)

  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', payment.subscription_id)
    .single()
  if (subErr) throw subErr

  const base = sub.current_period_end && sub.current_period_end > today ? sub.current_period_end : today
  const newPeriodEnd = addInterval(base, payment.billing_cycle)

  const { error: verifyErr } = await supabase
    .from('subscription_payments')
    .update({ status: 'verified', verified_by: actor?.id || null, verified_at: new Date().toISOString() })
    .eq('id', payment.id)
  if (verifyErr) throw verifyErr

  const { error: subUpdateErr } = await supabase
    .from('subscriptions')
    .update({
      plan_id: payment.plan_id,
      billing_cycle: payment.billing_cycle,
      status: 'active',
      current_period_start: today,
      current_period_end: newPeriodEnd,
      grace_period_end: null,
      trial_used: true,
    })
    .eq('id', payment.subscription_id)
  if (subUpdateErr) throw subUpdateErr

  await writeAudit({
    hospitalId: payment.hospital_id,
    actor,
    action: 'subscription.payment_verified',
    entityType: 'subscription_payment',
    entityId: payment.id,
    summary: `Payment verified — subscription renewed to ${newPeriodEnd}`,
    metadata: { plan_id: payment.plan_id, billing_cycle: payment.billing_cycle, new_period_end: newPeriodEnd },
  })

  await notifyHospital(payment.hospital_id, {
    title: 'Payment approved',
    body: `Your payment was verified. Your subscription now runs until ${newPeriodEnd}.`,
  })
}

export async function rejectPayment(payment, reason, actor) {
  const { error } = await supabase
    .from('subscription_payments')
    .update({
      status: 'rejected',
      verified_by: actor?.id || null,
      verified_at: new Date().toISOString(),
      rejection_reason: reason || null,
    })
    .eq('id', payment.id)
  if (error) throw error

  await writeAudit({
    hospitalId: payment.hospital_id,
    actor,
    action: 'subscription.payment_rejected',
    entityType: 'subscription_payment',
    entityId: payment.id,
    summary: `Payment rejected${reason ? ': ' + reason : ''}`,
    metadata: { reason: reason || null },
  })

  await notifyHospital(payment.hospital_id, {
    title: 'Payment rejected',
    body: reason ? `Your payment could not be verified: ${reason}` : 'Your payment could not be verified. Please contact support.',
    severity: 'warning',
  })
}

// ---- Bank account configuration (owner only) ----
// Note: these are platform-level records, not tied to any one
// hospital, so they fall outside writeAudit()'s hospital-scoped audit
// trail (it requires a hospitalId and silently skips without one).
// That's a known, acceptable gap for now — worth a platform-level
// audit table later if you want every price/bank-detail edit logged.

export async function getAllBankAccounts() {
  const { data, error } = await supabase
    .from('platform_bank_accounts')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data || []
}

export async function saveBankAccount(id, fields) {
  if (id) {
    const { error } = await supabase.from('platform_bank_accounts').update(fields).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('platform_bank_accounts').insert(fields)
    if (error) throw error
  }
}

export async function deleteBankAccount(id) {
  const { error } = await supabase.from('platform_bank_accounts').delete().eq('id', id)
  if (error) throw error
}

// =====================================================================
// Phase 7 — Owner: plan configuration + per-hospital subscription control
// =====================================================================

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Writes an in-app notification for a hospital. Deliberately NOT fatal:
// if the notification insert fails, the action the owner just took
// (approve, suspend, etc.) has still succeeded and must not look failed.
export async function notifyHospital(hospitalId, { title, body, severity = 'info' }) {
  const { error } = await supabase.from('notifications').insert({
    hospital_id: hospitalId,
    category: 'subscription',
    title,
    body: body || null,
    severity,
    email_status: 'skipped', // no email provider configured yet
  })
  if (error) console.warn('Could not write notification:', error.message)
}

// ---- Plans ----

export async function getAllPlans() {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data || []
}

// Plans are edited, never created/deleted here: existing subscriptions
// point at these rows, and slug is what the rest of the system keys on.
export async function savePlan(id, fields) {
  const { error } = await supabase.from('subscription_plans').update(fields).eq('id', id)
  if (error) throw error
}

// ---- Subscribers (every hospital's subscription) ----

export async function getAllSubscriptions() {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, hospital:hospitals(name, status), plan:subscription_plans(name)')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

async function ownerUpdateSubscription(sub, changes, actor, action, summary, notice) {
  const { error } = await supabase.from('subscriptions').update(changes).eq('id', sub.id)
  if (error) throw error

  await writeAudit({
    hospitalId: sub.hospital_id,
    actor,
    action,
    entityType: 'subscription',
    entityId: sub.id,
    summary,
    metadata: { before_status: sub.status, changes },
  })

  if (notice) await notifyHospital(sub.hospital_id, notice)
}

// Adds days. A trial gets a longer TRIAL; anything else gets a longer
// paid period (counted from whichever is later: today or the current
// end, so extending never shortens time already granted).
export async function extendSubscription(sub, days, actor) {
  const n = Math.floor(Number(days))
  if (!n || n < 1 || n > 3650) throw new Error('Enter a number of days between 1 and 3650.')
  const today = todayStr()

  if (sub.status === 'trialing') {
    const base = sub.trial_end && sub.trial_end > today ? sub.trial_end : today
    const newEnd = addDays(base, n)
    return ownerUpdateSubscription(
      sub, { trial_end: newEnd }, actor, 'subscription.extended',
      `Trial extended by ${n} day(s) to ${newEnd}`,
      { title: 'Your free trial was extended', body: `Your trial now ends on ${newEnd}.` },
    )
  }

  const base = sub.current_period_end && sub.current_period_end > today ? sub.current_period_end : today
  const newEnd = addDays(base, n)
  return ownerUpdateSubscription(
    sub,
    { current_period_end: newEnd, status: 'active', grace_period_end: null },
    actor, 'subscription.extended',
    `Subscription extended by ${n} day(s) to ${newEnd}`,
    { title: 'Your subscription was extended', body: `Your subscription now runs until ${newEnd}.` },
  )
}

export async function changeSubscriptionPlan(sub, planId, billingCycle, planName, actor) {
  return ownerUpdateSubscription(
    sub, { plan_id: planId, billing_cycle: billingCycle }, actor, 'subscription.plan_changed',
    `Plan changed to ${planName} (${billingCycle})`,
    { title: 'Your plan was changed', body: `Your plan is now ${planName}, billed ${billingCycle}.` },
  )
}

export async function suspendSubscription(sub, actor) {
  return ownerUpdateSubscription(
    sub, { status: 'suspended' }, actor, 'subscription.suspended',
    'Subscription suspended by owner',
    { title: 'Your subscription was suspended', body: 'Please contact GOODIE-MEDHUB support.', severity: 'critical' },
  )
}

export async function cancelSubscription(sub, actor) {
  return ownerUpdateSubscription(
    sub, { status: 'cancelled', auto_renew: false }, actor, 'subscription.cancelled',
    'Subscription cancelled by owner',
    { title: 'Your subscription was cancelled', body: 'Choose a plan on the Subscription page to reactivate.', severity: 'warning' },
  )
}

// Reactivating never hands out free time: if the paid period is still
// in the future the hospital goes back to active; otherwise it becomes
// expired and they must pay (or the owner uses Extend).
export async function reactivateSubscription(sub, actor) {
  const stillPaid = sub.current_period_end && sub.current_period_end >= todayStr()
  const status = stillPaid ? 'active' : 'expired'
  return ownerUpdateSubscription(
    sub, { status, grace_period_end: null }, actor, 'subscription.reactivated',
    `Subscription reactivated as ${status}`,
    { title: 'Your subscription was reactivated', body: stillPaid ? 'Your plan is active again.' : 'Renew on the Subscription page to restore full access.' },
  )
}
