// FD ABRANTE3 SPOT 2 — Daily Stock Keeper: main UI controller.

import {
  state, load, flush, getSheet, createSheet, saveSheet, saveMeta, saveLocal, saveItem,
  sortedDates, previousSheetDate, nextSheetDate, findItemByName, ensureItem, sortedItems,
  carryRows, onRemoteChange, queueAll, restoreAll, renameItemEverywhere, updatePriceEverywhere,
  deleteSheet,
} from './state.js?v=6.6';
import { startSync, syncNow, onStatus, testConnection, cloudOn } from './sync.js?v=6.6';
import {
  todayStr, addDays, isDateStr, formatLong, formatShort, uid, parseAmount, round2, round3,
  totalStockOf, soldOf, balanceOf, closingOf, amountOf, splitGhcGhp,
  dailyTotalOf, totalQtyOf, fmtMoney, fmtQty, esc, hashPin, CURRENCY,
} from './util.js?v=6.6';
import { openModal, confirmDialog, toast } from './ui.js?v=6.6';
import { exportCSV, printSheets, downloadBackup } from './export.js?v=6.6';

const $ = (s, el = document) => el.querySelector(s);

let current = todayStr();
let view = 'sheet';
const unsaved = new Set(); // row ids with invalid (not yet saved) input
const editedEarlier = new Set(); // dates edited while later days exist
let pendingRerender = false;

const FIELDS = ['opening', 'receipt', 'balance', 'sold', 'price'];
const FIELD_LABEL = { opening: 'Opening Stock', receipt: 'Receipt', balance: 'Stock Balance', sold: 'Stock Sold', price: 'Price' };

const ICON = {
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
  del: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>',
  sheet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
};

// =====================================================================
// Routing
// =====================================================================
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

