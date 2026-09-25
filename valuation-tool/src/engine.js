/*
 * محرك حسابات التقييم العقاري — Valuation engine
 * Pure functions, no DOM. Works in the browser (window.ValEngine) and in Node (require).
 *
 * Conventions:
 *  - The model stores raw user input (strings allowed, Arabic digits allowed).
 *    Every number is read through num() / pct(), so cleaning happens in one place.
 *  - Percent inputs are stored as percent numbers ("7.5" means 7.5%).
 *  - Money amounts are annual unless stated otherwise.
 *  - Sensitivity works by adding "shocks" to a model copy (model.__shocks); every
 *    calculation reads the shocks, so any output can be re-run under any shock set.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ValEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- parsing

  function toLatinDigits(s) {
    return s
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x6F0); });
  }

  /** Parse a user-entered number. Handles Arabic/Persian digits, thousands separators,
   *  Arabic decimal mark, currency text, %, (negatives), and k/m/ألف/مليون suffixes. */
  function num(v) {
    if (v === null || v === undefined) return NaN;
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (typeof v === 'boolean') return NaN;
    var s = toLatinDigits(String(v)).trim();
    if (!s) return NaN;
    s = s.replace(/٫/g, '.').replace(/[٬،,\s  ']/g, '');
    var neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[%٪]/g, '');
    var mult = 1;
    if (/(مليون|mn|m)$/i.test(s)) { mult = 1e6; s = s.replace(/(مليون|mn|m)$/i, ''); }
    else if (/(ألف|الف|k)$/i.test(s)) { mult = 1e3; s = s.replace(/(ألف|الف|k)$/i, ''); }
    s = s.replace(/[^0-9.\-]/g, '');
    if (!s || s === '-' || s === '.' || (s.match(/\./g) || []).length > 1) return NaN;
    if (s.lastIndexOf('-') > 0) return NaN;
    var n = Number(s) * mult;
    if (!isFinite(n)) return NaN;
    return neg ? -n : n;
  }

  function numOr(v, d) { var n = num(v); return isFinite(n) ? n : d; }
  function pct(v, d) { var n = num(v); return isFinite(n) ? n / 100 : (d === undefined ? NaN : d); }
  function isNum(n) { return typeof n === 'number' && isFinite(n); }
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }

  /** "3" -> [3,3,...]; "0, 2, 3" -> [0,2,3,3,...] (last value repeats). Values in percent. */
  function series(v, n, fallback) {
    var parts = toLatinDigits(String(v === undefined || v === null ? '' : v))
      .split(/[,;\u060C\u061B|\s]+/).map(num).filter(isNum);
    var out = [];
    for (var i = 0; i < n; i++) out.push(parts.length ? parts[Math.min(i, parts.length - 1)] : fallback);
    return out;
  }

  /** One-off amounts by year: "3:500000; 7:1,200,000" (year:amount pairs, separated by ; or new line). */
  function schedule(v, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(0);
    toLatinDigits(String(v || '')).split(/[;\u061B\n|]+/).forEach(function (part) {
      var m = part.split(/[:=]/);
      if (m.length !== 2) return;
      var y = Math.round(num(m[0])), a = num(m[1]);
      if (isNum(y) && y >= 1 && y <= n && isNum(a)) out[y - 1] += a;
    });
    return out;
  }

  function roundTo(v, step) {
    var s = num(step);
    if (!isNum(v)) return NaN;
    if (!isNum(s) || s <= 0) return v;
    return Math.round(v / s) * s;
  }

  // ------------------------------------------------------------- statistics

  function quantileSorted(s, p) {
    if (!s.length) return NaN;
    var idx = (s.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  }

  function describe(values, weights) {
    var v = [], w = [];
    for (var i = 0; i < values.length; i++) {
      if (isNum(values[i])) { v.push(values[i]); w.push(weights && isNum(weights[i]) && weights[i] > 0 ? weights[i] : 1); }
    }
    var n = v.length;
    var r = { n: n, min: NaN, max: NaN, mean: NaN, median: NaN, sd: NaN, cv: NaN, q1: NaN, q3: NaN, iqr: NaN, trimmed: NaN, weighted: NaN };
    if (!n) return r;
    var s = v.slice().sort(function (a, b) { return a - b; });
    var sum = v.reduce(function (a, b) { return a + b; }, 0);
    r.min = s[0]; r.max = s[n - 1]; r.mean = sum / n;
    r.median = quantileSorted(s, 0.5);
    r.q1 = quantileSorted(s, 0.25); r.q3 = quantileSorted(s, 0.75); r.iqr = r.q3 - r.q1;
    if (n > 1) {
      var ss = v.reduce(function (a, x) { return a + (x - r.mean) * (x - r.mean); }, 0);
      r.sd = Math.sqrt(ss / (n - 1));
      r.cv = r.mean !== 0 ? r.sd / Math.abs(r.mean) : NaN;
    } else { r.sd = 0; r.cv = 0; }
    var k = n >= 5 ? Math.max(1, Math.floor(n * 0.1)) : 0;
    var t = s.slice(k, n - k);
    r.trimmed = t.reduce(function (a, b) { return a + b; }, 0) / t.length;
    var ws = w.reduce(function (a, b) { return a + b; }, 0);
    r.weighted = v.reduce(function (a, x, j) { return a + x * w[j]; }, 0) / ws;
    return r;
  }

  /** Flag outliers. method: iqr (k=1.5) | zscore (k=2) | mad (k=3.5) | none */
  function outliers(values, method, k) {
    var flags = values.map(function () { return false; });
    var scores = values.map(function () { return NaN; });
    var vals = values.filter(isNum);
    var res = { flags: flags, scores: scores, lower: NaN, upper: NaN, method: method || 'iqr', applicable: vals.length >= 5 };
    if (!res.applicable || method === 'none') return res;
    var st = describe(vals);
    if (method === 'zscore') {
      var kz = isNum(num(k)) ? num(k) : 2;
      res.lower = st.mean - kz * st.sd; res.upper = st.mean + kz * st.sd;
      values.forEach(function (x, i) { if (isNum(x) && st.sd > 0) { scores[i] = (x - st.mean) / st.sd; flags[i] = Math.abs(scores[i]) > kz; } });
    } else if (method === 'mad') {
      var km = isNum(num(k)) ? num(k) : 3.5;
      var dev = vals.map(function (x) { return Math.abs(x - st.median); }).sort(function (a, b) { return a - b; });
      var mad = quantileSorted(dev, 0.5);
      if (mad > 0) {
        res.lower = st.median - km * mad / 0.6745; res.upper = st.median + km * mad / 0.6745;
        values.forEach(function (x, i) { if (isNum(x)) { scores[i] = 0.6745 * (x - st.median) / mad; flags[i] = Math.abs(scores[i]) > km; } });
      }
    } else {
      var ki = isNum(num(k)) ? num(k) : 1.5;
      res.lower = st.q1 - ki * st.iqr; res.upper = st.q3 + ki * st.iqr;
      values.forEach(function (x, i) {
        if (isNum(x)) { flags[i] = x < res.lower || x > res.upper; scores[i] = st.iqr > 0 ? (x - st.median) / st.iqr : 0; }
      });
    }
    return res;
  }

  /**
   * Generic evidence analysis used by rental comps, sales comps and cap-rate comps.
   * items: [{value, weight, include}]  (include=false => excluded by the appraiser)
   * opts: {pick: median|mean|trimmed|weighted|manual, manual, outlierMethod, outlierK,
   *        excludeOutliers: bool, range: iqr|minmax|sd}
   */
  function analyzeEvidence(items, opts) {
    opts = opts || {};
    var vals = items.map(function (it) { return it.valid && it.include ? it.value : NaN; });
    var ol = outliers(vals, opts.outlierMethod || 'iqr', opts.outlierK);
    var used = [], usedW = [];
    var rows = items.map(function (it, i) {
      var isOut = ol.flags[i];
      var use = it.valid && it.include && !(opts.excludeOutliers && isOut);
      if (use) { used.push(it.value); usedW.push(it.weight); }
      return Object.assign({}, it, { outlier: isOut, score: ol.scores[i], used: use });
    });
    var st = describe(used, usedW);
    var pick = opts.pick || 'median';
    var indicated = pick === 'manual' ? num(opts.manual) : st[pick];
    if (!isNum(indicated)) indicated = st.median;
    var rangeMode = opts.range || (st.n >= 4 ? 'iqr' : 'minmax');
    var low, high;
    if (rangeMode === 'iqr') { low = st.q1; high = st.q3; }
    else if (rangeMode === 'sd') { low = st.mean - st.sd; high = st.mean + st.sd; }
    else { low = st.min; high = st.max; }
    var warnings = [];
    if (st.n === 0) warnings.push('لا توجد مقارنات صالحة مستخدمة.');
    else if (st.n < 3) warnings.push('عدد المقارنات المستخدمة (' + st.n + ') أقل من 3؛ الدليل ضعيف.');
    if (st.n >= 3 && st.cv > 0.2) warnings.push('تشتت مرتفع بين المقارنات (معامل الاختلاف ' + (st.cv * 100).toFixed(1) + '%).');
    var nOut = rows.filter(function (r) { return r.outlier; }).length;
    if (nOut && !opts.excludeOutliers) warnings.push(nOut + ' قيمة شاذة مرصودة وما زالت ضمن الحساب — راجعها أو فعّل الاستبعاد التلقائي.');
    if (!ol.applicable && items.length) warnings.push('كشف القيم الشاذة الآلي يحتاج 5 مقارنات صالحة على الأقل؛ راجع القيم يدوياً.');
    return { rows: rows, stats: st, indicated: indicated, low: low, high: high, pick: pick, rangeMode: rangeMode, outlierBounds: [ol.lower, ol.upper], warnings: warnings };
  }

  // -------------------------------------------------------- comps normalise

  var ADJ_KEYS = ['time', 'location', 'size', 'condition', 'age', 'other'];

  function adjTotal(adj) {
    var t = 0;
    ADJ_KEYS.forEach(function (k) { var v = num(adj && adj[k]); if (isNum(v)) t += v; });
    return t;
  }

  function normKey(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  /** Rental comps -> annual rent per m², adjusted. */
  function normalizeRentComps(rows) {
    var seen = {};
    return (rows || []).map(function (r) {
      var rent = num(r.rent), area = num(r.area);
      var perYear = r.period === 'monthly' ? 12 : 1;
      var issues = [];
      var base = NaN;
      if (!isNum(rent) || rent <= 0) issues.push('الإيجار غير صالح');
      if (r.basis === 'perM2') base = rent * perYear;
      else {
        if (!isNum(area) || area <= 0) issues.push('المساحة مطلوبة');
        base = rent * perYear / area;
      }
      var adj = adjTotal(r.adj);
      var value = base * (1 + adj / 100);
      var key = normKey(r.label) + '|' + rent + '|' + area;
      var dup = !!seen[key]; seen[key] = true;
      if (dup) issues.push('مكرر محتمل');
      var valid = isNum(value) && value > 0 && issues.filter(function (x) { return x !== 'مكرر محتمل'; }).length === 0;
      return { label: r.label, category: (r.category || '').trim(), base: base, adjPct: adj, value: value, weight: numOr(r.weight, 1),
        include: r.include !== false, valid: valid, issues: issues, duplicate: dup };
    });
  }

  /** Sales comps -> price per m², adjusted. */
  function normalizeSaleComps(rows) {
    var seen = {};
    return (rows || []).map(function (r) {
      var price = num(r.price), area = num(r.area);
      var issues = [];
      var base = NaN;
      if (!isNum(price) || price <= 0) issues.push('السعر غير صالح');
      if (r.basis === 'perM2') base = price;
      else {
        if (!isNum(area) || area <= 0) issues.push('المساحة مطلوبة');
        base = price / area;
      }
      var adj = adjTotal(r.adj);
      var value = base * (1 + adj / 100);
      var key = normKey(r.label) + '|' + price + '|' + area;
      var dup = !!seen[key]; seen[key] = true;
      if (dup) issues.push('مكرر محتمل');
      var valid = isNum(value) && value > 0 && issues.filter(function (x) { return x !== 'مكرر محتمل'; }).length === 0;
      return { label: r.label, base: base, adjPct: adj, value: value, weight: numOr(r.weight, 1),
        include: r.include !== false, valid: valid, issues: issues, duplicate: dup };
    });
  }

  /** Cap-rate evidence: implied cap = NOI / price (or a stated cap), plus adjustment in % points. Value in %. */
  function normalizeCapComps(rows) {
    return (rows || []).map(function (r) {
      var price = num(r.price), noi = num(r.noi), stated = num(r.capRate);
      var issues = [];
      var base = NaN;
      if (isNum(price) && price > 0 && isNum(noi) && noi > 0) base = noi / price * 100;
      else if (isNum(stated) && stated > 0) base = stated;
      else issues.push('أدخل السعر وصافي الدخل أو معدل رسملة معلن');
      var adj = numOr(r.adjPts, 0);
      var value = base + adj;
      if (isNum(value) && (value < 2 || value > 20)) issues.push('معدل خارج النطاق المعتاد');
      var valid = isNum(value) && value > 0 && issues.indexOf('أدخل السعر وصافي الدخل أو معدل رسملة معلن') < 0;
      return { label: r.label, base: base, adjPct: adj, value: value, weight: numOr(r.weight, 1), include: r.include !== false, valid: valid, issues: issues };
    });
  }

  function evidenceOpts(cfg) {
    cfg = cfg || {};
    return { pick: cfg.pick, manual: cfg.manual, outlierMethod: cfg.outlierMethod, outlierK: cfg.outlierK,
      excludeOutliers: !!cfg.excludeOutliers, range: cfg.range === 'auto' ? undefined : cfg.range };
  }

  /** Market rent per m² per category ('' = all). */
  function analyzeRentComps(model) {
    var cfg = model.rentComps || {};
    var norm = normalizeRentComps(cfg.rows);
    var cats = {};
    norm.forEach(function (r) { cats[r.category || ''] = true; });
    var out = { all: analyzeEvidence(norm, evidenceOpts(cfg)), byCategory: {}, categories: Object.keys(cats).filter(Boolean) };
    out.categories.forEach(function (c) {
      var subset = norm.map(function (r) { return r.category === c ? r : Object.assign({}, r, { include: false }); });
      var a = analyzeEvidence(subset, evidenceOpts(cfg));
      a.rows = a.rows.filter(function (r) { return r.category === c; });
      out.byCategory[c] = a;
    });
    // Appraiser override per category
    var ov = cfg.overrides || {};
    out.rateFor = function (cat) {
      if (cat && isNum(num(ov[cat]))) return num(ov[cat]);
      if (cat && out.byCategory[cat] && out.byCategory[cat].stats.n) return out.byCategory[cat].indicated;
      return out.all.indicated;
    };
    return out;
  }

  // ------------------------------------------------------------------ shocks

  var SHOCKS = {
    rentPct: { label: 'الإيجارات', unit: '%', step: 5 },
    vacancyPts: { label: 'نسبة الشغور', unit: 'نقطة', step: 2 },
    opexPct: { label: 'المصروفات التشغيلية', unit: '%', step: 10 },
    capBps: { label: 'معدل الرسملة', unit: 'bps', step: 50 },
    discountBps: { label: 'معدل الخصم', unit: 'bps', step: 50 },
    exitCapBps: { label: 'معدل الرسملة التخارجي', unit: 'bps', step: 50 },
    growthPts: { label: 'نمو الإيجار', unit: 'نقطة', step: 1 },
    expenseGrowthPts: { label: 'نمو المصروفات', unit: 'نقطة', step: 1 },
    salePct: { label: 'سعر المتر في المقارنات البيعية', unit: '%', step: 5 },
    voidMonths: { label: 'شغور إعادة التأجير', unit: 'شهر', step: 3 },
    leaseRateBps: { label: 'معدل خصم فروق العقود', unit: 'bps', step: 100 }
  };

  function sh(model, k) { var s = model.__shocks; return s && isNum(s[k]) ? s[k] : 0; }

  function withShocks(model, shocks) {
    var m = Object.assign({}, model);
    var s = Object.assign({}, model.__shocks || {});
    Object.keys(shocks || {}).forEach(function (k) { var v = num(shocks[k]); if (isNum(v)) s[k] = (s[k] || 0) + v; });
    m.__shocks = s;
    return m;
  }

  // --------------------------------------------------------------- rent roll

  /**
   * year (1-based): contract rents follow their own escalation schedule and revert to market after
   * u.leaseYears (whole years). rev: market-rent growth factor for that year (contract rents never use it).
   * opts.forceMarket: value every unit at market rent (used by the market + lease-adjustment method).
   * In the first year after expiry the occupied units lose u.voidMonths of rent and incur u.leasingMonths
   * of market rent as a letting cost.
   */
  function computeRentRoll(model, rentAnalysis, year, rev, opts) {
    year = year || 1;
    rev = isNum(rev) ? rev : 1;
    opts = opts || {};
    var inc = model.income || {};
    var defBasis = inc.rentBasis || 'blended';
    var contractMult = inc.contractPeriod === 'monthly' ? 12 : 1;
    var rentShock = 1 + sh(model, 'rentPct') / 100;
    var rows = (inc.units || []).map(function (u) {
      var units = numOr(u.units, 1), area = num(u.area);
      var occ = clamp(numOr(u.occupied, units), 0, units);
      var rate = u.marketSource === 'comps' && rentAnalysis ? rentAnalysis.rateFor(u.category) : num(u.marketRate);
      var marketUnit0 = isNum(num(u.marketRentUnit)) && u.marketSource === 'unit' ? num(u.marketRentUnit) : rate * area;
      var marketUnit = marketUnit0 * rev;
      var contractBase = num(u.contractRent) * contractMult;
      var esc = pct(u.escPct, 0), every = Math.max(1, Math.round(numOr(u.escEvery, 1)));
      var contractUnit = contractBase * Math.pow(1 + esc, Math.floor((year - 1) / every));
      var leaseYears = Math.round(num(u.leaseYears));
      var expired = isNum(leaseYears) && year > leaseYears;
      var hasContract = isNum(contractUnit) && contractUnit > 0 && !expired;
      var basis = opts.forceMarket ? 'market' : (u.basis && u.basis !== 'default' ? u.basis : defBasis);
      var hadContract = isNum(contractBase) && contractBase > 0 && basis !== 'market';
      var reletYear = hadContract && isNum(leaseYears) && leaseYears >= 1 && year === leaseYears + 1;
      var voidM = Math.max(0, numOr(u.voidMonths, numOr(inc.voidMonths, 0)) + sh(model, 'voidMonths')), leaseM = numOr(u.leasingMonths, numOr(inc.leasingMonths, 0));
      var letUnits = basis === 'contract' ? units : occ;
      var voidLoss = reletYear && isNum(marketUnit) ? letUnits * marketUnit * voidM / 12 * rentShock : 0;
      var leasingCost = reletYear && isNum(marketUnit) ? letUnits * marketUnit * leaseM / 12 * rentShock : 0;
      var pgi;
      if (basis === 'market') pgi = units * marketUnit;
      else if (basis === 'contract') pgi = units * (hasContract ? contractUnit : marketUnit);
      else pgi = occ * (hasContract ? contractUnit : marketUnit) + (units - occ) * marketUnit;
      var issues = [];
      if (!isNum(area) || area <= 0) issues.push('المساحة');
      if (!isNum(marketUnit)) issues.push('الإيجار السوقي');
      pgi = isNum(pgi) ? pgi * rentShock : 0;
      var marketTotal = isNum(marketUnit) ? units * marketUnit * rentShock : 0;
      var contractTotal = hasContract ? units * contractUnit * rentShock : NaN;
      return { label: u.label, category: u.category, units: units, area: area, totalArea: units * (isNum(area) ? area : 0), occupied: occ,
        marketRate: rate, marketUnit: marketUnit, contractUnit: contractUnit, basis: basis, pgi: pgi,
        marketTotal: marketTotal, contractTotal: contractTotal, expired: expired, leaseYears: leaseYears,
        voidLoss: voidLoss, leasingCost: leasingCost, reletYear: reletYear,
        reversionGap: hasContract && isNum(marketUnit) ? (marketUnit - contractUnit) / contractUnit : NaN, issues: issues };
    });
    var t = { pgi: 0, marketTotal: 0, contractTotal: 0, area: 0, units: 0, occupied: 0, voidLoss: 0, leasingCost: 0 };
    rows.forEach(function (r) {
      t.pgi += r.pgi; t.voidLoss += r.voidLoss; t.leasingCost += r.leasingCost; t.marketTotal += r.marketTotal; t.contractTotal += isNum(r.contractTotal) ? r.contractTotal : 0;
      t.area += r.totalArea; t.units += r.units; t.occupied += r.occupied;
    });
    t.physicalOccupancy = t.units ? t.occupied / t.units : NaN;
    return { rows: rows, totals: t };
  }

  // --------------------------------------------------------------------- NOI

  /**
   * factors: {revenue, expense, vacancyPct} for DCF years. Returns full statement + trace.
   */
  function computeNOI(model, rentAnalysis, factors) {
    factors = factors || {};
    var inc = model.income || {};
    var cs = model.case || {};
    var rev = isNum(factors.revenue) ? factors.revenue : 1;
    var exf = isNum(factors.expense) ? factors.expense : 1;
    var rr = computeRentRoll(model, rentAnalysis, factors.year, rev, { forceMarket: factors.forceMarket });
    var direct = inc.mode === 'direct';
    var pgi = direct ? numOr(inc.pgiDirect, 0) * (1 + sh(model, 'rentPct') / 100) * rev : rr.totals.pgi;
    var relettingLoss = direct ? 0 : rr.totals.voidLoss;
    var leasingCost = direct ? 0 : rr.totals.leasingCost;
    var gla = numOr(cs.gla, rr.totals.area);
    var vac = isNum(factors.vacancyPct) ? factors.vacancyPct : pct(inc.vacancyPct, 0);
    vac = clamp(vac + sh(model, 'vacancyPts') / 100, 0, 1);
    var vacancyLoss = pgi * vac;
    var coll = pct(inc.collectionLossPct, 0);
    var collectionLoss = (pgi - vacancyLoss) * coll;
    var other = numOr(inc.otherIncome, 0) * rev;
    var egi = pgi - vacancyLoss - collectionLoss - relettingLoss + other;
    var op = model.opex || {};
    var opShock = 1 + sh(model, 'opexPct') / 100;
    var lines = [];
    if (op.mode === 'ratio') {
      lines.push({ label: 'مصروفات تشغيلية (نسبة من الدخل الفعلي)', basis: 'pctEGI', input: op.ratio, amount: egi * pct(op.ratio, 0) * opShock });
    } else {
      (op.lines || []).forEach(function (l) {
        var a = num(l.amount), amt = 0;
        if (!isNum(a)) a = 0;
        if (l.basis === 'pctEGI') amt = egi * a / 100;
        else if (l.basis === 'pctPGI') amt = pgi * a / 100;
        else if (l.basis === 'perM2') amt = a * gla * exf;
        else amt = a * exf;
        lines.push({ label: l.label, basis: l.basis || 'fixed', input: l.amount, amount: amt * opShock });
      });
    }
    var opex = lines.reduce(function (s, l) { return s + l.amount; }, 0);
    var noi = egi - opex;
    return { rentRoll: rr, pgi: pgi, vacancyPct: vac, vacancyLoss: vacancyLoss, collectionPct: coll, collectionLoss: collectionLoss,
      otherIncome: other, relettingLoss: relettingLoss, leasingCost: leasingCost, egi: egi, opexLines: lines, opex: opex, opexRatio: egi ? opex / egi : NaN, noiComputed: noi, noi: noi, gla: gla };
  }

  /** Year-1 NOI with optional professional override (scaled under shocks so sensitivity still works). */
  function computeNOIFinal(model, rentAnalysis) {
    var r = computeNOI(model, rentAnalysis);
    var ov = (model.noiOverride || {});
    var trace = [];
    var fmt = function (x) { return fmtN(x); };
    r.overridden = false;
    if (ov.enabled && isNum(num(ov.value))) {
      var unshocked = model.__shocks ? computeNOI(Object.assign({}, model, { __shocks: null }), rentAnalysis).noiComputed : r.noiComputed;
      var ratio = unshocked ? r.noiComputed / unshocked : 1;
      r.noi = num(ov.value) * ratio;
      r.overrideFactor = r.noiComputed ? r.noi / r.noiComputed : 1;
      r.overridden = true;
    }
    trace.push('إجمالي الدخل المحتمل PGI = ' + fmt(r.pgi));
    trace.push('− خسارة الشغور (' + fmtP(r.vacancyPct) + ') = ' + fmt(r.vacancyLoss));
    trace.push('− خسارة التحصيل (' + fmtP(r.collectionPct) + ' من الدخل بعد الشغور) = ' + fmt(r.collectionLoss));
    if (r.relettingLoss) trace.push('− فاقد إعادة التأجير عند انتهاء العقود = ' + fmt(r.relettingLoss));
    trace.push('+ دخل آخر = ' + fmt(r.otherIncome));
    trace.push('= الدخل الفعلي الإجمالي EGI = ' + fmt(r.egi));
    trace.push('− المصروفات التشغيلية = ' + fmt(r.opex) + ' (' + fmtP(r.opexRatio) + ' من EGI)');
    trace.push('= صافي الدخل التشغيلي المحسوب NOI = ' + fmt(r.noiComputed));
    if (r.overridden) trace.push('↺ تجاوز مهني: NOI المعتمد = ' + fmt(r.noi) + (ov.note ? ' — المبرر: ' + ov.note : ''));
    r.trace = trace;
    r.warnings = [];
    if (r.pgi <= 0) r.warnings.push('إجمالي الدخل المحتمل صفر أو غير مكتمل — راجع جدول الوحدات.');
    if (isNum(r.opexRatio) && (r.opexRatio < 0.08 || r.opexRatio > 0.6)) r.warnings.push('نسبة المصروفات ' + fmtP(r.opexRatio) + ' خارج النطاق المعتاد (8%–60%).');
    if (r.noi <= 0) r.warnings.push('صافي الدخل التشغيلي سالب أو صفر.');
    if (r.overridden && !ov.note) r.warnings.push('تم تجاوز NOI دون تسجيل مبرر.');
    return r;
  }

  // ---------------------------------------------------------------- cap rate

  function mortgageConstant(ratePct, years, perYear) {
    var i = num(ratePct) / 100 / (perYear || 12), n = num(years) * (perYear || 12);
    if (!isNum(i) || !isNum(n) || n <= 0) return NaN;
    if (i === 0) return 1 / num(years);
    return (i / (1 - Math.pow(1 + i, -n))) * (perYear || 12);
  }

  function computeCapRate(model) {
    var c = model.cap || {};
    var methods = {};
    var comps = analyzeEvidence(normalizeCapComps(c.rows), evidenceOpts(c));
    methods.comps = { label: 'مقارنات السوق (المعدل الضمني)', value: comps.indicated, low: comps.low, high: comps.high, detail: comps };

    var b = c.band || {};
    var ltv = pct(b.ltv), mc = mortgageConstant(b.rate, b.years, 12), edr = pct(b.equityRate);
    var bandCap = ltv * mc + (1 - ltv) * edr;
    methods.band = { label: 'النطاق الاستثماري Band of Investment', value: bandCap * 100, mc: mc, ltv: ltv, edr: edr };

    var bu = c.buildup || {};
    var y = numOr(bu.riskFree, NaN);
    (bu.premiums || []).forEach(function (p) { var v = num(p.value); if (isNum(v)) y += v; });
    var g = numOr(bu.growth, 0);
    methods.buildup = { label: 'البناء التراكمي (معدل الخصم − النمو)', value: y - g, discount: y, growth: g };

    methods.survey = { label: 'تقارير/مسوح السوق', value: num((c.survey || {}).value), low: num((c.survey || {}).low), high: num((c.survey || {}).high), source: (c.survey || {}).source };

    var sel = c.selection || 'comps';
    var selected, basisText;
    if (sel === 'weighted') {
      var w = c.weights || {}, tw = 0, acc = 0;
      ['comps', 'band', 'buildup', 'survey'].forEach(function (k) {
        var wk = numOr(w[k], 0);
        if (wk > 0 && isNum(methods[k].value)) { tw += wk; acc += wk * methods[k].value; }
      });
      selected = tw ? acc / tw : NaN;
      basisText = 'متوسط مرجح للطرق حسب الأوزان المحددة';
    } else if (sel === 'manual') {
      selected = num(c.manual);
      basisText = 'معدل محدد مهنياً';
    } else {
      selected = methods[sel] ? methods[sel].value : NaN;
      basisText = methods[sel] ? methods[sel].label : '';
    }
    var bpsShock = sh(model, 'capBps') / 100;
    var baseSelected = selected;
    selected = selected + bpsShock;

    var low, high;
    var spread = numOr(c.rangeBps, 50) / 100;
    if (c.rangeMode === 'evidence' && sel === 'comps' && isNum(comps.low)) { low = comps.low + bpsShock; high = comps.high + bpsShock; }
    else if (c.rangeMode === 'manual' && isNum(num(c.rangeLow)) && isNum(num(c.rangeHigh))) { low = num(c.rangeLow) + bpsShock; high = num(c.rangeHigh) + bpsShock; }
    else { low = selected - spread; high = selected + spread; }

    var warnings = comps.warnings.map(function (w) { return 'معدل الرسملة: ' + w; });
    if (!isNum(selected) || selected <= 0) warnings.push('معدل الرسملة المختار غير صالح.');
    if (sel === 'manual' && !c.note) warnings.push('معدل الرسملة محدد يدوياً دون مبرر مسجل.');
    var vals = ['comps', 'band', 'buildup', 'survey'].map(function (k) { return methods[k].value; }).filter(isNum);
    if (vals.length >= 2) {
      var spreadAll = Math.max.apply(null, vals) - Math.min.apply(null, vals);
      if (spreadAll > 1.5) warnings.push('فجوة ' + spreadAll.toFixed(2) + ' نقطة مئوية بين طرق اشتقاق معدل الرسملة — وضّح سبب الترجيح.');
    }
    return { methods: methods, selection: sel, selected: selected, baseSelected: baseSelected, low: low, high: high, basisText: basisText, warnings: warnings };
  }

  // ------------------------------------------------------ direct capitalisation

  /**
   * Lease adjustment for the "market + leases" direct capitalisation method.
   * Capitalising market NOI assumes every unit is let at market rent today. The adjustment adds the
   * present value, at rate y, of the yearly difference between the NOI actually receivable under the
   * leases (with escalations, re-letting void and letting costs) and market NOI, until the last lease
   * expires. Rows with no stated expiry keep their difference forever (capitalised at y).
   * With y = cap rate this equals the classic term-and-reversion valuation.
   */
  function leaseAdjustment(model, rentAnalysis, y) {
    var units = (model.income || {}).units || [];
    if ((model.income || {}).mode === 'direct' || !units.length || !(y > 0)) return { total: 0, years: [], horizon: 0 };
    var H = 0;
    units.forEach(function (u) { var L = Math.round(num(u.leaseYears)); if (isNum(L) && L + 1 > H) H = L + 1; });
    H = Math.min(H, 60);
    var years = [], total = 0;
    for (var t = 1; t <= H + 1; t++) {
      var asIs = computeNOI(model, rentAnalysis, { year: t });
      var mkt = computeNOI(model, rentAnalysis, { year: t, forceMarket: true });
      var diff = asIs.noiComputed - asIs.leasingCost - mkt.noiComputed;
      if (t <= H) {
        var pv = diff / Math.pow(1 + y, t);
        years.push({ year: t, asIs: asIs.noiComputed, leasing: asIs.leasingCost, market: mkt.noiComputed, diff: diff, pv: pv });
        total += pv;
      } else if (Math.abs(diff) > 1e-9) {
        var tail = diff / y / Math.pow(1 + y, H);
        years.push({ year: 'perp', asIs: asIs.noiComputed, leasing: 0, market: mkt.noiComputed, diff: diff, pv: tail });
        total += tail;
      }
    }
    return { total: total, years: years, horizon: H };
  }

  function computeDirectCap(model, noiRes, capRes, rentAnalysis) {
    var d = model.direct || {};
    var cs = model.case || {};
    var cap = capRes.selected / 100;
    var adjustments = (d.adjustments || []).map(function (a) { return { label: a.label, amount: numOr(a.amount, 0) }; });
    var adjSum = adjustments.reduce(function (s, a) { return s + a.amount; }, 0);
    var hasLeases = (model.income || {}).mode !== 'direct' && ((model.income || {}).units || []).some(function (u) { return num(u.contractRent) > 0; });
    var method = d.method === 'market' && hasLeases && !noiRes.overridden ? 'market' : 'asIs';
    var rateOf = function (c) { var m = pct(d.leaseRate); return (isNum(m) && m > 0 ? m : c) + sh(model, 'leaseRateBps') / 10000; };
    var valueAt = function (c) {
      if (method === 'asIs') return { cap: noiRes.noi / c, lease: 0, noi: noiRes.noi };
      var mNoi = computeNOI(model, rentAnalysis, { forceMarket: true }).noiComputed;
      var la = leaseAdjustment(model, rentAnalysis, rateOf(c));
      return { cap: mNoi / c, lease: la.total, noi: mNoi, detail: la };
    };
    var base = valueAt(cap), lo = valueAt(capRes.high / 100), hi = valueAt(capRes.low / 100);
    var raw = base.cap + base.lease;
    var value = raw + adjSum;
    var low = lo.cap + lo.lease + adjSum;
    var high = hi.cap + hi.lease + adjSum;
    var rounding = cs.rounding;
    var trace = method === 'market' ? [
      'NOI على أساس الإيجار السوقي لكل الوحدات = ' + fmtN(base.noi) + ' ÷ ' + fmtP(cap) + ' = ' + fmtN(base.cap),
      '+ تسوية العقود القائمة (القيمة الحالية لفرق الدخل التعاقدي عن السوقي حتى انتهاء العقود، شاملة الزيادات وفاقد وتكاليف إعادة التأجير، بمعدل ' + fmtP(rateOf(cap)) + ') = ' + fmtN(base.lease),
      '= القيمة بطريقة المدة والارتداد = ' + fmtN(raw)
    ] : [
      'القيمة = NOI ÷ معدل الرسملة = ' + fmtN(noiRes.noi) + ' ÷ ' + fmtP(cap) + ' = ' + fmtN(raw)
    ];
    trace = trace.concat([
      adjSum ? 'تعديلات بعد الرسملة (مصروفات رأسمالية/تأجير/أراضٍ زائدة) = ' + fmtN(adjSum) : 'لا توجد تعديلات بعد الرسملة',
      'القيمة قبل التقريب = ' + fmtN(value) + ' ← بعد التقريب = ' + fmtN(roundTo(value, rounding)),
      'النطاق عند معدل ' + fmtP(capRes.high / 100) + ' – ' + fmtP(capRes.low / 100) + ': ' + fmtN(roundTo(low, rounding)) + ' – ' + fmtN(roundTo(high, rounding))
    ]);
    var warnings = [];
    if (d.method === 'market' && noiRes.overridden) warnings.push('الرسملة المباشرة: تم تجاوز NOI مهنياً، لذا طُبقت الرسملة على NOI المعتمد بدل طريقة السوق + تسوية العقود.');
    if (method === 'asIs' && hasLeases && (model.income || {}).rentBasis !== 'market') warnings.push('الرسملة المباشرة ترسمل الإيجارات التعاقدية كأنها دائمة. اختر «سوقي + تسوية العقود» لعقار مؤجر بإيجارات تختلف عن السوق.');
    return { method: method, marketNoi: base.noi, capitalised: base.cap, leaseAdj: base.lease, leaseDetail: base.detail, warnings: warnings,
      raw: raw, adjustments: adjustments, adjSum: adjSum, value: value, rounded: roundTo(value, rounding),
      low: low, high: high, perM2: noiRes.gla ? value / noiRes.gla : NaN, multiplier: noiRes.egi ? value / noiRes.egi : NaN, trace: trace,
      valid: isNum(value) && cap > 0 };
  }

  // --------------------------------------------------------------------- DCF

  function computeDCF(model, rentAnalysis, noiRes, capRes, opts) {
    opts = opts || {};
    var d = model.dcf || {};
    var cs = model.case || {};
    var n = clamp(Math.round(numOr(d.years, 10)), 1, 30);
    var gShock = sh(model, 'growthPts'), eShock = sh(model, 'expenseGrowthPts');
    var rentG = series(d.rentGrowth, n + 1, 0).map(function (x) { return x + gShock; });
    var expG = series(d.expenseGrowth, n + 1, 0).map(function (x) { return x + eShock; });
    var baseVac = pct((model.income || {}).vacancyPct, 0) * 100;
    var vacList = series(d.vacancy, n + 1, baseVac);
    var capexPct = pct(d.capexPct, 0);
    var capexSched = schedule(d.capexSchedule, n + 1);
    var r = pct(d.discountRate) + sh(model, 'discountBps') / 10000;
    var exitSel = String(d.exitCap || '').trim() ? num(d.exitCap) : capRes.baseSelected + numOr(d.exitSpreadBps, 25) / 100;
    var exitCap = exitSel / 100 + sh(model, 'exitCapBps') / 10000;
    var sell = pct(d.sellingCostPct, 0);
    var mid = d.timing === 'mid';
    var overrideFactor = noiRes.overridden ? noiRes.overrideFactor : 1;

    var rows = [];
    var revF = 1, expF = 1;
    for (var t = 1; t <= n + 1; t++) {
      if (t > 1) { revF *= 1 + rentG[t - 2] / 100; expF *= 1 + expG[t - 2] / 100; }
      var y = computeNOI(model, rentAnalysis, { revenue: revF, expense: expF, vacancyPct: vacList[t - 1] / 100, year: t });
      var noi = y.noiComputed * overrideFactor;
      var capex = y.egi * capexPct + capexSched[t - 1];
      var cf = noi - capex - y.leasingCost;
      var df = 1 / Math.pow(1 + r, t - (mid ? 0.5 : 0));
      rows.push({ year: t, pgi: y.pgi, vacancyPct: y.vacancyPct, vacancyLoss: y.vacancyLoss + y.collectionLoss, relet: y.relettingLoss, leasing: y.leasingCost, other: y.otherIncome, egi: y.egi, opex: y.opex,
        noiComputed: y.noiComputed, overrideAdj: noi - y.noiComputed, noi: noi, capex: capex, cf: cf, df: df, pv: cf * df });
    }
    var hold = rows.slice(0, n);
    var exitNOI = d.exitBasis === 'final' ? rows[n - 1].noi : rows[n].noi;
    var gross = exitNOI / exitCap;
    var sellCost = gross * sell;
    var net = gross - sellCost;
    var dfN = 1 / Math.pow(1 + r, n);
    var pvRev = net * dfN;
    var pvCF = hold.reduce(function (s, x) { return s + x.pv; }, 0);
    var value = pvCF + pvRev;
    var res = { years: n, rows: hold, forward: rows[n], discountRate: r, exitCap: exitCap, exitNOI: exitNOI, gross: gross, sellCost: sellCost,
      net: net, dfN: dfN, pvRev: pvRev, pvCF: pvCF, value: value, rounded: roundTo(value, cs.rounding),
      goingIn: value ? rows[0].noi / value : NaN, reversionShare: value ? pvRev / value : NaN, valid: isNum(value) && r > 0 && exitCap > 0 };
    // Implied IRR check (should equal r); plus NOI CAGR
    res.noiCagr = rows[0].noi > 0 && rows[n - 1].noi > 0 && n > 1 ? Math.pow(rows[n - 1].noi / rows[0].noi, 1 / (n - 1)) - 1 : NaN;
    res.trace = [
      'فترة الاحتفاظ ' + n + ' سنوات، التدفقات ' + (mid ? 'منتصف السنة' : 'نهاية السنة') + '، معدل الخصم ' + fmtP(r),
      'مجموع القيمة الحالية للتدفقات = ' + fmtN(pvCF),
      'قيمة التخارج = NOI ' + (d.exitBasis === 'final' ? 'السنة ' + n : 'السنة ' + (n + 1)) + ' ' + fmtN(exitNOI) + ' ÷ ' + fmtP(exitCap) + ' = ' + fmtN(gross),
      '− تكاليف البيع (' + fmtP(sell) + ') = ' + fmtN(sellCost) + ' ← صافي التخارج ' + fmtN(net),
      'القيمة الحالية للتخارج = ' + fmtN(net) + ' × ' + dfN.toFixed(4) + ' = ' + fmtN(pvRev),
      'القيمة = ' + fmtN(pvCF) + ' + ' + fmtN(pvRev) + ' = ' + fmtN(value)
    ];
    res.warnings = [];
    if (!(r > 0)) res.warnings.push('معدل الخصم غير مدخل.');
    if (exitCap * 100 < capRes.baseSelected) res.warnings.push('معدل الرسملة التخارجي أقل من معدل الدخول — افتراض متفائل يحتاج تبريراً.');
    if (res.reversionShare > 0.7) res.warnings.push('قيمة التخارج تمثل ' + fmtP(res.reversionShare) + ' من القيمة — النتيجة حساسة جداً لمعدل التخارج.');
    var avgG = rentG.slice(0, n).reduce(function (a, b) { return a + b; }, 0) / n / 100;
    if (r - avgG < 0.02) res.warnings.push('الفرق بين معدل الخصم ومتوسط النمو ضئيل (' + fmtP(r - avgG) + ').');
    if (!opts.skipRange) {
      var rb = numOr(d.rangeBps, 50);
      var lo = computeDCF(withShocks(model, { discountBps: rb, exitCapBps: rb }), rentAnalysis, noiRes, capRes, { skipRange: true });
      var hi = computeDCF(withShocks(model, { discountBps: -rb, exitCapBps: -rb }), rentAnalysis, noiRes, capRes, { skipRange: true });
      res.low = lo.value; res.high = hi.value; res.rangeBps = rb;
    }
    return res;
  }

  // ------------------------------------------------------ sales comparison

  function computeSales(model) {
    var s = model.sales || {};
    var cs = model.case || {};
    var a = analyzeEvidence(normalizeSaleComps(s.rows), evidenceOpts(s));
    var shock = 1 + sh(model, 'salePct') / 100;
    var area = String(s.subjectArea || '').trim() ? num(s.subjectArea) : num(cs.gla);
    var rate = a.indicated * shock;
    var value = rate * area;
    return { analysis: a, area: area, rate: rate, value: value, rounded: roundTo(value, cs.rounding), low: a.low * shock * area, high: a.high * shock * area,
      valid: isNum(value) && value > 0,
      trace: ['سعر المتر المرجح = ' + fmtN(rate) + ' × المساحة ' + fmtN(area) + ' م² = ' + fmtN(value)] };
  }

  // -------------------------------------------------------- reconciliation

  function reconcile(model, parts) {
    var rc = model.recon || {};
    var cs = model.case || {};
    var w = rc.weights || {};
    var list = [
      { key: 'direct', label: 'الرسملة المباشرة', r: parts.direct },
      { key: 'dcf', label: 'التدفقات النقدية المخصومة DCF', r: parts.dcf },
      { key: 'sales', label: 'المقارنات البيعية', r: parts.sales }
    ];
    var tw = 0;
    list.forEach(function (x) { x.weight = numOr(w[x.key], 0); x.ok = x.r && x.r.valid && x.weight > 0; if (x.ok) tw += x.weight; });
    var value = 0, low = 0, high = 0;
    list.forEach(function (x) {
      x.share = x.ok ? x.weight / tw : 0;
      if (x.ok) { value += x.share * x.r.value; low += x.share * (isNum(x.r.low) ? x.r.low : x.r.value); high += x.share * (isNum(x.r.high) ? x.r.high : x.r.value); }
    });
    if (!tw) { value = NaN; low = NaN; high = NaN; }
    var overridden = rc.overrideEnabled && isNum(num(rc.overrideValue));
    var finalV = overridden ? num(rc.overrideValue) : value;
    var warnings = [];
    var vals = list.filter(function (x) { return x.r && x.r.valid && x.weight > 0; }).map(function (x) { return x.r.value; });
    if (vals.length >= 2) {
      var spread = (Math.max.apply(null, vals) - Math.min.apply(null, vals)) / value;
      if (spread > 0.15) warnings.push('الفرق بين نتائج الطرق ' + fmtP(spread) + ' — راجع الافتراضات قبل الترجيح.');
    }
    if (overridden && !rc.overrideNote) warnings.push('تم تجاوز القيمة النهائية دون مبرر مسجل.');
    return { approaches: list, weighted: value, value: finalV, rounded: roundTo(finalV, cs.rounding), low: roundTo(low, cs.rounding), high: roundTo(high, cs.rounding),
      overridden: overridden, warnings: warnings, perM2: num(cs.gla) ? finalV / num(cs.gla) : NaN };
  }

  // ------------------------------------------------------------- run all

  function runAll(model, opts) {
    opts = opts || {};
    var rent = analyzeRentComps(model);
    var noi = computeNOIFinal(model, rent);
    var cap = computeCapRate(model);
    var direct = computeDirectCap(model, noi, cap, rent);
    var dcf = computeDCF(model, rent, noi, cap, { skipRange: opts.skipRange });
    var sales = computeSales(model);
    var recon = reconcile(model, { direct: direct, dcf: dcf, sales: sales });
    var warnings = [].concat(
      rent.categories.length
        ? [].concat.apply([], rent.categories.map(function (c) { return rent.byCategory[c].warnings.map(function (w) { return 'إيجارات «' + c + '»: ' + w; }); }))
        : rent.all.warnings.map(function (w) { return 'الإيجارات المقارنة: ' + w; }),
      noi.warnings, cap.warnings, direct.warnings, dcf.warnings,
      sales.analysis.rows.length ? sales.analysis.warnings.map(function (w) { return 'المقارنات البيعية: ' + w; }) : [],
      recon.warnings);
    return { rent: rent, noi: noi, cap: cap, direct: direct, dcf: dcf, sales: sales, recon: recon, warnings: warnings };
  }

  var METRICS = {
    direct: { label: 'قيمة الرسملة المباشرة', get: function (r) { return r.direct.value; } },
    dcf: { label: 'قيمة DCF', get: function (r) { return r.dcf.value; } },
    sales: { label: 'قيمة المقارنات البيعية', get: function (r) { return r.sales.value; } },
    final: { label: 'القيمة النهائية المرجحة', get: function (r) { return r.recon.weighted; } },
    noi: { label: 'صافي الدخل التشغيلي', get: function (r) { return r.noi.noi; } }
  };

  function metricOf(model, metric, shocks) {
    var r = runAll(withShocks(model, shocks), { skipRange: true });
    return METRICS[metric].get(r);
  }

  /** Tornado: each variable at −step and +step. */
  function tornado(model, metric, steps) {
    var base = metricOf(model, metric, {});
    var rows = Object.keys(SHOCKS).map(function (k) {
      var st = steps && isNum(num(steps[k])) ? num(steps[k]) : SHOCKS[k].step;
      var down = {}, up = {}; down[k] = -st; up[k] = st;
      var vDown = metricOf(model, metric, down), vUp = metricOf(model, metric, up);
      return { key: k, label: SHOCKS[k].label, unit: SHOCKS[k].unit, step: st, down: vDown, up: vUp,
        dDown: (vDown - base) / base, dUp: (vUp - base) / base, swing: Math.abs(vUp - vDown) };
    });
    rows.sort(function (a, b) { return (b.swing || 0) - (a.swing || 0); });
    return { base: base, rows: rows };
  }

  /** Two-way grid of a metric. */
  function grid(model, metric, rowVar, rowSteps, colVar, colSteps) {
    var cells = rowSteps.map(function (rs) {
      return colSteps.map(function (c) {
        var s = {}; s[rowVar] = rs; s[colVar] = (s[colVar] || 0) + c;
        return metricOf(model, metric, s);
      });
    });
    return { rowVar: rowVar, colVar: colVar, rowSteps: rowSteps, colSteps: colSteps, cells: cells, base: metricOf(model, metric, {}) };
  }

  function scenarios(model) {
    var list = (model.scenarios || []).map(function (sc) {
      var r = runAll(withShocks(model, sc.shocks || {}), { skipRange: true });
      return { name: sc.name, prob: numOr(sc.prob, 0), shocks: sc.shocks, noi: r.noi.noi, cap: r.cap.selected, direct: r.direct.value, dcf: r.dcf.value, sales: r.sales.value, final: r.recon.weighted };
    });
    var tp = list.reduce(function (s, x) { return s + x.prob; }, 0);
    var weighted = tp ? list.reduce(function (s, x) { return s + x.prob * (isNum(x.final) ? x.final : 0); }, 0) / tp : NaN;
    return { list: list, totalProb: tp, weighted: weighted };
  }

  /** Solve a single shock so the metric hits a target (bisection). */
  function breakEven(model, metric, key, target, lo, hi) {
    var f = function (x) { var s = {}; s[key] = x; return metricOf(model, metric, s) - target; };
    var a = lo, b = hi, fa = f(a), fb = f(b);
    if (!isNum(fa) || !isNum(fb) || fa * fb > 0) return NaN;
    for (var i = 0; i < 60; i++) {
      var m = (a + b) / 2, fm = f(m);
      if (Math.abs(fm) < 1e-6 * Math.abs(target)) return m;
      if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; }
    }
    return (a + b) / 2;
  }

  // ----------------------------------------------------------- paste import

  /** Parse pasted Excel/CSV text into a 2D array. */
  function parseTable(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    var first = lines[0];
    var delim = first.indexOf('\t') >= 0 ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
    return lines.map(function (l) {
      if (delim !== ',') return l.split(delim).map(function (c) { return c.trim(); });
      var out = [], cur = '', q = false;
      for (var i = 0; i < l.length; i++) {
        var ch = l[i];
        if (ch === '"') q = !q;
        else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      out.push(cur.trim());
      return out;
    });
  }

  var COLUMN_SYNONYMS = {
    label: ['الوصف', 'المقارن', 'العقار', 'الاسم', 'الموقع', 'label', 'name', 'property', 'comp', 'description', 'الحي'],
    category: ['الفئة', 'النوع', 'نوع الوحدة', 'category', 'type', 'use', 'الاستخدام'],
    rent: ['الإيجار', 'الايجار', 'rent', 'الإيجار السنوي', 'قيمة الإيجار'],
    price: ['السعر', 'القيمة', 'سعر البيع', 'price', 'sale price', 'value', 'المبلغ'],
    area: ['المساحة', 'area', 'size', 'م2', 'م²', 'sqm', 'gla'],
    noi: ['صافي الدخل', 'noi', 'net income', 'صافي الدخل التشغيلي'],
    capRate: ['معدل الرسملة', 'cap', 'cap rate', 'العائد'],
    date: ['التاريخ', 'date', 'تاريخ الصفقة'],
    period: ['الفترة', 'period'],
    weight: ['الوزن', 'weight']
  };

  function mapColumns(header) {
    var map = {};
    header.forEach(function (h, i) {
      var k = normKey(h);
      Object.keys(COLUMN_SYNONYMS).forEach(function (field) {
        if (map[field] !== undefined) return;
        if (COLUMN_SYNONYMS[field].some(function (s) { return k === normKey(s) || k.indexOf(normKey(s)) >= 0; })) map[field] = i;
      });
    });
    return map;
  }

  /** Convert pasted text to comp rows for kind: rent | sales | cap. */
  function importRows(text, kind) {
    var t = parseTable(text);
    if (!t.length) return { rows: [], mapped: {}, skipped: 0 };
    var hasHeader = t[0].some(function (c) { return !isNum(num(c)) && c !== ''; }) && t.length > 1;
    var map = hasHeader ? mapColumns(t[0]) : {};
    if (!hasHeader || Object.keys(map).length < 2) {
      // positional fallback
      map = kind === 'cap' ? { label: 0, price: 1, noi: 2, capRate: 3 } : kind === 'sales' ? { label: 0, price: 1, area: 2 } : { label: 0, category: 1, rent: 2, area: 3 };
      if (!hasHeader) t.unshift([]);
    }
    var body = t.slice(1), skipped = 0;
    var rows = [];
    body.forEach(function (c) {
      var g = function (f) { return map[f] !== undefined ? (c[map[f]] || '') : ''; };
      var r = { label: g('label') || ('مقارن ' + (rows.length + 1)), include: true, weight: g('weight') || '1', adj: {} };
      if (g('date')) r.date = g('date');
      if (kind === 'rent') {
        r.category = g('category'); r.rent = g('rent'); r.area = g('area');
        r.period = /شهر|month/i.test(g('period')) ? 'monthly' : 'annual'; r.basis = 'total';
        if (!isNum(num(r.rent))) { skipped++; return; }
      } else if (kind === 'sales') {
        r.price = g('price'); r.area = g('area'); r.basis = 'total';
        if (!isNum(num(r.price))) { skipped++; return; }
      } else {
        r.price = g('price'); r.noi = g('noi'); r.capRate = g('capRate'); r.adjPts = '0';
        if (!isNum(num(r.price)) && !isNum(num(r.capRate))) { skipped++; return; }
      }
      rows.push(r);
    });
    return { rows: rows, mapped: map, skipped: skipped };
  }

  // -------------------------------------------------------------- formatting

  function fmtN(x, d) {
    if (!isNum(x)) return '—';
    return x.toLocaleString('en-US', { maximumFractionDigits: d === undefined ? 0 : d, minimumFractionDigits: d === undefined ? 0 : d });
  }
  function fmtP(x, d) { return isNum(x) ? (x * 100).toFixed(d === undefined ? 2 : d) + '%' : '—'; }

  return {
    num: num, pct: pct, numOr: numOr, isNum: isNum, series: series, schedule: schedule, roundTo: roundTo,
    describe: describe, outliers: outliers, analyzeEvidence: analyzeEvidence,
    normalizeRentComps: normalizeRentComps, normalizeSaleComps: normalizeSaleComps, normalizeCapComps: normalizeCapComps,
    analyzeRentComps: analyzeRentComps, computeRentRoll: computeRentRoll, computeNOI: computeNOI, computeNOIFinal: computeNOIFinal,
    mortgageConstant: mortgageConstant, computeCapRate: computeCapRate, computeDirectCap: computeDirectCap, computeDCF: computeDCF,
    computeSales: computeSales, leaseAdjustment: leaseAdjustment, reconcile: reconcile, runAll: runAll, withShocks: withShocks,
    SHOCKS: SHOCKS, METRICS: METRICS, ADJ_KEYS: ADJ_KEYS, tornado: tornado, grid: grid, scenarios: scenarios, breakEven: breakEven,
    parseTable: parseTable, importRows: importRows, mapColumns: mapColumns, fmtN: fmtN, fmtP: fmtP
  };
});
