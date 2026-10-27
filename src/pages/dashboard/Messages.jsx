import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { useOfflineTable } from '../../lib/useOfflineTable'
import AppIcon from '../../components/icons'
import SearchInput from '../../components/common/SearchInput'
import { formatTime, formatDate, dayKeyInZone, getTimezone } from '../../lib/datetime'
import { writeAudit } from '../../lib/audit'
import ModuleHistoryButton from '../../components/ModuleHistoryButton'

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

// Chat bubble stamp: time for today's messages, date · time otherwise.
// "Today" is decided in the hospital's timezone, not the device's.
function formatMessageTime(value, timezone) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const isToday = dayKeyInZone(d, timezone) === dayKeyInZone(new Date(), timezone)
  const time = formatTime(d, timezone)
  if (isToday) return time
  return formatDate(d, timezone) + ' · ' + time
}

export default function Messages() {
  const { profile, hospital } = useAuth()
  const timezone = getTimezone(hospital)
  const { records: messages, addRecord, syncFromServer, isOnline } = useOfflineTable('messages', hospital?.id)
  // ---- Per-user channel read tracking (proper unread counts) --------
  // Each row records when the current user last opened a given channel.
  // A message is "unread" for the current user when:
  //   - They are not the sender
  //   - The message's created_at is AFTER their last_read_at for that
  //     channel (or they have no last_read_at row at all)
  const { records: readStates, addRecord: addReadState, updateRecord: updateReadState, syncFromServer: syncReadStates } = useOfflineTable('message_channel_reads', hospital?.id)

  const [staff, setStaff] = useState([])
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [activeChannel, setActiveChannel] = useState(null) // { type: 'department'|'dm', key, label }
  const [staffFilter, setStaffFilter] = useState('')
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
  // screen is open, plus once immediately on mount. Also re-sync read
  // states so badges update the moment another device marks something read.
  useEffect(() => {
    if (!hospital?.id) return
    syncFromServer()
    syncReadStates()
    const id = setInterval(() => { syncFromServer(); syncReadStates() }, 20000)
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

  // ---- TRUE unread count for a channel -----------------------------
  // Replaces the old "messages from others in the last 24h" heuristic.
  // A message is unread for the current user when:
  //   - They are not the sender
  //   - created_at > their last_read_at for this channel (or no row)
  function unreadCount(type, key) {
    const readRow = readStates.find(r =>
      r.channel_type === type &&
      r.channel_key === key &&
      r.user_id === profile?.id
    )
    const lastReadAt = readRow?.last_read_at ? new Date(readRow.last_read_at).getTime() : 0
    return messages.filter(m =>
      m.channel_type === type &&
      m.channel_key === key &&
      m.sender_id !== profile?.id &&
      new Date(m.created_at).getTime() > lastReadAt
    ).length
  }

  // ---- Mark a channel as read when the user opens it ----------------
  // Upserts a row in message_channel_reads with last_read_at = now.
  // Called whenever activeChannel changes (i.e. user opens a thread).
  async function markChannelAsRead(channel) {
    if (!channel || !profile?.id || !hospital?.id) return
    const existing = readStates.find(r =>
      r.channel_type === channel.type &&
      r.channel_key === channel.key &&
      r.user_id === profile.id
    )
    const now = new Date().toISOString()
    try {
      if (existing) {
        await updateReadState(existing.id, { last_read_at: now })
      } else {
        await addReadState({
          hospital_id: hospital.id,
          user_id: profile.id,
          channel_type: channel.type,
          channel_key: channel.key,
          last_read_at: now,
        })
      }
    } catch (err) {
      // Non-fatal — the badge will simply remain until next refresh.
      console.warn('Could not mark channel as read:', err?.message || err)
    }
  }

  // When the user opens a thread, mark it as read.
  useEffect(() => {
    if (activeChannel) markChannelAsRead(activeChannel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel?.type, activeChannel?.key, threadMessages.length])

  // Staff DM directory filter (global staff-search rule) — match on
  // name or role so long staff lists stay navigable.
  const visibleStaff = useMemo(() => {
    const q = staffFilter.trim().toLowerCase()
    if (!q) return staff
    return staff.filter(s => `${s.full_name || ''} ${s.role || ''}`.toLowerCase().includes(q))
  }, [staff, staffFilter])

  // ---- Total unread count across ALL channels (for Dashboard badge) --
  // Recomputed here and exposed via a callback so the dashboard bell
  // can show a TRUE unread count instead of the old "last 24h" heuristic.
  const totalUnread = useMemo(() => {
    if (!profile?.id) return 0
    // Build a quick lookup of last_read_at per channel for this user
    const myReads = new Map()
    for (const r of readStates) {
      if (r.user_id === profile.id) {
        myReads.set(`${r.channel_type}|${r.channel_key}`, new Date(r.last_read_at).getTime())
      }
    }
    // Count messages NOT sent by me that are newer than my last_read_at
    // for their channel (or I have no last_read_at row at all).
    let count = 0
    for (const m of messages) {
      if (m.sender_id === profile.id) continue
      // Only count messages addressed to me (DM) or in a department channel.
      // (Both DMs and department messages have channel_type set.)
      if (m.channel_type !== 'department' && m.channel_type !== 'dm') continue
      // For DMs, only count if I'm the recipient (otherId == me) OR
      // the dmKey includes me. dmKey is built from sorted ids joined by __.
      if (m.channel_type === 'dm') {
        const ids = (m.channel_key || '').split('__')
        if (!ids.includes(profile.id)) continue
      }
      const lastRead = myReads.get(`${m.channel_type}|${m.channel_key}`) || 0
      if (new Date(m.created_at).getTime() > lastRead) count++
    }
    return count
  }, [messages, readStates, profile?.id])

  // Expose the total unread count via a window event so the Dashboard
  // bell can pick it up without prop drilling. The Dashboard listens
  // for 'gmed:messages-unread' events and updates its badge.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('gmed:messages-unread', { detail: { count: totalUnread } }))
  }, [totalUnread])

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
      writeAudit({
        hospitalId: hospital?.id, actor: profile,
        action: activeChannel.type === 'dm' ? 'messages.dm_sent' : 'messages.channel_posted',
        entityType: 'message', entityId: null,
        summary: `${activeChannel.type === 'dm' ? 'DM sent' : `Posted to #${activeChannel.label}`} — ${body.length > 60 ? body.slice(0, 60) + '…' : body}`,
        metadata: {
          channel_type: activeChannel.type,
          channel_key: activeChannel.key,
          channel_label: activeChannel.label,
          recipient_id: activeChannel.type === 'dm' ? activeChannel.otherId : null,
          body_length: body.length,
        },
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
            <ModuleHistoryButton moduleKey="messages" />
          </div>

          <div style={{ padding: '10px 8px 18px' }}>
            <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted-dim)', fontWeight: 700, padding: '10px 10px 6px' }}>Department Channels</div>
            {DEPARTMENT_CHANNELS.map(ch => {
              const count = unreadCount('department', ch.key)
              return (
                <button
                  key={ch.key}
                  type="button"
                  className="dash-channel-row"
                  onClick={() => setActiveChannel({ type: 'department', key: ch.key, label: ch.label })}
                >
                  <span style={{ fontSize: 13, fontWeight: 600 }}># {ch.label}</span>
                  {count > 0 && <span className="dash-status stable">{count}</span>}
                </button>
              )
            })}

            <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted-dim)', fontWeight: 700, padding: '18px 10px 6px' }}>Direct Messages</div>
            {staff.length > 6 && (
              <div style={{ padding: '0 10px 8px' }}>
                <SearchInput value={staffFilter} onChange={setStaffFilter} placeholder="Search staff by name or role…" ariaLabel="Search staff" />
              </div>
            )}
            {loadingStaff ? (
              <div className="dash-empty-state">Loading staff…</div>
            ) : staff.length === 0 ? (
              <div className="dash-empty-state">No other staff found for this hospital yet.</div>
            ) : visibleStaff.length === 0 ? (
              <div className="dash-empty-state">No staff match “{staffFilter}”.</div>
            ) : visibleStaff.map(s => {
              const key = dmKey(profile?.id, s.id)
              const count = unreadCount('dm', key)
              return (
                <button
                  key={s.id}
                  type="button"
                  className="dash-channel-row"
                  onClick={() => setActiveChannel({ type: 'dm', key, label: s.full_name || 'Staff', otherId: s.id })}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 600, minWidth: 0 }}>
                    <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(145deg,#436579,#172a37)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, color: '#fff', flexShrink: 0 }}>
                      {(s.full_name || '?').charAt(0).toUpperCase()}
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name || 'Staff member'}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500, flexShrink: 0 }}>{s.role || ''}</span>
                  </span>
                  {count > 0 && <span className="dash-status stable">{count}</span>}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)', minHeight: 420 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
            <button className="btn btn-ghost" style={{ width: 'auto', padding: '7px 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => setActiveChannel(null)}>
              <AppIcon name="chevronLeft" size={14} /> Back
            </button>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{activeChannel.type === 'department' ? `# ${activeChannel.label}` : activeChannel.label}</div>
            {!isOnline && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted)' }}>Offline — will send when back online</span>}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {threadMessages.length === 0 ? (
              <div className="dash-empty-state">No messages yet — send the first one to start the conversation.</div>
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
                  <span style={{ fontSize: 9.5, color: 'var(--muted-dim)', marginTop: 3, marginLeft: mine ? 0 : 4, marginRight: mine ? 4 : 0 }}>{formatMessageTime(m.created_at, timezone)}</span>
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
