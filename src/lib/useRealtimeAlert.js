import { useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

// Subscribes to new rows being inserted into a table, scoped to the
// current hospital, and calls onInsert with the new row the instant
// it happens — e.g. Pharmacy sees "New prescription" without needing
// to refresh, even if the doctor is on a completely different device.
//
// This is separate from (and doesn't replace) the offline-first sync
// system: it's purely a live "something just happened" signal. The
// caller decides what to do — typically show a toast and optionally
// re-sync the relevant table so the new row shows up in the list too.
export function useRealtimeAlert(tableName, hospitalId, onInsert) {
  const onInsertRef = useRef(onInsert)
  onInsertRef.current = onInsert

  useEffect(() => {
    if (!hospitalId || !tableName) return

    const channelName = `realtime-${tableName}-${hospitalId}-${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: tableName, filter: `hospital_id=eq.${hospitalId}` },
        (payload) => {
          if (payload?.new && typeof onInsertRef.current === 'function') {
            onInsertRef.current(payload.new)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tableName, hospitalId])
}
