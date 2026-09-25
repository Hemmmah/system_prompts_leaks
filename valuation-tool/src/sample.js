/*
 * حالة نموذجية للتجربة — Sample case (illustrative figures, not market data).
 * Also defines the empty template used by "حالة جديدة".
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ValSample = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function adj(o) { return Object.assign({ time: '', location: '', size: '', condition: '', age: '', other: '' }, o || {}); }

  function sample() {
    return {
      version: 1,
      case: {
        name: 'مبنى تجاري مكتبي — حالة نموذجية',
        client: 'عميل تجريبي',
        purpose: 'التقييم لأغراض التمويل',
        basis: 'القيمة السوقية',
        propertyType: 'تجاري مكتبي (معارض + مكاتب)',
        location: 'الرياض — حي الملقا، طريق أنس بن مالك',
        deed: '',
        valuationDate: '2026-09-25',
        inspectionDate: '2026-09-20',
        landArea: '2500',
        gla: '3780',
        currency: 'ر.س',
        rounding: '10000',
        appraiser: '',
        notes: 'الأرقام في هذه الحالة توضيحية لتجربة الأداة وليست بيانات سوق فعلية.'
      },
      rentComps: {
        pick: 'median', outlierMethod: 'iqr', outlierK: '1.5', excludeOutliers: true, range: 'auto', manual: '', overrides: {},
        rows: [
          { label: 'معرض — طريق أنس بن مالك', category: 'معارض', rent: '170000', area: '160', period: 'annual', basis: 'total', date: '2026-06', include: true, weight: '1', adj: adj({ location: '0', size: '-2' }) },
          { label: 'معرض — شارع الأمير سلطان', category: 'معارض', rent: '9,500', area: '100', period: 'monthly', basis: 'total', date: '2026-03', include: true, weight: '1', adj: adj({ location: '-5', time: '2' }) },
          { label: 'معرض — حي الياسمين', category: 'معارض', rent: '١٨٠٬٠٠٠', area: '170', period: 'annual', basis: 'total', date: '2026-07', include: true, weight: '1', adj: adj({ location: '3' }) },
          { label: 'معرض — طريق الملك فهد', category: 'معارض', rent: '1150', area: '', period: 'annual', basis: 'perM2', date: '2026-05', include: true, weight: '1', adj: adj({ location: '-8' }) },
          { label: 'معرض — حي النرجس (زاوية)', category: 'معارض', rent: '310000', area: '150', period: 'annual', basis: 'total', date: '2026-08', include: true, weight: '1', adj: adj() },
          { label: 'مكتب — برج الملقا', category: 'مكاتب', rent: '84000', area: '125', period: 'annual', basis: 'total', date: '2026-04', include: true, weight: '1', adj: adj({ condition: '-3' }) },
          { label: 'مكتب — مجمع أعمال الياسمين', category: 'مكاتب', rent: '5,200', area: '100', period: 'monthly', basis: 'total', date: '2026-02', include: true, weight: '1', adj: adj({ time: '2', age: '3' }) },
          { label: 'مكتب — طريق الملك عبدالعزيز', category: 'مكاتب', rent: '700', area: '', period: 'annual', basis: 'perM2', date: '2026-06', include: true, weight: '1', adj: adj({ location: '-4' }) },
          { label: 'مكتب — حي الصحافة', category: 'مكاتب', rent: '66000', area: '110', period: 'annual', basis: 'total', date: '2026-08', include: true, weight: '1', adj: adj({ location: '2' }) }
        ]
      },
      income: {
        mode: 'rentroll', pgiDirect: '', rentBasis: 'blended', contractPeriod: 'annual',
        vacancyPct: '7', collectionLossPct: '2', otherIncome: '60000',
        units: [
          { label: 'معارض الدور الأرضي', category: 'معارض', units: '6', area: '150', occupied: '6', contractRent: '150000', leaseYears: '4', escPct: '5', escEvery: '2', voidMonths: '3', leasingMonths: '1', marketSource: 'comps', marketRate: '', basis: 'default' },
          { label: 'مكاتب الأدوار العلوية', category: 'مكاتب', units: '24', area: '120', occupied: '20', contractRent: '72000', leaseYears: '2', escPct: '', escEvery: '', voidMonths: '4', leasingMonths: '1', marketSource: 'comps', marketRate: '', basis: 'default' }
        ]
      },
      opex: {
        mode: 'itemized', ratio: '20',
        lines: [
          { label: 'إدارة العقار', basis: 'pctEGI', amount: '5' },
          { label: 'صيانة وإصلاحات', basis: 'perM2', amount: '35' },
          { label: 'تأمين', basis: 'fixed', amount: '25000' },
          { label: 'خدمات المناطق المشتركة (كهرباء/مياه)', basis: 'fixed', amount: '90000' },
          { label: 'حراسة ونظافة', basis: 'fixed', amount: '120000' },
          { label: 'احتياطي الإحلال', basis: 'pctEGI', amount: '2' }
        ]
      },
      noiOverride: { enabled: false, value: '', note: '' },
      cap: {
        selection: 'comps', manual: '', note: '',
        pick: 'median', outlierMethod: 'iqr', outlierK: '1.5', excludeOutliers: true, range: 'auto',
        rangeMode: 'spread', rangeBps: '50', rangeLow: '', rangeHigh: '',
        rows: [
          { label: 'مبنى مكتبي — حي العقيق', price: '31,500,000', noi: '2,330,000', capRate: '', date: '2026-05', include: true, weight: '1', adjPts: '0' },
          { label: 'مجمع تجاري — حي الياسمين', price: '24,000,000', noi: '1,850,000', capRate: '', date: '2026-02', include: true, weight: '1', adjPts: '-0.25' },
          { label: 'مبنى معارض ومكاتب — الملقا', price: '38,000,000', noi: '2,810,000', capRate: '', date: '2026-07', include: true, weight: '2', adjPts: '0' },
          { label: 'مبنى مكتبي — طريق الملك فهد', price: '', noi: '', capRate: '7.1', date: '2026-01', include: true, weight: '1', adjPts: '0.25' },
          { label: 'مبنى متعدد الاستخدام — النرجس', price: '19,800,000', noi: '1,540,000', capRate: '', date: '2026-06', include: true, weight: '1', adjPts: '0' },
          { label: 'مبنى قديم — حي السليمانية', price: '12,000,000', noi: '1,290,000', capRate: '', date: '2025-11', include: true, weight: '1', adjPts: '0' }
        ],
        band: { ltv: '50', rate: '6.25', years: '20', equityRate: '7' },
        buildup: { riskFree: '4.75', growth: '2', premiums: [
          { label: 'علاوة مخاطر العقار', value: '2.5' },
          { label: 'علاوة السيولة', value: '1' },
          { label: 'علاوة الإدارة والتشغيل', value: '0.75' },
          { label: 'علاوة الموقع/المستأجرين', value: '0.5' }
        ] },
        survey: { value: '7.5', low: '7', high: '8', source: 'تقرير سوق المكاتب — الربع الثاني 2026 (أدخل المصدر الفعلي)' },
        weights: { comps: '60', band: '10', buildup: '10', survey: '20' }
      },
      direct: { method: 'market', leaseRate: '', adjustments: [
        { label: 'تكاليف تأجير الوحدات الشاغرة (عمولة + فترة مجانية)', amount: '-120000' }
      ] },
      dcf: {
        years: '10', rentGrowth: '0, 2.5', expenseGrowth: '2.5', vacancy: '', capexPct: '0', capexSchedule: '5:450000',
        discountRate: '9.75', exitCap: '', exitSpreadBps: '25', sellingCostPct: '2.5', exitBasis: 'next', timing: 'end', rangeBps: '50'
      },
      sales: {
        subjectArea: '', pick: 'median', outlierMethod: 'iqr', outlierK: '1.5', excludeOutliers: true, range: 'auto', manual: '',
        rows: [
          { label: 'مبنى مكتبي — حي العقيق', price: '31,500,000', area: '4500', basis: 'total', date: '2026-05', include: true, weight: '1', adj: adj({ location: '0', age: '2' }) },
          { label: 'مجمع تجاري — حي الياسمين', price: '24,000,000', area: '3600', basis: 'total', date: '2026-02', include: true, weight: '1', adj: adj({ time: '2', location: '3' }) },
          { label: 'مبنى معارض ومكاتب — الملقا', price: '38,000,000', area: '5400', basis: 'total', date: '2026-07', include: true, weight: '1', adj: adj({ size: '2' }) },
          { label: 'مبنى متعدد الاستخدام — النرجس', price: '19,800,000', area: '2850', basis: 'total', date: '2026-06', include: true, weight: '1', adj: adj({ condition: '-2' }) },
          { label: 'مبنى مكتبي فاخر — الملك فهد', price: '52,000,000', area: '4300', basis: 'total', date: '2026-04', include: true, weight: '1', adj: adj({ location: '-10' }) }
        ]
      },
      recon: { weights: { direct: '50', dcf: '30', sales: '20' }, overrideEnabled: false, overrideValue: '', overrideNote: '', rationale: 'رُجحت طريقة الرسملة المباشرة لتوفر أدلة معدلات رسملة من صفقات مماثلة في نفس المنطقة، مع استخدام DCF لاختبار أثر فرق الإيجار التعاقدي عن السوقي، والمقارنات البيعية كطريقة داعمة.' },
      sens: { metric: 'final', steps: {}, gridMetric: 'direct', rowVar: 'capBps', colVar: 'rentPct', rowStep: '25', colStep: '5', gridSize: '2' },
      scenarios: [
        { name: 'متحفظ', prob: '25', shocks: { rentPct: '-7.5', vacancyPts: '3', opexPct: '5', capBps: '50', discountBps: '50', exitCapBps: '50', growthPts: '-1', voidMonths: '3' } },
        { name: 'أساسي', prob: '50', shocks: {} },
        { name: 'متفائل', prob: '25', shocks: { rentPct: '5', vacancyPts: '-2', capBps: '-25', discountBps: '-25', exitCapBps: '-25', growthPts: '0.5' } }
      ]
    };
  }

  function empty() {
    var m = sample();
    m.case = { name: 'حالة جديدة', client: '', purpose: '', basis: 'القيمة السوقية', propertyType: '', location: '', deed: '', valuationDate: new Date().toISOString().slice(0, 10), inspectionDate: '', landArea: '', gla: '', currency: 'ر.س', rounding: '10000', appraiser: '', notes: '' };
    m.rentComps.rows = []; m.rentComps.overrides = {};
    m.income.units = [{ label: '', category: '', units: '1', area: '', occupied: '1', contractRent: '', leaseYears: '', escPct: '', escEvery: '', voidMonths: '', leasingMonths: '', marketSource: 'manual', marketRate: '', basis: 'default' }];
    m.income.otherIncome = '0';
    m.opex.lines.forEach(function (l) { if (l.basis === 'fixed' || l.basis === 'perM2') l.amount = ''; });
    m.cap.rows = []; m.cap.survey = { value: '', low: '', high: '', source: '' }; m.cap.selection = 'manual'; m.cap.manual = '';
    m.direct.adjustments = [];
    m.dcf.capexSchedule = '';
    m.sales.rows = [];
    m.recon.rationale = '';
    return m;
  }

  return { sample: sample, empty: empty, adj: adj };
});