function route() {
  const [v, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if (v === 'all') return show('all');
  if (v === 'settings') return show('settings');
  current = v === 'sheet' && isDateStr(arg) ? arg : todayStr();
  show('sheet');
}

function show(next) {
  if (view === 'sheet' && next !== 'sheet' && unsaved.size) {
    toast('Red entries were not saved because they were invalid.', 'warn');
  }
  if (next !== 'sheet' || view !== 'sheet') unsaved.clear();
  view = next;
  for (const v of ['sheet', 'all', 'settings']) $(`#view-${v}`).classList.toggle('hidden', v !== next);
  document.querySelectorAll('.nav-link').forEach((a) => {
    const active = a.dataset.view === next && (next !== 'sheet' || current === todayStr());
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (next === 'sheet') renderSheet();
  if (next === 'all') renderAll();
  if (next === 'settings') renderSettings();
  window.scrollTo({ top: 0 });
}

// =====================================================================
// Daily sheet
// =====================================================================
function applyStoreName() {
  const name = state.meta.storeName;
  $('#brand-name').textContent = name;
  $('#sheet-store').textContent = name;
  $('#lock-store').textContent = name;
  document.title = `${name} – Daily Stock Keeper`;
}

function refreshDatalist() {
  $('#item-list').innerHTML = sortedItems().map((it) => `<option value="${esc(it.name)}"></option>`).join('');
}

function renderSheet() {
  const sheet = getSheet(current);
  const today = todayStr();
  unsaved.clear();
  pendingRerender = false;

  $('#sheet-date').textContent = formatLong(current);
  $('#date-picker').value = current;
  const badge = $('#day-badge');
  badge.className = 'badge' + (current === today ? ' today' : current < today ? ' past' : '');
  badge.textContent = current === today ? 'Today' : current < today ? 'Past day' : 'Upcoming';
  $('#go-today').classList.toggle('hidden', current === today);

  // Delete sheet is only permitted for present (today) and forward (upcoming/mistaken) sheets.
  // Past sheets that are done being worked with are locked and cannot be deleted.
  const canDelete = current >= today;
  $('#delete-sheet')?.classList.toggle('hidden', !canDelete);

  $('#sheet-empty').classList.toggle('hidden', !!sheet);
  $('#sheet-card').classList.toggle('hidden', !sheet);
  $('#total-bar').classList.toggle('hidden', !sheet);
  renderLaterBanner();

  if (!sheet) return renderEmpty();

  const tbody = $('#sheet-body');
  tbody.innerHTML = sheet.rows.length
    ? sheet.rows.map(rowHTML).join('')
    : `<tr class="empty-row"><td colspan="11">No items on this page yet. Tap <b>Add Item</b> to start, or go to the previous day and use <b>Carry Forward</b>.</td></tr>`;

  const negatives = sheet.rows.filter((r) => soldOf(r) < 0);
  $('#sheet-msg').textContent = negatives.length
    ? `${negatives.map((r) => r.name).join(', ')}: Stock Balance is greater than Total available. Please correct the red rows.`
    : '';
  renderTotals(sheet);
  setSaved(true);
}

function numStr(n) { return (n != null && n !== 0) ? String(n) : '0'; }

function rowHTML(r, i) {
  const tot = totalStockOf(r);
  const bal = balanceOf(r);
  const sld = soldOf(r);
  const amt = amountOf(r);
  const { ghc, ghp } = splitGhcGhp(amt);
  const neg = sld < 0;
  const n = esc(r.name);
  return `<tr data-id="${r.id}"${neg ? ' class="row-error"' : ''}>
    <td class="c-no sticky-no">${i + 1}</td>
    <td class="c-item sticky-item"><input class="cell-input name" id="name-${r.id}" data-field="name" value="${n}" list="item-list" autocomplete="off" aria-label="Item name"></td>
    <td><input class="cell-input num" id="opening-${r.id}" data-field="opening" inputmode="decimal" value="${numStr(r.opening)}" aria-label="Opening stock for ${n}"></td>
    <td><input class="cell-input num" id="receipt-${r.id}" data-field="receipt" inputmode="decimal" value="${numStr(r.receipt ?? r.added)}" aria-label="Receipt for ${n}"></td>
    <td class="calc c-total-stock">${fmtQty(tot)}</td>
    <td><input class="cell-input num" id="balance-${r.id}" data-field="balance" inputmode="decimal" value="${numStr(bal)}" aria-label="Stock balance for ${n}"></td>
    <td><input class="cell-input num${neg ? ' invalid' : ''}" id="sold-${r.id}" data-field="sold" inputmode="decimal" value="${numStr(sld)}" aria-label="Stock sold for ${n}"></td>
    <td><input class="cell-input num" id="price-${r.id}" data-field="price" inputmode="decimal" value="${r.price ? r.price.toFixed(2) : '0.00'}" aria-label="Price for ${n}"></td>
    <td class="calc money amt-ghc c-amt-ghc sticky-amt-ghc">${ghc}</td>
    <td class="calc money amt-ghp c-amt-ghp sticky-amt-ghp">${ghp}</td>
    <td class="c-del sticky-del">
      <div class="row-actions">
        <button type="button" class="action-btn edit-btn" id="edit-${r.id}" data-action="edit" aria-label="Edit name and price for ${n}" title="Edit Name & Price">${ICON.edit}</button>
        <button type="button" class="action-btn del-btn" id="del-${r.id}" data-action="delete" aria-label="Delete ${n}" title="Delete from this day">${ICON.del}</button>
      </div>
    </td>
  </tr>`;
}

function renderTotals(sheet) {
  const total = dailyTotalOf(sheet);
  const { ghc, ghp } = splitGhcGhp(total);
  const totalStr = `${ghc}.${ghp}`;
  const money = $('#tb-total');
  if (money.textContent !== totalStr) {
    money.textContent = totalStr;
    const wrap = money.parentElement;
    wrap.classList.remove('bump'); void wrap.offsetWidth; wrap.classList.add('bump');
  }
  $('#tf-ghc').textContent = ghc;
  $('#tf-ghp').textContent = ghp;
  $('#tb-items').textContent = sheet.rows.length;
}

function setSaved(ok) {
  const el = $('#tb-saved');
  el.classList.toggle('unsaved', !ok);
  el.lastChild.textContent = ok ? 'Saved' : 'Not saved: fix red cells';
}

function renderEmpty() {
  const prev = previousSheetDate(current);
  const first = sortedDates().length === 0;
  $('#sheet-empty').innerHTML = `
    <div class="empty-icon">${ICON.sheet}</div>
    <h2>${first ? 'Welcome! Create your first stock sheet' : `No sheet for ${esc(formatShort(current))}`}</h2>
    <p>${first ? 'Each day has its own page. Start today\'s page and add the items in your store.' : 'Each day starts on its own page. Start a blank page, or carry the closing stock forward from the last recorded day.'}</p>
    <div class="empty-actions">
      <button type="button" class="btn primary" id="create-blank">Create blank sheet</button>
      ${prev ? `<button type="button" class="btn gold" id="create-carry">Carry forward from ${esc(formatShort(prev))}</button>` : ''}
    </div>`;
  $('#create-blank').addEventListener('click', () => {
    createSheet(current);
    renderSheet();
    toast(`Blank page created for ${formatShort(current)}`, 'success');
  });
  $('#create-carry')?.addEventListener('click', async () => {
    if (await carryForward(prev, current)) renderSheet();
  });
}

// ---------- editing ----------
function findRow(tr) {
  const sheet = getSheet(current);
  return { sheet, row: sheet?.rows.find((r) => r.id === tr.dataset.id) };
}

function onNumberInput(tr, activeField) {
  const { sheet, row } = findRow(tr);
  if (!row) return;
  const vals = {};
  let err = null;
  for (const f of FIELDS) {
    const el = tr.querySelector(`[data-field="${f}"]`);
    if (!el) continue;
    const p = parseAmount(el.value);
    el.classList.toggle('invalid', !p.ok);
    if (p.ok) vals[f] = p.value; else err ??= `${row.name}: ${FIELD_LABEL[f]} ${p.error}.`;
  }
  if (!err) {
    const total = round3(vals.opening + (vals.receipt ?? 0));
    // If the attendant is typing into 'sold', recalculate balance
    if (activeField === 'sold') {
      vals.balance = round3(total - vals.sold);
      const balEl = tr.querySelector('[data-field="balance"]');
      if (balEl && document.activeElement !== balEl) balEl.value = numStr(vals.balance);
    } else {
      // Otherwise (user typed opening, receipt, or balance), recalculate sold
      vals.sold = round3(total - vals.balance);
      const sldEl = tr.querySelector('[data-field="sold"]');
      if (sldEl && document.activeElement !== sldEl) sldEl.value = numStr(vals.sold);
    }

    if (vals.sold < -1e-9) {
      err = `${row.name}: Stock Balance (${fmtQty(vals.balance)}) cannot exceed Total stock available (${fmtQty(total)}).`;
      tr.querySelector('[data-field="balance"]')?.classList.add('invalid');
    } else if (vals.sold > total + 1e-9) {
      err = `${row.name}: Stock Sold (${fmtQty(vals.sold)}) cannot exceed Total stock available (${fmtQty(total)}).`;
      tr.querySelector('[data-field="sold"]')?.classList.add('invalid');
    }
  }
  tr.classList.toggle('row-error', !!err);
  if (err) {
    unsaved.add(row.id);
    tr.querySelector('.c-amt-ghc').textContent = '—';
    tr.querySelector('.c-amt-ghp').textContent = '—';
    $('#sheet-msg').textContent = err;
    setSaved(false);
    return;
  }
  unsaved.delete(row.id);
  const priceChanged = row.price !== vals.price;
  Object.assign(row, vals);
  saveSheet(sheet);
  if (priceChanged) {
    const it = state.items.get(row.itemId);
    if (it) { it.lastPrice = row.price; saveItem(it); }
  }
  const tot = totalStockOf(row);
  const amt = amountOf(row);
  const { ghc, ghp } = splitGhcGhp(amt);
  updateCalc(tr.querySelector('.c-total-stock'), fmtQty(tot));
  updateCalc(tr.querySelector('.c-amt-ghc'), ghc);
  updateCalc(tr.querySelector('.c-amt-ghp'), ghp);
  renderTotals(sheet);
  if (!unsaved.size) { $('#sheet-msg').textContent = ''; setSaved(true); }
  noteEdit();
}

function updateCalc(td, text) {
  if (td.textContent === text) return;
  td.textContent = text;
  td.classList.remove('flash'); void td.offsetWidth; td.classList.add('flash');
}

function onNameChange(inp) {
  const tr = inp.closest('tr');
  const { sheet, row } = findRow(tr);
  if (!row) return;
  const name = inp.value.trim().replace(/\s+/g, ' ');
  if (name === row.name) return;
  if (!name) { toast('Item name is required.', 'error'); inp.value = row.name; return; }
  if (sheet.rows.some((r) => r.id !== row.id && r.name.toLowerCase() === name.toLowerCase())) {
    toast(`"${name}" is already on this sheet.`, 'error');
    inp.value = row.name;
    return;
  }
  const oldName = row.name;
  const it = renameItemEverywhere(oldName, name, row.itemId);
  row.name = it.name;
  row.itemId = it.id;
  inp.value = row.name;
  saveSheet(sheet);
  refreshDatalist();
  noteEdit();
}

async function deleteRow(tr) {
  const { sheet, row } = findRow(tr);
  if (!row) return;
  const ok = await confirmDialog({
    title: 'Delete item from this day?',
    message: `Remove <b>${esc(row.name)}</b> from the sheet for ${esc(formatLong(current))}? Past sheets keep their records.`,
    okLabel: 'Delete',
    kind: 'danger',
  });
  if (!ok) return;
  sheet.rows = sheet.rows.filter((r) => r.id !== row.id);
  saveSheet(sheet);
  renderSheet();
  noteEdit();
  toast(`${row.name} removed from this day.`);
}

function openEditItem(tr) {
  const { sheet, row } = findRow(tr);
  if (!sheet || !row) return;

  const form = document.createElement('form');
  form.className = 'form-grid edit-item-form';
  form.noValidate = true;

  const curTot = totalStockOf(row);
  const curBal = balanceOf(row);
  const curSld = soldOf(row);
  const curAmt = amountOf(row);
  const { ghc: initGhc, ghp: initGhp } = splitGhcGhp(curAmt);

  form.innerHTML = `
    <div class="edit-section">
      <h3 class="edit-section-title">Item Identification</h3>
      <div class="two">
        <label class="field">Item Name
          <input id="edit-name" value="${esc(row.name)}" list="item-list" autocomplete="off" maxlength="80" required>
        </label>
        <label class="field">Price (${CURRENCY})
          <input id="edit-price" inputmode="decimal" value="${row.price != null ? row.price.toFixed(2) : '0.00'}" required>
        </label>
      </div>
      <div class="edit-checkboxes">
        <label class="checkbox-label">
          <input type="checkbox" id="edit-sync-name" checked>
          <span>Apply name change across all recorded days & catalog</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" id="edit-sync-price">
          <span>Apply price across all recorded days (otherwise current & future days)</span>
        </label>
      </div>
    </div>

    <div class="edit-section">
      <h3 class="edit-section-title">Stock Quantities (${esc(formatShort(current))})</h3>
      <div class="two">
        <label class="field">Opening Stock
          <input id="edit-opening" inputmode="decimal" value="${numStr(row.opening)}">
        </label>
        <label class="field">Receipt (Stock Added)
          <input id="edit-receipt" inputmode="decimal" value="${numStr(row.receipt ?? row.added)}">
        </label>
      </div>
      <div class="two">
        <label class="field">Stock Balance (Count at close)
          <input id="edit-balance" inputmode="decimal" value="${numStr(curBal)}">
        </label>
        <label class="field">Stock Sold (Auto or manual)
          <input id="edit-sold" inputmode="decimal" value="${numStr(curSld)}">
        </label>
      </div>
    </div>

    <div class="edit-preview-card" id="edit-preview">
      <div class="preview-stat">
        <span class="preview-label">Total Stock</span>
        <span class="preview-val" id="prev-total">${fmtQty(curTot)}</span>
      </div>
      <div class="preview-stat">
        <span class="preview-label">Stock Sold</span>
        <span class="preview-val" id="prev-sold">${fmtQty(curSld)}</span>
      </div>
      <div class="preview-stat">
        <span class="preview-label">Amount</span>
        <span class="preview-val preview-gold" id="prev-amt">${CURRENCY} ${initGhc}.${initGhp}</span>
      </div>
    </div>
    <p class="form-error" id="edit-error"></p>
  `;

  const nameEl = $('#edit-name', form);
  const priceEl = $('#edit-price', form);
  const openEl = $('#edit-opening', form);
  const rcptEl = $('#edit-receipt', form);
  const balEl = $('#edit-balance', form);
  const sldEl = $('#edit-sold', form);
  const syncNameEl = $('#edit-sync-name', form);
  const syncPriceEl = $('#edit-sync-price', form);
  const errEl = $('#edit-error', form);

  const prevTotEl = $('#prev-total', form);
  const prevSldEl = $('#prev-sold', form);
  const prevAmtEl = $('#prev-amt', form);

  function recalc(changedField) {
    errEl.textContent = '';
    const oP = parseAmount(openEl.value);
    const rP = parseAmount(rcptEl.value);
    const bP = parseAmount(balEl.value);
    const sP = parseAmount(sldEl.value);
    const pP = parseAmount(priceEl.value);

    openEl.classList.toggle('invalid', !oP.ok);
    rcptEl.classList.toggle('invalid', !rP.ok);
    balEl.classList.toggle('invalid', !bP.ok);
    sldEl.classList.toggle('invalid', !sP.ok);
    priceEl.classList.toggle('invalid', !pP.ok);

    if (!oP.ok) { errEl.textContent = `Opening stock: ${oP.error}`; return; }
    if (!rP.ok) { errEl.textContent = `Receipt: ${rP.error}`; return; }

    const total = round3(oP.value + rP.value);
    prevTotEl.textContent = fmtQty(total);

    let bal = bP.ok ? bP.value : 0;
    let sld = sP.ok ? sP.value : 0;

    if (changedField === 'sold') {
      if (!sP.ok) { errEl.textContent = `Stock sold: ${sP.error}`; return; }
      bal = round3(total - sP.value);
      balEl.value = numStr(bal);
      sld = sP.value;
    } else {
      if (!bP.ok) { errEl.textContent = `Stock balance: ${bP.error}`; return; }
      sld = round3(total - bP.value);
      sldEl.value = numStr(sld);
      bal = bP.value;
    }

    if (bal > total + 1e-9) {
      errEl.textContent = `Stock Balance (${fmtQty(bal)}) cannot exceed Total available (${fmtQty(total)}).`;
      balEl.classList.add('invalid');
      prevSldEl.classList.add('preview-err');
    } else if (sld > total + 1e-9) {
      errEl.textContent = `Stock Sold (${fmtQty(sld)}) cannot exceed Total available (${fmtQty(total)}).`;
      sldEl.classList.add('invalid');
      prevSldEl.classList.add('preview-err');
    } else {
      prevSldEl.classList.remove('preview-err');
    }

    prevSldEl.textContent = fmtQty(sld);

    if (pP.ok) {
      const price = pP.value;
      const amt = round2(Math.max(0, sld) * price);
      const { ghc, ghp } = splitGhcGhp(amt);
      prevAmtEl.textContent = `${CURRENCY} ${ghc}.${ghp}`;
    } else {
      prevAmtEl.textContent = '—';
    }
  }

  nameEl.addEventListener('input', () => { errEl.textContent = ''; });
  priceEl.addEventListener('input', () => recalc('price'));
  openEl.addEventListener('input', () => recalc('opening'));
  rcptEl.addEventListener('input', () => recalc('receipt'));
  balEl.addEventListener('input', () => recalc('balance'));
  sldEl.addEventListener('input', () => recalc('sold'));

  const submit = (close) => {
    const newName = nameEl.value.trim().replace(/\s+/g, ' ');
    const p = parseAmount(priceEl.value);
    const o = parseAmount(openEl.value);
    const rc = parseAmount(rcptEl.value);
    const b = parseAmount(balEl.value);
    const s = parseAmount(sldEl.value);

    if (!newName) { errEl.textContent = 'Item name is required.'; return nameEl.focus(); }
    const dup = sheet.rows.find((r) => r.id !== row.id && r.name.toLowerCase() === newName.toLowerCase());
    if (dup) { errEl.textContent = `"${newName}" is already on this sheet.`; return nameEl.focus(); }

    if (!p.ok) { errEl.textContent = `Price: ${p.error}.`; return priceEl.focus(); }
    if (!o.ok) { errEl.textContent = `Opening stock: ${o.error}.`; return openEl.focus(); }
    if (!rc.ok) { errEl.textContent = `Receipt: ${rc.error}.`; return rcptEl.focus(); }
    if (!b.ok) { errEl.textContent = `Stock balance: ${b.error}.`; return balEl.focus(); }
    if (!s.ok) { errEl.textContent = `Stock sold: ${s.error}.`; return sldEl.focus(); }

    const total = round3(o.value + rc.value);
    if (b.value > total + 1e-9) {
      errEl.textContent = `Stock Balance (${fmtQty(b.value)}) cannot exceed Total available (${fmtQty(total)}).`;
      return balEl.focus();
    }
    if (s.value > total + 1e-9) {
      errEl.textContent = `Stock Sold (${fmtQty(s.value)}) cannot exceed Total available (${fmtQty(total)}).`;
      return sldEl.focus();
    }

    const oldName = row.name;
    const nameChanged = newName !== oldName;
    const priceChanged = row.price !== p.value;

    row.name = newName;
    row.price = p.value;
    row.opening = o.value;
    row.receipt = rc.value;
    row.balance = b.value;
    row.sold = s.value;

    if (nameChanged && syncNameEl.checked) {
      const it = renameItemEverywhere(oldName, newName, row.itemId);
      row.itemId = it.id;
    } else {
      const it = ensureItem(newName, p.value);
      row.itemId = it.id;
    }

    if (priceChanged) {
      if (syncPriceEl.checked) {
        updatePriceEverywhere(row.itemId, newName, p.value);
      } else {
        const it = state.items.get(row.itemId);
        if (it) { it.lastPrice = p.value; saveItem(it); }
      }
    }

    saveSheet(sheet);
    refreshDatalist();
    renderSheet();
    noteEdit();

    toast(`All aspects of "${newName}" updated successfully.`, 'success');
    close();
  };

  const m = openModal({
    title: `Edit Item: ${row.name}`,
    id: 'edit-item-modal',
    body: form,
    actions: [
      { label: 'Cancel', onClick: (c) => c() },
      { label: 'Save Changes', kind: 'primary', id: 'edit-confirm', onClick: (c) => submit(c) },
    ],
  });

  form.addEventListener('submit', (e) => { e.preventDefault(); submit(m.close); });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      submit(m.close);
    }
  });

  setTimeout(() => { nameEl.focus(); nameEl.select(); }, 60);
}

