// Shared helpers: dates, numbers, stock formulas, formatting.

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const isDateStr = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function toLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const formatLong = (s) =>
  toLocalDate(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const formatShort = (s) =>
  toLocalDate(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

// ---------- Numbers ----------
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Parse a quantity/price typed by the user. Empty means 0. */
export function parseAmount(raw) {
  const t = String(raw ?? '').trim().replace(/,/g, '');
  if (t === '') return { ok: true, value: 0 };
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(t)) return { ok: false, error: 'enter a number' };
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false, error: 'enter a number' };
  if (n < 0) return { ok: false, error: 'must be zero or more' };
  return { ok: true, value: n };
}

// ---------- Stock formulas (PRD §5 & §8 - Ghanaian Ledger System) ----------
/** Total = Opening Stock + Receipt */
export const totalStockOf = (r) => round3((r.opening || 0) + (r.receipt ?? r.added ?? 0));

/** Stock Sold = Total − Stock Balance */
export const soldOf = (r) => {
  if (r.sold != null && r.balance == null) return round3(r.sold || 0);
  const tot = totalStockOf(r);
  return round3(tot - (r.balance ?? 0));
};

/** Stock Balance = Total − Stock Sold */
export const balanceOf = (r) => {
  if (r.balance != null) return round3(r.balance || 0);
  const tot = totalStockOf(r);
  return round3(tot - (r.sold ?? 0));
};

/** Backwards-compatible alias */
export const closingOf = (r) => balanceOf(r);

/** Amount = Stock Sold × Price (Sales Value) */
export const amountOf = (r) => round2(soldOf(r) * (r.price || 0));

/** Split Amount into Ghana Cedis (GH₵) and Ghana Pesewas (GHp) */
export function splitGhcGhp(amount) {
  const rounded = round2(amount || 0);
  const isNeg = rounded < 0;
  const absVal = Math.abs(rounded);
  const whole = Math.floor(absVal);
  const pesewas = Math.round((absVal - whole) * 100);
  return {
    ghc: (isNeg ? '-' : '') + new Intl.NumberFormat('en-GB').format(whole),
    ghp: String(pesewas).padStart(2, '0'),
  };
}

/** Daily Total Sales Amount = sum of Amount for that day */
export const dailyTotalOf = (sheet) => round2((sheet?.rows || []).reduce((s, r) => s + amountOf(r), 0));
export const totalQtyOf = (sheet) => round3((sheet?.rows || []).reduce((s, r) => s + balanceOf(r), 0));
export const totalSoldOf = (sheet) => round3((sheet?.rows || []).reduce((s, r) => s + soldOf(r), 0));

// ---------- Formatting ----------
const moneyFmt = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 3 });
export const fmtMoney = (n) => moneyFmt.format(n || 0);
export const fmtQty = (n) => qtyFmt.format(n || 0);
export const CURRENCY = 'GH₵';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * Hash a PIN with a salt. Pure JS so it behaves the same on every device
 * (crypto.subtle is unavailable on plain-http LAN addresses).
 * A 4–6 digit PIN is a convenience lock, not strong security.
 */
export function hashPin(pin, salt) {
  const text = `${salt}:${pin}:fd-abrante3`;
  let h1 = 0xdeadbeef ^ text.length, h2 = 0x41c6ce57 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'c53:' + (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
