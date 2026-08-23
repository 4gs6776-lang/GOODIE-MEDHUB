import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { useOfflineTable } from '../../lib/useOfflineTable'

// Fixed department channels every staff member can see and post in.
const DEPARTMENT_CHANNELS = [
  { key: 'general', label: 'General (All Staff)' },
  { key: 'doctors', label: 'Doctors' },
  { key: 'nurses', label: 'Nurses' },
  { key: 'reception', label: 'Reception / Front Desk' },
  { key: 'pharmacy', label: 'Pharmacy' },
  { key: 'lab', label: 'Laboratory / Radiology' },
  { key: 'billing', label: 'Billing / Insurance' },
]

// Consistent channel key for a DM between two people, regardless of
// who opens it first — both sides land on the exact same key.
function dmKey(idA, idB) {
  return [idA, idB].sort().join('__')
}

function formatMessageTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short' }) + ' · ' + time
}

export default function Messages() {
  const { profile, hospital } = useAuth()
  const { records: messages, addRecord, syncFromServer, isOnline } = useOfflineTable('messages', hospital?.id)

  const [staff, setStaff] = useState([])
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [activeChannel, setActiveChannel] = useState(null) // { type: 'department'|'dm', key, label }
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const threadEndRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function loadStaff() {
      if (!hospital?.id) return
      setLoadingStaff(true)
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('hospital_id', hospital.id)
      if (!cancelled) {
        setStaff((data || []).filter(s => s.id !== profile?.id))
        setLoadingStaff(false)
      }
    }
    loadStaff()
    return () => { cancelled = true }
  }, [hospital?.id, profile?.id])

  // Refresh-based inbox: check for new messages every 20s while this
  // screen is open, plus once immediately on mount.
  useEffect(() => {
    if (!hospital?.id) return
    syncFromServer()
    const id = setInterval(() => syncFromServer(), 20000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospital?.id])

  const threadMessages = useMemo(() => {
    if (!activeChannel) return []
    return messages
      .filter(m => {
        if (activeChannel.type === 'department') {
          return m.channel_type === 'department' && m.channel_key === activeChannel.key
        }
        return m.channel_type === 'dm' && m.channel_key === activeChannel.key
      })
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }, [messages, activeChannel])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' })
  }, [threadMessages.length, activeChannel])

  // Lightweight "recent activity" badge per channel — messages from
  // someone else in the last 24 hours. Not a strict unread count
  // (that would need read-receipt tracking), just a helpful signal.
  function recentCount(type, key) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    return messages.filter(m =>
      m.channel_type === type &&
      m.channel_key === key &&
      m.sender_id !== profile?.id &&
      new Date(m.created_at).getTime() >= cutoff
    ).length
  }

  async function handleSend(e) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || !activeChannel || !hospital?.id || !profile) return
    setSending(true)
    try {
      await addRecord({
        hospital_id: hospital.id,
        sender_id: profile.id,
        sender_name: profile.full_name || 'Staff',
        sender_role: profile.role || null,
        channel_type: activeChannel.type,
        channel_key: activeChannel.key,
        recipient_id: activeChannel.type === 'dm' ? activeChannel.otherId : null,
        body,
      })
      setDraft('')
    } catch (err) {
      console.error('Could not send message:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="dash-panel" style={{ padding: 0, overflow: 'hidden' }}>
      {!activeChannel ? (
        <div>
          <div className="dash-panel-head" style={{ padding: '18px 18px 0' }}>
            <div>
              <div className="dash-panel-title">Messages</div>
              <div className="dash-panel-sub">Department channels and direct messages</div>
            </div>
          </div>

          <div style={{ padding: '10px 8px 18px' }}>
            <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted-dim)', fontWeight: 700, padding: '10px 10px 6px' }}>Department Channels</div>
            {DEPARTMENT_CHANNELS.map(ch => {
              const count = recentCount('department', ch.key)
              return (
                <div
                  key={ch.key}
                  onClick={() => setActiveChannel({ type: 'department', key: ch.key, label: ch.label })}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 10px', borderRadius: 9, cursor: 'pointer' }}
                  onMouseDown={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                >
                  <span style={{ fontSize: 13, fontWeight: 600 }}># {ch.label}</span>
                  {count > 0 && <span className="dash-status stable">{count}</span>}
                </div>
              )
            })}

            <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted-dim)', fontWeight: 700, padding: '18px 10px 6px' }}>Direct Messages</div>
            {loadingStaff ? (
              <div className="dash-empty-state">Loading staff…</div>
            ) : staff.length === 0 ? (
              <div className="dash-empty-state">No other staff found for this hospital yet.</div>
            ) : staff.map(s => {
              const key = dmKey(profile?.id, s.id)
              const count = recentCount('dm', key)
              return (
                <div
                  key={s.id}
                  onClick={() => setActiveChannel({ type: 'dm', key, label: s.full_name || 'Staff', otherId: s.id })}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 10px', borderRadius: 9, cursor: 'pointer' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 600 }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(145deg,#436579,#172a37)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, color: '#fff', flexShrink: 0 }}>
                      {(s.full_name || '?').charAt(0).toUpperCase()}
                    </span>
                    {s.full_name || 'Staff member'}
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>{s.role || ''}</span>
                  </span>
                  {count > 0 && <span className="dash-status stable">{count}</span>}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)', minHeight: 420 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
            <button className="btn btn-ghost" style={{ width: 'auto', padding: '7px 12px' }} onClick={() => setActiveChannel(null)}>‹ Back</button>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{activeChannel.type === 'department' ? `# ${activeChannel.label}` : activeChannel.label}</div>
            {!isOnline && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted)' }}>Offline — will send when back online</span>}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {threadMessages.length === 0 ? (
              <div className="dash-empty-state">No messages yet — say hello 👋</div>
            ) : threadMessages.map(m => {
              const mine = m.sender_id === profile?.id
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                  {!mine && activeChannel.type === 'department' && (
                    <span style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 3, marginLeft: 4 }}>{m.sender_name}</span>
                  )}
                  <div style={{
                    maxWidth: '78%',
                    padding: '9px 13px',
                    borderRadius: mine ? '13px 13px 3px 13px' : '13px 13px 13px 3px',
                    background: mine ? 'linear-gradient(145deg, var(--teal), #08999a)' : 'var(--bg-elevated)',
                    color: mine ? '#00251F' : 'var(--ivory)',
                    border: mine ? 'none' : '1px solid var(--line)',
                    fontSize: 13,
                    lineHeight: 1.45,
                    wordBreak: 'break-word',
                  }}>
                    {m.body}
                  </div>
                  <span style={{ fontSize: 9.5, color: 'var(--muted-dim)', marginTop: 3, marginLeft: mine ? 0 : 4, marginRight: mine ? 4 : 0 }}>{formatMessageTime(m.created_at)}</span>
                </div>
              )
            })}
            <div ref={threadEndRef} />
          </div>

          <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--line)', flexShrink: 0 }}>
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Type a message…"
              style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--line)', borderRadius: 9, padding: '10px 13px', color: 'var(--ivory)', fontSize: 13, outline: 'none' }}
            />
            <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '10px 18px' }} disabled={sending || !draft.trim()}>Send</button>
          </form>
        </div>
      )}
    </div>
  )
}
