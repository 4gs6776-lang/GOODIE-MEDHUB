import { useId } from 'react'
import { Search, X } from 'lucide-react'

// Stage 1 (req. #12): the text glyphs ⌕ / × are replaced by real Lucide
// icons — consistent stroke weight with every other icon in the app,
// proper aria labels, and a clear-button that is big enough for touch.
export default function SearchInput({ value, onChange, placeholder = 'Search...', style, fullWidth = true }) {
  const id = useId()
  return (
    // gmed-search-grow carries the "grow inside a toolbar row" behaviour as a
    // CSS class instead of an inline flex style. Inline `flex: 1 1 280px`
    // broke on phones: when a .dash-panel-head stacks vertically (<=600px)
    // the main axis flips and 280px became the wrapper's HEIGHT, stretching
    // the search box ~280px tall with the icon floating mid-air.
    <div className={`gmed-search${fullWidth ? ' gmed-search-grow' : ''}`} style={{ position: 'relative', minWidth: 220, ...style }}>
      <label htmlFor={id} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Search</label>
      <Search
        aria-hidden="true"
        width={15}
        height={15}
        strokeWidth={1.8}
        style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }}
      />
      <input
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 36px 10px 34px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)', outline: 'none', fontSize: 12.5 }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          title="Clear search"
          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', borderRadius: 6 }}
        >
          <X width={15} height={15} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