function noteEdit() {
  if (nextSheetDate(current)) {
    editedEarlier.add(current);
    renderLaterBanner();
  }
}

function renderLaterBanner() {
  const banner = $('#later-banner');
  const nxt = nextSheetDate(current);
  if (!nxt || !editedEarlier.has(current) || !getSheet(current)) { banner.classList.add('hidden'); return; }
  banner.innerHTML = `<p>You changed an earlier day. Opening stock on later days (from <b>${esc(formatShort(nxt))}</b>) may no longer match.</p>
    <button type="button" class="btn gold" id="rerun-carry">Update later days</button>
    <button type="button" class="btn subtle" id="dismiss-banner">Dismiss</button>`;
  banner.classList.remove('hidden');
  $('#dismiss-banner').onclick = () => { editedEarlier.delete(current); banner.classList.add('hidden'); };
  $('#rerun-carry').onclick = async () => {
    if (unsaved.size) return toast('Fix the red entries first.', 'error');
    const ok = await confirmDialog({
      title: 'Update later days?',
      message: 'Opening Stock on every later day will be reset from the day before\'s Closing Stock. Stock Add, Stock Sold and prices on those days stay as they are.',
      okLabel: 'Update later days',
      kind: 'gold',
    });
    if (!ok) return;
    const { changedDays, negatives } = updateLaterDays(current);
    editedEarlier.delete(current);
    banner.classList.add('hidden');
    toast(changedDays ? `Opening stock updated on ${changedDays} later day(s).` : 'Later days already match.', 'success');
    if (negatives.length) toast(`Check ${negatives.map(formatShort).join(', ')}: some items now show negative stock.`, 'warn', { duration: 7000 });
  };
}

