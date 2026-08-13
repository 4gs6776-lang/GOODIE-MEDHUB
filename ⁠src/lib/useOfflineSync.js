import { supabase } from './supabaseClient';

export async function getAllSyncErrors() {
  try {
    const request = indexedDB.open('HospitalOfflineDB', 1);
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('offline_records')) return resolve([]);
        const tx = db.transaction('offline_records', 'readonly');
        const store = tx.objectStore('offline_records');
        const getReq = store.getAll();
        getReq.onsuccess = () => {
          const all = getReq.result || [];
          resolve(all.filter((r) => r._syncError));
        };
        getReq.onerror = () => resolve([]);
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

export function subscribeSyncErrors(callback) {
  const handler = async () => {
    if (typeof callback === 'function') {
      const errors = await getAllSyncErrors();
      callback(errors);
    }
  };

  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);

  return () => {
    window.removeEventListener('online', handler);
    window.removeEventListener('offline', handler);
  };
}

export async function flushTableQueue(tableName) {
  if (!navigator.onLine || !supabase?.from) return;

  try {
    const request = indexedDB.open('HospitalOfflineDB', 1);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('offline_records')) return;
      const tx = db.transaction('offline_records', 'readwrite');
      const store = tx.objectStore('offline_records');
      const getReq = store.getAll();

      getReq.onsuccess = async () => {
        const all = getReq.result || [];
        const pending = all.filter(
          (r) => (tableName ? r.table_name === tableName : true) && r._synced === false
        );

        for (const record of pending) {
          try {
            const { _synced, _deleted, _syncError, ...payload } = record;
            if (record._deleted) {
              await supabase.from(record.table_name).delete().eq('id', record.id);
              const deleteTx = db.transaction('offline_records', 'readwrite');
              deleteTx.objectStore('offline_records').delete(record.id);
            } else {
              await supabase.from(record.table_name).upsert(payload);
              const updateTx = db.transaction('offline_records', 'readwrite');
              updateTx.objectStore('offline_records').put({ ...record, _synced: true });
            }
          } catch (err) {
            console.warn('Failed to sync record:', record.id, err);
          }
        }
      };
    };
  } catch (err) {
    console.error('Error flushing queue:', err);
  }
}
