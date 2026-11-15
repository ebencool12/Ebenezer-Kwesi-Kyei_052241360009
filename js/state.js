// App state + persistence. Data is split into small documents so that saving
// and cloud sync only touch what changed:
//   meta            -> store name, currency, PIN       (synced)
//   item:<id>       -> one product in the item list    (synced)
//   sheet:<date>    -> one day's stock sheet           (synced)
//   local           -> this device's settings / sync queue (never synced)

import * as db from './db.js';
import { uid, dailyTotalOf, closingOf, balanceOf, todayStr } from './util.js';

const DEFAULT_META = { storeName: 'FD ABRANTE3 SPOT 2', currency: 'GH₵', pinHash: null, pinSalt: null, updatedAt: 0 };
const defaultLocal = () => ({ cloud: { url: '', key: '', enabled: false }, lastPull: null, queue: [], lastBackup: null });

export const state = {
  meta: { ...DEFAULT_META },
  local: defaultLocal(),
  items: new Map(), // id -> item
  sheets: new Map(), // date -> sheet
};

const remoteListeners = new Set();
export const onRemoteChange = (fn) => remoteListeners.add(fn);
let syncHook = null;
export const setSyncHook = (fn) => (syncHook = fn);
let deleteRemoteHook = null;
export const setDeleteRemoteHook = (fn) => (deleteRemoteHook = fn);

function ingest(id, data) {
  if (!data) return;
  if (id === 'meta') state.meta = { ...DEFAULT_META, ...data };
  else if (id === 'local') state.local = { ...defaultLocal(), ...data, cloud: { ...defaultLocal().cloud, ...(data.cloud || {}) } };
  else if (id.startsWith('item:')) state.items.set(data.id, data);
  else if (id.startsWith('sheet:')) state.sheets.set(data.date, data);
}

export async function load() {
  try { await navigator.storage?.persist?.(); } catch { /* optional */ }
  const docs = await db.getAll();
  for (const { id, data } of docs) ingest(id, data);
}

// ---------- write coalescing ----------
const pending = new Map();
let flushTimer = null;

function persist(id, data, { sync = true } = {}) {
  pending.set(id, data);
  if (sync && id !== 'local') enqueue(id);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 250);
}

export async function flush() {
  clearTimeout(flushTimer);
  if (!pending.size) return;
  const docs = [...pending].map(([id, data]) => ({ id, data }));
  pending.clear();
  await db.putMany(docs);
}

function enqueue(id) {
  if (!state.local.queue.includes(id)) {
    state.local.queue.push(id);
    persist('local', state.local, { sync: false });
  }
  syncHook?.();
}

export function queueAll() {
  const ids = ['meta', ...[...state.items.keys()].map((k) => 'item:' + k), ...[...state.sheets.keys()].map((k) => 'sheet:' + k)];
  state.local.queue = [...new Set([...state.local.queue, ...ids])];
  persist('local', state.local, { sync: false });
}

export function docFor(id) {
  if (id === 'meta') return state.meta;
  if (id.startsWith('item:')) return state.items.get(id.slice(5));
  if (id.startsWith('sheet:')) return state.sheets.get(id.slice(6));
  return undefined;
}

// ---------- mutations ----------
export const saveLocal = () => persist('local', state.local, { sync: false });

export function saveMeta() {
  state.meta.updatedAt = Date.now();
  persist('meta', state.meta);
}

export function saveSheet(sheet) {
  sheet.updatedAt = Date.now();
  sheet.dailyTotal = dailyTotalOf(sheet);
  state.sheets.set(sheet.date, sheet);
  persist('sheet:' + sheet.date, sheet);
}

export function saveItem(item) {
  item.updatedAt = Date.now();
  state.items.set(item.id, item);
  persist('item:' + item.id, item);
}

export function createSheet(date, rows = []) {
  const now = Date.now();
  const sheet = { id: uid(), date, rows, createdAt: now, updatedAt: now, dailyTotal: 0 };
  saveSheet(sheet);
  return sheet;
}

export async function deleteSheet(date) {
  if (date < todayStr()) {
    console.warn('Blocked attempt to delete historical past sheet for', date);
    return;
  }
  const docId = 'sheet:' + date;
  state.sheets.delete(date);
  pending.delete(docId);
  state.local.queue = state.local.queue.filter((id) => id !== docId);
  saveLocal();
  await db.deleteMany([docId]);
  deleteRemoteHook?.(docId);
}

export const getSheet = (date) => state.sheets.get(date);
export const sortedDates = () => [...state.sheets.keys()].sort();
export const previousSheetDate = (date) => sortedDates().filter((d) => d < date).pop();
export const nextSheetDate = (date) => sortedDates().find((d) => d > date);

