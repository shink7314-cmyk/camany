import { masters, demoReports } from '../data/demo.js';
import { upsertReport, summarize } from '../domain/reports.js';

let reports = [];
let editingId = null;
let activeScreen = 'daily';
const $ = selector => document.querySelector(selector);
const form = $('#report-form');
const name = (kind, id) => masters[kind].find(item => item.id === id)?.name || '要確認';
const duration = value => value === null ? '要確認' : `${Math.floor(value / 60)}時間${value % 60}分`;
const el = (tag, value, className) => { const node = document.createElement(tag); if (value !== undefined) node.textContent = value; if (className) node.className = className; return node; };
const message = (value, error = false) => { $('#status').textContent = value; $('#status').className = error ? 'error' : ''; };

function populate(select, kind, value = '') {
  select.append(new Option('選択してね', ''));
  for (const item of masters[kind]) select.append(new Option(kind === 'employees' ? `${item.id} / ${item.name}` : item.name, item.id));
  select.value = value;
}
populate(form.elements.employeeId, 'employees');
populate(form.elements.siteId, 'sites');

function addEntry(kind, initial = {}) {
  const wrapper = el('div', undefined, 'entry');
  wrapper.dataset.id = initial.id || crypto.randomUUID();
  const grid = el('div', undefined, 'grid');
  const fields = kind === 'hauls' ? [
    ['from', '出発地', 'text'], ['destinationId', '処分場', 'destinations'], ['materialId', '材種', 'materials'],
    ['quantity', '数量', 'number'], ['unit', '数量単位', 'units'], ['assetId', '車両', 'assets'], ['driverId', '運転手', 'employees']
  ] : [['assetId', '車両・重機', 'assets'], ['liters', '給油量（L）', 'number']];
  for (const [key, label, type] of fields) {
    const caption = el('label', label);
    const control = el(masters[type] ? 'select' : 'input');
    control.dataset.field = key;
    control.required = true;
    if (masters[type]) populate(control, type, initial[key]);
    else { control.type = type; control.value = initial[key] ?? ''; if (type === 'number') { control.min = '0.001'; control.step = '0.001'; } else control.maxLength = 200; }
    caption.append(control);
    grid.append(caption);
  }
  const remove = el('button', 'この明細を削除');
  remove.type = 'button';
  remove.addEventListener('click', () => wrapper.remove());
  wrapper.append(grid, remove);
  $(`#${kind}`).append(wrapper);
}
$('#add-haul').addEventListener('click', () => addEntry('hauls'));
$('#add-fuel').addEventListener('click', () => addEntry('fuels'));

function readEntries(kind) {
  return [...$(`#${kind}`).children].map(wrapper => {
    const row = { id: wrapper.dataset.id };
    for (const input of wrapper.querySelectorAll('[data-field]')) row[input.dataset.field] = input.type === 'number' ? Number(input.value) : input.value.trim();
    return row;
  });
}

function resetForm() {
  editingId = null;
  form.reset();
  $('#hauls').replaceChildren();
  $('#fuels').replaceChildren();
  $('#save-report').textContent = '日報を反映する（試作）';
}
$('#reset-form').addEventListener('click', () => { resetForm(); message('入力欄をクリアしたよ。反映済みの日報は残っているよ。'); });

form.addEventListener('submit', event => {
  event.preventDefault();
  const report = { id: editingId || crypto.randomUUID(), hauls: readEntries('hauls'), fuels: readEntries('fuels') };
  for (const key of ['date', 'employeeId', 'siteId', 'start', 'end', 'work']) report[key] = form.elements[key].value.trim();
  report.breakMinutes = Number(form.elements.breakMinutes.value);
  try {
    reports = upsertReport(reports, report, masters);
    $('#month').value = report.date.slice(0, 7);
    resetForm(); render(); message('日報を反映したよ。各管理画面で確認できるよ（このタブ内のみ）。');
  } catch (error) { message(error.message, true); }
});

function table(headers, rows) {
  if (!rows.length) return el('p', 'この期間の記録はまだないよ。日報を入力するか、架空サンプルを読み込んでね。', 'empty');
  const wrap = el('div', undefined, 'table-wrap');
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', '集計表（横にスクロールできるよ）');
  const t = el('table'); const head = el('thead'); const heading = el('tr');
  headers.forEach(text => { const th = el('th', text); th.scope = 'col'; heading.append(th); });
  head.append(heading); t.append(head);
  const body = el('tbody');
  for (const row of rows) { const tr = el('tr'); for (const value of row) { const td = el('td'); if (value instanceof Node) td.append(value); else td.textContent = value; tr.append(td); } body.append(tr); }
  t.append(body); wrap.append(t); return wrap;
}