/** Re-runs carry forward through every later day without touching Add/Sold/price. */
function updateLaterDays(fromDate) {
  let prev = getSheet(fromDate);
  let changedDays = 0;
  const negatives = [];
  for (const d of sortedDates().filter((x) => x > fromDate)) {
    const s = getSheet(d);
    let changed = false;
    for (const pr of prev.rows) {
      const row = s.rows.find((r) => r.itemId === pr.itemId) || s.rows.find((r) => r.name.toLowerCase() === pr.name.toLowerCase());
      const close = balanceOf(pr);
      if (row && row.opening !== close) { row.opening = close; changed = true; }
    }
    if (changed) { saveSheet(s); changedDays++; }
    if (s.rows.some((r) => soldOf(r) < 0)) negatives.push(d);
    prev = s;
  }
  return { changedDays, negatives };
}

// ---------- Add item ----------
function openAddItem() {
  const sheet = getSheet(current);
  if (!sheet) return;
  const form = document.createElement('form');
  form.className = 'form-grid';
  form.noValidate = true;
  form.innerHTML = `
    <label class="field">Item name
      <input id="add-name" list="item-list" autocomplete="off" placeholder="e.g. Sugar" maxlength="80">
    </label>
    <div class="two">
      <label class="field">Opening stock<input id="add-opening" inputmode="decimal" placeholder="0"></label>
      <label class="field">Price (${CURRENCY})<input id="add-price" inputmode="decimal" placeholder="0.00"></label>
    </div>
    <p class="hint muted" id="add-hint">Pick from the list or type a new item.</p>
    <p class="form-error" id="add-error"></p>`;
  const nameEl = $('#add-name', form), openEl = $('#add-opening', form), priceEl = $('#add-price', form);
  const hint = $('#add-hint', form), errEl = $('#add-error', form);
  let priceTouched = false;
  nameEl.addEventListener('input', () => {
    const v = nameEl.value.trim();
    const it = v && findItemByName(v);
    hint.textContent = it ? `Known item. Last price ${CURRENCY} ${fmtMoney(it.lastPrice)}.` : v ? 'New item: it will be added to the store\'s item list.' : 'Pick from the list or type a new item.';
    if (it && !priceTouched) priceEl.value = it.lastPrice ? it.lastPrice.toFixed(2) : '';
    errEl.textContent = '';
  });
  priceEl.addEventListener('input', () => { priceTouched = true; errEl.textContent = ''; });
  openEl.addEventListener('input', () => (errEl.textContent = ''));

  const submit = (close, keepOpen) => {
    const name = nameEl.value.trim().replace(/\s+/g, ' ');
    const o = parseAmount(openEl.value), p = parseAmount(priceEl.value);
    if (!name) { errEl.textContent = 'Item name is required.'; return nameEl.focus(); }
    if (sheet.rows.some((r) => r.name.toLowerCase() === name.toLowerCase())) { errEl.textContent = `"${name}" is already on this sheet.`; return nameEl.focus(); }
    if (!o.ok) { errEl.textContent = `Opening stock: ${o.error}.`; return openEl.focus(); }
    if (!p.ok) { errEl.textContent = `Price: ${p.error}.`; return priceEl.focus(); }
    const it = ensureItem(name, p.value);
    sheet.rows.push({ id: uid(), itemId: it.id, name: it.name, opening: o.value, receipt: 0, balance: o.value, sold: 0, price: p.value });
    saveSheet(sheet);
    refreshDatalist();
    renderSheet();
    noteEdit();
    const wrap = $('#table-wrap');
    wrap.scrollTop = wrap.scrollHeight;
    if (keepOpen) {
      toast(`${it.name} added`, 'success', { duration: 1800 });
      form.reset(); priceTouched = false; hint.textContent = 'Pick from the list or type a new item.';
      nameEl.focus();
    } else close();
  };
  const m = openModal({
    title: 'Add Item',
    id: 'add-item-modal',
    body: form,
    actions: [
      { label: 'Cancel', onClick: (c) => c() },
      { label: 'Save & Add Another', id: 'add-another', onClick: (c) => submit(c, true) },
      { label: 'Add Item', kind: 'primary', id: 'add-confirm', onClick: (c) => submit(c, false) },
    ],
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(m.close, true); }
  });
  form.addEventListener('submit', (e) => e.preventDefault());
}

