'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const S = require('../src/sample.js');

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('num() cleans Arabic digits, separators, currency and suffixes', () => {
  assert.equal(E.num('١٨٠٬٠٠٠'), 180000);
  assert.equal(E.num('1,250,000 ر.س'), 1250000);
  assert.equal(E.num('7٫5%'), 7.5);
  assert.equal(E.num('(25,000)'), -25000);
  assert.equal(E.num('2.5 مليون'), 2500000);
  assert.equal(E.num('850k'), 850000);
  assert.ok(Number.isNaN(E.num('')));
  assert.ok(Number.isNaN(E.num('1.2.3')));
});

test('series() repeats last value; schedule() reads year:amount pairs', () => {
  assert.deepEqual(E.series('0, 2.5', 4, 0), [0, 2.5, 2.5, 2.5]);
  assert.deepEqual(E.series('', 3, 7), [7, 7, 7]);
  assert.deepEqual(E.schedule('2:1,000; 3:500000', 4), [0, 1000, 500000, 0]);
});

test('describe() and outlier detection', () => {
  const d = E.describe([1, 2, 3, 4, 100]);
  assert.equal(d.median, 3);
  assert.equal(d.q1, 2);
  assert.equal(d.q3, 4);
  const o = E.outliers([1, 2, 3, 4, 100], 'iqr');
  assert.deepEqual(o.flags, [false, false, false, false, true]);
  const m = E.outliers([10, 10.2, 9.9, 10.1, 30], 'mad');
  assert.equal(m.flags[4], true);
  assert.equal(E.outliers([1, 2, 100], 'iqr').applicable, false);
});

test('NOI statement: PGI → vacancy → collection → EGI → opex → NOI', () => {
  const m = {
    case: { gla: '1000' },
    income: { mode: 'direct', pgiDirect: '1,000,000', vacancyPct: '10', collectionLossPct: '5', otherIncome: '20000' },
    opex: { mode: 'itemized', lines: [{ basis: 'pctEGI', amount: '10' }, { basis: 'perM2', amount: '20' }, { basis: 'fixed', amount: '50000' }] }
  };
  const r = E.computeNOIFinal(m, null);
  // vacancy 100,000; collection 5% of 900,000 = 45,000; EGI = 875,000
  close(r.egi, 875000);
  close(r.opex, 87500 + 20000 + 50000);
  close(r.noi, 875000 - 157500);
});

test('rent roll: blended basis uses contract for occupied, market for vacant', () => {
  const m = { income: { rentBasis: 'blended', units: [{ units: '10', area: '100', occupied: '8', contractRent: '50000', marketSource: 'manual', marketRate: '600' }] } };
  const rr = E.computeRentRoll(m, null);
  close(rr.totals.pgi, 8 * 50000 + 2 * 60000);
  // lease expiry reverts to market
  m.income.units[0].leaseYears = '1';
  close(E.computeRentRoll(m, null, 2).totals.pgi, 10 * 60000);
});

test('rental comps normalise monthly and per-m² inputs and apply adjustments', () => {
  const rows = E.normalizeRentComps([
    { rent: '5,000', area: '100', period: 'monthly', basis: 'total', adj: { location: '10' } },
    { rent: '700', basis: 'perM2', period: 'annual' }
  ]);
  close(rows[0].value, 600 * 1.1);
  close(rows[1].value, 700);
});

test('cap rate methods: implied comps, band of investment, build-up', () => {
  const caps = E.normalizeCapComps([{ price: '10,000,000', noi: '750,000', adjPts: '0.25' }]);
  close(caps[0].value, 7.75);
  const mc = E.mortgageConstant('6', '25', 12);
  close(mc, 0.077316, 1e-4);
  const r = E.computeCapRate({ cap: { selection: 'band', band: { ltv: '60', rate: '6', years: '25', equityRate: '8' }, rows: [] } });
  close(r.selected, (0.6 * mc + 0.4 * 0.08) * 100);
  const b = E.computeCapRate({ cap: { selection: 'buildup', buildup: { riskFree: '5', growth: '2', premiums: [{ value: '3' }] }, rows: [] } });
  close(b.selected, 6);
});

