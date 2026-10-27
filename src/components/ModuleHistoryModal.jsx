import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOfflineTable } from '../lib/useOfflineTable'
import { getModuleHistoryConfig, eventMatchesModule } from '../lib/moduleHistory'
import { formatDateTimeSec, getTimezone } from '../lib/datetime'
import AppIcon from './icons'

// =====================================================================
// GOODIE-MEDHUB — <ModuleHistoryModal>
//
// Reusable per-module audit history viewer. Opens as a modal with
// two views:
//   1. "Recent" — last 20 events for this module (quick glance)
//   2. "Full"   — paginated, filterable list (date range, action,
//                 actor, search) of ALL events for this module
//
// Usage:
//   <ModuleHistoryModal
//     moduleKey="pharmacy"
//     onClose={() => setShowHistory(false)}
//   />
//
// The moduleKey is resolved via MODULE_HISTORY_MAP (in
// src/lib/moduleHistory.js) to determine which audit_events rows
// belong to this module (by action prefix + entity type).
// =====================================================================

const PAGE_SIZE = 25

export default function ModuleHistoryModal({ moduleKey, onClose }) {
  const { hospital } = useAuth()
  const timezone = getTimezone(hospital)
  const { records: allEvents, loading } = useOfflineTable('audit_events', hospital?.id)

  const moduleConfig = getModuleHistoryConfig(moduleKey)

  const [view, setView] = useState('recent')  // 'recent' | 'full'
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [actorFilter, setActorFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedEvent, setSelectedEvent] = useState(null)

  // Filter all audit_events down to ones that match THIS module
  const moduleEvents = useMemo(() => {
    return allEvents
      .filter(e => eventMatchesModule(e, moduleConfig))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [allEvents, moduleConfig])

  // Build filter dropdowns from the module's events
  const actionOptions = useMemo(() => {
    const set = new Set(moduleEvents.map(e => e.action).filter(Boolean))
    return ['all', ...Array.from(set).sort()]
  }, [moduleEvents])

  const actorOptions = useMemo(() => {
    const set = new Set(moduleEvents.map(e => e.actor_name).filter(Boolean))
    return ['all', ...Array.from(set).sort()]
  }, [moduleEvents])

  // Full view: apply user filters
  const filteredEvents = useMemo(() => {
    return moduleEvents
      .filter(e => actionFilter === 'all' || e.action === actionFilter)
      .filter(e => actorFilter === 'all' || e.actor_name === actorFilter)
      .filter(e => {
        if (!dateFrom) return true
        return e.created_at && new Date(e.created_at) >= new Date(dateFrom)
      })
      .filter(e => {
        if (!dateTo) return true
        const end = new Date(dateTo)
        end.setHours(23, 59, 59, 999)
        return e.created_at && new Date(e.created_at) <= end
      })
      .filter(e => {
        if (!search.trim()) return true
        const q = search.trim().toLowerCase()
        return (
          (e.summary || '').toLowerCase().includes(q) ||
          (e.action || '').toLowerCase().includes(q) ||
          (e.actor_name || '').toLowerCase().includes(q) ||
          (e.entity_type || '').toLowerCase().includes(q)
        )
      })
  }, [moduleEvents, actionFilter, actorFilter, dateFrom, dateTo, search])

  // Paginate
  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = (safePage - 1) * PAGE_SIZE
  const endIndex = Math.min(startIndex + PAGE_SIZE, filteredEvents.length)
  const pageItems = filteredEvents.slice(startIndex, endIndex)

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1) }, [search, actionFilter, actorFilter, dateFrom, dateTo])

  // Esc closes the modal
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="dash-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card dash-modal" style={{ maxWidth: 900, maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>

        {/* ---- Header ----------------------------------------------- */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, flexShrink: 0 }}>
          <div>
            <div className="dash-modal-title" style={{ paddingBottom: 0 }}>{moduleConfig.title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3, maxWidth: 600 }}>
              {moduleConfig.description}
            </div>
          </div>
          <button className="dash-icon-btn" onClick={onClose} aria-label="Close history">
            <AppIcon name="close" size={18} />
          </button>
        </div>

        {/* ---- View switcher (Recent / Full) ------------------------ */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${view === 'recent' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
            onClick={() => setView('recent')}
          >
            Recent (last 20)
          </button>
          <button
            type="button"
            className={`btn ${view === 'full' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
            onClick={() => setView('full')}
          >
            Full History ({moduleEvents.length})
          </button>
        </div>

        {/* ---- Body -------------------------------------------------- */}
        <div className="dash-modal-body" style={{ overflowY: 'auto' }}>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 12.5 }}>
              Loading history…
            </div>
          ) : moduleEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 12.5 }}>
              No actions recorded in this module yet.
            </div>
          ) : view === 'recent' ? (
            // ---- Recent view: simple list of the last 20 events ----
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {moduleEvents.slice(0, 20).map(ev => (
                <HistoryRow key={ev.id} ev={ev} timezone={timezone} onClick={() => setSelectedEvent(ev)} />
              ))}
            </div>
          ) : (
            // ---- Full view: filters + paginated table ----
            <>
              {/* Filter row */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Search summary, action, actor…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, minWidth: 180, padding: '6px 10px', fontSize: 12 }}
                  className="dash-search-input"
                />
                <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)' }}>
                  {actionOptions.map(a => <option key={a} value={a}>{a === 'all' ? 'All actions' : a}</option>)}
                </select>
                <select value={actorFilter} onChange={e => setActorFilter(e.target.value)} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)' }}>
                  {actorOptions.map(a => <option key={a} value={a}>{a === 'all' ? 'All staff' : a}</option>)}
                </select>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)' }} title="From date" />
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: '6px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-elevated)', color: 'var(--ivory)' }} title="To date" />
                {(search || actionFilter !== 'all' || actorFilter !== 'all' || dateFrom || dateTo) && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ width: 'auto', padding: '6px 10px', fontSize: 11 }}
                    onClick={() => { setSearch(''); setActionFilter('all'); setActorFilter('all'); setDateFrom(''); setDateTo('') }}
                  >
                    Clear
                  </button>
                )}
              </div>

              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 }}>
                Showing {filteredEvents.length === 0 ? '0' : `${startIndex + 1}–${endIndex}`} of {filteredEvents.length} events
              </div>

              {/* Events list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pageItems.map(ev => (
                  <HistoryRow key={ev.id} ev={ev} timezone={timezone} onClick={() => setSelectedEvent(ev)} />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }}
                    disabled={safePage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  >
                    ← Prev
                  </button>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: 11 }}
                    disabled={safePage === totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ---- Footer ------------------------------------------------ */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12, flexShrink: 0 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>

        {/* ---- Event detail popover (when a row is clicked) -------- */}
        {selectedEvent && (
          <div
            className="dash-modal-backdrop"
            style={{ zIndex: 110 }}
            onClick={e => { if (e.target === e.currentTarget) setSelectedEvent(null) }}
          >
            <div className="card dash-modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14 }}>
                <div className="dash-modal-title" style={{ paddingBottom: 0 }}>Event Detail</div>
                <button className="dash-icon-btn" onClick={() => setSelectedEvent(null)} aria-label="Close detail">
                  <AppIcon name="close" size={18} />
                </button>
              </div>
              <div className="dash-modal-body">
                <DetailRow label="When" value={formatDateTimeSec(selectedEvent.created_at, timezone)} />
                <DetailRow label="Action" value={selectedEvent.action} mono />
                <DetailRow label="Entity" value={`${selectedEvent.entity_type || '—'}${selectedEvent.entity_id ? ` · ${selectedEvent.entity_id.slice(0, 8)}…` : ''}`} mono />
                {selectedEvent.patient_id && (
                  <DetailRow label="Patient ID" value={selectedEvent.patient_id} mono />
                )}
                <DetailRow label="Actor" value={`${selectedEvent.actor_name || '—'}${selectedEvent.actor_role ? ` (${selectedEvent.actor_role})` : ''}`} />
                {selectedEvent.summary && (
                  <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)', fontSize: 12.5, color: 'var(--ivory)', lineHeight: 1.5 }}>
                    {selectedEvent.summary}
                  </div>
                )}
                {selectedEvent.metadata && Object.keys(selectedEvent.metadata).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Metadata</div>
                    <pre style={{ margin: 0, padding: '10px 12px', borderRadius: 6, background: 'var(--bg-card)', border: '1px solid var(--line)', fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflowY: 'auto' }}>
                      {JSON.stringify(selectedEvent.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Sub-components ----------------------------------------------------

function HistoryRow({ ev, timezone, onClick }) {
  // Color the action chip based on its verb (create/update/delete/dispense)
  const actionVerb = (ev.action || '').split('.').pop() || ''
  const color = actionVerb === 'create' || actionVerb === 'generated' || actionVerb === 'recorded' || actionVerb === 'filed' || actionVerb === 'received' ? 'var(--teal)' :
                actionVerb === 'delete' || actionVerb === 'archived' || actionVerb === 'cancelled' || actionVerb === 'reversed' || actionVerb === 'rejected' ? 'var(--danger)' :
                actionVerb === 'update' || actionVerb === 'updated' || actionVerb === 'status' || actionVerb === 'toggled' ? 'var(--blue)' :
                actionVerb === 'dispensed' || actionVerb === 'dispense' || actionVerb === 'charge' || actionVerb === 'deduct' ? 'var(--gold)' :
                'var(--violet)'
  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 10px', borderRadius: 6,
        background: 'var(--bg-elevated)', border: '1px solid var(--line-soft)',
        cursor: 'pointer', transition: 'background 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{
            fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
            background: `${color}22`, color: color,
            textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
          }}>
            {ev.action || '—'}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            {formatDateTimeSec(ev.created_at, timezone)}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          {ev.actor_name || '—'}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ivory)', lineHeight: 1.4 }}>
        {ev.summary || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>(no summary)</span>}
      </div>
    </div>
  )
}

function DetailRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 80 }}>
        {label}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ivory)', fontFamily: mono ? 'var(--font-mono, monospace)' : 'inherit', wordBreak: 'break-word', flex: 1 }}>
        {value || '—'}
      </div>
    </div>
  )
}