// ---------- Carry forward (FR-14..19) ----------
async function carryForward(from, to) {
  const src = getSheet(from);
  if (!src) return false;
  if (to <= from) { toast('Choose a date after the source day.', 'error'); return false; }
  const existing = getSheet(to);
  if (existing && existing.rows.length) {
    const ok = await confirmDialog({
      title: 'Overwrite existing sheet?',
      message: `<b>${esc(formatLong(to))}</b> already has ${existing.rows.length} item(s). Overwrite it with the balances from ${esc(formatLong(from))}? That day's current entries will be replaced.`,
      okLabel: 'Overwrite',
      kind: 'danger',
    });
    if (!ok) return false;
  }
  const rows = carryRows(src);
  if (existing) { existing.rows = rows; saveSheet(existing); } else createSheet(to, rows);
  toast(`${rows.length} balance(s) carried forward to ${formatShort(to)}.`, 'success');
  return true;
}

function openCarryForward() {
  const sheet = getSheet(current);
  if (!sheet) return;
  if (unsaved.size) return toast('Fix the red entries first. They are not saved yet.', 'error');
  if (!sheet.rows.length) return toast('Nothing to carry forward. Add items first.', 'warn');
  const next = addDays(current, 1);
  const body = document.createElement('div');
  body.innerHTML = `
    <p>The closing stock of all <b>${sheet.rows.length}</b> item(s) on <b>${esc(formatLong(current))}</b> becomes the opening stock of:</p>
    <label class="field">Date<input type="date" id="cf-date" min="${next}" value="${next}"></label>
    <p class="hint" id="cf-hint"></p>
    <p class="hint muted">Stock Add and Stock Sold start at 0. Prices are copied. This day's sheet does not change.</p>`;
  const m = openModal({
    title: `Copy all balances to ${formatShort(next)}?`,
    id: 'carry-modal',
    body,
    actions: [
      { label: 'Cancel', onClick: (c) => c() },
      {
        label: 'Copy Balances', kind: 'gold', id: 'cf-confirm',
        onClick: async (close) => {
          const d = $('#cf-date', body).value;
          if (!isDateStr(d) || d <= current) return toast('Choose a date after this day.', 'error');
          close();
          if (await carryForward(current, d)) go(`#/sheet/${d}`);
        },
      },
    ],
  });
  const update = () => {
    const d = $('#cf-date', body).value;
    const hint = $('#cf-hint', body);
    if (!isDateStr(d)) return;
    m.el.querySelector('.modal-title').textContent = `Copy all balances to ${formatShort(d)}?`;
    const ex = getSheet(d);
    hint.className = 'hint' + (ex && ex.rows.length ? ' warn' : ' muted');
    hint.textContent = ex && ex.rows.length ? `⚠ ${formatShort(d)} already has ${ex.rows.length} item(s). You will be asked before anything is overwritten.` : '';
  };
  $('#cf-date', body).addEventListener('input', update);
  update();
}

function newDay() {
  if (unsaved.size) return toast('Fix the red entries first. They are not saved yet.', 'error');
  const next = addDays(current, 1);
  if (!getSheet(next)) {
    createSheet(next);
    toast(`New blank page created for ${formatShort(next)}.`, 'success');
  } else {
    toast(`${formatShort(next)} already has a sheet. Opening it.`);
  }
  go(`#/sheet/${next}`);
}

async function deleteCurrentSheet(targetDate = current) {
  if (targetDate < todayStr()) {
    toast('Past completed days are locked and cannot be deleted.', 'warn');
    return;
  }

  const sheet = getSheet(targetDate);
  if (!sheet) {
    toast('No sheet exists for this day.', 'warn');
    return;
  }

  const rowCount = sheet.rows.length;
  const total = fmtMoney(dailyTotalOf(sheet));
  const dateFormatted = formatLong(targetDate);

  const ok = await confirmDialog({
    title: `Delete sheet for ${formatShort(targetDate)}?`,
    message: `<p>Are you sure you want to delete the stock sheet for <b>${esc(dateFormatted)}</b>?</p>
      <p class="muted small">${rowCount ? `This sheet has <b>${rowCount} item(s)</b> recorded with a daily total of <b>${CURRENCY} ${total}</b>.` : 'This sheet is blank / has no items recorded.'} This action cannot be undone.</p>`,
    okLabel: 'Delete Sheet',
    kind: 'danger',
  });

  if (!ok) return;

  await deleteSheet(targetDate);
  toast(`Sheet for ${formatShort(targetDate)} deleted.`, 'success');

  if (view === 'all') {
    renderAll();
  } else {
    const remaining = sortedDates();
    const prev = previousSheetDate(targetDate);
    const next = nextSheetDate(targetDate);
    const dest = prev || next || remaining[remaining.length - 1] || todayStr();
    go(`#/sheet/${dest}`);
    renderSheet();
  }
}

function bindSheet() {
  const tbody = $('#sheet-body');
  tbody.addEventListener('input', (e) => {
    if (e.target.matches('input.num')) onNumberInput(e.target.closest('tr'), e.target.dataset.field);
  });
  tbody.addEventListener('change', (e) => {
    if (e.target.matches('input.name')) onNameChange(e.target);
  });
  tbody.addEventListener('focusin', (e) => {
    if (e.target.matches('input.num')) setTimeout(() => e.target.select(), 0);
  });
  tbody.addEventListener('focusout', (e) => {
    if (pendingRerender && !tbody.contains(e.relatedTarget)) renderSheet();
    if (e.target.matches('input.num') && !e.target.classList.contains('invalid')) {
      const p = parseAmount(e.target.value);
      if (p.ok) e.target.value = e.target.dataset.field === 'price' ? p.value.toFixed(2) : String(p.value);
    }
  });
  tbody.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('input.cell-input')) return;
    e.preventDefault();
    if (e.target.matches('input.name')) e.target.blur();
    const tr = e.target.closest('tr');
    const target = (e.shiftKey ? tr.previousElementSibling : tr.nextElementSibling)?.querySelector(`[data-field="${e.target.dataset.field}"]`);
    target?.focus();
  });
  tbody.addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-action="delete"]');
    if (delBtn) return deleteRow(delBtn.closest('tr'));
    const editBtn = e.target.closest('[data-action="edit"]');
    if (editBtn) return openEditItem(editBtn.closest('tr'));
  });

  $('#prev-day').addEventListener('click', () => go(`#/sheet/${addDays(current, -1)}`));
  $('#next-day').addEventListener('click', () => go(`#/sheet/${addDays(current, 1)}`));
  $('#date-picker').addEventListener('change', (e) => isDateStr(e.target.value) && go(`#/sheet/${e.target.value}`));
  $('#go-today').addEventListener('click', () => go('#/'));
  $('#add-item').addEventListener('click', openAddItem);
  $('#carry-forward').addEventListener('click', openCarryForward);
  $('#new-day').addEventListener('click', newDay);
  $('#delete-sheet')?.addEventListener('click', () => deleteCurrentSheet(current));
}

