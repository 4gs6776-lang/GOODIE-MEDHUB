import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOfflineTable } from '../lib/useOfflineTable'
import { writeAudit } from '../lib/audit'
import AppIcon from './icons'
import { PRICE_LIST_TYPES, formatMoney } from '../lib/billingService'

// =====================================================================
// PriceListManager — CRUD UI for price_lists + price_list_items.
// Shown in Settings → Price Lists. Admin/owner/billing only.
//
// Lets the admin create multiple tariffs (standard, HMO, staff, etc.)
// and override the price + coverage for each service in each tariff.
// =====================================================================

export default function PriceListManager() {
  const { profile, hospital } = useAuth()
  const { records: priceLists, addRecord: addPl, updateRecord: updatePl, deleteRecord: deletePl } = useOfflineTable('price_lists', hospital?.id)
  const { records: items, addRecord: addItem, updateRecord: updateItem, deleteRecord: deleteItem } = useOfflineTable('price_list_items', hospital?.id)
  const { records: catalog } = useOfflineTable('service_catalog', hospital?.id)

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expandedPl, setExpandedPl] = useState(null)

  const [form, setForm] = useState({
    code: '', name: '', description: '', type: 'standard',
    is_default: false, is_active: true, effective_from: '', effective_to: '',
  })

  function resetForm() {
    setForm({ code: '', name: '', description: '', type: 'standard', is_default: false, is_active: true, effective_from: '', effective_to: '' })
    setEditingId(null); setError('')
  }

  function openModal(pl = null) {
    if (pl) {
      setEditingId(pl.id)
      setForm({
        code: pl.code || '',
        name: pl.name || '',
        description: pl.description || '',
        type: pl.type || 'standard',
        is_default: !!pl.is_default,
        is_active: pl.is_active !== false,
        effective_from: pl.effective_from || '',
        effective_to: pl.effective_to || '',
      })
    } else {
      resetForm()
    }
    setShowModal(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (!form.code.trim()) { setError('Code is required.'); return }
    if (!form.name.trim()) { setError('Name is required.'); return }
    const dupe = (priceLists || []).find(p => p.code === form.code.trim().toUpperCase() && p.id !== editingId)
    if (dupe) { setError(`Code "${form.code.trim().toUpperCase()}" is already in use.`); return }

    setSaving(true)
    try {
      const payload = {
        hospital_id: hospital.id,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        type: form.type,
        is_default: !!form.is_default,
        is_active: form.is_active !== false,
        effective_from: form.effective_from || null,
        effective_to: form.effective_to || null,
      }
      if (editingId) {
        await updatePl(editingId, payload)
        writeAudit({
          hospitalId: hospital.id, actor: profile,
          action: 'price_list.updated',
          entityType: 'price_lists', entityId: editingId,
          summary: `Updated price list "${payload.name}" (${payload.code})`,
          metadata: payload,
        })
      } else {
        const saved = await addPl(payload)
        writeAudit({
          hospitalId: hospital.id, actor: profile,
          action: 'price_list.created',
          entityType: 'price_lists', entityId: saved?.id || null,
          summary: `Created price list "${payload.name}" (${payload.code})`,
          metadata: payload,
        })
      }
      setShowModal(false); resetForm()
    } catch (err) {
      setError(err.message || 'Could not save the price list.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(pl) {
    if (!confirm(`Delete price list "${pl.name}"?\n\nAll ${items?.filter(i => i.price_list_id === pl.id).length || 0} price overrides in this list will also be removed. This cannot be undone.`)) return
    await deletePl(pl.id)
    writeAudit({
      hospitalId: hospital.id, actor: profile,
      action: 'price_list.deleted',
      entityType: 'price_lists', entityId: pl.id,
      summary: `Deleted price list "${pl.name}" (${pl.code})`,
      metadata: { code: pl.code },
    })
  }

  // Items for the expanded price list
  const expandedItems = useMemo(() => {
    if (!expandedPl || !items || !catalog) return []
    return (catalog || [])
      .filter(s => s.is_active !== false)
      .map(s => {
        const item = items.find(i => i.price_list_id === expandedPl && i.service_catalog_id === s.id)
        return { service: s, item }
      })
      .sort((a, b) => (a.service.sort_order || 0) - (b.service.sort_order || 0) || (a.service.name || '').localeCompare(b.service.name || ''))
  }, [expandedPl, items, catalog])

  async function updateOverride(service, item, field, value) {
    if (item) {
      await updateItem(item.id, { [field]: value })
    } else {
      // Create the override row with the catalog's default price as starting point
      const newItem = await addItem({
        hospital_id: hospital.id,
        price_list_id: expandedPl,
        service_catalog_id: service.id,
        price: service.default_price,
        copay_amount: 0,
        copay_percent: 0,
        coverage_percent: 100,
        is_excluded: false,
        prior_auth_required: false,
        [field]: value,
      })
      writeAudit({
        hospitalId: hospital.id, actor: profile,
        action: 'price_list_item.created',
        entityType: 'price_list_items', entityId: newItem?.id || null,
        summary: `Added price override for ${service.name} (${service.code}) in price list`,
        metadata: { service_code: service.code, field, value },
      })
    }
  }

  const typeLabel = (t) => PRICE_LIST_TYPES.find(x => x.value === t)?.label || t

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary" style={{ width: 'auto', padding: '8px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => openModal(null)}>
          <AppIcon name="plus" size={14} /> Add Price List
        </button>
      </div>

      {(priceLists || []).length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>No price lists yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(priceLists || []).sort((a, b) => (a.is_default === b.is_default ? 0 : a.is_default ? -1 : 1)).map(pl => (
            <div key={pl.id} style={{ padding: 14, borderRadius: 10, background: 'var(--bg-elevated)', border: `1px solid ${expandedPl === pl.id ? 'var(--teal-border)' : 'var(--line-soft)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={() => setExpandedPl(expandedPl === pl.id ? null : pl.id)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)', display: 'inline-block', transition: 'transform 0.15s', transform: expandedPl === pl.id ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                    <strong style={{ fontSize: 14 }}>{pl.name}</strong>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--muted)' }}>{pl.code}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(118,87,232,0.14)', color: 'var(--violet)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{typeLabel(pl.type)}</span>
                    {pl.is_default && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(0,199,199,0.14)', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Default</span>}
                    {pl.is_active === false && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(154,170,183,0.14)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Inactive</span>}
                  </div>
                  {pl.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, marginLeft: 22 }}>{pl.description}</div>}
                </button>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }} onClick={() => openModal(pl)}>Edit</button>
                  <button className="btn btn-ghost" style={{ width: 'auto', padding: '4px 10px', fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => handleDelete(pl)}>Delete</button>
                </div>
              </div>

              {expandedPl === pl.id && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    Price Overrides ({expandedItems.filter(x => x.item).length} of {expandedItems.length} services overridden)
                  </div>
                  <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)' }}>
                        <tr>
                          <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--line)' }}>Service</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid var(--line)' }}>Catalog Price</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid var(--line)' }}>Override Price</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid var(--line)' }}>Coverage %</th>
                          <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--line)' }}>Excl?</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expandedItems.map(({ service, item }) => (
                          <tr key={service.id}>
                            <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--line-soft)' }}>
                              <div style={{ fontWeight: 600 }}>{service.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>{service.code}</div>
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid var(--line-soft)', fontFamily: 'var(--font-mono, monospace)', color: 'var(--muted)' }}>{formatMoney(service.default_price)}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid var(--line-soft)' }}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue={item?.price ?? ''}
                                placeholder={String(service.default_price)}
                                onBlur={e => updateOverride(service, item, 'price', parseFloat(e.target.value) || 0)}
                                style={{ width: 90, padding: '4px 6px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--bg-card)', color: 'var(--ivory)' }}
                              />
                            </td>
                            <td style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid var(--line-soft)' }}>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="5"
                                defaultValue={item?.coverage_percent ?? 100}
                                onBlur={e => updateOverride(service, item, 'coverage_percent', parseFloat(e.target.value) ?? 100)}
                                style={{ width: 60, padding: '4px 6px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', borderRadius: 4, border: '1px solid var(--line)', background: 'var(--bg-card)', color: 'var(--ivory)' }}
                              />
                            </td>
                            <td style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid var(--line-soft)' }}>
                              <input
                                type="checkbox"
                                defaultChecked={!!item?.is_excluded}
                                onChange={e => updateOverride(service, item, 'is_excluded', e.target.checked)}
                                style={{ width: 14, height: 14, accentColor: 'var(--danger)' }}
                                title="Mark as excluded from this price list"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                    Edit a cell and click out — changes are saved automatically. Empty override uses the catalog's default price.
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm() } }}>
          <div className="card dash-modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14 }}>
              <div className="dash-modal-title" style={{ paddingBottom: 0 }}>{editingId ? 'Edit Price List' : 'Add Price List'}</div>
              <button className="dash-icon-btn" onClick={() => { setShowModal(false); resetForm() }} aria-label="Close"><AppIcon name="close" size={18} /></button>
            </div>
            <div className="dash-modal-body">
              <form id="price-list-form" onSubmit={handleSave}>
                {error && <div className="error-box" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
                <div className="dash-field-grid">
                  <div className="field">
                    <label>Code *</label>
                    <input value={form.code} onChange={e => setField('code', e.target.value.toUpperCase())} placeholder="e.g. STD" autoFocus required style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }} disabled={!!editingId} />
                  </div>
                  <div className="field">
                    <label>Type</label>
                    <select value={form.type} onChange={e => setField('type', e.target.value)}>
                      {PRICE_LIST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Name *</label>
                  <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. Standard Tariff" required />
                </div>
                <div className="field">
                  <label>Description</label>
                  <input value={form.description} onChange={e => setField('description', e.target.value)} placeholder="Optional description" />
                </div>
                <div className="dash-field-grid">
                  <div className="field">
                    <label>Effective From</label>
                    <input type="date" value={form.effective_from} onChange={e => setField('effective_from', e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Effective To</label>
                    <input type="date" value={form.effective_to} onChange={e => setField('effective_to', e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={form.is_default} onChange={e => setField('is_default', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--teal)' }} />
                    Set as default price list (used when no patient-specific tariff applies)
                  </label>
                </div>
              </form>
            </div>
            <div className="dash-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { setShowModal(false); resetForm() }} disabled={saving}>Cancel</button>
              <button type="submit" form="price-list-form" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : (editingId ? 'Save Changes' : 'Add Price List')}</button>
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
