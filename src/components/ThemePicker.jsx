import { useState, useEffect, useRef } from 'react'
import AppIcon from './icons'

// =====================================================================
// ThemePicker — Telegram-style accent color picker.
//
// Renders a small palette button in the dashboard header. Clicking it
// opens a popup with 7 accent color swatches (Teal, Blue, Violet,
// Green, Pink, Orange, Red). Selecting one immediately recolors the
// entire app — buttons, links, KPI icons, focus rings, status pills,
// body gradient glow, etc. — because every usage of var(--teal)
// follows the active theme.
//
// The choice is persisted in localStorage('gmedhub-accent') and
// re-applied on app startup in main.jsx.
//
// Props: none. Reads + writes localStorage directly.
// =====================================================================

const THEMES = [
  { key: 'teal',   label: 'Teal',   color: '#00C7C7' },
  { key: 'blue',   label: 'Blue',   color: '#4169FF' },
  { key: 'violet', label: 'Violet', color: '#7657E8' },
  { key: 'green',  label: 'Green',  color: '#18D99B' },
  { key: 'pink',   label: 'Pink',   color: '#F044B8' },
  { key: 'orange', label: 'Orange', color: '#F4B62A' },
  { key: 'red',    label: 'Red',    color: '#F04F5F' },
]

export default function ThemePicker() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(() => {
    try {
      return localStorage.getItem('gmedhub-accent') || 'teal'
    } catch { return 'teal' }
  })
  const popupRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return undefined
    function handleClickOutside(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  function applyTheme(themeKey) {
    // Add the transitioning class so all CSS variables smoothly animate
    // (themes.css defines html.transitioning-theme * to add transitions).
    document.documentElement.classList.add('transitioning-theme')
    document.documentElement.setAttribute('data-accent', themeKey)
    try { localStorage.setItem('gmedhub-accent', themeKey) } catch {}
    setActive(themeKey)
    // Remove the transitioning class after the animation completes so
    // it doesn't interfere with hover states later.
    setTimeout(() => {
      document.documentElement.classList.remove('transitioning-theme')
    }, 350)
  }

  const activeTheme = THEMES.find(t => t.key === active) || THEMES[0]

  return (
    <div style={{ position: 'relative' }} ref={popupRef}>
      {/* Trigger button — shows the active accent color as a small swatch */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Choose accent color"
        title={`Accent: ${activeTheme.label} — click to change`}
        style={{
          width: 36, height: 36, borderRadius: 10,
          border: '1px solid var(--line)',
          background: 'var(--bg-elevated)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
          transition: 'border-color .15s ease',
        }}
      >
        {/* The swatch — a circle in the active accent color */}
        <span style={{
          width: 18, height: 18, borderRadius: '50%',
          background: activeTheme.color,
          boxShadow: `0 0 12px -2px ${activeTheme.color}, inset 0 0 0 1px rgba(255,255,255,0.15)`,
          transition: 'background .2s ease, box-shadow .2s ease',
        }} />
      </button>

      {/* Popup — list of accent swatches */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          padding: 14,
          minWidth: 220,
          boxShadow: '0 18px 40px -16px rgba(0,0,0,0.6)',
          zIndex: 80,
        }}>
          <div style={{
            fontSize: 10.5, fontWeight: 700, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: 1.2,
            marginBottom: 12, textAlign: 'center',
          }}>
            Accent Color
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            justifyItems: 'center',
          }}>
            {THEMES.map(t => {
              const isActive = t.key === active
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => applyTheme(t.key)}
                  title={t.label}
                  aria-label={`Set accent to ${t.label}`}
                  aria-pressed={isActive}
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    border: isActive ? `2px solid ${t.color}` : '2px solid transparent',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                    transition: 'transform .15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.12)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                >
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: t.color,
                    boxShadow: isActive
                      ? `0 0 14px -2px ${t.color}, inset 0 0 0 2px rgba(255,255,255,0.25)`
                      : 'inset 0 0 0 1px rgba(255,255,255,0.10)',
                  }} />
                  {isActive && (
                    <span style={{
                      position: 'absolute',
                      top: -2, right: -2,
                      width: 12, height: 12, borderRadius: '50%',
                      background: t.color,
                      border: '2px solid var(--bg-elevated)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <AppIcon name="check" size={7} strokeWidth={3} style={{ color: '#fff' }} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div style={{
            marginTop: 12, paddingTop: 10,
            borderTop: '1px solid var(--line-soft)',
            fontSize: 11, color: 'var(--muted)',
            textAlign: 'center', lineHeight: 1.5,
          }}>
            Active: <strong style={{ color: activeTheme.color }}>{activeTheme.label}</strong>
            <div style={{ fontSize: 10, marginTop: 4, color: 'var(--muted-dim)' }}>
              Recolors buttons, links, KPIs, focus rings, body glow.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