// =====================================================================
// All Days view (FR-20..26)
// =====================================================================
const BATCH = 30;
let allDates = [];
let rendered = 0;
let observer;

function readonlyTable(sheet) {
  const rows = sheet.rows.length
    ? sheet.rows.map((r, i) => {
      const tot = totalStockOf(r);
      const bal = balanceOf(r);
      const sld = soldOf(r);
      const amt = amountOf(r);
      const { ghc, ghp } = splitGhcGhp(amt);
      return `<tr${sld < 0 ? ' class="row-error"' : ''}>
          <td class="c-no sticky-no">${i + 1}</td>
          <td class="sticky-item"><b>${esc(r.name)}</b></td>
          <td class="num">${fmtQty(r.opening)}</td>
          <td class="num">${fmtQty(r.receipt ?? r.added)}</td>
          <td class="calc">${fmtQty(tot)}</td>
          <td class="num">${fmtQty(bal)}</td>
          <td class="calc">${fmtQty(sld)}</td>
          <td class="num">${fmtMoney(r.price)}</td>
          <td class="calc money amt-ghc sticky-amt-ghc">${ghc}</td>
          <td class="calc money amt-ghp sticky-amt-ghp">${ghp}</td>
        </tr>`;
    }).join('')
    : '<tr class="empty-row"><td colspan="10">No items recorded on this day.</td></tr>';
  return `<div class="table-wrap"><table class="stock-table">
    <colgroup>
      <col class="col-no" />
      <col class="col-item" />
      <col class="col-opening" />
      <col class="col-receipt" />
      <col class="col-total" />
      <col class="col-balance" />
      <col class="col-sold" />
      <col class="col-price" />
      <col class="col-amt-ghc" />
      <col class="col-amt-ghp" />
    </colgroup>
    <thead>
      <tr>
        <th class="c-no sticky-no" rowspan="2">No.</th>
        <th class="sticky-item" rowspan="2">Item</th>
        <th class="num" rowspan="2">Opening Stock</th>
        <th class="num" rowspan="2">Receipt</th>
        <th class="num calc-h" rowspan="2">Total</th>
        <th class="num" rowspan="2">Stock Balance</th>
        <th class="num calc-h" rowspan="2">Stock Sold</th>
        <th class="num th-price" rowspan="2">
          <div class="th-stack">
            <span>Price</span>
            <span class="unit">${CURRENCY}</span>
          </div>
        </th>
        <th colspan="2" class="num amt-super sticky-amt-super">Amount</th>
      </tr>
      <tr class="sub-head">
        <th class="num amt-sub amt-ghc-h sticky-amt-ghc">GH₵</th>
        <th class="num amt-sub amt-ghp-h sticky-amt-ghp">GHp</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function daySection(date, index) {
  const sheet = getSheet(date);
  const total = fmtMoney(dailyTotalOf(sheet));
  const canDelete = date >= todayStr();
  const delBtnHTML = canDelete
    ? `<button type="button" class="day-del-btn" data-action="delete-day" data-date="${date}" aria-label="Delete sheet for ${date}" title="Delete sheet for this day">${ICON.del}</button>`
    : '';

  return `<article class="card day" id="day-${date}" style="animation-delay:${(index % BATCH) * 25}ms">
    <header class="day-head">
      <button type="button" class="day-link" data-date="${date}" title="Open this day to edit">
        <span class="day-num">Day ${index + 1}</span>
        <span><span class="day-date">${esc(formatLong(date))}</span><br><span class="day-edit">Tap to open and edit</span></span>
      </button>
      <div class="day-head-right">
        <span class="day-total-chip">${CURRENCY} ${total}</span>
        ${delBtnHTML}
      </div>
    </header>
    ${readonlyTable(sheet)}
    <footer class="day-foot"><span class="label">Daily Total</span><span class="value">${CURRENCY} ${total}</span></footer>
  </article>`;
}

function renderAll() {
  allDates = sortedDates();
  rendered = 0;
  const list = $('#all-list');
  list.innerHTML = '';
  if (!allDates.length) {
    $('#all-summary').textContent = 'No days recorded yet.';
    list.innerHTML = `<div class="empty-card"><div class="empty-icon">${ICON.sheet}</div><h2>No stock recorded yet</h2><p>Create today's sheet to begin. Every day you record will appear here, from Day 1 onward.</p><div class="empty-actions"><a class="btn primary" href="#/">Go to Today's Sheet</a></div></div>`;
    return;
  }
  $('#all-summary').textContent = `${allDates.length} day(s) recorded · Day 1 was ${formatLong(allDates[0])}`;
  $('#jump-date').min = allDates[0];
  $('#jump-date').max = allDates[allDates.length - 1];
  renderMore();
}

function renderMore() {
  if (rendered >= allDates.length) return;
  const slice = allDates.slice(rendered, rendered + BATCH);
  $('#all-list').insertAdjacentHTML('beforeend', slice.map((d, i) => daySection(d, rendered + i)).join(''));
  rendered += slice.length;
  $('#all-list .all-end')?.remove();
  if (rendered >= allDates.length) $('#all-list').insertAdjacentHTML('beforeend', '<p class="all-end">You have reached the latest day. New days appear here automatically.</p>');
}

function jumpTo(date) {
  if (!allDates.length || !isDateStr(date)) return;
  let idx = allDates.findIndex((d) => d >= date);
  if (idx === -1) idx = allDates.length - 1;
  if (allDates[idx] !== date) toast(`No sheet on ${formatShort(date)}. Showing ${formatShort(allDates[idx])}.`, 'warn');
  while (rendered <= idx) renderMore();
  const el = document.getElementById(`day-${allDates[idx]}`);
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('highlight');
  setTimeout(() => el.classList.remove('highlight'), 2200);
}

function bindAll() {
  observer = new IntersectionObserver((entries) => {
    if (view === 'all' && entries[0].isIntersecting) renderMore();
  }, { rootMargin: '800px 0px' });
  observer.observe($('#all-sentinel'));
  $('#all-list').addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-action="delete-day"]');
    if (delBtn) return deleteCurrentSheet(delBtn.dataset.date);
    const b = e.target.closest('.day-link');
    if (b) go(`#/sheet/${b.dataset.date}`);
  });
  $('#jump-go').addEventListener('click', () => jumpTo($('#jump-date').value));
  $('#jump-date').addEventListener('keydown', (e) => e.key === 'Enter' && jumpTo(e.target.value));
  $('#back-today').addEventListener('click', () => go('#/'));
  $('#all-export-csv').addEventListener('click', () => (sortedDates().length ? exportCSV(sortedDates()) : toast('Nothing to export yet.', 'warn')));
  $('#all-print').addEventListener('click', () => (sortedDates().length ? printSheets(sortedDates()) : toast('Nothing to print yet.', 'warn')));
}

