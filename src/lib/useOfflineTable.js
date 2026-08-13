import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
const DB_NAME = 'HospitalOfflineDB';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('offline_records')) {
        const store = db.createObjectStore('offline_records', { keyPath: 'id' });
        store.createIndex('table_name', 'table_name', { unique: false });
        store.createIndex('hospital_id', 'hospital_id', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

export function useOfflineTable(tableName, hospitalId) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  const loadLocalRecords = useCallback(async () => {
    if (!hospitalId) return;
    try {
      const db = await openDB();
      const tx = db.transaction('offline_records', 'readonly');
      const store = tx.objectStore('offline_records');
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result || [];
        const filtered = all.filter(
          (r) => r.table_name === tableName && r.hospital_id === hospitalId && !r._deleted
        );
        setRecords(filtered);
        setPendingCount(all.filter((r) => r._synced === false).length);
        setLoading(false);
      };
    } catch (err) {
      console.error('Error reading offline storage:', err);
      setLoading(false);
    }
  }, [tableName, hospitalId]);

  useEffect(() => {
    loadLocalRecords();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadLocalRecords]);

  const addRecord = async (data) => {
    const id = data.id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newRecord = {
      ...data,
      id,
      table_name: tableName,
      hospital_id: hospitalId,
      _synced: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('offline_records', 'readwrite');
      const store = tx.objectStore('offline_records');
      const req = store.put(newRecord);
      
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });

    if (navigator.onLine && supabase?.from) {
      try {
        const { _synced, _deleted, ...payload } = newRecord;
        const { data: remoteData, error } = await supabase.from(tableName).insert([payload]).select().single();
        
        if (!error && remoteData) {
          const tx = db.transaction('offline_records', 'readwrite');
          const store = tx.objectStore('offline_records');
          await new Promise((res) => {
            const req = store.put({ ...remoteData, table_name: tableName, hospital_id: hospitalId, _synced: true });
            tx.oncomplete = () => res(req.result);
          });
        }
      } catch (err) {
        console.warn('Network write failed, remaining in local queue:', err);
      }
    }

    await loadLocalRecords();
    return newRecord;
  };

  const updateRecord = async (id, updates) => {
    const db = await openDB();
    let updatedRecord = null;

    await new Promise((resolve, reject) => {
      const tx = db.transaction('offline_records', 'readwrite');
      const store = tx.objectStore('offline_records');
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const existing = getReq.result || { id, table_name: tableName, hospital_id: hospitalId };
        updatedRecord = {
          ...existing,
          ...updates,
          _synced: false,
          updated_at: new Date().toISOString()
        };
        const putReq = store.put(updatedRecord);
        tx.oncomplete = () => resolve(putReq.result);
      };
      tx.onerror = () => reject(tx.error);
    });

    if (navigator.onLine && supabase?.from) {
      try {
        const { _synced, _deleted, ...payload } = updatedRecord;
        await supabase.from(tableName).update(payload).eq('id', id);
        
        const tx = db.transaction('offline_records', 'readwrite');
        const store = tx.objectStore('offline_records');
        await new Promise((res) => {
          const req = store.put({ ...updatedRecord, _synced: true });
          tx.oncomplete = () => res(req.result);
        });
      } catch (err) {
        console.warn('Network update failed, saved locally:', err);
      }
    }

    await loadLocalRecords();
    return updatedRecord;
  };

  const deleteRecord = async (id) => {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('offline_records', 'readwrite');
      const store = tx.objectStore('offline_records');
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (existing) {
          existing._deleted = true;
          existing._synced = false;
          store.put(existing);
        }
        tx.oncomplete = () => resolve();
      };
      tx.onerror = () => reject(tx.error);
    });

    if (navigator.onLine && supabase?.from) {
      try {
        await supabase.from(tableName).delete().eq('id', id);
        const tx = db.transaction('offline_records', 'readwrite');
        const store = tx.objectStore('offline_records');
        await new Promise((res) => {
          const req = store.delete(id);
          tx.oncomplete = () => res(req.result);
        });
      } catch (err) {
        console.warn('Network delete failed, marked offline:', err);
      }
    }

    await loadLocalRecords();
  };

  return {
    records,
    loading,
    isOnline,
    pendingCount,
    addRecord,
    updateRecord,
    deleteRecord,
    refreshTable: loadLocalRecords
  };
}
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

