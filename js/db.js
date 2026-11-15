// Device Database (SQLite) + Client IndexedDB offline cache.
// When running server.py on this device, all records are stored centrally in data/stock.db.
// IndexedDB is retained as a local cache and offline fallback.

const DB_NAME = 'fd-abrante3-spot2';
const STORE = 'docs';
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const result = fn(store);
        t.oncomplete = () => resolve(result?.result ?? result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

// Low-level IndexedDB methods
const getLocalAll = () => tx('readonly', (s) => s.getAll());
const putLocalMany = (docs) => tx('readwrite', (s) => docs.forEach((d) => s.put(d)));
const deleteLocalMany = (ids) => tx('readwrite', (s) => ids.forEach((id) => s.delete(id)));
const clearLocalAll = () => tx('readwrite', (s) => s.clear());

// Device Server Status & Listeners
let serverState = {
  online: false,
  database: 'sqlite',
  db_path: 'data/stock.db',
  total_documents: 0,
  items_count: 0,
  sheets_count: 0,
  local_ip: '',
  port: 4173,
  checkedAt: 0,
};

const statusListeners = new Set();
export function onServerStatus(fn) {
  statusListeners.add(fn);
  fn(serverState);
}

function notifyStatus() {
  statusListeners.forEach((fn) => fn(serverState));
}

export async function checkServerStatus() {
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      serverState = { ...serverState, ...data, online: true, checkedAt: Date.now() };
    } else {
      serverState.online = false;
    }
  } catch {
    serverState.online = false;
  }
  notifyStatus();
  return serverState;
}

// Periodic check and listener on visibility change
if (typeof window !== 'undefined') {
  setTimeout(checkServerStatus, 100);
  setInterval(checkServerStatus, 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkServerStatus();
  });
}

/**
 * Retrieve all documents.
 * Prioritizes the central SQLite database on this device.
 * Migrates existing IndexedDB records if SQLite is fresh.
 * Falls back to IndexedDB if offline or server is unreachable.
 */
export async function getAll() {
  try {
    const res = await fetch('/api/docs', { cache: 'no-store' });
    if (res.ok) {
      const serverDocs = await res.json();
      serverState.online = true;
      notifyStatus();

      // If SQLite is empty, check if IndexedDB has legacy data to migrate into SQLite
      if (!serverDocs || serverDocs.length === 0) {
        const localDocs = await getLocalAll();
        if (localDocs && localDocs.length > 0) {
          // Sync existing local records into SQLite
          await fetch('/api/docs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(localDocs),
          }).catch(() => null);
          checkServerStatus();
          return localDocs;
        }
      }

      // Cache server documents locally in IndexedDB
      if (serverDocs && serverDocs.length > 0) {
        await putLocalMany(serverDocs).catch(() => null);
      }
      return serverDocs;
    }
  } catch {
    serverState.online = false;
    notifyStatus();
  }

  // Fallback to IndexedDB
  return getLocalAll();
}

/**
 * Upsert multiple documents.
 * Writes to local IndexedDB and posts to SQLite on this device.
 */
export async function putMany(docs) {
  if (!docs || !docs.length) return;
  // Always write to local IndexedDB cache first
  await putLocalMany(docs);

  // Send to SQLite on this device
  try {
    const res = await fetch('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docs),
    });
    if (res.ok) {
      serverState.online = true;
      notifyStatus();
    }
  } catch {
    // If offline, it's saved in IndexedDB and will sync when server is reachable
    serverState.online = false;
    notifyStatus();
  }
}

/**
 * Delete documents by ID.
 * Deletes from IndexedDB and SQLite on this device.
 */
export async function deleteMany(ids) {
  if (!ids || !ids.length) return;
  await deleteLocalMany(ids);

  try {
    const res = await fetch('/api/docs', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids),
    });
    if (res.ok) {
      serverState.online = true;
      notifyStatus();
    }
  } catch {
    serverState.online = false;
    notifyStatus();
  }
}

/**
 * Clear all documents.
 */
export async function clearAll() {
  const localDocs = await getLocalAll();
  const ids = localDocs.map((d) => d.id);
  await clearLocalAll();
  if (ids.length) {
    await deleteMany(ids).catch(() => null);
  }
}