// =====================================================================
// Settings
// =====================================================================
const SYNC_TEXT = {
  local: ['On this device', 'Data is saved on this device'],
  syncing: ['Syncing…', 'Sending and receiving changes'],
  synced: ['Synced', 'All changes are saved in the cloud'],
  offline: ['Offline', 'No internet. Changes are saved here and will sync later'],
  error: ['Sync problem', 'Could not sync'],
};

function renderSyncStatus(s, msg) {
  const pill = $('#sync-status');
  pill.dataset.state = s;
  $('.sync-text', pill).textContent = SYNC_TEXT[s][0];
  pill.title = msg ? `${SYNC_TEXT[s][1]}: ${msg}` : SYNC_TEXT[s][1];
  if (view === 'settings') renderCloudStatus(s, msg);
}

function renderCloudStatus(s = $('#sync-status').dataset.state, msg = '') {
  const el = $('#cloud-status');
  if (!cloudOn()) { el.textContent = 'Off. Data is kept on this device only.'; return; }
  const waiting = state.local.queue.length;
  el.textContent = `On · ${SYNC_TEXT[s][0]}${waiting ? ` · ${waiting} change(s) waiting` : ''}${msg ? ` · ${msg}` : ''}`;
}

function renderSettings() {
  $('#set-store-name').value = state.meta.storeName;
  const hasPin = !!state.meta.pinHash;
  $('#pin-status').textContent = hasPin ? 'PIN lock is on. The app asks for the PIN when it opens.' : 'No PIN set. Anyone with this device can edit stock.';
  $('#pin-actions').innerHTML = hasPin
    ? '<button type="button" class="btn ghost" id="pin-change">Change PIN</button><button type="button" class="btn danger-ghost" id="pin-remove">Remove PIN</button><button type="button" class="btn ghost" id="pin-lock">Lock now</button>'
    : '<button type="button" class="btn primary" id="pin-set">Set a PIN</button>';
  $('#pin-set')?.addEventListener('click', () => openPinModal('set'));
  $('#pin-change')?.addEventListener('click', () => openPinModal('change'));
  $('#pin-remove')?.addEventListener('click', () => openPinModal('remove'));
  $('#pin-lock')?.addEventListener('click', showLock);
  const lb = state.local.lastBackup;
  $('#backup-status').textContent = lb ? `Last backup downloaded: ${new Date(lb).toLocaleString('en-GB')}` : 'No backup downloaded on this device yet.';
  $('#cloud-url').value = state.local.cloud.url;
  $('#cloud-key').value = state.local.cloud.key;
  $('#cloud-sync-now').disabled = !cloudOn();
  $('#cloud-disconnect').disabled = !cloudOn();
  renderCloudStatus();
}

function openPinModal(mode) {
  const form = document.createElement('form');
  form.className = 'form-grid';
  form.noValidate = true;
  form.innerHTML = `
    ${mode !== 'set' ? '<label class="field">Current PIN<input type="password" id="pin-current" inputmode="numeric" maxlength="6" autocomplete="off"></label>' : ''}
    ${mode !== 'remove' ? '<label class="field">New PIN (4–6 digits)<input type="password" id="pin-new" inputmode="numeric" maxlength="6" autocomplete="off"></label><label class="field">Repeat new PIN<input type="password" id="pin-repeat" inputmode="numeric" maxlength="6" autocomplete="off"></label>' : ''}
    <p class="form-error" id="pin-error"></p>`;
  const err = $('#pin-error', form);
  const submit = (close) => {
    if (mode !== 'set' && hashPin($('#pin-current', form).value, state.meta.pinSalt) !== state.meta.pinHash) {
      err.textContent = 'Current PIN is wrong.'; return;
    }
    if (mode === 'remove') {
      state.meta.pinHash = null; state.meta.pinSalt = null; state.meta.pinLength = null;
    } else {
      const p = $('#pin-new', form).value;
      if (!/^\d{4,6}$/.test(p)) { err.textContent = 'PIN must be 4 to 6 digits.'; return; }
      if (p !== $('#pin-repeat', form).value) { err.textContent = 'The two PINs do not match.'; return; }
      state.meta.pinSalt = uid();
      state.meta.pinHash = hashPin(p, state.meta.pinSalt);
      state.meta.pinLength = p.length;
    }
    saveMeta();
    close();
    renderSettings();
    updateLockButton();
    toast(mode === 'remove' ? 'PIN removed.' : 'PIN saved.', 'success');
  };
  const m = openModal({
    title: mode === 'set' ? 'Set a PIN' : mode === 'change' ? 'Change PIN' : 'Remove PIN',
    body: form,
    actions: [
      { label: 'Cancel', onClick: (c) => c() },
      { label: mode === 'remove' ? 'Remove PIN' : 'Save PIN', kind: mode === 'remove' ? 'danger' : 'primary', onClick: submit },
    ],
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(m.close); });
  form.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(m.close); } });
}