test('direct capitalisation value and range', () => {
  const m = S.sample();
  const r = E.runAll(m);
  assert.equal(r.direct.method, 'market');
  close(r.direct.raw, r.direct.marketNoi / (r.cap.selected / 100) + r.direct.leaseAdj);
  assert.ok(r.direct.low < r.direct.value && r.direct.value < r.direct.high);
  m.direct.method = 'asIs';
  const a = E.runAll(m);
  close(a.direct.raw, a.noi.noi / (a.cap.selected / 100));
});

test('DCF: with zero growth and exit cap = discount rate the value equals NOI / r', () => {
  const m = {
    case: { gla: '1000' },
    income: { mode: 'direct', pgiDirect: '1000000', vacancyPct: '0', collectionLossPct: '0', otherIncome: '0' },
    opex: { mode: 'ratio', ratio: '0' },
    cap: { selection: 'manual', manual: '8', rows: [] },
    dcf: { years: '10', rentGrowth: '0', expenseGrowth: '0', discountRate: '8', exitCap: '8', sellingCostPct: '0', exitBasis: 'next', timing: 'end' }
  };
  const r = E.runAll(m);
  close(r.dcf.value, 1000000 / 0.08, 1e-9);
  close(r.direct.value, 1000000 / 0.08, 1e-9);
});

test('DCF: growing perpetuity check (r − g) with exit cap = r − g', () => {
  const m = {
    case: {}, income: { mode: 'direct', pgiDirect: '100', vacancyPct: '0', collectionLossPct: '0' }, opex: { mode: 'ratio', ratio: '0' },
    cap: { selection: 'manual', manual: '7', rows: [] },
    dcf: { years: '10', rentGrowth: '3', expenseGrowth: '3', discountRate: '10', exitCap: '7', sellingCostPct: '0', exitBasis: 'next', timing: 'end' }
  };
  close(E.runAll(m).dcf.value, 100 / 0.07, 1e-9);
});

test('NOI override is honoured and still responds to shocks', () => {
  const m = S.sample();
  m.noiOverride = { enabled: true, value: '2,000,000', note: 'test' };
  const r = E.runAll(m);
  close(r.noi.noi, 2000000);
  const r2 = E.runAll(E.withShocks(m, { rentPct: 10 }));
  assert.ok(r2.noi.noi > 2000000);
});

test('sensitivity: signs and ordering are sensible', () => {
  const m = S.sample();
  const t = E.tornado(m, 'direct');
  const byKey = Object.fromEntries(t.rows.map(r => [r.key, r]));
  assert.ok(byKey.rentPct.up > t.base && byKey.rentPct.down < t.base);
  assert.ok(byKey.capBps.up < t.base && byKey.capBps.down > t.base);
  assert.ok(byKey.vacancyPts.up < t.base);
  assert.equal(byKey.discountBps.swing, 0); // DCF-only input does not move direct cap
  const g = E.grid(m, 'direct', 'capBps', [-50, 0, 50], 'rentPct', [-5, 0, 5]);
  close(g.cells[1][1], t.base);
  assert.ok(g.cells[0][2] > g.cells[2][0]);
});

test('break-even solves the cap rate shift for a target value', () => {
  const m = S.sample();
  const base = E.runAll(m).direct.value;
  const bps = E.breakEven(m, 'direct', 'capBps', base * 0.9, -300, 300);
  assert.ok(bps > 0);
  close(E.runAll(E.withShocks(m, { capBps: bps })).direct.value, base * 0.9, 1e-4);
});

test('reconciliation weights normalise over valid approaches', () => {
  const m = S.sample();
  m.recon.weights = { direct: '1', dcf: '1', sales: '0' };
  const r = E.runAll(m);
  close(r.recon.weighted, (r.direct.value + r.dcf.value) / 2);
});

