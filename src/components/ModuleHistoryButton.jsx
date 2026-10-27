import { useState } from 'react'
import ModuleHistoryModal from './ModuleHistoryModal'
import AppIcon from './icons'

// =====================================================================
// GOODIE-MEDHUB — <ModuleHistoryButton>
//
// Thin wrapper that opens the <ModuleHistoryModal> for the given
// module. Self-manages its own `open` state so callers don't have to.
//
// Usage:
//   <ModuleHistoryButton moduleKey="pharmacy" />
//
// Optional props:
//   label   Override the button label (default "History")
//   size    Pass through to AppIcon (default 14)
//   style   Override inline styles
// =====================================================================

export default function ModuleHistoryButton({ moduleKey, label = 'History', size = 14, style }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: 'auto', padding: '8px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, ...style }}
        onClick={() => setOpen(true)}
        title={`View history of all actions in this module`}
      >
        <AppIcon name="shield" size={size} /> {label}
      </button>
      {open && <ModuleHistoryModal moduleKey={moduleKey} onClose={() => setOpen(false)} />}
    </>
  )
}