function editReport(report) {
  resetForm();
  editingId = report.id;
  for (const key of ['date', 'employeeId', 'siteId', 'start', 'end', 'work', 'breakMinutes']) form.elements[key].value = report[key];
  report.hauls.forEach(row => addEntry('hauls', row));
  report.fuels.forEach(row => addEntry('fuels', row));
  $('#save-report').textContent = '修正を反映する（試作）';
  message('日報を修正中。反映すると元の日報を更新するよ。');
  form.elements.date.focus();
}

function render() {
  const month = $('#month').value;
  const data = summarize(reports, month);
  $('#report-count').textContent = `日報 ${data.attendance.length}件 / 全${reports.length}件`;
  $('#daily').hidden = activeScreen !== 'daily';
  $('#ledger').hidden = activeScreen === 'daily';
  for (const button of document.querySelectorAll('[data-screen]')) {
    if (button.dataset.screen === activeScreen) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
  const selected = reports.filter(report => !month || report.date.startsWith(month));
  $('#report-list').replaceChildren(table(['作業日', '社員', '現場', '作業内容', '操作'], selected.map(report => {
    const edit = el('button', '修正'); edit.type = 'button'; edit.setAttribute('aria-label', `${report.date} ${name('employees', report.employeeId)}の日報を修正`); edit.addEventListener('click', () => editReport(report));
    return [report.date, name('employees', report.employeeId), name('sites', report.siteId), report.work, edit];
  })));
  if (activeScreen === 'daily') return;
  const screens = {
    attendance: ['出勤簿', '日報ごとの出退勤・休憩・参考実働。端数処理・残業区分は要確認。', ['作業日', '社員', '現場', '出勤', '退社', '休憩（分）', '参考実働'], data.attendance.map(row => [row.date, name('employees', row.employeeId), name('sites', row.siteId), row.start, row.end, row.breakMinutes, duration(row.workedMinutes)])],
    payroll: ['給与資料', '月別・社員別の勤務資料。給与額・残業手当・控除は未計算。出勤日数は記録された作業日の種類数。', ['対象月', '社員', '記録上の出勤日数', '参考実働', '支給額'], data.payroll.map(row => [row.month, name('employees', row.employeeId), row.days, duration(row.workedMinutes), row.status])],
    transport: ['運行管理', '運搬明細を日報から表示。現段階では処分場への運搬だけに対応。法定運行記録としての項目は要確認。', ['作業日', '出発地', '運搬先', '材種', '数量', '単位', '車両', '運転手'], data.transport.map(row => [row.date, row.from, name('destinations', row.destinationId), name('materials', row.materialId), row.quantity, name('units', row.unit), name('assets', row.assetId), name('employees', row.driverId)])],
    disposal: ['処分費', '現場・処分場・材種・単位別に数量を集計。m³・t・台は合算しない。金額は単価・計量基準の確認後に実装。', ['現場', '処分場', '材種', '数量', '単位', '処分金額'], data.disposal.map(row => [name('sites', row.siteId), name('destinations', row.destinationId), name('materials', row.materialId), row.quantity, name('units', row.unit), row.status])],
    fuel: ['燃料管理', '車両・重機ごとの給油量。燃料代・燃費・タンク残量は未計算。', ['車両・重機', '給油量（L）', '給油回数'], data.fuel.map(row => [name('assets', row.assetId), row.liters, row.records.length])]
  };
  const [title, note, headers, rows] = screens[activeScreen];
  $('#ledger-title').textContent = title; $('#ledger-note').textContent = note;
  $('#ledger-content').replaceChildren(table(headers, rows));
  if (activeScreen === 'fuel') {
    $('#ledger-content').append(el('h3', '給油明細'), table(['作業日', '現場', '車両・重機', '給油量（L）'], data.fuel.flatMap(row => row.records.map(record => [record.date, name('sites', record.siteId), name('assets', record.assetId), record.liters]))));
  }
}

for (const button of document.querySelectorAll('[data-screen]')) button.addEventListener('click', () => { activeScreen = button.dataset.screen; render(); });
$('#month').addEventListener('change', render);
$('#load-demo').addEventListener('click', () => {
  if (reports.length || editingId || [...form.querySelectorAll('input, textarea, select')].some(input => input.value)) {
    message('サンプル読込は空の状態で使えるよ。現在の入力を残すため、読込しなかったよ。', true); return;
  }
  reports = demoReports().reduce((all, report) => upsertReport(all, report, masters), []);
  $('#month').value = '2026-11'; render(); message('架空の日報2件を読み込んだよ。修正と各画面への反映を試せるよ。');
});
window.addEventListener('beforeunload', event => { if (reports.length) { event.preventDefault(); event.returnValue = ''; } });
render();
