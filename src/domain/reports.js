const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const round = value => Math.round((value + Number.EPSILON) * 1000) / 1000;

export function workedMinutes(report) {
  if (!validTime(report.start) || !validTime(report.end) || !Number.isInteger(report.breakMinutes) || report.breakMinutes < 0) return null;
  const duration = minutes(report.end) - minutes(report.start);
  if (duration <= 0 || report.breakMinutes >= duration) return null;
  return duration - report.breakMinutes;
}

export function validateReport(report, masters) {
  const errors = [];
  const exists = (kind, id) => masters[kind].some(item => item.id === id);
  if (!nonempty(report.id)) errors.push('日報IDが必要。');
  const date = typeof report.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(report.date) ? new Date(`${report.date}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== report.date) errors.push('正しい作業日を入力してね。');
  if (!exists('employees', report.employeeId)) errors.push('社員を選択してね。');
  if (!exists('sites', report.siteId)) errors.push('現場を選択してね。');
  if (!nonempty(report.work) || report.work.length > 1000) errors.push('作業内容を1〜1000文字で入力してね。');
  if (workedMinutes(report) === null) errors.push('出勤・退社・休憩を確認してね。試作では同日内で、実働が1分以上の記録に対応。');
  if (!Array.isArray(report.hauls) || !Array.isArray(report.fuels)) return [...errors, '運搬・給油明細の形式が不正。'];
  const childIds = new Set();
  for (const haul of report.hauls) {
    if (!nonempty(haul.id) || childIds.has(haul.id)) errors.push('明細IDが重複または未設定。');
    childIds.add(haul.id);
    if (!nonempty(haul.from) || haul.from.length > 200 || !exists('destinations', haul.destinationId) || !exists('materials', haul.materialId) || !exists('assets', haul.assetId) || !exists('employees', haul.driverId)) errors.push('運搬の出発地・処分場・材種・車両・運転手を確認してね。');
    if (!positive(haul.quantity) || !exists('units', haul.unit) || (haul.unit === 'trip' && !Number.isInteger(haul.quantity))) errors.push('運搬数量は正の数、台数は整数で入力してね。');
  }
  for (const fuel of report.fuels) {
    if (!nonempty(fuel.id) || childIds.has(fuel.id)) errors.push('明細IDが重複または未設定。');
    childIds.add(fuel.id);
    if (!exists('assets', fuel.assetId) || !positive(fuel.liters)) errors.push('給油する車両・重機と、0より大きい給油量を入力してね。');
  }
  return [...new Set(errors)];
}

export function upsertReport(reports, report, masters) {
  const errors = validateReport(report, masters);
  if (errors.length) throw new Error(errors.join('\n'));
  // 同一社員の時間が重なる日報を二重集計しない。休憩区間は不明なため勤務区間全体で判定。
  if (reports.some(other => other.id !== report.id && other.employeeId === report.employeeId && other.date === report.date && minutes(other.start) < minutes(report.end) && minutes(report.start) < minutes(other.end))) {
    throw new Error('同じ社員の勤務時間が重なる日報があるよ。既存日報を修正するか、時刻を確認してね。');
  }
  const next = structuredClone(report);
  return reports.some(item => item.id === report.id) ? reports.map(item => item.id === report.id ? next : item) : [...reports, next];
}

export function summarize(reports, month = '') {
  const selected = reports.filter(report => !month || report.date.slice(0, 7) === month);
  const attendance = selected.map(report => ({ reportId: report.id, date: report.date, employeeId: report.employeeId, siteId: report.siteId, start: report.start, end: report.end, breakMinutes: report.breakMinutes, workedMinutes: workedMinutes(report) }));
  const payrollMap = new Map();
  const disposalMap = new Map();
  const fuelMap = new Map();
  const transport = [];
  for (const report of selected) {
    const payrollKey = JSON.stringify([report.employeeId, report.date.slice(0, 7)]);
    const pay = payrollMap.get(payrollKey) || { employeeId: report.employeeId, month: report.date.slice(0, 7), workedMinutes: 0, days: new Set(), amount: null, status: '要確認：給与・残業ルール未設定' };
    pay.workedMinutes += workedMinutes(report);
    pay.days.add(report.date);
    payrollMap.set(payrollKey, pay);
    for (const haul of report.hauls) {
      transport.push({ ...haul, reportId: report.id, date: report.date, siteId: report.siteId });
      const key = JSON.stringify([report.siteId, haul.destinationId, haul.materialId, haul.unit]);
      const row = disposalMap.get(key) || { siteId: report.siteId, destinationId: haul.destinationId, materialId: haul.materialId, unit: haul.unit, quantity: 0, amount: null, status: '要確認：単価・計量基準未設定' };
      row.quantity = round(row.quantity + haul.quantity);
      disposalMap.set(key, row);
    }
    for (const fuel of report.fuels) {
      const row = fuelMap.get(fuel.assetId) || { assetId: fuel.assetId, liters: 0, records: [] };
      row.liters = round(row.liters + fuel.liters);
      row.records.push({ ...fuel, reportId: report.id, date: report.date, siteId: report.siteId });
      fuelMap.set(fuel.assetId, row);
    }
  }
  return { attendance, payroll: [...payrollMap.values()].map(({ days, ...row }) => ({ ...row, days: days.size })), transport, disposal: [...disposalMap.values()], fuel: [...fuelMap.values()] };
}
