import { useEffect, useId, useMemo, useRef, useState } from 'react'
import AppIcon from '../icons'

// =====================================================================
// GOODIE-MEDHUB — Autocomplete: THE single-select searchable combobox
// (global search & autocomplete rule)
//
// One component, one behaviour, everywhere the user picks from a
// predefined or database-backed set of values — patients, staff, drugs,
// lab tests, diagnoses, departments, suppliers, insurers, inventory.
// No module may hand-roll its own dropdown anymore.
//
// Built-in, per the global rule:
//   - opens while typing, filters as you type (label + sublabel)
//   - keyboard navigation (ArrowUp/Down, Enter, Escape, Home/End)
//   - mouse AND touch selection (options commit on mousedown, before
//     the input's blur can close the list)
//   - similar results are distinguishable (sublabel + right meta rows:
//     e.g. MRN · phone on the left, age/sex or stock on the right)
//   - loading, error (+ retry) and no-results states
//   - optional free-text escape hatch (allowFreeText) for controlled
//     lists that must still accept unmatched values
//   - ARIA combobox pattern; works inside dash-modal bottom sheets
//
// Props:
//   value      selected option object | null  (controlled)
//   onChange   (option | null) => void
//   options    [{ id, label, sublabel?, right?, rightTone? }]
//   loading / error / onRetry                     async states
//   emptyText   message when nothing matches
//   minChars    hide matches below this query length (default 0)
//   allowFreeText + freeTextLabel  offer "add <query>" row
//   clearable   show an × to unselect (default true)
// =====================================================================

export default function Autocomplete({
  value,
  onChange,
  options = [],
  loading = false,
  error = '',
  onRetry,
  emptyText = 'No matches found',
  minChars = 0,
  allowFreeText = false,
  freeTextLabel,
  placeholder,
  disabled = false,
  clearable = true,
  ariaLabel,
  style,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const listId = useId()
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const blurTimer = useRef(null)

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    if (q.length < minChars) return []
    return options.filter(o => {
      if (value && o.id === value.id) return false
      const hay = `${o.label || ''} ${o.sublabel || ''}`.toLowerCase()
      return hay.includes(q)
    }).slice(0, 30)
  }, [options, q, minChars, value])

  const canFreeText = allowFreeText && q.length >= minChars &&
    !options.some(o => (o.label || '').toLowerCase() === q)

  // Reset the active highlight whenever the list content changes.
  useEffect(() => { setActive(matches.length ? 0 : -1) }, [query, loading, error]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the highlighted option visible while arrowing through the list.
  useEffect(() => {
    if (active < 0 || !open) return
    const el = document.getElementById(`${listId}-opt-${active}`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open, listId])

  function openList(){
    if (disabled) return
    clearTimeout(blurTimer.current)
    setQuery('')          // re-selecting starts a fresh search
    setActive(-1)
    setOpen(true)
  }

  function closeList(){
    setOpen(false)
    setQuery('')
    setActive(-1)
  }

  function commit(option){
    onChange(option)
    closeList()
    inputRef.current?.blur()
  }

  function commitFreeText(){
    const label = query.trim()
    if (!label) return
    onChange({ id: `free-${Date.now()}`, label, freeText: true })
    closeList()
    inputRef.current?.blur()
  }

  function handleKeyDown(e){
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { openList(); return }
      const n = matches.length
      if (!n) return
      setActive(i => {
        const next = e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n
        return next
      })
    } else if (e.key === 'Home' && open && matches.length) {
      e.preventDefault(); setActive(0)
    } else if (e.key === 'End' && open && matches.length) {
      e.preventDefault(); setActive(matches.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && active >= 0 && matches[active]) commit(matches[active])
      else if (open && canFreeText && !matches.length) commitFreeText()
      else if (open && matches.length) commit(matches[0])
    } else if (e.key === 'Escape') {
      if (open) { e.stopPropagation(); closeList() }
    }
  }

  function handleBlur(){
    // Give option mousedown handlers (which run first) a chance to commit
    // before the list closes — the established app-wide pattern.
    blurTimer.current = setTimeout(() => { setOpen(false); setQuery(''); setActive(-1) }, 150)
  }

  function clearValue(e){
    e.preventDefault()
    e.stopPropagation()
    onChange(null)
    inputRef.current?.focus()
    openList()
  }

  const showList = open && (loading || !!error || matches.length > 0 || canFreeText ||
    (q.length >= minChars ? !!emptyText : true))

  return (
    <div className="gmed-ac" style={style} onKeyDown={handleKeyDown}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={showList && active >= 0 ? `${listId}-opt-${active}` : undefined}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          className="gmed-ac-input"
          disabled={disabled}
          value={open ? query : (value?.label ?? '')}
          placeholder={placeholder}
          onFocus={openList}
          onBlur={handleBlur}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          autoComplete="off"
          style={clearable && value ? { paddingRight: 36 } : undefined}
        />
        {clearable && value && !open && (
          <button
            type="button"
            className="gmed-ac-clear"
            onMouseDown={clearValue}
            aria-label={`Clear ${ariaLabel || 'selection'}`}
          >
            <AppIcon name="close" size={14} />
          </button>
        )}
      </div>

      {showList && (
        <div className="gmed-ac-list" role="listbox" id={listId} ref={listRef}>
          {loading && (
            <div className="gmed-ac-state" role="status">
              <AppIcon name="loading" size={15} spin /> Searching…
            </div>
          )}
          {!loading && error && (
            <div className="gmed-ac-state gmed-ac-state-error" role="alert">
              <AppIcon name="alert" size={15} />
              <span>{error}</span>
              {onRetry && (
                <button type="button" className="gmed-ac-retry" onMouseDown={e => { e.preventDefault(); onRetry() }}>
                  Retry
                </button>
              )}
            </div>
          )}
          {!loading && !error && matches.map((o, i) => (
            <div
              key={o.id}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected="false"
              className={`gmed-ac-opt${i === active ? ' is-active' : ''}`}
              // mousedown commits before the input's blur closes the list —
              // this is also what makes touch selection reliable.
              onMouseDown={e => { e.preventDefault(); commit(o) }}
              onMouseEnter={() => setActive(i)}
            >
              <div className="gmed-ac-opt-main">
                <span className="gmed-ac-opt-label">{o.label}</span>
                {o.sublabel && <span className="gmed-ac-opt-sub">{o.sublabel}</span>}
              </div>
              {o.right && (
                <span className={`gmed-ac-opt-right${o.rightTone ? ` is-${o.rightTone}` : ''}`}>{o.right}</span>
              )}
            </div>
          ))}
          {!loading && !error && matches.length === 0 && q.length >= minChars && (
            <div className="gmed-ac-state">{emptyText}</div>
          )}
          {!loading && !error && q.length < minChars && (
            <div className="gmed-ac-state">
              Type at least {minChars} character{minChars === 1 ? '' : 's'} to search
            </div>
          )}
          {!loading && !error && canFreeText && (
            <div
              className="gmed-ac-opt gmed-ac-opt-free"
              role="option"
              aria-selected="false"
              id={`${listId}-opt-free`}
              onMouseDown={e => { e.preventDefault(); commitFreeText() }}
            >
              <AppIcon name="plus" size={13} />
              {freeTextLabel ? freeTextLabel.replace('{query}', query.trim()) : `Use "${query.trim()}"`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
