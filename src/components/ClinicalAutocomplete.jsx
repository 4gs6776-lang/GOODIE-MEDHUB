import { useMemo, useState } from 'react'

// Multi-select, searchable chip picker. Type to filter `options`, click or
// press Enter to add a chip, click a chip's × to remove it. If allowCustom
// is true, an unmatched query can still be added as a free-text chip.
//
// options: [{ id, label, sublabel? }]
// value:   [{ id, label, sublabel? }]
export function TagAutocomplete({ options, value, onChange, placeholder, allowCustom = true }){
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const selectedIds = new Set(value.map(v => v.id))
  const matches = useMemo(() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()
    return options
      .filter(o => !selectedIds.has(o.id) && o.label.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, options, value]) // eslint-disable-line react-hooks/exhaustive-deps

  function addItem(item){
    onChange([...value, item])
    setQuery('')
    setOpen(false)
  }

  function addCustom(){
    const label = query.trim()
    if (!label) return
    addItem({ id: `custom-${Date.now()}`, label, custom: true })
  }

  function removeItem(id){
    onChange(value.filter(v => v.id !== id))
  }

  function handleKeyDown(e){
    if (e.key === 'Enter') {
      e.preventDefault()
      if (matches.length > 0) addItem(matches[0])
      else if (allowCustom) addCustom()
    } else if (e.key === 'Backspace' && !query && value.length > 0) {
      removeItem(value[value.length - 1].id)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {value.map(item => (
            <span
              key={item.id}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'var(--teal-soft)', color: 'var(--teal)',
                borderRadius: 20, padding: '4px 6px 4px 12px', fontSize: 12.5, fontWeight: 600,
              }}
            >
              {item.label}{item.code ? ` — ${item.code}` : ''}
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                style={{
                  background: 'rgba(0,0,0,0.15)', border: 'none', color: 'inherit', cursor: 'pointer',
                  borderRadius: '50%', width: 18, height: 18, fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                aria-label={`Remove ${item.label}`}
              >✕</button>
            </span>
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />

      {open && query.trim() && (matches.length > 0 || allowCustom) && (
        <div style={{
          position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 10,
          maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>
          {matches.map(item => (
            <div
              key={item.id}
              onMouseDown={() => addItem(item)}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--line-soft)' }}
            >
              {item.label}{item.code ? <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 11.5 }}>{item.code}</span> : null}
            </div>
          ))}
          {allowCustom && query.trim() && !matches.some(m => m.label.toLowerCase() === query.trim().toLowerCase()) && (
            <div
              onMouseDown={addCustom}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--gold)' }}
            >
              + Add "{query.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Single-select searchable combobox for picking a drug from the pharmacy
// catalog (falls back to free typing if nothing matches — the pharmacy may
// not stock everything a doctor needs to write down).
//
// drugOptions: [{ id, label }] — usually sourced from the pharmacy_items table
export function DrugSearchInput({ drugOptions, value, onChange, placeholder }){
  const [open, setOpen] = useState(false)

  const matches = useMemo(() => {
    if (!value.trim()) return []
    const q = value.trim().toLowerCase()
    return drugOptions.filter(d => d.label.toLowerCase().includes(q)).slice(0, 8)
  }, [value, drugOptions])

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 10,
          maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>
          {matches.map(d => (
            <div
              key={d.id}
              onMouseDown={() => { onChange(d.label); setOpen(false) }}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'space-between' }}
            >
              <span>{d.label}</span>
              {d.stock != null && (
                <span style={{ color: d.stock <= 0 ? 'var(--danger)' : 'var(--muted)', fontSize: 11.5 }}>
                  {d.stock <= 0 ? 'out of stock' : `${d.stock} in stock`}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
