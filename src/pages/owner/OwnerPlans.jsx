import { useEffect, useState } from 'react'
import { getAllPlans, savePlan, formatMoney } from '../../lib/subscriptions'

// =====================================================================
// GOODIE-MEDHUB — Owner Portal: Plan editor (Phase 7)
//
// Lets the owner change every price, limit and feature of the three
// plans. Nothing about a plan is hard-coded in the app — the hospital
// Subscription page and the payment-price trigger both read these rows.
//
// Plans can be EDITED but not created, deleted or re-slugged here:
// existing hospital subscriptions point at these rows.
//
// Limits: "max_staff" and "max_patients" have their own fields (blank
// means unlimited). Any OTHER keys already inside a plan's limits are
// preserved untouched when you save, so future limits are never lost.
// =====================================================================

function planToForm(plan) {
  const limits = plan.limits || {}
  return {
    name: plan.name || '',
    description: plan.description || '',
    monthly_price: String(plan.monthly_price ?? 0),
    yearly_price: String(plan.yearly_price ?? 0),
    currency: plan.currency || 'NGN',
    included_facilities: String(plan.included_facilities ?? 1),
    additional_facility_monthly_price: String(plan.additional_facility_monthly_price ?? 0),
    additional_facility_yearly_price: String(plan.additional_facility_yearly_price ?? 0),
    trial_days: String(plan.trial_days ?? 30),
    trial_eligible: !!plan.trial_eligible,
    features: (Array.isArray(plan.features) ? plan.features : []).join('\n'),
    max_staff: limits.max_staff == null ? '' : String(limits.max_staff),
    max_patients: limits.max_patients == null ? '' : String(limits.max_patients),
    active: !!plan.active,
    sort_order: String(plan.sort_order ?? 0),
  }
}

function isNonNegativeNumber(v) {
  return v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0
}