export function findItemByName(name) {
  const key = name.trim().toLowerCase();
  for (const it of state.items.values()) if (it.name.toLowerCase() === key) return it;
  return undefined;
}

/** Find an item in the store's item list by name, or add it (FR-27). */
export function ensureItem(name, price) {
  let it = findItemByName(name);
  if (!it) {
    it = { id: uid(), name: name.trim(), lastPrice: price || 0, createdAt: Date.now() };
    saveItem(it);
  } else if (price != null && price !== it.lastPrice) {
    it.lastPrice = price;
    saveItem(it);
  }
  return it;
}

/** Rename item in catalog and update all sheets containing it */
export function renameItemEverywhere(oldName, newName, itemId) {
  const cleanNew = newName.trim();
  let it = itemId ? state.items.get(itemId) : findItemByName(oldName);
  if (it) {
    it.name = cleanNew;
    saveItem(it);
  } else {
    it = ensureItem(cleanNew);
  }

  const lowerOld = (oldName || '').trim().toLowerCase();
  for (const sheet of state.sheets.values()) {
    let touched = false;
    for (const r of sheet.rows) {
      if ((itemId && r.itemId === itemId) || (lowerOld && r.name.toLowerCase() === lowerOld)) {
        r.name = cleanNew;
        r.itemId = it.id;
        touched = true;
      }
    }
    if (touched) {
      saveSheet(sheet);
    }
  }
  return it;
}

/** Update an item's price across all recorded sheets and catalog */
export function updatePriceEverywhere(itemId, itemName, newPrice) {
  let it = itemId ? state.items.get(itemId) : findItemByName(itemName);
  if (it) {
    it.lastPrice = newPrice;
    saveItem(it);
  }
  const lowerName = (itemName || '').trim().toLowerCase();
  for (const sheet of state.sheets.values()) {
    let touched = false;
    for (const r of sheet.rows) {
      if ((itemId && r.itemId === itemId) || (lowerName && r.name.toLowerCase() === lowerName)) {
        r.price = newPrice;
        touched = true;
      }
    }
    if (touched) {
      saveSheet(sheet);
    }
  }
}

export const sortedItems = () => [...state.items.values()].sort((a, b) => a.name.localeCompare(b.name));

/** Rows for the next day: Opening = today's Stock Balance; Receipt reset; price copied. */
export function carryRows(src) {
  return src.rows.map((r) => {
    const bal = balanceOf(r);
    return {
      id: uid(),
      itemId: r.itemId,
      name: r.name,
      opening: bal,
      receipt: 0,
      balance: bal,
      sold: 0,
      price: r.price,
    };
  });
}

// ---------- remote (cloud) ----------
export function applyRemote(docs) {
  const changed = [];
  for (const { id, data } of docs) {
    if (!data || id === 'local') continue;
    const cur = docFor(id);
    if (cur && (cur.updatedAt || 0) >= (data.updatedAt || 0)) continue;
    ingest(id, data);
    pending.set(id, data);
    changed.push(id);
  }
  if (changed.length) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 250);
    remoteListeners.forEach((fn) => fn(changed));
  }
  return changed;
}

// ---------- backup / restore ----------
export function exportAll() {
  return {
    app: 'fd-abrante3-spot2',
    version: 1,
    exportedAt: new Date().toISOString(),
    meta: state.meta,
    items: [...state.items.values()],
    sheets: sortedDates().map((d) => state.sheets.get(d)),
  };
}

export async function restoreAll(backup) {
  if (!backup || backup.app !== 'fd-abrante3-spot2' || !Array.isArray(backup.sheets)) {
    throw new Error('This file is not an FD ABRANTE3 SPOT 2 backup.');
  }
  const now = Date.now();
  await flush();
  await db.clearAll();
  const local = state.local;
  state.items.clear();
  state.sheets.clear();
  state.meta = { ...DEFAULT_META, ...(backup.meta || {}), updatedAt: now };
  for (const it of backup.items || []) state.items.set(it.id, { ...it, updatedAt: now });
  for (const s of backup.sheets) {
    const sheet = { ...s, rows: Array.isArray(s.rows) ? s.rows : [], updatedAt: now };
    sheet.dailyTotal = dailyTotalOf(sheet);
    state.sheets.set(sheet.date, sheet);
  }
  state.local = local;
  const docs = [
    { id: 'meta', data: state.meta },
    { id: 'local', data: state.local },
    ...[...state.items.values()].map((it) => ({ id: 'item:' + it.id, data: it })),
    ...[...state.sheets.values()].map((s) => ({ id: 'sheet:' + s.date, data: s })),
  ];
  await db.putMany(docs);
  queueAll();
  syncHook?.();
}
