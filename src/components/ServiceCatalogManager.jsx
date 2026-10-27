import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOfflineTable } from '../lib/useOfflineTable'
import { writeAudit } from '../lib/audit'
import AppIcon from './icons'
import { SERVICE_CATEGORIES, formatMoney } from '../lib/billingService'

// =====================================================================
// ServiceCatalogManager — CRUD UI for the service_catalog table.
// Shown in Settings → Service Catalog. Admin/owner/billing only.
//
// Lists all services grouped by category. Supports search, add, edit,
// deactivate (soft-delete via is_active=false).
// =====================================================================

export default function ServiceCatalogManager() {
  const { profile, hospital } = useAuth()
  const { records: catalog, addRecord, updateRecord } = useOfflineTable('service_catalog', hospital?.id)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [form, setForm] = useState({
    code: '', name: '', description: '', category: 'consultation',
    default_price: '', default_cost: '', unit: 'session',
    is_taxable: false, tax_rate: '7.5', sort_order: '0',
  })

  function resetForm() {
    setForm({
      code: '', name: '', description: '', category: 'consultation',
      default_price: '', default_cost: '', unit: 'session',
      is_taxable: false, tax_rate: '7.5', sort_order: '0',
    })
    setEditingId(null)
    setError('')
  }

  function openModal(item = null) {
    if (item) {
      setEditingId(item.id)
      setForm({
        code: item.code || '',
        name: item.name || '',
        description: item.description || '',
        category: item.category || 'consultation',
        default_price: String(item.default_price ?? ''),
        default_cost: String(item.default_cost ?? ''),
        unit: item.unit || 'session',
        is_taxable: !!item.is_taxable,
        tax_rate: String(item.tax_rate ?? '7.5'),
        sort_order: String(item.sort_order ?? '0'),
      })
    } else {
      resetForm()
    }
    setShowModal(true)
  }

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const filtered = useMemo(() => {
    let arr = [...(catalog || [])]
    if (categoryFilter !== 'all') {
      arr = arr.filter(s => s.category === categoryFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      arr = arr.filter(s =>
        (s.code || '').toLowerCase().includes(q) ||
        (s.name || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
      )
    }
    return arr.sort((a, b) => {
      // Active first, then by sort_order, then by name
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0)
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [catalog, search, categoryFilter])

  async function handleSave(e) {
    e.preventDefault()
    setError('')

    if (!form.code.trim()) { setError('Service code is required.'); return }
    if (!form.name.trim()) { setError('Service name is required.'); return }
    const price = parseFloat(form.default_price)
    if (isNaN(price) || price < 0) { setError('Default price must be a non-negative number.'); return }

    // Check for duplicate code (excluding the row being edited)
    const dupe = (catalog || []).find(s =>
      s.code === form.code.trim().toUpperCase() && s.id !== editingId
    )
    if (dupe) { setError(`Code "${form.code.trim().toUpperCase()}" is already in use.`); return }

    setSaving(true)
    try {
      const payload = {
        hospital_id: hospital.id,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category,
        default_price: price,
        default_cost: parseFloat(form.default_cost) || 0,
        unit: form.unit?.trim() || null,
        is_taxable: !!form.is_taxable,
        tax_rate: parseFloat(form.tax_rate) || 0,
        sort_order: parseInt(form.sort_order, 10) || 0,
        is_active: true,
      }

      if (editingId) {
        await updateRecord(editingId, payload)
        writeAudit({
          hospitalId: hospital.id, actor: profile,
          action: 'service_catalog.updated',
          entityType: 'service_catalog', entityId: editingId,
          summary: `Updated service "${payload.name}" (${payload.code}) — ${formatMoney(payload.default_price)}`,
          metadata: { code: payload.code, category: payload.category, price: payload.default_price },
        })
      } else {
        const saved = await addRecord(payload)
        writeAudit({
          hospitalId: hospital.id, actor: profile,
          action: 'service_catalog.created',
          entityType: 'service_catalog', entityId: saved?.id || null,
          summary: `Created service "${payload.name}" (${payload.code}) — ${formatMoney(payload.default_price)}`,
          metadata: { code: payload.code, category: payload.category, price: payload.default_price },
        })
      }
      setShowModal(false)
      resetForm()
    } catch (err) {
      setError(err.message || 'Could not save the service.')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(item) {
    const next = !item.is_active
    await updateRecord(item.id, { is_active: next })
    writeAudit({
      hospitalId: hospital.id, actor: profile,
      action: next ? 'service_catalog.activated' : 'service_catalog.deactivated',
      entityType: 'service_catalog', entityId: item.id,
      summary: `${next ? 'Activated' : 'Deactivated'} service "${item.name}" (${item.code})`,
      metadata: { code: item.code, is_active: next },
    })
  }

  const categoryLabel = (cat) => SERVICE_CATEGORIES.find(c => c.value === cat)?.label || cat

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search code, name, description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: '8px 10px', fontSize: 12.5, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)' }}
        />
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ padding: '8px 10px', fontSize: 12.5, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)' }}>
          <option value="all">All categories</option>
          {SERVICE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: 'auto', padding: '8px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => openModal(null)}
        >
          <AppIcon name="plus" size={14} /> Add Service
        </button>
      </div>

      <div className="dash-table-wrap">
        <table className="dash-full-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Price</th>
              <th>Cost</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>
                {catalog?.length === 0 ? 'No services in the catalog yet. Click "Add Service" to create the first one.' : 'No services match these filters.'}
              </td></tr>
            ) : filtered.map(s => (
              <tr key={s.id} style={{ opacity: s.is_active === false ? 0.5 : 1 }}>
                <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, fontSize: 12 }}>{s.code}</td>
                <td style={{ fontWeight: 600 }}>
                  {s.name}
                  {s.description && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400, marginTop: 2 }}>{s.description}</div>}
                </td>
                <td>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(118,87,232,0.14)', color: 'var(--violet)',
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>{categoryLabel(s.category)}</span>
                </td>
                <td style={{ fontSize: 11.5, color: 'var(--muted)' }}>{s.unit || '—'}</td>
                <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--teal)' }}>{formatMoney(s.default_price)}</td>
                <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, color: 'var(--muted)' }}>{formatMoney(s.default_cost)}</td>
                <td>
                  {s.is_active === false ? (
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(154,170,183,0.14)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Inactive</span>
                  ) : (
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(0,199,199,0.14)', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Active</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }} onClick={() => openModal(s)}>Edit</button>
                    <button className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }} onClick={() => handleToggleActive(s)} title={s.is_active === false ? 'Activate' : 'Deactivate'}>
                      {s.is_active === false ? 'Activate' : 'Disable'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>
        Showing {filtered.length} of {catalog?.length || 0} services
      </div>

      {showModal && (
        <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm() } }}>
          <div className="card dash-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14 }}>
              <div className="dash-modal-title" style={{ paddingBottom: 0 }}>{editingId ? 'Edit Service' : 'Add Service'}</div>
              <button className="dash-icon-btn" onClick={() => { setShowModal(false); resetForm() }} aria-label="Close"><AppIcon name="close" size={18} /></button>
            </div>
            <div className="dash-modal-body">
              <form id="service-form" onSubmit={handleSave}>
                {error && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
                <div className="dash-field-grid">
                  <div className="field">
                    <label>Code *</label>
                    <input value={form.code} onChange={e => setField('code', e.target.value.toUpperCase())} placeholder="e.g. CONS-GEN" autoFocus required style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }} disabled={!!editingId} />
                  </div>
                  <div className="field">
                    <label>Category *</label>
                    <select value={form.category} onChange={e => setField('category', e.target.value)}>
                      {SERVICE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Name *</label>
                  <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. General Consultation" required />
                </div>
                <div className="field">
                  <label>Description (optional)</label>
                  <input value={form.description} onChange={e => setField('description', e.target.value)} placeholder="e.g. Standard doctor consultation" />
                </div>
                <div className="dash-field-grid">
                  <div className="field">
                    <label>Default Price (₦) *</label>
                    <input type="number" min="0" step="0.01" value={form.default_price} onChange={e => setField('default_price', e.target.value)} placeholder="e.g. 5000" required style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }} />
                  </div>
                  <div className="field">
                    <label>Internal Cost (₦)</label>
                    <input type="number" min="0" step="0.01" value={form.default_cost} onChange={e => setField('default_cost', e.target.value)} placeholder="0" style={{ fontFamily: 'var(--font-mono, monospace)' }} />
                  </div>
                </div>
                <div className="dash-field-grid">
                  <div className="field">
                    <label>Unit</label>
                    <input value={form.unit} onChange={e => setField('unit', e.target.value)} placeholder="e.g. session, test, day, dose" />
                  </div>
                  <div className="field">
                    <label>Sort Order</label>
                    <input type="number" min="0" value={form.sort_order} onChange={e => setField('sort_order', e.target.value)} placeholder="0" />
                  </div>
                </div>
                <div className="dash-field-grid">
                  <div className="field">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={form.is_taxable} onChange={e => setField('is_taxable', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
                      Taxable
                    </label>
                  </div>
                  <div className="field">
                    <label>Tax Rate (%)</label>
                    <input type="number" min="0" max="100" step="0.5" value={form.tax_rate} onChange={e => setField('tax_rate', e.target.value)} disabled={!form.is_taxable} style={{ opacity: form.is_taxable ? 1 : 0.5 }} />
                  </div>
                </div>
              </form>
            </div>
            <div className="dash-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { setShowModal(false); resetForm() }} disabled={saving}>Cancel</button>
              <button type="submit" form="service-form" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : (editingId ? 'Save Changes' : 'Add Service')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
