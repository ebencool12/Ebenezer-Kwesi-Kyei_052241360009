// Export to Excel (CSV), print / save as PDF, and JSON backups.

import { state, getSheet, exportAll, saveLocal } from './state.js';
import { totalStockOf, soldOf, balanceOf, amountOf, splitGhcGhp, dailyTotalOf, fmtMoney, fmtQty, formatLong, esc, CURRENCY } from './util.js';

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

const fileBase = () => (state.meta.storeName || 'FD ABRANTE3 SPOT 2').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
const range = (dates) => (dates.length === 1 ? dates[0] : `${dates[0]}_to_${dates[dates.length - 1]}`);

/** CSV opens directly in Excel. Raw numbers so Excel can calculate with them. */
export function exportCSV(dates) {
  const q = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [[
    'Date', 'No.', 'Item', 'Opening Stock', 'Receipt', 'Total', 'Stock Balance', 'Stock Sold',
    `Price (${CURRENCY})`, 'Amount GH₵', 'Amount GHp', `Total Amount (${CURRENCY})`,
  ].map(q).join(',')];
  for (const d of dates) {
    const sheet = getSheet(d);
    if (!sheet) continue;
    sheet.rows.forEach((r, i) => {
      const tot = totalStockOf(r);
      const bal = balanceOf(r);
      const sld = soldOf(r);
      const amt = amountOf(r);
      const { ghc, ghp } = splitGhcGhp(amt);
      lines.push([
        d, i + 1, r.name, r.opening, r.receipt ?? r.added, tot, bal, sld, r.price.toFixed(2), ghc, ghp, amt.toFixed(2)
      ].map(q).join(','));
    });
    const dt = dailyTotalOf(sheet);
    const { ghc: dtGhc, ghp: dtGhp } = splitGhcGhp(dt);
    lines.push([d, '', 'DAILY TOTAL', '', '', '', '', '', '', dtGhc, dtGhp, dt.toFixed(2)].map(q).join(','));
    lines.push('');
  }
  download(`${fileBase()}_stock_${range(dates)}.csv`, '\ufeff' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}

export function printSheets(dates) {
  const root = document.getElementById('print-root');
  const store = esc(state.meta.storeName);
  root.innerHTML = dates
    .map((d) => {
      const sheet = getSheet(d);
      if (!sheet) return '';
      const rows = sheet.rows
        .map((r, i) => {
          const tot = totalStockOf(r);
          const bal = balanceOf(r);
          const sld = soldOf(r);
          const amt = amountOf(r);
          const { ghc, ghp } = splitGhcGhp(amt);
          return `<tr>
            <td>${i + 1}</td>
            <td>${esc(r.name)}</td>
            <td class="num">${fmtQty(r.opening)}</td>
            <td class="num">${fmtQty(r.receipt ?? r.added)}</td>
            <td class="num">${fmtQty(tot)}</td>
            <td class="num">${fmtQty(bal)}</td>
            <td class="num">${fmtQty(sld)}</td>
            <td class="num">${fmtMoney(r.price)}</td>
            <td class="num" style="border-right:1px dashed #bbb">${ghc}</td>
            <td class="num" style="text-align:center">${ghp}</td>
          </tr>`;
        })
        .join('');
      const dt = dailyTotalOf(sheet);
      const { ghc: dtGhc, ghp: dtGhp } = splitGhcGhp(dt);
      return `<section class="p-day">
        <div class="p-head"><h2 class="p-store">${store}</h2><span class="p-date">${esc(formatLong(d))}</span></div>
        <table class="p-table">
          <thead>
            <tr>
              <th rowspan="2">No.</th>
              <th rowspan="2">Item</th>
              <th class="num" rowspan="2">Opening</th>
              <th class="num" rowspan="2">Receipt</th>
              <th class="num" rowspan="2">Total</th>
              <th class="num" rowspan="2">Balance</th>
              <th class="num" rowspan="2">Sold</th>
              <th class="num" rowspan="2">Price (${CURRENCY})</th>
              <th colspan="2" class="num" style="text-align:center">Amount</th>
            </tr>
            <tr>
              <th class="num" style="width:65px">GH₵</th>
              <th class="num" style="width:45px;text-align:center">GHp</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="10">No items</td></tr>'}</tbody>
          <tfoot>
            <tr class="p-total">
              <td colspan="8" class="num">Daily Total</td>
              <td class="num" style="border-right:1px dashed #bbb">${dtGhc}</td>
              <td class="num" style="text-align:center">${dtGhp}</td>
            </tr>
          </tfoot>
        </table>
        <div class="p-meta">${sheet.rows.length} items</div>
      </section>`;
    })
    .join('');
  const cleanup = () => { root.innerHTML = ''; window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => window.print(), 50);
}

export function downloadBackup() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  download(`${fileBase()}_backup_${stamp}.json`, JSON.stringify(exportAll()), 'application/json');
  state.local.lastBackup = Date.now();
  saveLocal();
}
