import test from 'node:test';
import assert from 'node:assert/strict';
import { masters, demoReports } from '../src/data/demo.js';
import { workedMinutes, validateReport, upsertReport, summarize } from '../src/domain/reports.js';

test('実働は分で計算し、給与用の丸めを加えない', () => {
  assert.equal(workedMinutes(demoReports()[0]), 480);
  assert.equal(workedMinutes({ start: '08:13', end: '17:02', breakMinutes: 57 }), 472);
});

test('日またぎ・不正時刻・過剰休憩を勝手に補完しない', () => {
  for (const patch of [{ end: '07:00' }, { start: '24:00' }, { start: '' }, { breakMinutes: 540 }, { breakMinutes: -1 }, { breakMinutes: 0.5 }]) {
    assert.equal(workedMinutes({ ...demoReports()[0], ...patch }), null);
  }
});

test('不正な日付・マスタ・未入力を拒否する', () => {
  assert.deepEqual(validateReport(demoReports()[0], masters), []);
  for (const patch of [{ date: '2026-02-30' }, { date: 'abc' }, { employeeId: 'UNKNOWN' }, { siteId: '' }, { work: '  ' }]) {
    assert.ok(validateReport({ ...demoReports()[0], ...patch }, masters).length > 0);
  }
});

test('運搬数量・単位・IDを検証する', () => {
  for (const patch of [{ quantity: 0 }, { quantity: -1 }, { quantity: NaN }, { quantity: Infinity }, { quantity: 1.5, unit: 'trip' }, { unit: 'unknown' }, { driverId: '' }, { destinationId: 'UNKNOWN' }]) {
    const report = demoReports()[0]; Object.assign(report.hauls[0], patch);
    assert.ok(validateReport(report, masters).length > 0);
  }
  const duplicate = demoReports()[0];
  duplicate.hauls.push(structuredClone(duplicate.hauls[0]));
  assert.ok(validateReport(duplicate, masters).length > 0);
});

test('給油量の欠落・負数を検証する', () => {
  for (const liters of [0, -3, NaN, Infinity, undefined]) {
    const report = demoReports()[0]; report.fuels[0].liters = liters;
    assert.ok(validateReport(report, masters).length > 0);
  }
});

test('架空サンプルの日報を5種類の台帳へ連動する', () => {
  const result = summarize(demoReports(), '2026-11');
  assert.deepEqual(result.attendance.map(row => row.workedMinutes), [480, 420]);
  assert.deepEqual(result.payroll.map(row => row.days), [1, 1]);
  assert.equal(result.transport.length, 1);
  assert.equal(result.transport[0].reportId, 'DEMO-REPORT-A');
  assert.equal(result.disposal[0].quantity, 3);
  assert.deepEqual(result.fuel.map(row => row.liters), [25, 18]);
});

test('給与・処分金額の不明値は0円ではなくnullと要確認を保つ', () => {
  const result = summarize(demoReports());
  for (const row of [...result.payroll, ...result.disposal]) {
    assert.equal(row.amount, null);
    assert.match(row.status, /要確認/);
  }
});

test('月フィルターを全台帳へ適用する', () => {
  const result = summarize(demoReports(), '2026-12');
  for (const rows of Object.values(result)) assert.deepEqual(rows, []);
});

test('全期間表示でも給与資料の月を混ぜない', () => {
  const reports = demoReports();
  const nextMonth = structuredClone(reports[0]); nextMonth.id = 'NEXT'; nextMonth.date = '2026-12-01';
  const result = summarize(upsertReport(reports, nextMonth, masters));
  const employee = result.payroll.filter(row => row.employeeId === 'DEMO-001');
  assert.deepEqual(employee.map(row => row.month), ['2026-11', '2026-12']);
  assert.deepEqual(employee.map(row => row.workedMinutes), [480, 480]);
});

test('修正を繰り返しても同一IDは二重集計しない', () => {
  const original = demoReports();
  const report = structuredClone(original[0]); report.hauls[0].quantity = 5; report.fuels[0].liters = 30; report.breakMinutes = 90;
  let updated = upsertReport(original, report, masters);
  updated = upsertReport(updated, report, masters);
  const result = summarize(updated);
  assert.equal(updated.length, 2);
  assert.equal(result.disposal[0].quantity, 5);
  assert.equal(result.fuel[0].liters, 30);
  assert.equal(result.attendance[0].workedMinutes, 450);
  assert.equal(original[0].hauls[0].quantity, 3);
});

test('修正で明細を消すと集計にも残らない', () => {
  const reports = demoReports();
  const report = { ...reports[0], hauls: [], fuels: [] };
  const result = summarize(upsertReport(reports, report, masters));
  assert.deepEqual(result.transport, []);
  assert.deepEqual(result.disposal, []);
  assert.equal(result.fuel.length, 1);
  assert.equal(result.fuel[0].assetId, 'MACHINE-A');
});

test('同じ社員の重なる勤務日報を拒否する', () => {
  const reports = demoReports();
  const duplicate = { ...reports[0], id: 'DUPLICATE', siteId: 'SITE-B' };
  assert.throws(() => upsertReport(reports, duplicate, masters), /勤務時間が重なる/);
});

test('重ならない複数現場の日報は合計し、出勤日数は重複させない', () => {
  const first = { ...demoReports()[0], start: '08:00', end: '12:00', breakMinutes: 0, hauls: [], fuels: [] };
  const second = { ...first, id: 'AFTERNOON', siteId: 'SITE-B', start: '13:00', end: '17:00' };
  const reports = upsertReport(upsertReport([], first, masters), second, masters);
  const result = summarize(reports);
  assert.equal(result.attendance.length, 2);
  assert.equal(result.payroll[0].workedMinutes, 480);
  assert.equal(result.payroll[0].days, 1);
});

test('処分数量の単位・処分場・材種・現場を混ぜない', () => {
  const report = demoReports()[0];
  const haul = report.hauls[0];
  report.hauls.push({ ...haul, id: 'T', quantity: 1.2, unit: 't' }, { ...haul, id: 'TRIP', quantity: 2, unit: 'trip' }, { ...haul, id: 'YARD', destinationId: 'YARD-B' }, { ...haul, id: 'MIX', materialId: 'MIXED' });
  const second = { ...structuredClone(report), id: 'OTHER-SITE', date: '2026-11-03', siteId: 'SITE-B', hauls: [{ ...haul, id: 'B' }] };
  const result = summarize([report, second]);
  assert.equal(result.disposal.length, 6);
  assert.equal(result.disposal.find(row => row.unit === 't').quantity, 1.2);
});

test('運転手を入力社員と別に保持できる', () => {
  const report = demoReports()[0]; report.hauls[0].driverId = 'DEMO-002';
  assert.deepEqual(validateReport(report, masters), []);
  assert.equal(summarize([report]).transport[0].driverId, 'DEMO-002');
});

test('給油小数を車両ごとに合計し、元日報へたどれる', () => {
  const report = demoReports()[0];
  report.fuels = [{ id: 'A', assetId: 'TRUCK-A', liters: 0.1 }, { id: 'B', assetId: 'TRUCK-A', liters: 0.2 }];
  const result = summarize([report]);
  assert.equal(result.fuel[0].liters, 0.3);
  assert.equal(result.fuel[0].records.length, 2);
  assert.equal(result.fuel[0].records[1].reportId, report.id);
});