function bindSettings() {
  $('#save-store').addEventListener('click', () => {
    const name = $('#set-store-name').value.trim();
    if (!name) return toast('Store name is required.', 'error');
    state.meta.storeName = name;
    saveMeta();
    applyStoreName();
    toast('Store name saved.', 'success');
  });

  const needSheet = (fn) => () => (getSheet(current) ? fn() : toast(`No sheet for ${formatShort(current)}.`, 'warn'));
  const needAny = (fn) => () => (sortedDates().length ? fn() : toast('Nothing recorded yet.', 'warn'));
  $('#exp-csv-day').addEventListener('click', needSheet(() => exportCSV([current])));
  $('#exp-csv-all').addEventListener('click', needAny(() => exportCSV(sortedDates())));
  $('#exp-pdf-day').addEventListener('click', needSheet(() => printSheets([current])));
  $('#exp-pdf-all').addEventListener('click', needAny(() => printSheets(sortedDates())));

  $('#backup-download').addEventListener('click', async () => {
    await flush();
    downloadBackup();
    renderSettings();
    toast('Backup downloaded. Keep it somewhere safe (e.g. Google Drive or WhatsApp to yourself).', 'success', { duration: 6000 });
  });
  $('#backup-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== 'fd-abrante3-spot2') throw new Error('This file is not an FD ABRANTE3 SPOT 2 backup.');
      const ok = await confirmDialog({
        title: 'Restore backup?',
        message: `This replaces <b>all</b> stock on this device with the backup from <b>${esc(new Date(data.exportedAt).toLocaleString('en-GB'))}</b> (${data.sheets.length} day(s), ${(data.items || []).length} item(s)).${cloudOn() ? ' The restored data will also be sent to the cloud.' : ''}`,
        okLabel: 'Restore',
        kind: 'danger',
      });
      if (!ok) return;
      await restoreAll(data);
      applyStoreName();
      refreshDatalist();
      updateLockButton();
      renderSettings();
      toast('Backup restored.', 'success');
    } catch (err) {
      toast(err.message || 'Could not read that file.', 'error', { duration: 6000 });
    }
  });

  $('#cloud-connect').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const url = $('#cloud-url').value.trim().replace(/\/+$/, '');
    const key = $('#cloud-key').value.trim();
    if (!/^https:\/\/.+/.test(url)) return toast('Enter the Supabase project URL (starts with https://).', 'error');
    if (!key) return toast('Enter the Supabase anon key.', 'error');
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    try {
      await testConnection(url, key);
      state.local.cloud = { url, key, enabled: true };
      state.local.lastPull = null;
      queueAll();
      saveLocal();
      await syncNow();
      toast('Connected. Stock is now shared with your other devices.', 'success');
    } catch (err) {
      toast(err.message, 'error', { duration: 7000 });
    } finally {
      btn.disabled = false;
      btn.textContent = 'Connect & Sync';
      renderSettings();
    }
  });
  $('#cloud-sync-now').addEventListener('click', () => syncNow());
  $('#cloud-disconnect').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Turn off cloud sync?',
      message: 'This device will stop sharing changes. Data already on this device stays here.',
      okLabel: 'Turn off',
      kind: 'danger',
    });
    if (!ok) return;
    state.local.cloud.enabled = false;
    saveLocal();
    syncNow();
    renderSettings();
  });
  $('#copy-sql').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#sql-setup').textContent);
      toast('SQL copied.', 'success');
    } catch {
      toast('Select the SQL and copy it manually.', 'warn');
    }
  });
  $('#sync-status').addEventListener('click', () => go('#/settings'));
}

// =====================================================================
// PIN lock
// =====================================================================
let pinBuf = '';

function updateLockButton() {
  $('#lock-now').classList.toggle('hidden', !state.meta.pinHash);
}

function renderDots() {
  const len = state.meta.pinLength || 4;
  $('#pin-dots').innerHTML = Array.from({ length: Math.max(len, pinBuf.length) }, (_, i) => `<span class="${i < pinBuf.length ? 'on' : ''}"></span>`).join('');
}

function showLock() {
  if (!state.meta.pinHash) return;
  pinBuf = '';
  renderDots();
  $('#lock-screen').classList.remove('hidden');
}

function pinKey(k) {
  if (k === 'back') pinBuf = pinBuf.slice(0, -1);
  else if (k === 'clear') pinBuf = '';
  else if (/^\d$/.test(k) && pinBuf.length < 6) pinBuf += k;
  renderDots();
  const len = state.meta.pinLength || 0;
  if (pinBuf.length >= 4 && (pinBuf.length === len || !len)) {
    if (hashPin(pinBuf, state.meta.pinSalt) === state.meta.pinHash) {
      $('#lock-screen').classList.add('hidden');
      pinBuf = '';
    } else if (len || pinBuf.length === 6) {
      const dots = $('#pin-dots');
      dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
      setTimeout(() => { pinBuf = ''; renderDots(); }, 380);
    }
  }
}

function bindLock() {
  $('#keypad').addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (b) pinKey(b.dataset.key);
  });
  document.addEventListener('keydown', (e) => {
    if ($('#lock-screen').classList.contains('hidden')) return;
    if (/^\d$/.test(e.key)) pinKey(e.key);
    else if (e.key === 'Backspace') pinKey('back');
    else if (e.key === 'Escape') pinKey('clear');
    else return;
    e.preventDefault();
  });
  $('#lock-now').addEventListener('click', showLock);
}

// =====================================================================
// Cloud changes from other devices
// =====================================================================
function handleRemote(ids) {
  if (ids.includes('meta')) { applyStoreName(); updateLockButton(); }
  if (ids.some((id) => id.startsWith('item:'))) refreshDatalist();
  const sheetIds = ids.filter((id) => id.startsWith('sheet:'));
  if (view === 'sheet' && (sheetIds.includes(`sheet:${current}`) || sheetIds.length)) {
    if ($('#sheet-body').contains(document.activeElement)) pendingRerender = true;
    else renderSheet();
  }
  if (view === 'all' && sheetIds.length) renderAll();
  if (view === 'settings') renderSettings();
}

// =====================================================================
// Start
// =====================================================================
function backupReminder() {
  if (cloudOn() || sortedDates().length < 3) return;
  const lb = state.local.lastBackup;
  if (lb && Date.now() - lb < 7 * 864e5) return;
  toast('Tip: download a backup of your stock regularly.', 'warn', { duration: 8000, action: { label: 'Back up', onClick: () => go('#/settings') } });
}

function initAutoHideScrollbars() {
  const scrollTimers = new WeakMap();

  const markScrolling = (el) => {
    if (!el || !el.classList) return;
    el.classList.add('is-scrolling');
    const existing = scrollTimers.get(el);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      el.classList.remove('is-scrolling');
    }, 900);
    scrollTimers.set(el, timer);
  };

  // Capture all scroll events across any scrollable element (table, views, modals)
  window.addEventListener(
    'scroll',
    (e) => {
      const target = e.target;
      const el = (!target || target === document || target === document.documentElement)
        ? document.body
        : (target.nodeType === 1 ? target : null);
      markScrolling(el);
    },
    { capture: true, passive: true }
  );

  // Also trigger immediately on wheel for instant visual feedback over scrollable regions
  window.addEventListener(
    'wheel',
    (e) => {
      let el = e.target;
      while (el && el !== document.body) {
        if (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) {
          markScrolling(el);
          break;
        }
        el = el.parentElement;
      }
    },
    { capture: true, passive: true }
  );
}

async function init() {
  initAutoHideScrollbars();
  try {
    await load();
  } catch (e) {
    console.error(e);
    toast('Could not open storage on this device. Data may not be saved.', 'error', { duration: 10000 });
  }
  applyStoreName();
  refreshDatalist();
  updateLockButton();
  bindSheet();
  bindAll();
  bindSettings();
  bindLock();
  onRemoteChange(handleRemote);
  onStatus(renderSyncStatus);
  startSync();
  if (state.meta.pinHash) showLock();
  window.addEventListener('hashchange', route);
  route();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else if (view === 'sheet' && !location.hash.startsWith('#/sheet/') && current !== todayStr()) route();
  });
  window.addEventListener('pagehide', () => flush());

  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && secure) navigator.serviceWorker.register('sw.js').catch(() => { });
  setTimeout(backupReminder, 2500);
}

init();

