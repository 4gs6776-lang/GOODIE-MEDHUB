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