export default function OwnerPlans() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const [editingPlan, setEditingPlan] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function loadPlans() {
    setLoading(true)
    try {
      setPlans(await getAllPlans())
    } catch (err) {
      showToast(err.message || 'Could not load plans')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPlans() }, [])

  function openEdit(plan) {
    setEditingPlan(plan)
    setForm(planToForm(plan))
    setFormError('')
  }

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setFormError('')

    if (!form.name.trim()) return setFormError('Plan name is required.')
    const numberFields = [
      ['monthly_price', 'Monthly price'],
      ['yearly_price', 'Yearly price'],
      ['additional_facility_monthly_price', 'Extra facility monthly price'],
      ['additional_facility_yearly_price', 'Extra facility yearly price'],
      ['included_facilities', 'Included facilities'],
      ['trial_days', 'Trial days'],
    ]
    for (const [key, label] of numberFields) {
      if (!isNonNegativeNumber(form[key])) return setFormError(`${label} must be a number that is 0 or more.`)
    }
    if (Number(form.included_facilities) < 1) return setFormError('A plan must include at least 1 facility.')
    for (const key of ['max_staff', 'max_patients']) {
      if (form[key] !== '' && !isNonNegativeNumber(form[key])) {
        return setFormError('Limits must be a number 0 or more, or left blank for unlimited.')
      }
    }

    // Keep any limit keys this form doesn't know about, then apply ours.
    const limits = { ...(editingPlan.limits || {}) }
    limits.max_staff = form.max_staff === '' ? null : Number(form.max_staff)
    limits.max_patients = form.max_patients === '' ? null : Number(form.max_patients)

    const fields = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      monthly_price: Number(form.monthly_price),
      yearly_price: Number(form.yearly_price),
      currency: form.currency.trim().toUpperCase() || 'NGN',
      included_facilities: Math.floor(Number(form.included_facilities)),
      additional_facility_monthly_price: Number(form.additional_facility_monthly_price),
      additional_facility_yearly_price: Number(form.additional_facility_yearly_price),
      trial_days: Math.floor(Number(form.trial_days)),
      trial_eligible: form.trial_eligible,
      features: form.features.split('\n').map(s => s.trim()).filter(Boolean),
      limits,
      active: form.active,
      sort_order: Math.floor(Number(form.sort_order)) || 0,
    }

    setSaving(true)
    try {
      await savePlan(editingPlan.id, fields)
      setEditingPlan(null)
      showToast(`${fields.name} updated`)
      loadPlans()
    } catch (err) {
      setFormError(err.message || 'Could not save plan')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="owner-panel"><div className="owner-empty">Loading…</div></div>

  return (
    <>
      <section className="owner-panel">
        <div className="owner-panel-head">
          <div className="owner-panel-title">Plans</div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 14 }}>
          Changing a price affects payments submitted from now on. Hospitals already active keep their current period.
        </div>

        {plans.map(p => (
          <div key={p.id} className="owner-list-row">
            <div className="owner-list-row-main">
              <div className="owner-list-row-title">
                {p.name}{!p.active ? ' (inactive)' : ''}
              </div>
              <div className="owner-list-row-sub">
                {formatMoney(p.monthly_price, p.currency)}/mo · {formatMoney(p.yearly_price, p.currency)}/yr ·
                {' '}{p.included_facilities} facilit{p.included_facilities === 1 ? 'y' : 'ies'} included ·
                {' '}extra {formatMoney(p.additional_facility_monthly_price, p.currency)}/mo
              </div>
              <div className="owner-list-row-sub">
                {p.trial_eligible ? `${p.trial_days}-day trial` : 'No trial'} ·
                {' '}staff {p.limits?.max_staff ?? 'unlimited'} · patients {p.limits?.max_patients ?? 'unlimited'}
              </div>
            </div>
            <div className="owner-list-row-actions">
              <button className="owner-icon-btn owner-icon-btn-inline" onClick={() => openEdit(p)}>Edit</button>
            </div>
          </div>
        ))}
      </section>

      {editingPlan && form && (
        <div className="dash-modal-backdrop" onClick={() => !saving && setEditingPlan(null)}>
          <div className="card dash-modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="dash-modal-title">Edit {editingPlan.name} ({editingPlan.slug})</div>
            <div className="dash-modal-body">
              {formError && <div className="error-box">{formError}</div>}
              <form id="plan-form" onSubmit={handleSave}>
                <div className="field">
                  <label>Plan Name</label>
                  <input value={form.name} onChange={e => setField('name', e.target.value)} />
                </div>
                <div className="field">
                  <label>Description</label>
                  <textarea rows={2} value={form.description} onChange={e => setField('description', e.target.value)} />
                </div>

                <div className="dash-field-grid">
                  <div className="field">
                    <label>Monthly Price</label>
                    <input type="number" min="0" step="0.01" value={form.monthly_price} onChange={e => setField('monthly_price', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Yearly Price</label>
                    <input type="number" min="0" step="0.01" value={form.yearly_price} onChange={e => setField('yearly_price', e.target.value)} />
                  </div>
                </div>

                <div className="dash-field-grid">
                  <div className="field">
                    <label>Currency</label>
                    <input maxLength={3} value={form.currency} onChange={e => setField('currency', e.target.value.toUpperCase())} />
                  </div>
                  <div className="field">
                    <label>Facilities Included</label>
                    <input type="number" min="1" step="1" value={form.included_facilities} onChange={e => setField('included_facilities', e.target.value)} />
                  </div>
                </div>

                <div className="dash-field-grid">
                  <div className="field">
                    <label>Extra Facility — Monthly</label>
                    <input type="number" min="0" step="0.01" value={form.additional_facility_monthly_price} onChange={e => setField('additional_facility_monthly_price', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Extra Facility — Yearly</label>
                    <input type="number" min="0" step="0.01" value={form.additional_facility_yearly_price} onChange={e => setField('additional_facility_yearly_price', e.target.value)} />
                  </div>
                </div>

                <div className="dash-field-grid">
                  <div className="field">
                    <label>Trial Days</label>
                    <input type="number" min="0" step="1" value={form.trial_days} onChange={e => setField('trial_days', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Sort Order</label>
                    <input type="number" step="1" value={form.sort_order} onChange={e => setField('sort_order', e.target.value)} />
                  </div>
                </div>

                <div className="dash-field-grid">
                  <div className="field">
                    <label>Max Staff (blank = unlimited)</label>
                    <input type="number" min="0" step="1" value={form.max_staff} onChange={e => setField('max_staff', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Max Patients (blank = unlimited)</label>
                    <input type="number" min="0" step="1" value={form.max_patients} onChange={e => setField('max_patients', e.target.value)} />
                  </div>
                </div>

                <div className="field">
                  <label>Features (one per line)</label>
                  <textarea rows={5} value={form.features} onChange={e => setField('features', e.target.value)} />
                  <div className="field-hint">Shown to hospitals on the plan card. Only list what the plan really includes.</div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>
                  <input type="checkbox" checked={form.trial_eligible} onChange={e => setField('trial_eligible', e.target.checked)} />
                  Eligible for free trial
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--muted)' }}>
                  <input type="checkbox" checked={form.active} onChange={e => setField('active', e.target.checked)} />
                  Active (hospitals can choose this plan)
                </label>
              </form>
            </div>
            <div className="dash-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditingPlan(null)} disabled={saving}>Cancel</button>
              <button type="submit" form="plan-form" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="owner-toast">{toast}</div>}
    </>
  )
}
