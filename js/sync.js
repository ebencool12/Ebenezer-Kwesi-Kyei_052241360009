// Optional cloud sync with Supabase (REST API, no extra library).
// Local data always works on its own; the cloud just copies documents
// between devices. Conflicts: the most recently edited document wins.

import { state, docFor, applyRemote, saveLocal, setSyncHook, setDeleteRemoteHook } from './state.js';

let status = 'local';
let statusMsg = '';
const subs = new Set();
export function onStatus(fn) { subs.add(fn); fn(status, statusMsg); }
function setStatus(s, msg = '') { status = s; statusMsg = msg; subs.forEach((fn) => fn(s, msg)); }

const cfg = () => state.local.cloud;
export const cloudOn = () => !!(cfg().enabled && cfg().url && cfg().key);
const cleanUrl = (u) => u.trim().replace(/\/+$/, '');
const endpoint = (url = cfg().url) => cleanUrl(url) + '/rest/v1/stock_docs';
const headers = (key = cfg().key, extra = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra });

async function failText(r) {
  const t = await r.text().catch(() => '');
  if (r.status === 404 || /relation .* does not exist|stock_docs/.test(t)) return 'The stock_docs table was not found. Run the setup SQL first.';
  if (r.status === 401) return 'The key was rejected. Check the anon key.';
  return `Server error ${r.status}. ${t.slice(0, 160)}`;
}

export async function testConnection(url, key) {
  let r;
  try {
    r = await fetch(endpoint(url) + '?select=id&limit=1', { headers: headers(key) });
  } catch {
    throw new Error('Could not reach the server. Check the URL and internet connection.');
  }
  if (!r.ok) throw new Error(await failText(r));
}

let pushTimer = null;
let busy = false;
let again = false;

function schedule() {
  if (!cloudOn()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, 1500);
}

export async function syncNow() {
  if (!cloudOn()) { setStatus('local'); return; }
  if (!navigator.onLine) { setStatus('offline', `${state.local.queue.length} change(s) waiting`); return; }
  if (busy) { again = true; return; }
  busy = true;
  setStatus('syncing');
  try {
    await push();
    await pull();
    setStatus('synced');
  } catch (e) {
    console.error(e);
    setStatus(navigator.onLine ? 'error' : 'offline', e.message);
  } finally {
    busy = false;
    if (again) { again = false; schedule(); }
  }
}

async function push() {
  const ids = [...state.local.queue];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const rows = chunk.map((id) => ({ id, data: docFor(id) })).filter((r) => r.data);
    const sent = new Map(rows.map((r) => [r.id, r.data.updatedAt]));
    if (rows.length) {
      let r;
      try {
        r = await fetch(endpoint(), {
          method: 'POST',
          headers: headers(undefined, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify(rows),
        });
      } catch {
        throw new Error('Network problem while uploading. Will retry.');
      }
      if (!r.ok) throw new Error(await failText(r));
    }
    // Only clear ids that did not change again while uploading.
    state.local.queue = state.local.queue.filter((id) => {
      if (!chunk.includes(id)) return true;
      const doc = docFor(id);
      return doc && doc.updatedAt !== sent.get(id);
    });
    saveLocal();
  }
}

async function pull() {
  const since = state.local.lastPull || '1970-01-01T00:00:00Z';
  let latest = since;
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const url = `${endpoint()}?select=id,data,updated_at&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc&limit=${PAGE}&offset=${offset}`;
    let r;
    try {
      r = await fetch(url, { headers: headers() });
    } catch {
      throw new Error('Network problem while downloading. Will retry.');
    }
    if (!r.ok) throw new Error(await failText(r));
    const rows = await r.json();
    if (rows.length) {
      applyRemote(rows.map((x) => ({ id: x.id, data: x.data })));
      latest = rows[rows.length - 1].updated_at;
    }
    if (rows.length < PAGE) break;
  }
  if (latest !== since) { state.local.lastPull = latest; saveLocal(); }
}

export function startSync() {
  setSyncHook(schedule);
  setDeleteRemoteHook(deleteRemote);
  window.addEventListener('online', syncNow);
  window.addEventListener('offline', () => cloudOn() && setStatus('offline'));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNow());
  setInterval(() => cloudOn() && syncNow(), 60_000);
  syncNow();
}

export async function deleteRemote(id) {
  if (!cloudOn()) return;
  try {
    await fetch(`${endpoint()}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: headers(),
    });
  } catch {
    /* ignore offline */
  }
}