test('paste import maps Arabic headers and skips unusable rows', () => {
  const txt = 'الوصف\tالفئة\tالإيجار\tالمساحة\tالفترة\nمكتب أ\tمكاتب\t٥٬٠٠٠\t100\tشهري\nسطر فارغ\t\t\t\t\nمكتب ب\tمكاتب\t70000\t110\tسنوي';
  const r = E.importRows(txt, 'rent');
  assert.equal(r.rows.length, 2);
  assert.equal(r.skipped, 1);
  assert.equal(r.rows[0].period, 'monthly');
  close(E.normalizeRentComps(r.rows)[0].value, 600);
});

test('sample case runs end to end with finite outputs', () => {
  const r = E.runAll(S.sample());
  for (const v of [r.noi.noi, r.cap.selected, r.direct.value, r.dcf.value, r.sales.value, r.recon.value]) assert.ok(Number.isFinite(v));
  const empty = E.runAll(S.empty());
  assert.ok(Array.isArray(empty.warnings));
});

// ------------------------------------------------------------ leases
const leaseCase = (unit, extra) => Object.assign({
  case: { gla: '1' },
  income: { mode: 'rentroll', rentBasis: 'blended', vacancyPct: '0', collectionLossPct: '0', otherIncome: '0',
    units: [Object.assign({ units: '1', area: '1', occupied: '1', contractRent: '80', leaseYears: '3', marketSource: 'manual', marketRate: '100' }, unit)] },
  opex: { mode: 'ratio', ratio: '0' },
  cap: { selection: 'manual', manual: '8', rows: [] },
  direct: { method: 'market' },
  dcf: { years: '10', rentGrowth: '3', expenseGrowth: '0', discountRate: '11', exitCap: '8', sellingCostPct: '0', exitBasis: 'next', timing: 'end' }
}, extra || {});
const v = 1 / 1.08;

test('direct cap "market + leases" equals textbook term and reversion', () => {
  const r = E.runAll(leaseCase({}));
  close(r.direct.value, 80 * (v + v ** 2 + v ** 3) + (100 / 0.08) * v ** 3, 1e-9);
  // the as-is method capitalises the contract rent in perpetuity
  close(E.runAll(leaseCase({}, { direct: { method: 'asIs' } })).direct.value, 80 / 0.08, 1e-9);
});

test('escalations, re-letting void and letting costs flow into term and reversion', () => {
  const r = E.runAll(leaseCase({ escPct: '10', escEvery: '1', voidMonths: '6', leasingMonths: '1' }));
  const hand = 80 * v + 88 * v ** 2 + 96.8 * v ** 3 + (-50 - 100 / 12) * v ** 4 + 1250 * v ** 3;
  close(r.direct.value, hand, 1e-9);
});

test('escalation every N years steps the contract rent', () => {
  const m = leaseCase({ escPct: '5', escEvery: '2', leaseYears: '10' });
  const pgi = [1, 2, 3, 4, 5].map((y) => E.computeRentRoll(m, null, y).totals.pgi);
  assert.deepEqual(pgi.map((x) => +x.toFixed(4)), [80, 80, 84, 84, 88.2]);
});

test('DCF: contract rents stay fixed, market growth applies only after expiry', () => {
  const r = E.runAll(leaseCase({ voidMonths: '6', leasingMonths: '1' }));
  const rows = r.dcf.rows;
  assert.deepEqual(rows.slice(0, 3).map((x) => x.pgi), [80, 80, 80]);
  close(rows[3].pgi, 100 * 1.03 ** 3);
  close(rows[3].relet, 100 * 1.03 ** 3 / 2);
  close(rows[3].leasing, 100 * 1.03 ** 3 / 12);
  close(rows[3].cf, rows[3].noi - rows[3].leasing);
  assert.equal(rows[4].relet, 0);
});

