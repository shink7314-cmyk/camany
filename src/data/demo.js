// このファイルには架空データだけを置く。
export const masters = {
  employees: [{ id: 'DEMO-001', name: 'テスト社員A' }, { id: 'DEMO-002', name: 'テスト社員B' }],
  sites: [{ id: 'SITE-A', name: 'サンプル現場A' }, { id: 'SITE-B', name: 'サンプル現場B' }],
  assets: [{ id: 'TRUCK-A', name: 'サンプル車両A（ダンプ）' }, { id: 'MACHINE-A', name: 'サンプル重機A' }],
  destinations: [{ id: 'YARD-A', name: 'サンプル処分場A' }, { id: 'YARD-B', name: 'サンプル処分場B' }],
  materials: [{ id: 'WOOD', name: '木くず' }, { id: 'MIXED', name: '混合' }, { id: 'RC', name: 'RCガラ' }],
  units: [{ id: 'm3', name: 'm³' }, { id: 't', name: 't' }, { id: 'trip', name: '台（運搬回数）' }]
};

export function demoReports() {
  return [
    { id: 'DEMO-REPORT-A', date: '2026-11-02', employeeId: 'DEMO-001', siteId: 'SITE-A', work: '架空の解体作業', start: '08:00', end: '17:00', breakMinutes: 60,
      hauls: [{ id: 'HAUL-A', from: 'サンプル現場A', destinationId: 'YARD-A', materialId: 'WOOD', quantity: 3, unit: 'm3', assetId: 'TRUCK-A', driverId: 'DEMO-001' }],
      fuels: [{ id: 'FUEL-A', assetId: 'TRUCK-A', liters: 25 }] },
    { id: 'DEMO-REPORT-B', date: '2026-11-02', employeeId: 'DEMO-002', siteId: 'SITE-B', work: '架空の整地作業', start: '08:30', end: '16:30', breakMinutes: 60,
      hauls: [], fuels: [{ id: 'FUEL-B', assetId: 'MACHINE-A', liters: 18 }] }
  ];
}
