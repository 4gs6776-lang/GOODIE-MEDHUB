import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOfflineTable } from '../lib/useOfflineTable'
import AppIcon from './icons'
import { writeAudit } from '../lib/audit'
import { CREDIT_CONTROL_ACTIONS, formatMoney } from '../lib/billingService'

// =====================================================================
// <CreditControlRulesManager> — CRUD UI for hospital_credit_control_rules.
// Shown in Settings → Credit Control Rules.
// =====================================================================

const PATIENT_CATEGORIES = ['outpatient', 'inpatient', 'hmo', 'anc', 'personal', 'family', 'emergency']

export default function CreditControlRulesManager() {
  const { profile, hospital } = useAuth()
  const { records: rules, addRecord, updateRecord, deleteRecord } = useOfflineTable('hospital_credit_control_rules', hospital?.id)
  const { records: blocks } = useOfflineTable('patient_credit_blocks', hospital?.id)

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '', description: '',
    outstanding_balance_threshold: '50000',
    oldest_invoice_age_days: '60',
    action: 'warn',
    applies_to_all: true,
    applies_to_categories: [],
    is_active: true,
  })

  function resetForm() {
    setForm({
      name: '', description: '',
      outstanding_balance_threshold: '50000',
      oldest_invoice_age_days: '60',
      action: 'warn',
      applies_to_all: true,
      applies_to_categories: [],
      is_active: true,
    })
    setEditingId(null); setError('')
  }

  function openModal(item = null) {
    if (item) {
      setEditingId(item.id)
      setForm({
        name: item.name || '',
        description: item.description || '',
        outstanding_balance_threshold: String(item.outstanding_balance_threshold ?? '50000'),
        oldest_invoice_age_days: String(item.oldest_invoice_age_days ?? '60'),
        action: item.action || 'warn',
        applies_to_all: item.applies_to_all !== false,
        applies_to_categories: item.applies_to_categories || [],
        is_active: item.is_active !== false,
      })
    } else { resetForm() }
    setShowModal(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setError('Rule name is required'); return }
    const threshold = parseFloat(form.outstanding_balance_threshold)
    if (isNaN(threshold) || threshold <= 0) { setError('Outstanding balance threshold must be greater than 0'); return }
    const ageDays = parseInt(form.oldest_invoice_age_days, 10)
    if (isNaN(ageDays) || ageDays <= 0) { setError('Oldest invoice age must be greater than 0 days'); return }

    setSaving(true)
    try {
      const payload = {
        hospital_id: hospital.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        outstanding_balance_threshold: threshold,
        oldest_invoice_age_days: ageDays,
        action: form.action,
        applies_to_all: !!form.applies_to_all,
        applies_to_categories: form.applies_to_all ? [] : form.applies_to_categories,
        is_active: form.is_active !== false,
        created_by: profile?.id || null,
      }
      if (editingId) {
        await updateRecord(editingId, payload)
        writeAudit({
          hospitalId: hospital.id, actor: profile,
          action: 'credit_control_rule.updated',
          entityType: 'hospital_credit_control_rules', entityId: editingId,
          summary: `Updated credit control rule "${payload.name}" — ${formatMoney(payload.outstanding_balance_threshold)} / ${payload.oldest_invoice_age_days} days → ${payload.action}`,
          metadata: payload,
        })
      } else {
        const saved = await addRecord(payload)
        writeAudit({
          hospitalId: hospital.id, actor: profile,
          action: 'credit_control_rule.created',
          entityType: 'hospital_credit_control_rules', entityId: saved?.id || null,
          summary: `Created credit control rule "${payload.name}" — ${formatMoney(payload.outstanding_balance_threshold)} / ${payload.oldest_invoice_age_days} days → ${payload.action}`,
          metadata: payload,
        })
      }
      setShowModal(false); resetForm()
    } catch (err) {
      setError(err.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(item) {
    await updateRecord(item.id, { is_active: !item.is_active })
    writeAudit({
      hospitalId: hospital.id, actor: profile,
      action: item.is_active ? 'credit_control_rule.deactivated' : 'credit_control_rule.activated',
      entityType: 'hospital_credit_control_rules', entityId: item.id,
      summary: `${item.is_active ? 'Deactivated' : 'Activated'} credit control rule "${item.name}"`,
      metadata: { is_active: !item.is_active },
    })
  }

  async function handleDelete(item) {
    if (!confirm(`Delete credit control rule "${item.name}"?`)) return
    await deleteRecord(item.id)
    writeAudit({
      hospitalId: hospital.id, actor: profile,
      action: 'credit_control_rule.deleted',
      entityType: 'hospital_credit_control_rules', entityId: item.id,
      summary: `Deleted credit control rule "${item.name}"`,
      metadata: { name: item.name },
    })
  }

  const sorted = useMemo(() => {
    return [...(rules || [])].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [rules])

  const activeBlocksCount = (blocks || []).filter(b => b.status === 'active').length

  function toggleCategory(cat) {
    setForm(prev => ({
      ...prev,
      applies_to_categories: prev.applies_to_categories.includes(cat)
        ? prev.applies_to_categories.filter(c => c !== cat)
        : [...prev.applies_to_categories, cat],
    }))
  }

  const actionLabel = (a) => CREDIT_CONTROL_ACTIONS.find(x => x.value === a)?.label || a

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        {activeBlocksCount > 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--danger)', fontWeight: 700 }}>
            {activeBlocksCount} patient(s) currently on credit hold
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary" style={{ width: 'auto', padding: '8px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => openModal(null)}>
          <AppIcon name="plus" size={14} /> Add Rule
        </button>
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)', fontSize: 12.5 }}>
          No credit control rules yet. Add one to automatically warn or block services for patients with overdue balances.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map(r => (
            <div key={r.id} style={{
              padding: 14, borderRadius: 10,
              background: 'var(--bg-elevated)',
              border: `1px solid ${r.is_active ? 'var(--line-soft)' : 'var(--line)'}`,
              opacity: r.is_active ? 1 : 0.6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14 }}>{r.name}</strong>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: r.action === 'warn' ? 'rgba(201,169,97,0.14)' : r.action === 'block' ? 'rgba(225,104,94,0.14)' : 'rgba(118,87,232,0.14)',
                      color: r.action === 'warn' ? 'var(--gold)' : r.action === 'block' ? 'var(--danger)' : 'var(--violet)',
                      textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {actionLabel(r.action)}
                    </span>
                    {!r.is_active && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(154,170,183,0.14)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Inactive</span>}
                  </div>
                  {r.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{r.description}</div>}
                  <div style={{ fontSize: 12, color: 'var(--ivory)', marginTop: 6 }}>
                    Triggers when outstanding balance ≥ <strong style={{ color: 'var(--danger)' }}>{formatMoney(r.outstanding_balance_threshold)}</strong>
                    {' '}AND oldest unpaid invoice ≥ <strong style={{ color: 'var(--gold)' }}>{r.oldest_invoice_age_days} days</strong> old
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    Applies to: {r.applies_to_all ? 'All patient categories' : (r.applies_to_categories?.length ? r.applies_to_categories.join(', ') : 'None')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '5px 10px', fontSize: 11 }} onClick={() => openModal(r)}>Edit</button>
                  <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '5px 10px', fontSize: 11 }} onClick={() => handleToggleActive(r)}>{r.is_active ? 'Disable' : 'Activate'}</button>
                  <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '5px 10px', fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => handleDelete(r)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm() } }}>
          <div className="card dash-modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14 }}>
              <div className="dash-modal-title" style={{ paddingBottom: 0 }}>{editingId ? 'Edit Credit Control Rule' : 'Add Credit Control Rule'}</div>
              <button className="dash-icon-btn" onClick={() => { setShowModal(false); resetForm() }} aria-label="Close"><AppIcon name="close" size={18} /></button>
            </div>
            <div className="dash-modal-body">
              <form id="credit-rule-form" onSubmit={handleSave}>
                {error && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
                <div className="field">
                  <label>Rule Name *</label>
                  <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. Block services for chronic debtors" autoFocus required />
                </div>
                <div className="field">
                  <label>Description (optional)</label>
                  <input value={form.description} onChange={e => setField('description', e.target.value)} placeholder="What this rule does + when to use it" />
                </div>
                <div className="dash-field-grid">
                  <div className="field">
                    <label>Outstanding Balance Threshold (₦) *</label>
                    <input type="number" min="1" step="100" value={form.outstanding_balance_threshold} onChange={e => setField('outstanding_balance_threshold', e.target.value)} required style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }} />
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Block when balance ≥ this amount</div>
                  </div>
                  <div className="field">
                    <label>Oldest Invoice Age (days) *</label>
                    <input type="number" min="1" step="1" value={form.oldest_invoice_age_days} onChange={e => setField('oldest_invoice_age_days', e.target.value)} required style={{ fontFamily: 'var(--font-mono, monospace)' }} />
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>AND oldest unpaid invoice is at least this old</div>
                  </div>
                </div>
                <div className="field">
                  <label>Action when triggered *</label>
                  <select value={form.action} onChange={e => setField('action', e.target.value)}>
                    {CREDIT_CONTROL_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    {CREDIT_CONTROL_ACTIONS.find(a => a.value === form.action)?.description}
                  </div>
                </div>
                <div className="field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={form.applies_to_all} onChange={e => setField('applies_to_all', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
                    Apply to ALL patient categories
                  </label>
                </div>
                {!form.applies_to_all && (
                  <div className="field">
                    <label>Apply to these categories:</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {PATIENT_CATEGORIES.map(cat => (
                        <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px', borderRadius: 6, background: 'var(--bg-elevated)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={form.applies_to_categories.includes(cat)} onChange={() => toggleCategory(cat)} style={{ width: 14, height: 14, accentColor: 'var(--teal)' }} />
                          {cat}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={form.is_active} onChange={e => setField('is_active', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
                    Active
                  </label>
                </div>
              </form>
            </div>
            <div className="dash-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { setShowModal(false); resetForm() }} disabled={saving}>Cancel</button>
              <button type="submit" form="credit-rule-form" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : (editingId ? 'Save Changes' : 'Add Rule')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }
}
