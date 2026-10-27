import { useState, useMemo } from 'react'
import AppIcon from './icons'
import { SERVICE_CATEGORIES, formatMoney } from '../lib/billingService'

// =====================================================================
// CatalogPicker — modal that lets the cashier pick a service from the
// service_catalog and (optionally) override the resolved price.
//
// Props:
//   catalog          service_catalog rows (from useBillingCatalog)
//   priceLists       price_lists rows
//   priceListItems   price_list_items rows
//   contracts        hmo_contracts rows
//   patient          the patient being billed (for HMO price list lookup)
//   onPick           (selectedService, resolvedPrice) => void
//   onClose          () => void
//
// The picker calls resolvePriceForPatient() automatically when the user
// picks a service — the cashier sees the resolved price, the HMO split
// (if any), and any pre-auth requirement before they confirm.
// =====================================================================

import { resolvePriceForPatient, computeHmoSplit, findContractForPatient } from '../lib/billingService'

export default function CatalogPicker({ catalog, priceLists, priceListItems, contracts, patient, onPick, onClose }) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [overridePrice, setOverridePrice] = useState('')
  const [overrideQty, setOverrideQty] = useState('1')

  const filtered = useMemo(() => {
    let arr = (catalog || []).filter(s => s.is_active !== false)
    if (categoryFilter !== 'all') arr = arr.filter(s => s.category === categoryFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      arr = arr.filter(s =>
        (s.code || '').toLowerCase().includes(q) ||
        (s.name || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
      )
    }
    return arr.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.name || '').localeCompare(b.name || ''))
  }, [catalog, search, categoryFilter])

  const selected = useMemo(() => {
    return filtered.find(s => s.id === selectedId) || (selectedId ? catalog?.find(s => s.id === selectedId) : null)
  }, [filtered, selectedId, catalog])

  const resolved = useMemo(() => {
    if (!selected) return null
    return resolvePriceForPatient(catalog, priceLists, priceListItems, contracts, patient, selected.code)
  }, [selected, catalog, priceLists, priceListItems, contracts, patient])

  const contract = useMemo(() => findContractForPatient(contracts, patient), [contracts, patient])

  const effectivePrice = overridePrice !== '' ? parseFloat(overridePrice) : resolved?.price
  const qty = parseInt(overrideQty, 10) || 1
  const total = (effectivePrice || 0) * qty
  const split = useMemo(() => computeHmoSplit(total, resolved || {}), [total, resolved])

  function handleConfirm() {
    if (!selected || !resolved) return
    onPick({
      service: selected,
      resolved: {
        ...resolved,
        price: effectivePrice,
        quantity: qty,
      },
      total,
      split,
    })
  }

  return (
    <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card dash-modal" style={{ maxWidth: 720, maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, flexShrink: 0 }}>
          <div>
            <div className="dash-modal-title" style={{ paddingBottom: 0 }}>Add Charge from Catalog</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
              Pick a service — price resolves automatically based on the patient's price list
              {contract && <> (HMO contract: <strong style={{ color: 'var(--violet)' }}>{contract.payer_name}</strong>)</>}
            </div>
          </div>
          <button className="dash-icon-btn" onClick={onClose} aria-label="Close picker"><AppIcon name="close" size={18} /></button>
        </div>

        <div className="dash-modal-body" style={{ overflowY: 'auto' }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search code or name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 220, padding: '8px 10px', fontSize: 12.5, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)' }}
              autoFocus
            />
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ padding: '8px 10px', fontSize: 12.5, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)' }}>
              <option value="all">All categories</option>
              {SERVICE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {/* Service list */}
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>
                No services match. Add more in Settings → Service Catalog.
              </div>
            ) : filtered.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => { setSelectedId(s.id); setOverridePrice(''); setOverrideQty('1') }}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 12px',
                  background: selectedId === s.id ? 'rgba(0,199,199,0.08)' : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--line-soft)',
                  cursor: 'pointer', color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, fontSize: 11.5 }}>{s.code}</span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {SERVICE_CATEGORIES.find(c => c.value === s.category)?.label || s.category}
                      {s.unit && ` · ${s.unit}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--teal)' }}>{formatMoney(s.default_price)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Selected service detail + price resolution */}
          {selected && resolved && (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: 'rgba(0,199,199,0.06)', border: '1px solid var(--teal-border)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                {selected.code} · {selected.name}
              </div>

              <div className="dash-field-grid" style={{ margin: 0 }}>
                <div className="field">
                  <label>Quantity</label>
                  <input type="number" min="1" step="1" value={overrideQty} onChange={e => setOverrideQty(e.target.value)} style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }} />
                </div>
                <div className="field">
                  <label>Unit Price (₦) <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(blank = auto-resolved)</span></label>
                  <input type="number" min="0" step="0.01" value={overridePrice} onChange={e => setOverridePrice(e.target.value)} placeholder={String(resolved.price)} style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }} />
                </div>
              </div>

              {/* Resolved price breakdown */}
              <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ color: 'var(--muted)' }}>Unit Price</span>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>{formatMoney(effectivePrice)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ color: 'var(--muted)' }}>Quantity</span>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>× {qty}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, paddingTop: 6, marginTop: 4, borderTop: '1px solid var(--line)' }}>
                  <span>Total</span>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--teal)' }}>{formatMoney(total)}</span>
                </div>

                {split.hmoAmount > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--line)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--violet)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                      HMO Split ({contract?.payer_name || 'HMO'} covers {resolved.coveragePercent}%)
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: 'var(--muted)' }}>HMO Covers</span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--violet)' }}>{formatMoney(split.hmoAmount)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                      <span>Patient Pays</span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--gold)' }}>{formatMoney(split.patientAmount)}</span>
                    </div>
                    {resolved.priorAuthRequired && (
                      <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 4, background: 'rgba(232,184,46,0.08)', border: '1px solid rgba(232,184,46,0.25)', fontSize: 11, color: 'var(--gold)' }}>
                        ⚠ Pre-authorization required — capture auth code from {contract?.payer_name || 'HMO'} before billing.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="dash-modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!selected || !resolved} onClick={handleConfirm}>
            <AppIcon name="plus" size={14} /> Add Charge
          </button>
        </div>
      </div>
    </div>
  )
}
