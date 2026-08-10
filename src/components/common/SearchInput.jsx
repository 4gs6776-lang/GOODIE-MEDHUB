import { useId } from 'react'

export default function SearchInput({ value, onChange, placeholder = 'Search...', style, fullWidth = true }) {
  const id = useId()
  return (
    <div style={{ position: 'relative', flex: fullWidth ? '1 1 280px' : undefined, minWidth: 220, ...style }}>
      <label htmlFor={id} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Search</label>
      <span aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none', fontSize: 15 }}>⌕</span>
      <input
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 36px 10px 34px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)', outline: 'none', fontSize: 12.5 }}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
      )}
    </div>
  )
}