test('lease adjustment is zero when contract equals market', () => {
  const r = E.runAll(leaseCase({ contractRent: '100' }));
  close(r.direct.value, 1250, 1e-9);
});

test('rows without an expiry keep their difference in perpetuity (market+leases = as-is)', () => {
  const r = E.runAll(leaseCase({ leaseYears: '' }));
  close(r.direct.value, 80 / 0.08, 1e-9);
});

test('sensitivity covers lease assumptions: re-letting void and lease discount rate', () => {
  const m = leaseCase({ voidMonths: '6' });
  const base = E.runAll(m).direct.value;
  // +3 months void in year 4 costs 3/12 of market rent, discounted 4 years at the cap rate
  close(E.runAll(E.withShocks(m, { voidMonths: 3 })).direct.value, base - 25 * v ** 4, 1e-9);
  // void can not go below zero months
  close(E.runAll(E.withShocks(leaseCase({}), { voidMonths: -5 })).direct.value, E.runAll(leaseCase({})).direct.value, 1e-9);
  // lease-rate shift re-discounts the contract-vs-market difference only
  const w = 1 / 1.09;
  close(E.runAll(E.withShocks(leaseCase({}), { leaseRateBps: 100 })).direct.value, 1250 - 20 * (w + w ** 2 + w ** 3), 1e-9);
  const t = E.tornado(S.sample(), 'final');
  assert.ok(t.rows.find((r) => r.key === 'voidMonths').swing > 0);
  assert.ok(t.rows.find((r) => r.key === 'leaseRateBps').swing > 0);
});

// gate 3: test against a value the appraiser already signed off
const signedCase = () => {
  const alt = S.sample();
  alt.cap.selection = 'manual'; alt.cap.manual = '8'; alt.income.vacancyPct = '10'; alt.direct.method = 'asIs';
  return E.runAll(alt).recon.weighted;
};

test('benchmark bridge: substituting the appraiser assumptions reproduces the signed value exactly', () => {
  const signed = signedCase();
  const b = E.benchmark(S.sample(), { value: String(signed), capRate: '8', vacancyPct: '10', leaseMethod: 'asIs' });
  assert.equal(b.ready, true);
  close(b.residual, 0, 1e-9);
  // the bridge adds up: steps + residual = gap
  close(b.steps.reduce((s, x) => s + x.delta, 0) + b.residual, b.gap, 1e-9);
  assert.deepEqual(b.steps.map((s) => s.key), ['lease', 'vacancy', 'cap']);
  const [c1, c2, c3] = b.conditions;
  assert.equal(c1.pass, false);   // −10.9% gap is outside ±3%
  assert.equal(c2.pass, true);    // but fully explained by named assumptions
  assert.equal(c3.pass, false);   // leases move the final value 2.3% < 5% materiality
  close(b.lease.effect, 0.023, 0.05);
  assert.deepEqual(b.actions.map((a) => a.kind), ['change', 'change']);
});

test('benchmark: unexplained gap stops development; matching value passes; thresholds are editable', () => {
  const m = S.sample();
  const none = E.benchmark(m, { value: String(signedCase()) });
  assert.equal(none.conditions[1].pass, false);
  assert.equal(none.actions[0].kind, 'stop');
  const own = E.runAll(m).recon.weighted;
  const ok = E.benchmark(m, { value: String(own * 1.02), materialityPct: '2' });
  assert.equal(ok.conditions[0].pass, true);
  assert.equal(ok.conditions[1].pass, true);
  assert.equal(ok.conditions[2].pass, true);
  assert.equal(ok.actions.at(-1).kind, 'go');
  assert.equal(E.benchmark(m, { value: String(own * 1.02), tolerancePct: '1' }).conditions[0].pass, false);
  assert.equal(E.benchmark(m, {}).ready, false);
  // target can be the direct value instead of the final value
  close(E.benchmark(m, { value: '1', target: 'direct' }).toolValue, E.runAll(m).direct.value, 1e-9);
});
