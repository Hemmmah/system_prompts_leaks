/* واجهة أداة التقييم — UI layer. All maths lives in engine.js. */
(function () {
  'use strict';
  var E = window.ValEngine, S = window.ValSample;
  var STORE_KEY = 'valuation-tool.case.v1';
  var root = document.getElementById('app');
  var inFrame = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();

  var state = { model: load() || S.sample(), tab: 'case', ui: { modal: null, confirm: null, toast: '' } };
  var hashTab = (location.hash || '').replace('#', '');
  if (hashTab) state.tab = hashTab;

  // ------------------------------------------------------------ utilities
  function load() { try { var s = localStorage.getItem(STORE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state.model)); } catch (e) { /* storage unavailable */ } }
  function get(path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, state.model); }
  function set(path, v) {
    var ks = path.split('.'), o = state.model;
    for (var i = 0; i < ks.length - 1; i++) {
      if (o[ks[i]] == null) o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {};
      o = o[ks[i]];
    }
    o[ks[ks.length - 1]] = v;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var N = E.fmtN, P = E.fmtP, isNum = E.isNum;
  function cur() { return (state.model.case && state.model.case.currency) || 'ر.س'; }
  function M(x) { return isNum(x) ? '<bdi class="num">' + N(x) + '</bdi>' : '—'; }
  function Pc(x, d) { return isNum(x) ? '<bdi class="num">' + x.toFixed(d === undefined ? 2 : d) + '%</bdi>' : '—'; }
  function Pf(x, d) { return isNum(x) ? '<bdi class="num">' + P(x, d) + '</bdi>' : '—'; }
  function idOf(path) { return 'f-' + path.replace(/[^\w؀-ۿ-]/g, '-'); }

  function inp(path, o) {
    o = o || {};
    var v = get(path);
    return '<input id="' + idOf(path) + '" data-path="' + esc(path) + '"' + (o.num ? ' class="num" inputmode="decimal" dir="ltr"' : '') +
      (o.type ? ' type="' + o.type + '"' : '') + ' value="' + esc(v) + '" placeholder="' + esc(o.ph || '') + '" aria-label="' + esc(o.label || o.ph || path) + '"' + (o.list ? ' list="' + o.list + '"' : '') + '>';
  }
  function area(path, o) { o = o || {}; return '<textarea id="' + idOf(path) + '" data-path="' + esc(path) + '" placeholder="' + esc(o.ph || '') + '" aria-label="' + esc(o.label || path) + '">' + esc(get(path)) + '</textarea>'; }
  function sel(path, opts, o) {
    o = o || {};
    var v = get(path);
    return '<select id="' + idOf(path) + '" data-path="' + esc(path) + '" aria-label="' + esc(o.label || path) + '">' + opts.map(function (x) {
      return '<option value="' + esc(x[0]) + '"' + (String(v) === String(x[0]) ? ' selected' : '') + '>' + esc(x[1]) + '</option>';
    }).join('') + '</select>';
  }
  function chk(path, label) { return '<label class="chk"><input type="checkbox" id="' + idOf(path) + '" data-path="' + esc(path) + '"' + (get(path) ? ' checked' : '') + '> ' + label + '</label>'; }
  function field(label, control, hint, cls) { return '<label class="field ' + (cls || '') + '"><span class="lbl">' + label + '</span>' + control + (hint ? '<small>' + hint + '</small>' : '') + '</label>'; }
  function btn(action, label, attrs, cls) { return '<button type="button" class="btn ' + (cls || '') + '" data-action="' + action + '" ' + (attrs || '') + '>' + label + '</button>'; }
  function chip(t, cls) { return '<span class="chip ' + (cls || 'muted') + '">' + t + '</span>'; }
  function ltrNums(html) { return html.replace(/[-+]?\d[\d,]*(?:\.\d+)?%?/g, '<bdi dir="ltr">$&</bdi>'); }
  function traceList(lines) { return '<ol class="trace">' + lines.map(function (l) { return '<li>' + ltrNums(esc(l)) + '</li>'; }).join('') + '</ol>'; }
  function warnList(ws, okText) {
    if (!ws.length) return okText ? '<ul class="warnings"><li class="ok">' + okText + '</li></ul>' : '';
    return '<ul class="warnings">' + ws.map(function (w) { return '<li>' + ltrNums(esc(w)) + '</li>'; }).join('') + '</ul>';
  }

  var PICKS = [['median', 'الوسيط'], ['mean', 'المتوسط'], ['trimmed', 'المتوسط المقتطع'], ['weighted', 'المتوسط المرجح بالأوزان'], ['manual', 'قيمة يحددها المقيّم']];
  var OUTM = [['iqr', 'المدى الربيعي IQR'], ['mad', 'الانحراف المطلق MAD'], ['zscore', 'الدرجة المعيارية Z'], ['none', 'بدون']];
  var RANGES = [['auto', 'تلقائي'], ['iqr', 'الربيع الأول – الثالث'], ['minmax', 'الأدنى – الأعلى'], ['sd', 'المتوسط ± انحراف معياري']];
  var ADJ_LABELS = { time: 'زمن', location: 'موقع', size: 'مساحة', condition: 'حالة', age: 'عمر', other: 'أخرى' };

  var TPL = {
    rentComp: function () { return { label: '', category: '', rent: '', area: '', period: 'annual', basis: 'total', date: '', include: true, weight: '1', adj: S.adj() }; },
    unit: function () { return { label: '', category: '', units: '1', area: '', occupied: '1', contractRent: '', leaseYears: '', escPct: '', escEvery: '', voidMonths: '', leasingMonths: '', marketSource: 'comps', marketRate: '', basis: 'default' }; },
    opexLine: function () { return { label: '', basis: 'fixed', amount: '' }; },
    capComp: function () { return { label: '', price: '', noi: '', capRate: '', date: '', include: true, weight: '1', adjPts: '0' }; },
    saleComp: function () { return { label: '', price: '', area: '', basis: 'total', date: '', include: true, weight: '1', adj: S.adj() }; },
    premium: function () { return { label: '', value: '' }; },
    adjustment: function () { return { label: '', amount: '' }; },
    scenario: function () { return { name: 'سيناريو جديد', prob: '0', shocks: {} }; }
  };

  var TABS = [
    ['case', 'بيانات الحالة'], ['rent', 'الإيجار السوقي'], ['noi', 'الدخل وNOI'], ['cap', 'معدل الرسملة'],
    ['direct', 'الرسملة المباشرة'], ['dcf', 'التدفقات المخصومة'], ['sales', 'المقارنات البيعية'],
    ['sens', 'الحساسية والسيناريوهات'], ['report', 'التسوية والتقرير'], ['bench', 'اختبار حالة معتمدة']
  ];

  // --------------------------------------------------------------- shared
  function editTable(listPath, cols, opts) {
    opts = opts || {};
    var rows = get(listPath) || [];
    var head = '<thead><tr>' + cols.map(function (c) { return '<th class="' + (c.num ? 'num' : '') + '">' + c.h + '</th>'; }).join('') + '<th class="rowact"></th></tr></thead>';
    var body = '<tbody>' + rows.map(function (r, i) {
      var p = listPath + '.' + i;
      return '<tr class="' + (opts.rowClass ? opts.rowClass(r, i) : '') + '">' + cols.map(function (c) {
        return '<td class="' + (c.cls || '') + (c.num ? ' num' : '') + '">' + c.f(r, i, p) + '</td>';
      }).join('') + '<td class="rowact">' + btn('delRow', 'حذف', 'data-list="' + listPath + '" data-i="' + i + '"', 'danger sm') + '</td></tr>';
    }).join('') + (rows.length ? '' : '<tr><td colspan="' + (cols.length + 1) + '"><small>لا توجد صفوف بعد.</small></td></tr>') + '</tbody>';
    return '<div class="scroll"><table class="grid" id="' + (opts.id || '') + '">' + head + body + (opts.foot || '') + '</table></div>';
  }

  function evidenceStatus(a) {
    if (!a) return '';
    var out = [];
    if (!a.valid) out.push(chip(a.issues.join('، ') || 'غير صالح', 'bad'));
    else if (!a.include) out.push(chip('مستبعد يدوياً'));
    else if (a.outlier) out.push(chip(a.used ? 'شاذة — مستخدمة' : 'شاذة — مستبعدة', 'warn'));
    else out.push(chip('مستخدم', 'good'));
    if (a.duplicate) out.push(chip('مكرر محتمل', 'warn'));
    return out.join(' ');
  }
  function rowClassFor(a) { return !a ? '' : !a.valid ? 'row-bad' : !a.include ? 'row-off' : a.outlier ? 'row-out' : ''; }

  function adjCells(p) {
    return '<div class="adjgrp">' + E.ADJ_KEYS.map(function (k) { return inp(p + '.adj.' + k, { num: 1, ph: ADJ_LABELS[k], label: 'تعديل ' + ADJ_LABELS[k] + ' %' }); }).join('') + '</div>';
  }

  function evidenceControls(base) {
    var c = get(base) || {};
    return '<div class="form">' +
      field('طريقة استخلاص القيمة', sel(base + '.pick', PICKS)) +
      (c.pick === 'manual' ? field('القيمة المعتمدة يدوياً', inp(base + '.manual', { num: 1 })) : '') +
      field('كشف القيم الشاذة', sel(base + '.outlierMethod', OUTM)) +
      field('معامل الحساسية k', inp(base + '.outlierK', { num: 1 }), 'IQR: 1.5 · MAD: 3.5 · Z: 2') +
      field('نطاق الدليل', sel(base + '.range', RANGES)) +
      '<div class="field"><span class="lbl">المعالجة</span>' + chk(base + '.excludeOutliers', 'استبعاد الشواذ تلقائياً') + '</div>' +
      '</div>';
  }

  function statsBlock(a, fmt, unit) {
    var s = a.stats;
    var f = function (x) { return fmt(x); };
    var items = [['العدد المستخدم', s.n, function (x) { return String(x); }], ['الأدنى', s.min], ['الربيع الأول', s.q1], ['الوسيط', s.median], ['المتوسط', s.mean],
      ['المتوسط المقتطع', s.trimmed], ['المرجح', s.weighted], ['الربيع الثالث', s.q3], ['الأعلى', s.max], ['معامل الاختلاف', s.cv, function (x) { return P(x, 1); }]];
    return '<div class="stats">' + items.map(function (it) {
      return '<div class="stat"><span class="k">' + it[0] + '</span><span class="v">' + (it[2] ? (isNum(it[1]) ? it[2](it[1]) : '—') : f(it[1])) + '</span></div>';
    }).join('') + '<div class="stat hl"><span class="k">القيمة المستخلصة' + (unit ? ' (' + unit + ')' : '') + '</span><span class="v">' + f(a.indicated) + '</span></div>' +
      '<div class="stat hl"><span class="k">النطاق</span><span class="v">' + f(a.low) + ' – ' + f(a.high) + '</span></div></div>';
  }

  /** Number line of evidence values with indicated marker and range band. */
  function dotPlot(rows, indicated, low, high, fmt) {
    var vals = rows.filter(function (r) { return r.valid && isNum(r.value); }).map(function (r) { return r.value; });
    if (!vals.length) return '';
    var lo = Math.min.apply(null, vals.concat(isNum(low) ? [low] : [])), hi = Math.max.apply(null, vals.concat(isNum(high) ? [high] : []));
    var pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad;
    var x = function (v) { return ((v - lo) / (hi - lo) * 100).toFixed(2) + '%'; };
    var h = '<div class="dots" role="img" aria-label="توزيع المقارنات"><div class="axis"></div>';
    if (isNum(low) && isNum(high)) h += '<div class="band" style="left:' + x(low) + ';width:calc(' + x(high) + ' - ' + x(low) + ')"></div>';
    rows.forEach(function (r) {
      if (!r.valid || !isNum(r.value)) return;
      h += '<div class="dot ' + (!r.used ? (r.outlier ? 'out' : 'off') : '') + '" style="left:' + x(r.value) + '" title="' + esc((r.label || '') + ': ' + fmt(r.value)) + '"></div>';
    });
    if (isNum(indicated)) h += '<div class="mark" style="left:' + x(indicated) + '"><span>' + fmt(indicated) + '</span></div>';
    h += '<span class="tick" style="left:3%">' + fmt(lo + pad) + '</span><span class="tick" style="left:97%">' + fmt(hi - pad) + '</span>';
    return h + '</div>';
  }

  function pasteButton(target, kind) { return btn('openPaste', 'لصق من Excel', 'data-target="' + target + '" data-kind="' + kind + '"', 'ghost'); }

  // ------------------------------------------------------------ tab: case
  function tabCase(R) {
    return '<section class="panel"><div class="panel-head"><h2>بيانات المهمة والعقار</h2></div><div class="form">' +
      field('اسم الحالة / العقار', inp('case.name')) + field('العميل', inp('case.client')) + field('الغرض من التقييم', inp('case.purpose')) +
      field('أساس القيمة', inp('case.basis')) + field('نوع العقار', inp('case.propertyType')) + field('الموقع', inp('case.location')) +
      field('رقم الصك / المرجع', inp('case.deed')) + field('تاريخ التقييم', inp('case.valuationDate', { type: 'date' })) + field('تاريخ المعاينة', inp('case.inspectionDate', { type: 'date' })) +
      field('مساحة الأرض م²', inp('case.landArea', { num: 1 })) +
      field('المساحة التأجيرية GLA م²', inp('case.gla', { num: 1 }), 'فارغة = مجموع مساحات جدول الوحدات (' + N(R.noi.rentRoll.totals.area) + ' م²)') +
      field('العملة', inp('case.currency')) + field('تقريب القيم إلى', inp('case.rounding', { num: 1 }), 'مثال: 10,000 أو 100,000') +
      field('المقيّم', inp('case.appraiser')) + field('ملاحظات', area('case.notes'), '', 'wide') +
      '</div></section>' +
      '<section class="panel"><div class="panel-head"><h2>مسار العمل</h2></div>' +
      '<ol class="trace"><li>الإيجار السوقي: أدخل أو الصق المقارنات الإيجارية؛ تُنظّف الأرقام وتُحوّل إلى ريال/م²/سنة وتُرصد الشواذ.</li>' +
      '<li>الدخل وNOI: جدول الوحدات يأخذ الإيجار السوقي من المقارنات تلقائياً أو يدوياً، ثم الشغور والمصروفات.</li>' +
      '<li>معدل الرسملة: من الصفقات، النطاق الاستثماري، البناء التراكمي، أو تقارير السوق، مع إمكانية الترجيح أو التحديد المهني.</li>' +
      '<li>الرسملة المباشرة وDCF والمقارنات البيعية تُحسب فورياً، ثم الحساسية والتسوية والتقرير.</li></ol>' +
      '<p class="hint">كل حقل قابل للتعديل، وأي نتيجة يمكن تجاوزها مهنياً مع تسجيل المبرر. البيانات تُحفظ في هذا المتصفح فقط؛ استخدم «تصدير الحالة» لحفظ نسخة.</p></section>';
  }

  // ------------------------------------------------------------ tab: rent
  function tabRent(R) {
    var ra = R.rent;
    var all = ra.all.rows;
    var cols = [
      { h: 'مستخدم', f: function (r, i, p) { return '<input type="checkbox" data-path="' + p + '.include"' + (r.include !== false ? ' checked' : '') + ' aria-label="استخدام المقارن">'; } },
      { h: 'الوصف', cls: 'w-l', f: function (r, i, p) { return inp(p + '.label', { ph: 'الموقع / العقار' }); } },
      { h: 'الفئة', cls: 'w-s', f: function (r, i, p) { return inp(p + '.category', { ph: 'مكاتب', list: 'cats' }); } },
      { h: 'الإيجار', cls: 'w-s', f: function (r, i, p) { return inp(p + '.rent', { num: 1 }); } },
      { h: 'الفترة', cls: 'w-s', f: function (r, i, p) { return sel(p + '.period', [['annual', 'سنوي'], ['monthly', 'شهري']]); } },
      { h: 'الأساس', cls: 'w-s', f: function (r, i, p) { return sel(p + '.basis', [['total', 'إجمالي الوحدة'], ['perM2', 'للمتر']]); } },
      { h: 'المساحة م²', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.area', { num: 1 }); } },
      { h: 'التاريخ', cls: 'w-s', f: function (r, i, p) { return inp(p + '.date', { ph: '2026-06' }); } },
      { h: 'تعديلات % (زمن، موقع، مساحة، حالة، عمر، أخرى)', f: function (r, i, p) { return adjCells(p); } },
      { h: 'الوزن', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.weight', { num: 1 }); } },
      { h: 'ر.س/م²/سنة', num: 1, cls: 'computed', f: function (r, i) { return N(all[i] && all[i].base); } },
      { h: 'التعديل', num: 1, f: function (r, i) { return all[i] ? Pc(all[i].adjPct, 1) : ''; } },
      { h: 'بعد التعديل', num: 1, cls: 'computed', f: function (r, i) { return N(all[i] && all[i].value); } },
      { h: 'الحالة', f: function (r, i) { return evidenceStatus(catRow(ra, i) || all[i]); } }
    ];
    var cats = ra.categories.length ? ra.categories : [''];
    var cards = cats.map(function (c) {
      var a = c ? ra.byCategory[c] : ra.all;
      var ov = c ? '<div class="form">' + field('معدل معتمد مهنياً لهذه الفئة (اختياري)', inp('rentComps.overrides.' + c, { num: 1, ph: 'فارغ = المستخلص' })) + '</div>' : '';
      var applied = ra.rateFor(c);
      return '<div class="method"><div class="panel-head"><h2>' + (c ? 'فئة: ' + esc(c) : 'جميع المقارنات') + '</h2>' +
        '<span class="mv">' + N(applied) + ' <small>' + cur() + '/م²</small></span></div>' +
        dotPlot(a.rows, a.indicated, a.low, a.high, function (v) { return N(v); }) + statsBlock(a, function (v) { return N(v); }, cur() + '/م²') + ov +
        warnList(a.warnings) + '</div>';
    }).join('');
    return '<section class="panel"><div class="panel-head"><h2>المقارنات الإيجارية</h2><div class="tools">' +
      btn('addRow', 'إضافة مقارن', 'data-list="rentComps.rows" data-tpl="rentComp"', 'ghost') + pasteButton('rentComps.rows', 'rent') + btn('copyTable', 'نسخ الجدول', 'data-table="t-rent"', 'ghost') + '</div></div>' +
      '<p class="hint">تقبل الحقول الأرقام العربية والفواصل والعملة. الإيجار الشهري يُحوّل إلى سنوي، والإجمالي يُقسم على المساحة. التعديلات نسب مئوية موجبة أو سالبة على المقارن ليعادل العقار محل التقييم.</p>' +
      editTable('rentComps.rows', cols, { id: 't-rent', rowClass: function (r, i) { return rowClassFor(catRow(ra, i) || all[i]); } }) +
      evidenceControls('rentComps') + '</section>' +
      '<section class="panel"><div class="panel-head"><h2>الإيجار السوقي المستخلص لكل فئة</h2></div>' +
      '<p class="hint">جدول الوحدات في «الدخل وNOI» يستخدم هذه المعدلات تلقائياً عندما يكون مصدر الإيجار «من المقارنات» وتطابق الفئة.</p>' +
      '<div class="cols">' + cards + '</div></section>';
  }
  function catRow(ra, i) {
    var r = ra.all.rows[i];
    if (!r || !r.category || !ra.byCategory[r.category]) return null;
    var list = ra.byCategory[r.category].rows, idx = 0;
    for (var k = 0; k < i; k++) if (ra.all.rows[k].category === r.category) idx++;
    return list[idx];
  }

  // ------------------------------------------------------------- tab: NOI
  function tabNOI(R) {
    var n = R.noi, rr = n.rentRoll;
    var m = state.model;
    var direct = m.income.mode === 'direct';
    var cols = [
      { h: 'الوصف', cls: 'w-m', f: function (r, i, p) { return inp(p + '.label'); } },
      { h: 'الفئة', cls: 'w-s', f: function (r, i, p) { return inp(p + '.category', { list: 'cats' }); } },
      { h: 'عدد الوحدات', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.units', { num: 1 }); } },
      { h: 'مساحة الوحدة م²', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.area', { num: 1 }); } },
      { h: 'المؤجر', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.occupied', { num: 1 }); } },
      { h: 'الإيجار التعاقدي للوحدة', cls: 'w-s', f: function (r, i, p) { return inp(p + '.contractRent', { num: 1 }); } },
      { h: 'سنوات متبقية بالعقد', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.leaseYears', { num: 1, ph: '∞' }); } },
      { h: 'زيادة دورية %', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.escPct', { num: 1, ph: '0' }); } },
      { h: 'كل (سنة)', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.escEvery', { num: 1, ph: '1' }); } },
      { h: 'شغور عند الانتهاء (شهر)', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.voidMonths', { num: 1, ph: '0' }); } },
      { h: 'تكلفة تأجير (شهر)', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.leasingMonths', { num: 1, ph: '0' }); } },
      { h: 'مصدر الإيجار السوقي', cls: 'w-s', f: function (r, i, p) { return sel(p + '.marketSource', [['comps', 'من المقارنات'], ['manual', 'يدوي (م²)']]); } },
      { h: 'السوقي ر.س/م²', cls: 'w-s', f: function (r, i, p) { return r.marketSource === 'comps' ? '<span class="chip link">' + N(rr.rows[i] && rr.rows[i].marketRate) + '</span>' : inp(p + '.marketRate', { num: 1 }); } },
      { h: 'أساس الدخل', cls: 'w-s', f: function (r, i, p) { return sel(p + '.basis', [['default', 'الافتراضي'], ['blended', 'تعاقدي للمؤجر + سوقي للشاغر'], ['contract', 'تعاقدي'], ['market', 'سوقي']]); } },
      { h: 'السوقي للوحدة', num: 1, cls: 'computed', f: function (r, i) { return N(rr.rows[i] && rr.rows[i].marketUnit); } },
      { h: 'فرق السوقي عن التعاقدي', num: 1, f: function (r, i) { var g = rr.rows[i] && rr.rows[i].reversionGap; return isNum(g) ? '<span class="chip ' + (g > 0.05 ? 'warn' : g < -0.05 ? 'bad' : 'muted') + '">' + P(g, 1) + '</span>' : '—'; } },
      { h: 'الدخل المحتمل PGI', num: 1, cls: 'computed', f: function (r, i) { return N(rr.rows[i] && rr.rows[i].pgi); } }
    ];
    var foot = '<tfoot><tr><td>الإجمالي</td><td></td><td class="num">' + N(rr.totals.units) + '</td><td class="num">' + N(rr.totals.area) + ' م²</td><td class="num">' + N(rr.totals.occupied) +
      '</td><td colspan="11">الإشغال الفعلي ' + P(rr.totals.physicalOccupancy, 1) + ' · الإيجار السوقي الكامل ' + N(rr.totals.marketTotal) + ' · التعاقدي ' + N(rr.totals.contractTotal) + '</td><td class="num">' + N(rr.totals.pgi) + '</td><td></td></tr></tfoot>';

    var opCols = [
      { h: 'البند', cls: 'w-l', f: function (r, i, p) { return inp(p + '.label'); } },
      { h: 'أساس الاحتساب', cls: 'w-m', f: function (r, i, p) { return sel(p + '.basis', [['fixed', 'مبلغ سنوي ثابت'], ['perM2', 'ريال لكل م² GLA'], ['pctEGI', '% من الدخل الفعلي EGI'], ['pctPGI', '% من الدخل المحتمل PGI']]); } },
      { h: 'القيمة المدخلة', cls: 'w-s', f: function (r, i, p) { return inp(p + '.amount', { num: 1 }); } },
      { h: 'المبلغ السنوي', num: 1, cls: 'computed', f: function (r, i) { return N(n.opexLines[i] && n.opexLines[i].amount); } },
      { h: '% من EGI', num: 1, f: function (r, i) { return n.opexLines[i] ? P(n.opexLines[i].amount / n.egi, 1) : ''; } },
      { h: 'ر.س/م²', num: 1, f: function (r, i) { return n.opexLines[i] ? N(n.opexLines[i].amount / n.gla, 1) : ''; } }
    ];

    var stmt = [
      ['إجمالي الدخل المحتمل PGI', n.pgi, 'sub'], ['خسارة الشغور (' + P(n.vacancyPct, 1) + ')', -n.vacancyLoss], ['خسارة التحصيل (' + P(n.collectionPct, 1) + ')', -n.collectionLoss],
      ['دخل آخر (مواقف، لوحات، خدمات)', n.otherIncome], ['الدخل الفعلي الإجمالي EGI', n.egi, 'sub']
    ];
    if (n.relettingLoss) stmt.splice(3, 0, ['فاقد إعادة التأجير عند انتهاء العقود', -n.relettingLoss]);
    stmt = stmt.concat(n.opexLines.map(function (l) { return ['  ' + (l.label || 'مصروف'), -l.amount]; })).concat([
      ['إجمالي المصروفات التشغيلية (' + P(n.opexRatio, 1) + ' من EGI)', -n.opex, 'sub'], ['صافي الدخل التشغيلي المحسوب', n.noiComputed, 'sub']
    ]);
    if (n.overridden) stmt.push(['تجاوز مهني', n.noi - n.noiComputed]);
    stmt.push(['صافي الدخل التشغيلي المعتمد NOI', n.noi, 'total']);

    return '<section class="panel"><div class="panel-head"><h2>مصدر الدخل</h2></div><div class="form">' +
      field('طريقة احتساب الدخل المحتمل', sel('income.mode', [['rentroll', 'جدول الوحدات (موصى به)'], ['direct', 'إدخال PGI مباشرة']])) +
      (direct ? field('إجمالي الدخل المحتمل السنوي', inp('income.pgiDirect', { num: 1 })) :
        field('أساس الدخل الافتراضي', sel('income.rentBasis', [['blended', 'تعاقدي للمؤجر + سوقي للشاغر'], ['market', 'سوقي بالكامل'], ['contract', 'تعاقدي بالكامل']]), 'للرسملة المباشرة على أساس السوق اختر «سوقي بالكامل»') +
        field('الإيجار التعاقدي مدخل', sel('income.contractPeriod', [['annual', 'سنوياً للوحدة'], ['monthly', 'شهرياً للوحدة']]))) +
      '</div>' + (direct ? '' : '<div class="panel-head"><h3>جدول الوحدات Rent Roll</h3><div class="tools">' + btn('addRow', 'إضافة صف', 'data-list="income.units" data-tpl="unit"', 'ghost') + '</div></div>' +
        editTable('income.units', cols, { id: 't-units', foot: foot }) +
        '<p class="hint">«سنوات متبقية بالعقد»: بعد انتهائها يتحول الصف إلى الإيجار السوقي، مع فاقد شغور وتكلفة تأجير في سنة إعادة التأجير. الزيادة الدورية تُطبق على الإيجار التعاقدي فقط، ونمو السوق في DCF يُطبق على الإيجار السوقي فقط. اترك المدة فارغة لإبقاء العقد دائماً.</p>') +
      '</section>' +
      '<div class="cols"><section class="panel"><div class="panel-head"><h2>الشغور والتحصيل والدخل الآخر</h2></div><div class="form">' +
      field('نسبة الشغور والفاقد %', inp('income.vacancyPct', { num: 1 }), 'من إجمالي الدخل المحتمل') +
      field('خسارة التحصيل %', inp('income.collectionLossPct', { num: 1 }), 'من الدخل بعد الشغور') +
      field('دخل آخر سنوي', inp('income.otherIncome', { num: 1 })) + '</div>' +
      '<div class="panel-head"><h2>المصروفات التشغيلية</h2></div><div class="form">' +
      field('طريقة الإدخال', sel('opex.mode', [['itemized', 'بنود تفصيلية'], ['ratio', 'نسبة إجمالية من EGI']])) +
      (m.opex.mode === 'ratio' ? field('نسبة المصروفات %', inp('opex.ratio', { num: 1 })) : '') + '</div>' +
      (m.opex.mode === 'ratio' ? '' : editTable('opex.lines', opCols, { id: 't-opex' }) + '<div>' + btn('addRow', 'إضافة بند', 'data-list="opex.lines" data-tpl="opexLine"', 'ghost') + '</div>') +
      '</section>' +
      '<section class="panel"><div class="panel-head"><h2>قائمة صافي الدخل التشغيلي</h2><div class="tools">' + btn('copyTable', 'نسخ', 'data-table="t-stmt"', 'ghost') + '</div></div>' +
      '<div class="scroll"><table class="stmt" id="t-stmt"><thead><tr><th>البند</th><th class="num">سنوي (' + esc(cur()) + ')</th><th class="num">ر.س/م²</th></tr></thead><tbody>' +
      stmt.map(function (s) { return '<tr class="' + (s[2] || '') + '"><td>' + esc(s[0]) + '</td><td class="num ' + (s[1] < 0 ? 'neg' : '') + '">' + N(s[1]) + '</td><td class="num">' + N(s[1] / n.gla, 1) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' + traceList(n.trace) +
      '<div class="panel-head"><h3>تجاوز مهني لصافي الدخل</h3></div>' +
      '<div class="form">' + '<div class="field"><span class="lbl">التفعيل</span>' + chk('noiOverride.enabled', 'اعتماد NOI مختلف عن المحسوب') + '</div>' +
      (m.noiOverride.enabled ? field('NOI المعتمد', inp('noiOverride.value', { num: 1 })) + field('المبرر', inp('noiOverride.note', { ph: 'مثال: حسب القوائم المدققة 2025' }), '', 'wide') : '') + '</div>' +
      warnList(n.warnings) + '</section></div>';
  }

  // -------------------------------------------------------------- tab: cap
  function tabCap(R) {
    var c = R.cap, m = state.model, a = c.methods.comps.detail;
    var cols = [
      { h: 'مستخدم', f: function (r, i, p) { return '<input type="checkbox" data-path="' + p + '.include"' + (r.include !== false ? ' checked' : '') + ' aria-label="استخدام">'; } },
      { h: 'الصفقة', cls: 'w-l', f: function (r, i, p) { return inp(p + '.label'); } },
      { h: 'سعر البيع', cls: 'w-s', f: function (r, i, p) { return inp(p + '.price', { num: 1 }); } },
      { h: 'صافي الدخل NOI', cls: 'w-s', f: function (r, i, p) { return inp(p + '.noi', { num: 1 }); } },
      { h: 'أو معدل معلن %', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.capRate', { num: 1 }); } },
      { h: 'التاريخ', cls: 'w-s', f: function (r, i, p) { return inp(p + '.date'); } },
      { h: 'تعديل (نقطة %)', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.adjPts', { num: 1 }); } },
      { h: 'الوزن', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.weight', { num: 1 }); } },
      { h: 'المعدل الضمني', num: 1, cls: 'computed', f: function (r, i) { return a.rows[i] ? Pc(a.rows[i].base) : ''; } },
      { h: 'بعد التعديل', num: 1, cls: 'computed', f: function (r, i) { return a.rows[i] ? Pc(a.rows[i].value) : ''; } },
      { h: 'الحالة', f: function (r, i) { return evidenceStatus(a.rows[i]); } }
    ];
    var band = c.methods.band, bu = c.methods.buildup, sv = c.methods.survey;
    var sel0 = m.cap.selection;
    var on = function (k) { return sel0 === k || (sel0 === 'weighted' && E.numOr(m.cap.weights[k], 0) > 0) ? ' on' : ''; };
    var pf = function (v) { return isNum(v) ? v.toFixed(2) + '%' : '—'; };

    var methodVals = ['comps', 'band', 'buildup', 'survey'].map(function (k) { return { label: c.methods[k].label, value: c.methods[k].value, valid: isNum(c.methods[k].value), used: true }; });

    return '<section class="panel"><div class="panel-head"><h2>أدلة معدل الرسملة من الصفقات</h2><div class="tools">' +
      btn('addRow', 'إضافة صفقة', 'data-list="cap.rows" data-tpl="capComp"', 'ghost') + pasteButton('cap.rows', 'cap') + btn('copyTable', 'نسخ', 'data-table="t-cap"', 'ghost') + '</div></div>' +
      '<p class="hint">المعدل الضمني = NOI ÷ سعر البيع. عند عدم توفر NOI أدخل المعدل المعلن للصفقة. «التعديل» بالنقاط المئوية لفروق الموقع/الجودة/المخاطر (موجب = مخاطر أعلى في العقار محل التقييم).</p>' +
      editTable('cap.rows', cols, { id: 't-cap', rowClass: function (r, i) { return rowClassFor(a.rows[i]); } }) +
      evidenceControls('cap') + dotPlot(a.rows, a.indicated, a.low, a.high, pf) + statsBlock(a, pf, '%') + warnList(a.warnings) + '</section>' +

      '<section class="panel"><div class="panel-head"><h2>طرق اشتقاق بديلة</h2></div><div class="cols-3">' +
      '<div class="method' + on('comps') + '"><h3>مقارنات السوق</h3><span class="mv">' + pf(c.methods.comps.value) + '</span><small>من ' + a.stats.n + ' صفقات مستخدمة · النطاق ' + pf(a.low) + ' – ' + pf(a.high) + '</small></div>' +
      '<div class="method' + on('band') + '"><h3>النطاق الاستثماري Band of Investment</h3><div class="form">' +
      field('نسبة التمويل LTV %', inp('cap.band.ltv', { num: 1 })) + field('معدل الفائدة %', inp('cap.band.rate', { num: 1 })) +
      field('مدة القرض (سنوات)', inp('cap.band.years', { num: 1 })) + field('عائد حقوق الملكية %', inp('cap.band.equityRate', { num: 1 })) + '</div>' +
      '<small>ثابت الرهن السنوي ' + P(band.mc) + ' · ' + P(band.ltv, 0) + ' × ' + P(band.mc) + ' + ' + P(1 - band.ltv, 0) + ' × ' + P(band.edr) + '</small><span class="mv">' + pf(band.value) + '</span></div>' +
      '<div class="method' + on('buildup') + '"><h3>البناء التراكمي</h3><div class="form">' + field('العائد الخالي من المخاطر %', inp('cap.buildup.riskFree', { num: 1 })) + '</div>' +
      editTable('cap.buildup.premiums', [
        { h: 'العلاوة', cls: 'w-m', f: function (r, i, p) { return inp(p + '.label'); } },
        { h: '%', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.value', { num: 1 }); } }]) +
      '<div>' + btn('addRow', 'إضافة علاوة', 'data-list="cap.buildup.premiums" data-tpl="premium"', 'ghost sm') + '</div>' +
      '<div class="form">' + field('النمو طويل الأجل g %', inp('cap.buildup.growth', { num: 1 })) + '</div>' +
      '<small>معدل الخصم ' + pf(bu.discount) + ' − النمو ' + pf(bu.growth) + '</small><span class="mv">' + pf(bu.value) + '</span>' +
      '<div>' + btn('useDiscount', 'استخدم ' + pf(bu.discount) + ' كمعدل خصم في DCF', '', 'ghost sm') + '</div></div>' +
      '<div class="method' + on('survey') + '"><h3>تقارير ومسوح السوق</h3><div class="form">' +
      field('المعدل %', inp('cap.survey.value', { num: 1 })) + field('الأدنى %', inp('cap.survey.low', { num: 1 })) + field('الأعلى %', inp('cap.survey.high', { num: 1 })) +
      field('المصدر', inp('cap.survey.source'), '', 'wide') + '</div><span class="mv">' + pf(sv.value) + '</span></div>' +
      '</div></section>' +

      '<section class="panel"><div class="panel-head"><h2>اختيار معدل الرسملة</h2></div>' +
      dotPlot(methodVals, c.selected, c.low, c.high, pf) +
      '<div class="form">' + field('الأساس', sel('cap.selection', [['comps', 'مقارنات السوق'], ['band', 'النطاق الاستثماري'], ['buildup', 'البناء التراكمي'], ['survey', 'تقارير السوق'], ['weighted', 'ترجيح بين الطرق'], ['manual', 'تحديد مهني']])) +
      (sel0 === 'manual' ? field('المعدل المعتمد %', inp('cap.manual', { num: 1 })) : '') +
      (sel0 === 'weighted' ? field('وزن المقارنات', inp('cap.weights.comps', { num: 1 })) + field('وزن النطاق الاستثماري', inp('cap.weights.band', { num: 1 })) +
        field('وزن البناء التراكمي', inp('cap.weights.buildup', { num: 1 })) + field('وزن تقارير السوق', inp('cap.weights.survey', { num: 1 })) : '') +
      field('نطاق المعدل', sel('cap.rangeMode', [['spread', '± نقاط أساس'], ['evidence', 'نطاق أدلة الصفقات'], ['manual', 'يدوي']])) +
      (m.cap.rangeMode === 'manual' ? field('الأدنى %', inp('cap.rangeLow', { num: 1 })) + field('الأعلى %', inp('cap.rangeHigh', { num: 1 })) : m.cap.rangeMode === 'evidence' ? '' : field('± نقاط أساس', inp('cap.rangeBps', { num: 1 }))) +
      field('مبرر الاختيار', area('cap.note', { ph: 'مثال: الوسيط بعد استبعاد صفقة السليمانية لقدم المبنى، ويتسق مع تقارير السوق.' }), '', 'wide') + '</div>' +
      '<div class="result"><span class="lab">المعدل المعتمد</span><span class="big">' + pf(c.selected) + '</span><span class="lab">النطاق ' + pf(c.low) + ' – ' + pf(c.high) + ' · ' + esc(c.basisText) + '</span></div>' +
      warnList(c.warnings) + '</section>';
  }

  // ----------------------------------------------------------- tab: direct
  function tabDirect(R) {
    var d = R.direct, n = R.noi, c = R.cap, r = state.model.case.rounding, m = state.model;
    var steps = [-100, -75, -50, -25, 0, 25, 50, 75, 100];
    var vals = steps.map(function (s) { return s === 0 ? d.value : E.runAll(E.withShocks(m, { capBps: s }), { skipRange: true }).direct.value; });
    var tbl = '<div class="scroll"><table id="t-dsteps"><thead><tr><th>معدل الرسملة</th>' + steps.map(function (s) { return '<th class="num">' + (c.selected + s / 100).toFixed(2) + '%</th>'; }).join('') + '</tr></thead><tbody><tr><td>القيمة</td>' +
      vals.map(function (v, i) { return '<td class="num' + (steps[i] === 0 ? ' computed' : '') + '">' + N(E.roundTo(v, r)) + '</td>'; }).join('') + '</tr><tr><td>التغير</td>' +
      vals.map(function (v) { return '<td class="num">' + P(v / d.value - 1, 1) + '</td>'; }).join('') + '</tr></tbody></table></div>';
    var hasLeases = m.income.mode !== 'direct' && (m.income.units || []).some(function (u) { return E.num(u.contractRent) > 0; });
    var ld = d.leaseDetail;
    var leaseTbl = d.method === 'market' && ld && ld.years.length ? '<div class="scroll"><table class="stmt" id="t-lease"><thead><tr><th>السنة</th><th class="num">NOI حسب العقود</th><th class="num">تكلفة إعادة التأجير</th><th class="num">NOI بالإيجار السوقي</th><th class="num">الفرق</th><th class="num">القيمة الحالية</th></tr></thead><tbody>' +
      ld.years.map(function (y) { return '<tr><td>' + (y.year === 'perp' ? 'ما بعد ذلك (دائم)' : 'سنة ' + y.year) + '</td><td class="num">' + N(y.asIs) + '</td><td class="num neg">' + (y.leasing ? N(-y.leasing) : '—') + '</td><td class="num">' + N(y.market) + '</td><td class="num ' + (y.diff < 0 ? 'neg' : '') + '">' + N(y.diff) + '</td><td class="num">' + N(y.pv) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td colspan="5">تسوية العقود القائمة</td><td class="num">' + N(d.leaseAdj) + '</td></tr></tfoot></table></div>' : '';
    var methodPanel = hasLeases ? '<section class="panel"><div class="panel-head"><h2>أساس الرسملة للعقار المؤجر</h2><div class="tools">' + (leaseTbl ? btn('copyTable', 'نسخ', 'data-table="t-lease"', 'ghost') : '') + '</div></div><div class="form">' +
      field('الطريقة', sel('direct.method', [['market', 'سوقي + تسوية العقود (المدة والارتداد)'], ['asIs', 'رسملة الدخل الحالي كما هو']])) +
      (m.direct.method === 'market' ? field('معدل خصم فروق العقود %', inp('direct.leaseRate', { num: 1, ph: 'فارغ = معدل الرسملة' }), 'معدل أقل من معدل الرسملة يعكس أمان الإيجار التعاقدي') : '') + '</div>' +
      '<p class="hint">«سوقي + تسوية العقود» يرسمل الدخل بالإيجار السوقي لكل الوحدات، ثم يضيف القيمة الحالية لفرق الدخل التعاقدي عن السوقي حتى انتهاء كل عقد، شاملاً الزيادات الدورية وفاقد وتكاليف إعادة التأجير. عند تساوي معدل الخصم مع معدل الرسملة تطابق النتيجة طريقة المدة والارتداد. «كما هو» يرسمل الإيجار التعاقدي كأنه دائم.</p>' +
      leaseTbl + warnList(d.warnings) + '</section>' : '';
    return '<section class="panel"><div class="panel-head"><h2>الرسملة المباشرة</h2></div>' +
      '<div class="result"><span class="lab">القيمة (' + esc(cur()) + ')</span><span class="big">' + N(d.rounded) + '</span><span class="lab">النطاق ' + N(E.roundTo(d.low, r)) + ' – ' + N(E.roundTo(d.high, r)) + '</span></div>' +
      '<ul class="kv"><li>' + (d.method === 'market' ? 'NOI بالإيجار السوقي' : 'صافي الدخل التشغيلي NOI') + ' <b>' + N(d.method === 'market' ? d.marketNoi : n.noi) + '</b></li><li>معدل الرسملة <b>' + P(c.selected / 100) + '</b></li>' +
      (d.method === 'market' ? '<li>تسوية العقود القائمة <b>' + N(d.leaseAdj) + '</b></li><li>NOI الحالي حسب العقود <b>' + N(n.noi) + '</b></li>' : '') +
      '<li>القيمة للمتر المربع GLA <b>' + N(d.perM2) + '</b></li><li>مضاعف الدخل الفعلي EGIM <b>' + N(d.multiplier, 2) + '</b></li>' +
      '<li>العائد على القيمة المقربة <b>' + P(n.noi / d.rounded) + '</b></li><li>تعديلات بعد الرسملة <b>' + N(d.adjSum) + '</b></li></ul>' +
      traceList(d.trace) + '</section>' + methodPanel +
      '<section class="panel"><div class="panel-head"><h2>تعديلات بعد الرسملة</h2><div class="tools">' + btn('addRow', 'إضافة تعديل', 'data-list="direct.adjustments" data-tpl="adjustment"', 'ghost') + '</div></div>' +
      '<p class="hint">مبالغ تُضاف أو تُطرح من القيمة المرسملة: مصروفات رأسمالية مؤجلة، تكاليف تأجير، فرق إيجار أقل من السوق، أرض زائدة. أدخل الطرح بإشارة سالبة.</p>' +
      editTable('direct.adjustments', [
        { h: 'البند', cls: 'w-l', f: function (r, i, p) { return inp(p + '.label'); } },
        { h: 'المبلغ', cls: 'w-s', f: function (r, i, p) { return inp(p + '.amount', { num: 1 }); } }]) + '</section>' +
      '<section class="panel"><div class="panel-head"><h2>القيمة عند معدلات مختلفة</h2><div class="tools">' + btn('copyTable', 'نسخ', 'data-table="t-dsteps"', 'ghost') + '</div></div>' + tbl + '</section>';
  }

  // -------------------------------------------------------------- tab: DCF
  function tabDCF(R) {
    var d = R.dcf, c = R.cap, bu = c.methods.buildup;
    var rowsDef = [
      ['إجمالي الدخل المحتمل', 'pgi'], ['شغور وتحصيل', 'vacancyLoss', -1], ['فاقد إعادة التأجير', 'relet', -1], ['دخل آخر', 'other'], ['الدخل الفعلي EGI', 'egi', 1, 'sub'], ['المصروفات التشغيلية', 'opex', -1],
      ['تعديل التجاوز المهني', 'overrideAdj'], ['صافي الدخل NOI', 'noi', 1, 'sub'], ['مصروفات رأسمالية', 'capex', -1], ['تكاليف إعادة التأجير', 'leasing', -1], ['صافي التدفق النقدي', 'cf', 1, 'sub'],
      ['معامل الخصم', 'df', 1, '', 4], ['القيمة الحالية', 'pv', 1, 'total']
    ];
    if (!R.noi.overridden) rowsDef = rowsDef.filter(function (x) { return x[1] !== 'overrideAdj'; });
    ['relet', 'leasing'].forEach(function (k) { if (!d.rows.some(function (y) { return y[k]; })) rowsDef = rowsDef.filter(function (x) { return x[1] !== k; }); });
    var yrs = d.rows.concat([d.forward]);
    var table = '<div class="scroll"><table class="stmt" id="t-dcf"><thead><tr><th>البند / السنة</th>' + yrs.map(function (y, i) { return '<th class="num">' + (i === d.rows.length ? 'سنة ' + y.year + ' (للتخارج)' : 'سنة ' + y.year) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rowsDef.map(function (rd) {
        return '<tr class="' + (rd[3] || '') + '"><td>' + rd[0] + '</td>' + yrs.map(function (y, i) {
          if (i === d.rows.length && ['df', 'pv', 'cf', 'capex', 'leasing'].indexOf(rd[1]) >= 0) return '<td></td>';
          var v = y[rd[1]] * (rd[2] || 1);
          return '<td class="num ' + (v < 0 ? 'neg' : '') + '">' + (rd[4] ? v.toFixed(rd[4]) : N(v)) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '<tr><td>نسبة الشغور</td>' + yrs.map(function (y) { return '<td class="num">' + P(y.vacancyPct, 1) + '</td>'; }).join('') + '</tr></tbody></table></div>';
    var sugg = isNum(c.selected) ? (c.baseSelected + E.series(state.model.dcf.rentGrowth, 3, 0)[2]).toFixed(2) : '—';
    return '<section class="panel"><div class="panel-head"><h2>افتراضات التدفقات النقدية المخصومة</h2></div><div class="form">' +
      field('فترة الاحتفاظ (سنوات)', inp('dcf.years', { num: 1 })) +
      field('نمو الإيجار السنوي %', inp('dcf.rentGrowth', { num: 1 }), 'قيمة واحدة أو قائمة تبدأ من السنة 2؛ آخر قيمة تتكرر. مثال: 0, 2.5') +
      field('نمو المصروفات السنوي %', inp('dcf.expenseGrowth', { num: 1 }), 'ينطبق على البنود الثابتة وبنود ريال/م²') +
      field('الشغور لكل سنة %', inp('dcf.vacancy', { num: 1, ph: 'فارغ = ' + state.model.income.vacancyPct + '%' }), 'مثال لفترة تأجير: 15, 10, 7') +
      field('معدل الخصم %', inp('dcf.discountRate', { num: 1 }), 'مرجع: البناء التراكمي ' + (isNum(bu.discount) ? bu.discount.toFixed(2) : '—') + '% · معدل الرسملة + النمو ≈ ' + sugg + '%') +
      field('معدل الرسملة التخارجي %', inp('dcf.exitCap', { num: 1, ph: 'فارغ = المعتمد + هامش' }), 'فارغ = ' + (isNum(c.baseSelected) ? c.baseSelected.toFixed(2) : '—') + '% + الهامش') +
      field('هامش التخارج (نقاط أساس)', inp('dcf.exitSpreadBps', { num: 1 })) +
      field('تكاليف البيع %', inp('dcf.sellingCostPct', { num: 1 })) +
      field('احتياطي رأسمالي % من EGI', inp('dcf.capexPct', { num: 1 })) +
      field('مصروفات رأسمالية محددة', inp('dcf.capexSchedule', { ph: '5:450000; 8:200000' }), 'السنة:المبلغ مفصولة بـ ;') +
      field('أساس NOI للتخارج', sel('dcf.exitBasis', [['next', 'السنة التالية لنهاية الفترة'], ['final', 'السنة الأخيرة']])) +
      field('توقيت التدفقات', sel('dcf.timing', [['end', 'نهاية السنة'], ['mid', 'منتصف السنة']])) +
      field('نطاق القيمة ± نقاط أساس', inp('dcf.rangeBps', { num: 1 }), 'يُطبق على معدل الخصم والتخارج معاً') +
      '</div></section>' +
      '<section class="panel"><div class="panel-head"><h2>النتيجة</h2></div>' +
      '<div class="result"><span class="lab">قيمة DCF (' + esc(cur()) + ')</span><span class="big">' + N(d.rounded) + '</span><span class="lab">النطاق ' + N(E.roundTo(d.low, state.model.case.rounding)) + ' – ' + N(E.roundTo(d.high, state.model.case.rounding)) + ' (± ' + d.rangeBps + ' نقطة أساس)</span></div>' +
      '<ul class="kv"><li>القيمة الحالية للتدفقات <b>' + N(d.pvCF) + '</b></li><li>القيمة الحالية للتخارج <b>' + N(d.pvRev) + '</b></li>' +
      '<li>حصة التخارج من القيمة <b>' + P(d.reversionShare, 1) + '</b></li><li>معدل الدخول الضمني <b>' + P(d.goingIn) + '</b></li>' +
      '<li>معدل التخارج <b>' + P(d.exitCap) + '</b></li><li>نمو NOI السنوي المركب <b>' + P(d.noiCagr) + '</b></li>' +
      '<li>قيمة التخارج الإجمالية <b>' + N(d.gross) + '</b></li><li>صافي التخارج بعد تكاليف البيع <b>' + N(d.net) + '</b></li></ul>' +
      traceList(d.trace) + warnList(d.warnings) + '</section>' +
      '<section class="panel"><div class="panel-head"><h2>جدول التدفقات النقدية</h2><div class="tools">' + btn('copyTable', 'نسخ إلى Excel', 'data-table="t-dcf"', 'ghost') + '</div></div>' + table + '</section>';
  }

  // ------------------------------------------------------------ tab: sales
  function tabSales(R) {
    var s = R.sales, a = s.analysis;
    var cols = [
      { h: 'مستخدم', f: function (r, i, p) { return '<input type="checkbox" data-path="' + p + '.include"' + (r.include !== false ? ' checked' : '') + ' aria-label="استخدام">'; } },
      { h: 'الوصف', cls: 'w-l', f: function (r, i, p) { return inp(p + '.label'); } },
      { h: 'السعر', cls: 'w-s', f: function (r, i, p) { return inp(p + '.price', { num: 1 }); } },
      { h: 'الأساس', cls: 'w-s', f: function (r, i, p) { return sel(p + '.basis', [['total', 'سعر إجمالي'], ['perM2', 'سعر للمتر']]); } },
      { h: 'المساحة م²', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.area', { num: 1 }); } },
      { h: 'التاريخ', cls: 'w-s', f: function (r, i, p) { return inp(p + '.date'); } },
      { h: 'تعديلات % (زمن، موقع، مساحة، حالة، عمر، أخرى)', f: function (r, i, p) { return adjCells(p); } },
      { h: 'الوزن', cls: 'w-xs', f: function (r, i, p) { return inp(p + '.weight', { num: 1 }); } },
      { h: 'ر.س/م²', num: 1, cls: 'computed', f: function (r, i) { return N(a.rows[i] && a.rows[i].base); } },
      { h: 'التعديل', num: 1, f: function (r, i) { return a.rows[i] ? Pc(a.rows[i].adjPct, 1) : ''; } },
      { h: 'بعد التعديل', num: 1, cls: 'computed', f: function (r, i) { return N(a.rows[i] && a.rows[i].value); } },
      { h: 'الحالة', f: function (r, i) { return evidenceStatus(a.rows[i]); } }
    ];
    return '<section class="panel"><div class="panel-head"><h2>المقارنات البيعية</h2><div class="tools">' +
      btn('addRow', 'إضافة مقارن', 'data-list="sales.rows" data-tpl="saleComp"', 'ghost') + pasteButton('sales.rows', 'sales') + btn('copyTable', 'نسخ', 'data-table="t-sales"', 'ghost') + '</div></div>' +
      editTable('sales.rows', cols, { id: 't-sales', rowClass: function (r, i) { return rowClassFor(a.rows[i]); } }) +
      evidenceControls('sales') +
      '<div class="form">' + field('مساحة العقار محل التقييم م²', inp('sales.subjectArea', { num: 1, ph: 'فارغ = GLA ' + N(E.num(state.model.case.gla)) })) + '</div>' +
      dotPlot(a.rows, a.indicated, a.low, a.high, function (v) { return N(v); }) + statsBlock(a, function (v) { return N(v); }, cur() + '/م²') +
      '<div class="result"><span class="lab">القيمة بالمقارنة</span><span class="big">' + N(s.rounded) + '</span><span class="lab">' + N(s.rate) + ' ' + esc(cur()) + '/م² × ' + N(s.area) + ' م² · النطاق ' + N(s.low) + ' – ' + N(s.high) + '</span></div>' +
      warnList(a.warnings) + '</section>';
  }

  // ------------------------------------------------------------- tab: sens
  var VAR_OPTS = Object.keys(E.SHOCKS).map(function (k) { return [k, E.SHOCKS[k].label + ' (' + E.SHOCKS[k].unit + ')']; });
  var METRIC_OPTS = Object.keys(E.METRICS).map(function (k) { return [k, E.METRICS[k].label]; });

  function tornadoHtml(t) {
    var maxD = t.rows.reduce(function (mx, r) { return Math.max(mx, Math.abs(r.dDown || 0), Math.abs(r.dUp || 0)); }, 0) || 1;
    return '<div class="tornado">' + t.rows.map(function (r) {
      var seg = function (d, side) {
        if (!isNum(d) || d === 0) return '';
        var w = Math.abs(d) / maxD * 48;
        var left = d < 0 ? 50 - w : 50;
        return '<div class="seg ' + (d < 0 ? 'neg' : 'pos') + '" style="left:' + left + '%;width:' + w + '%" title="' + side + '"></div>' +
          '<span class="lbl" style="' + (d < 0 ? 'right:' + (50 + w + 1) + '%' : 'left:' + (50 + w + 1) + '%') + '">' + (d > 0 ? '+' : '') + (d * 100).toFixed(1) + '%</span>';
      };
      return '<div class="trow"><div>' + esc(r.label) + ' <small>±' + r.step + ' ' + r.unit + '</small></div><div class="tbar"><div class="c"></div>' +
        (r.swing ? seg(r.dDown, 'انخفاض') + seg(r.dUp, 'ارتفاع') : '<span class="lbl" style="left:52%;color:var(--muted)">لا يؤثر على هذا المقياس</span>') + '</div></div>';
    }).join('') + '</div>';
  }

  function tabSens(R) {
    var m = state.model, sn = m.sens;
    var t = E.tornado(m, sn.metric, sn.steps);
    var size = Math.max(1, Math.min(4, Math.round(E.numOr(sn.gridSize, 2))));
    var rs = E.numOr(sn.rowStep, E.SHOCKS[sn.rowVar].step), cs = E.numOr(sn.colStep, E.SHOCKS[sn.colVar].step);
    var rSteps = [], cSteps = [];
    for (var i = -size; i <= size; i++) { rSteps.push(i * rs); cSteps.push(i * cs); }
    var g = E.grid(m, sn.gridMetric, sn.rowVar, rSteps, sn.colVar, cSteps);
    var heat = function (v) {
      var d = v / g.base - 1; if (!isNum(d)) return '';
      var a = Math.min(0.55, Math.abs(d) * 2.2);
      return 'background:color-mix(in srgb, ' + (d >= 0 ? 'var(--good)' : 'var(--bad)') + ' ' + (a * 100).toFixed(0) + '%, var(--surface))';
    };
    var gridHtml = '<div class="scroll"><table class="heat" id="t-grid"><thead><tr><th>' + esc(E.SHOCKS[sn.rowVar].label) + ' ↓ / ' + esc(E.SHOCKS[sn.colVar].label) + ' →</th>' +
      cSteps.map(function (c) { return '<th class="num">' + (c > 0 ? '+' : '') + c + ' ' + E.SHOCKS[sn.colVar].unit + '</th>'; }).join('') + '</tr></thead><tbody>' +
      g.cells.map(function (row, ri) {
        return '<tr><th class="num">' + (rSteps[ri] > 0 ? '+' : '') + rSteps[ri] + ' ' + E.SHOCKS[sn.rowVar].unit + '</th>' + row.map(function (v, ci) {
          return '<td class="num' + (rSteps[ri] === 0 && cSteps[ci] === 0 ? ' base' : '') + '" style="' + heat(v) + '">' + N(E.roundTo(v, m.case.rounding)) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';

    var sc = E.scenarios(m);
    var shockKeys = ['rentPct', 'vacancyPts', 'opexPct', 'capBps', 'discountBps', 'exitCapBps', 'growthPts', 'voidMonths', 'salePct'];
    var scTable = '<div class="scroll"><table class="grid" id="t-scen"><thead><tr><th>السيناريو</th><th>الاحتمال %</th>' +
      shockKeys.map(function (k) { return '<th>' + esc(E.SHOCKS[k].label) + ' <small>' + E.SHOCKS[k].unit + '</small></th>'; }).join('') +
      '<th class="num">NOI</th><th class="num">معدل الرسملة</th><th class="num">الرسملة المباشرة</th><th class="num">DCF</th><th class="num">المرجحة</th><th class="rowact"></th></tr></thead><tbody>' +
      (m.scenarios || []).map(function (s, i) {
        var r = sc.list[i], p = 'scenarios.' + i;
        return '<tr><td class="w-s">' + inp(p + '.name') + '</td><td class="w-xs">' + inp(p + '.prob', { num: 1 }) + '</td>' +
          shockKeys.map(function (k) { return '<td class="w-xs">' + inp(p + '.shocks.' + k, { num: 1, ph: '0' }) + '</td>'; }).join('') +
          '<td class="num">' + N(r.noi) + '</td><td class="num">' + Pc(r.cap) + '</td><td class="num">' + N(r.direct) + '</td><td class="num">' + N(r.dcf) + '</td><td class="num computed">' + N(r.final) + '</td>' +
          '<td class="rowact">' + btn('delRow', 'حذف', 'data-list="scenarios" data-i="' + i + '"', 'danger sm') + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    var be = m.sens.beTarget ? (function () {
      var target = E.num(m.sens.beTarget), key = m.sens.beVar || 'capBps';
      var st = E.SHOCKS[key].step * 40;
      var x = E.breakEven(m, sn.metric, key, target, -st, st);
      return isNum(x) ? 'لتصل ' + E.METRICS[sn.metric].label + ' إلى ' + N(target) + ' يلزم تغيير «' + E.SHOCKS[key].label + '» بمقدار ' + (x > 0 ? '+' : '') + x.toFixed(2) + ' ' + E.SHOCKS[key].unit + '.' : 'لا يمكن بلوغ القيمة المستهدفة ضمن نطاق معقول لهذا المتغير.';
    })() : '';

    return '<section class="panel"><div class="panel-head"><h2>أثر كل افتراض على القيمة</h2></div><div class="form">' +
      field('المقياس', sel('sens.metric', METRIC_OPTS)) +
      Object.keys(E.SHOCKS).map(function (k) { return field('خطوة ' + E.SHOCKS[k].label + ' (' + E.SHOCKS[k].unit + ')', inp('sens.steps.' + k, { num: 1, ph: String(E.SHOCKS[k].step) })); }).join('') +
      '</div><p class="hint">القيمة الأساسية ' + N(t.base) + '. الأشرطة مرتبة من الأكثر تأثيراً؛ الأخضر = ارتفاع القيمة، الأحمر = انخفاضها، والجانب يعكس اتجاه تغير الافتراض (يسار = خفض، يمين = رفع).</p>' +
      tornadoHtml(t) +
      '<div class="scroll"><table id="t-tornado"><thead><tr><th>الافتراض</th><th class="num">عند الخفض</th><th class="num">التغير</th><th class="num">عند الرفع</th><th class="num">التغير</th><th class="num">مدى التأثير</th></tr></thead><tbody>' +
      t.rows.map(function (r) { return '<tr><td>' + esc(r.label) + ' (±' + r.step + ' ' + r.unit + ')</td><td class="num">' + N(r.down) + '</td><td class="num">' + P(r.dDown, 1) + '</td><td class="num">' + N(r.up) + '</td><td class="num">' + P(r.dUp, 1) + '</td><td class="num">' + N(r.swing) + '</td></tr>'; }).join('') +
      '</tbody></table></div></section>' +

      '<section class="panel"><div class="panel-head"><h2>جدول الحساسية الثنائي</h2><div class="tools">' + btn('copyTable', 'نسخ', 'data-table="t-grid"', 'ghost') + '</div></div><div class="form">' +
      field('المقياس', sel('sens.gridMetric', METRIC_OPTS)) + field('متغير الصفوف', sel('sens.rowVar', VAR_OPTS)) + field('خطوة الصفوف', inp('sens.rowStep', { num: 1 })) +
      field('متغير الأعمدة', sel('sens.colVar', VAR_OPTS)) + field('خطوة الأعمدة', inp('sens.colStep', { num: 1 })) + field('عدد الخطوات لكل اتجاه', inp('sens.gridSize', { num: 1 })) +
      '</div>' + gridHtml + '</section>' +

      '<section class="panel"><div class="panel-head"><h2>السيناريوهات</h2><div class="tools">' + btn('addRow', 'إضافة سيناريو', 'data-list="scenarios" data-tpl="scenario"', 'ghost') + btn('copyTable', 'نسخ', 'data-table="t-scen"', 'ghost') + '</div></div>' +
      '<p class="hint">كل سيناريو مجموعة تغييرات على الحالة الأساسية بنفس وحدات جدول الحساسية. الاحتمالات تُستخدم للقيمة المرجحة بالاحتمال فقط.</p>' + scTable +
      '<div class="result"><span class="lab">القيمة المرجحة بالاحتمال</span><span class="big">' + N(E.roundTo(sc.weighted, m.case.rounding)) + '</span><span class="lab">مجموع الاحتمالات ' + N(sc.totalProb) + '%' + (Math.abs(sc.totalProb - 100) > 0.01 ? ' — يُطبّع تلقائياً' : '') + '</span></div></section>' +

      '<section class="panel"><div class="panel-head"><h2>نقطة التعادل</h2></div><div class="form">' +
      field('القيمة المستهدفة (' + E.METRICS[sn.metric].label + ')', inp('sens.beTarget', { num: 1, ph: 'مثال: سعر العرض' })) + field('المتغير', sel('sens.beVar', VAR_OPTS)) + '</div>' +
      (be ? '<div class="result"><span class="lab">' + esc(be) + '</span></div>' : '<p class="hint">أدخل قيمة مستهدفة (مثل سعر العرض أو قيمة الرهن) لمعرفة التغير المطلوب في أي افتراض لبلوغها.</p>') + '</section>';
  }

  // ----------------------------------------------------------- tab: report
  function tabReport(R) {
    var m = state.model, rc = R.recon, cs = m.case, r = cs.rounding;
    var t = E.tornado(m, 'final', m.sens.steps);
    var sc = E.scenarios(m);
    var ap = rc.approaches.map(function (x) {
      return '<tr><td>' + x.label + '</td><td class="w-xs">' + inp('recon.weights.' + x.key, { num: 1 }) + '</td><td class="num">' + P(x.share, 0) + '</td><td class="num">' + N(x.r && x.r.rounded) +
        '</td><td class="num">' + N(x.r && E.roundTo(x.r.low, r)) + ' – ' + N(x.r && E.roundTo(x.r.high, r)) + '</td><td class="num computed">' + (x.ok ? N(x.share * x.r.value) : '—') + '</td></tr>';
    }).join('');
    var rentCats = R.rent.categories.map(function (c) { return '<li>الإيجار السوقي «' + esc(c) + '» <b>' + N(R.rent.rateFor(c)) + ' ' + esc(cur()) + '/م²</b></li>'; }).join('');
    var basisLabel = { blended: 'تعاقدي للمؤجر + سوقي للشاغر', market: 'سوقي بالكامل', contract: 'تعاقدي بالكامل' }[m.income.rentBasis] || '';
    var assumptions = '<ul class="kv">' + rentCats +
      '<li>أساس الدخل <b>' + (m.income.mode === 'direct' ? 'PGI مدخل مباشرة' : basisLabel) + '</b></li>' +
      '<li>أساس الرسملة المباشرة <b>' + (R.direct.method === 'market' ? 'سوقي + تسوية العقود (' + N(R.direct.leaseAdj) + ')' : 'الدخل الحالي كما هو') + '</b></li>' +
      '<li>الدخل المحتمل PGI <b>' + N(R.noi.pgi) + '</b></li><li>الشغور / التحصيل <b>' + P(R.noi.vacancyPct, 1) + ' / ' + P(R.noi.collectionPct, 1) + '</b></li>' +
      '<li>الدخل الفعلي EGI <b>' + N(R.noi.egi) + '</b></li><li>نسبة المصروفات <b>' + P(R.noi.opexRatio, 1) + '</b></li>' +
      '<li>صافي الدخل NOI' + (R.noi.overridden ? ' (مُتجاوز)' : '') + ' <b>' + N(R.noi.noi) + '</b></li><li>معدل الرسملة <b>' + P(R.cap.selected / 100) + ' (' + P(R.cap.low / 100) + ' – ' + P(R.cap.high / 100) + ')</b></li>' +
      '<li>أساس المعدل <b>' + esc(R.cap.basisText) + '</b></li><li>فترة DCF <b>' + R.dcf.years + ' سنوات</b></li>' +
      '<li>نمو الإيجار / المصروفات <b>' + esc(m.dcf.rentGrowth) + ' / ' + esc(m.dcf.expenseGrowth) + ' %</b></li><li>معدل الخصم / التخارج <b>' + P(R.dcf.discountRate) + ' / ' + P(R.dcf.exitCap) + '</b></li>' +
      '<li>تكاليف البيع <b>' + P(E.pct(m.dcf.sellingCostPct, 0), 1) + '</b></li><li>سعر المتر بالمقارنة <b>' + N(R.sales.rate) + '</b></li></ul>';
    var capEvidence = R.cap.methods.comps.detail.rows.map(function (x) { return '<tr><td>' + esc(x.label) + '</td><td class="num">' + Pc(x.base) + '</td><td class="num">' + Pc(x.value) + '</td><td>' + evidenceStatus(x) + '</td></tr>'; }).join('');

    return '<section class="panel"><div class="panel-head"><h2>التسوية بين الطرق</h2></div>' +
      '<div class="scroll"><table class="grid" id="t-recon"><thead><tr><th>الطريقة</th><th>الوزن</th><th class="num">الحصة</th><th class="num">القيمة</th><th class="num">النطاق</th><th class="num">المساهمة</th></tr></thead><tbody>' + ap +
      '</tbody><tfoot><tr><td>القيمة المرجحة</td><td></td><td></td><td class="num">' + N(E.roundTo(rc.weighted, r)) + '</td><td class="num">' + N(rc.low) + ' – ' + N(rc.high) + '</td><td></td></tr></tfoot></table></div>' +
      '<div class="form"><div class="field"><span class="lbl">القيمة النهائية</span>' + chk('recon.overrideEnabled', 'اعتماد قيمة نهائية يحددها المقيّم') + '</div>' +
      (m.recon.overrideEnabled ? field('القيمة المعتمدة', inp('recon.overrideValue', { num: 1 })) + field('مبرر التجاوز', inp('recon.overrideNote'), '', 'wide') : '') +
      field('مبررات الترجيح', area('recon.rationale'), '', 'wide') + '</div>' +
      '<div class="result gold"><span class="lab">القيمة السوقية المقدرة (' + esc(cur()) + ')</span><span class="big">' + N(rc.rounded) + '</span><span class="lab">النطاق ' + N(rc.low) + ' – ' + N(rc.high) + ' · ' + N(rc.perM2) + ' ' + esc(cur()) + '/م² GLA</span></div>' +
      '<div class="panel-head"><h3>التنبيهات والفحوص</h3></div>' + warnList(R.warnings, 'لا توجد تنبيهات على المدخلات الحالية.') + '</section>' +

      '<section class="panel report" id="report"><div class="panel-head"><h2>ملخص التقييم</h2><div class="tools no-print">' +
      (inFrame ? '' : btn('print', 'طباعة / PDF', '', 'ghost')) + btn('copyReport', 'نسخ الملخص نصاً', '', 'ghost') + '</div></div>' +
      '<dl><dt>العقار</dt><dd>' + esc(cs.name) + '</dd><dt>الموقع</dt><dd>' + esc(cs.location) + '</dd><dt>العميل</dt><dd>' + esc(cs.client) + '</dd><dt>الغرض</dt><dd>' + esc(cs.purpose) + '</dd>' +
      '<dt>أساس القيمة</dt><dd>' + esc(cs.basis) + '</dd><dt>تاريخ التقييم</dt><dd><bdi>' + esc(cs.valuationDate) + '</bdi></dd><dt>المساحة التأجيرية</dt><dd>' + N(R.noi.gla) + ' م²</dd></dl>' +
      '<h3>الافتراضات الرئيسية</h3>' + assumptions +
      '<h3>قائمة صافي الدخل</h3>' + traceList(R.noi.trace) +
      '<h3>أدلة معدل الرسملة</h3><div class="scroll"><table><thead><tr><th>الصفقة</th><th class="num">الضمني</th><th class="num">المعدل بعد التعديل</th><th>الحالة</th></tr></thead><tbody>' + capEvidence + '</tbody></table></div>' +
      (m.cap.note ? '<p>' + esc(m.cap.note) + '</p>' : '') +
      '<h3>نتائج الطرق</h3><ul class="kv"><li>الرسملة المباشرة <b>' + N(R.direct.rounded) + '</b></li><li>DCF <b>' + N(R.dcf.rounded) + '</b></li><li>المقارنات البيعية <b>' + N(R.sales.rounded) + '</b></li>' +
      '<li>القيمة النهائية <b>' + N(rc.rounded) + '</b></li></ul>' +
      '<h3>أكثر الافتراضات تأثيراً</h3><ul class="kv">' + t.rows.filter(function (x) { return x.swing; }).slice(0, 5).map(function (x) {
        return '<li>' + esc(x.label) + ' ±' + x.step + ' ' + x.unit + ' <b>' + P(x.dDown, 1) + ' / ' + P(x.dUp, 1) + '</b></li>';
      }).join('') + '</ul>' +
      '<h3>السيناريوهات</h3><ul class="kv">' + sc.list.map(function (s) { return '<li>' + esc(s.name) + ' (' + N(s.prob) + '%) <b>' + N(E.roundTo(s.final, r)) + '</b></li>'; }).join('') + '</ul>' +
      (m.recon.rationale ? '<h3>مبررات الترجيح</h3><p>' + esc(m.recon.rationale) + '</p>' : '') +
      (cs.notes ? '<h3>ملاحظات</h3><p>' + esc(cs.notes) + '</p>' : '') + '</section>';
  }

  // ------------------------------------------------------------- tab: bench
  function tabBench() {
    var bm = state.model.benchmark;
    var b = E.benchmark(state.model, bm);
    var targets = Object.keys(E.BENCH_TARGETS).map(function (k) { return [k, E.BENCH_TARGETS[k].label]; });
    var form = '<section class="panel"><div class="panel-head"><h2>اختبار الأداة على حالة معتمدة</h2></div>' +
      '<p class="hint">أدخل قيمة سبق أن اعتمدتها لهذا العقار، ثم ما تعرفه من افتراضاتك. تستبدل الأداة افتراضاتها بافتراضاتك واحداً تلو الآخر وتعيد الحساب كاملاً بعد كل خطوة، فيظهر أثر كل بند على القيمة، وما يبقى بعد ذلك هو الفرق غير المفسَّر. الحدود أدناه قابلة للتعديل وتُحدَّد قبل النظر في النتيجة.</p>' +
      '<div class="form">' +
      field('القيمة المعتمدة (' + esc(cur()) + ')', inp('benchmark.value', { num: 1, ph: 'من تقريرك الموقّع' })) +
      field('تُقارن مع', sel('benchmark.target', targets)) +
      field('حد التطابق ±%', inp('benchmark.tolerancePct', { num: 1 }), 'الشرط 1') +
      field('حد غير المفسَّر ±%', inp('benchmark.residualPct', { num: 1, ph: 'فارغ = حد التطابق' }), 'الشرط 2') +
      field('حد المادية لأثر العقود %', inp('benchmark.materialityPct', { num: 1 }), 'الشرط 3') +
      '</div><div class="panel-head"><h3>افتراضاتك في التقرير المعتمد (أدخل ما تعرفه فقط)</h3></div><div class="form">' +
      field('طريقة الرسملة', sel('benchmark.leaseMethod', [['', 'لا أعرف / لا تستبدل'], ['asIs', 'رسملة الدخل الحالي'], ['market', 'سوقي + تسوية العقود']])) +
      field('نسبة الشغور %', inp('benchmark.vacancyPct', { num: 1 })) +
      field('صافي الدخل NOI', inp('benchmark.noi', { num: 1 })) +
      field('معدل الرسملة %', inp('benchmark.capRate', { num: 1 })) +
      field('معدل الخصم %', inp('benchmark.discountRate', { num: 1 })) +
      field('وزن الرسملة المباشرة', inp('benchmark.wDirect', { num: 1 })) +
      field('وزن DCF', inp('benchmark.wDcf', { num: 1 })) +
      field('وزن المقارنات', inp('benchmark.wSales', { num: 1 })) +
      field('ملاحظة عن الحالة', inp('benchmark.note', { ph: 'رقم التقرير، التاريخ، نوع الأصل' }), '', 'wide') +
      '</div></section>';
    if (!b.ready) return form + '<section class="panel"><p class="hint">أدخل القيمة المعتمدة لتظهر النتيجة.</p></section>';

    var condChip = function (c) {
      if (c.applicable === false) return chip('لا ينطبق', 'muted');
      return chip(c.pass ? 'ناجح' : 'راسب', c.pass ? 'good' : 'bad');
    };
    var conds = '<div class="scroll"><table class="stmt" id="t-bench-cond"><thead><tr><th>الشرط</th><th>النتيجة</th><th>القياس</th></tr></thead><tbody>' +
      b.conditions.map(function (c, i) { return '<tr><td>' + (i + 1) + '. ' + esc(c.label) + '</td><td>' + condChip(c) + '</td><td>' + ltrNums(esc(c.detail)) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    var rows = [['قيمة الأداة (' + b.target + ')', b.toolValue, NaN, NaN, 'total']]
      .concat(b.steps.map(function (s) { return ['↳ ' + s.label, s.delta, s.deltaPct, s.alone, '']; }))
      .concat([['المتبقي غير المفسَّر', b.residual, b.residualPct, NaN, ''], ['القيمة المعتمدة', b.signed, b.gapPct, NaN, 'total']]);
    var bridge = '<div class="scroll"><table class="stmt" id="t-bench"><thead><tr><th>البند</th><th class="num">الأثر بالتتابع (' + esc(cur()) + ')</th><th class="num">% من الأداة</th><th class="num">أثره منفرداً</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr class="' + r[4] + '"><td>' + ltrNums(esc(r[0])) + '</td><td class="num">' + M(r[1]) + '</td><td class="num">' + Pf(r[2]) + '</td><td class="num">' + M(r[3]) + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="hint">الأثر بالتتابع يعتمد على ترتيب الاستبدال (العقود، الشغور، NOI، معدل الرسملة، معدل الخصم، الأوزان). عمود «أثره منفرداً» يبيّن أثر كل بند وحده على قيمة الأداة، والفرق بين العمودين هو تداخل البنود.</p>';
    var acts = '<ul class="warnings">' + b.actions.map(function (a) { return '<li class="' + (a.kind === 'go' ? 'ok' : '') + '">' + chip(a.kind === 'stop' ? 'أوقف' : a.kind === 'go' ? 'استمر' : 'غيّر', a.kind === 'stop' ? 'bad' : a.kind === 'go' ? 'good' : 'warn') + ' ' + ltrNums(esc(a.text)) + '</li>'; }).join('') + '</ul>';
    return form +
      '<section class="panel"><div class="panel-head"><h2>النتيجة</h2><div class="tools">' + btn('copyTable', 'نسخ الجسر', 'data-table="t-bench"', 'ghost') + '</div></div>' +
      '<div class="result ' + (b.passed ? '' : 'gold') + '"><span class="lab">الفرق عن القيمة المعتمدة</span><span class="big">' + Pf(b.gapPct) + '</span><span class="lab">' + (b.passed ? 'اجتازت الشروط' : 'لم تجتز كل الشروط') + ' · الأداة ' + M(b.toolValue) + ' · المعتمدة ' + M(b.signed) + '</span></div>' +
      conds + '<div class="panel-head"><h3>جسر الفروقات</h3></div>' + bridge +
      '<div class="panel-head"><h3>القرار المترتب</h3></div>' + acts + '</section>';
  }

  // ---------------------------------------------------------------- shell
  function kpis(R) {
    var r = state.model.case.rounding;
    var k = function (tab, label, v, s, cls) { return '<button type="button" class="kpi ' + (cls || '') + '" data-action="tab" data-tab="' + tab + '"><span class="k">' + label + '</span><span class="v">' + v + '</span><span class="s">' + (s || '&nbsp;') + '</span></button>'; };
    return '<div class="strip">' +
      k('noi', 'صافي الدخل NOI', N(R.noi.noi), R.noi.overridden ? 'تجاوز مهني' : 'EGI ' + N(R.noi.egi)) +
      k('cap', 'معدل الرسملة', P(R.cap.selected / 100), P(R.cap.low / 100) + ' – ' + P(R.cap.high / 100)) +
      k('direct', 'الرسملة المباشرة', N(R.direct.rounded), N(E.roundTo(R.direct.low, r)) + ' – ' + N(E.roundTo(R.direct.high, r))) +
      k('dcf', 'DCF', N(R.dcf.rounded), N(E.roundTo(R.dcf.low, r)) + ' – ' + N(E.roundTo(R.dcf.high, r))) +
      k('sales', 'المقارنات البيعية', N(R.sales.rounded), N(R.sales.rate) + ' /م²') +
      k('report', 'القيمة النهائية', N(R.recon.rounded), N(R.recon.low) + ' – ' + N(R.recon.high), 'final') +
      k('report', 'تنبيهات', String(R.warnings.length), R.warnings.length ? 'راجعها قبل الاعتماد' : 'لا توجد', R.warnings.length ? 'alerts' : '') +
      '</div>';
  }

  function modal() {
    var md = state.ui.modal;
    if (!md) return '';
    var body = '';
    if (md.type === 'paste') {
      body = '<h2>لصق بيانات من Excel أو CSV</h2><p class="hint">انسخ الصفوف مع سطر العناوين من Excel والصقها هنا. تتعرف الأداة على العناوين العربية والإنجليزية (الوصف، الفئة، الإيجار، السعر، المساحة، صافي الدخل، معدل الرسملة، الفترة، التاريخ، الوزن). بدون عناوين يُفترض ترتيب: ' +
        (md.kind === 'cap' ? 'الوصف، السعر، NOI، المعدل' : md.kind === 'sales' ? 'الوصف، السعر، المساحة' : 'الوصف، الفئة، الإيجار، المساحة') + '.</p>' +
        '<textarea id="paste-text" aria-label="البيانات الملصقة"></textarea><div class="tools">' + btn('doPaste', 'إضافة الصفوف') + btn('closeModal', 'إلغاء', '', 'ghost') + '</div>';
    } else if (md.type === 'export') {
      body = '<h2>تصدير الحالة</h2><p class="hint">احفظ هذا النص في ملف .json لاسترجاع الحالة لاحقاً أو مشاركتها.</p><textarea id="export-text" readonly>' + esc(JSON.stringify(state.model, null, 1)) + '</textarea><div class="tools">' +
        btn('copyExport', 'نسخ') + (inFrame ? '' : btn('downloadExport', 'تنزيل ملف', '', 'ghost')) + btn('closeModal', 'إغلاق', '', 'ghost') + '</div>';
    } else if (md.type === 'import') {
      body = '<h2>استيراد حالة</h2><p class="hint">اختر ملف JSON سبق تصديره، أو الصق محتواه.</p><input type="file" id="import-file" accept=".json,application/json"><textarea id="import-text" aria-label="نص الحالة"></textarea>' +
        '<div class="tools">' + btn('doImport', 'استيراد') + btn('closeModal', 'إلغاء', '', 'ghost') + '</div>';
    }
    return '<div class="modal-bg" data-action="bgClose"><div class="modal" role="dialog" aria-modal="true">' + body + '</div></div>';
  }

  function datalist() {
    var cats = {};
    (state.model.rentComps.rows || []).forEach(function (r) { if (r.category) cats[r.category] = 1; });
    (state.model.income.units || []).forEach(function (r) { if (r.category) cats[r.category] = 1; });
    return '<datalist id="cats">' + Object.keys(cats).map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>';
  }

  var TAB_FN = { case: tabCase, rent: tabRent, noi: tabNOI, cap: tabCap, direct: tabDirect, dcf: tabDCF, sales: tabSales, sens: tabSens, report: tabReport, bench: tabBench };

  function render() {
    var a = document.activeElement, fp = null, ss = null, se = null;
    if (a && a.dataset && a.dataset.path) { fp = a.dataset.path; try { ss = a.selectionStart; se = a.selectionEnd; } catch (e) { /* select */ } }
    var scrolls = Array.prototype.map.call(root.querySelectorAll('.scroll'), function (el) { return el.scrollLeft; });
    var R;
    try { R = E.runAll(state.model); } catch (err) { root.innerHTML = '<div class="panel"><h2>تعذر الحساب</h2><p>' + esc(err.message) + '</p>' + btn('loadSample', 'تحميل الحالة النموذجية') + '</div>'; console.error(err); return; }
    var c = state.ui.confirm;
    var confirmBar = c ? '<span class="chip warn">' + (c === 'newCase' ? 'سيتم مسح الحالة الحالية' : 'سيتم استبدال الحالة الحالية بالنموذج') + '</span>' + btn(c, 'تأكيد', 'data-confirmed="1"', 'sm') + btn('cancelConfirm', 'إلغاء', '', 'ghost sm') : '';
    root.innerHTML =
      '<header class="top"><div class="brand"><span class="eyebrow">مُقيِّم الدخل · أداة تقييم عقاري</span><h1>' + esc(state.model.case.name || 'حالة بدون اسم') + '</h1></div>' +
      '<div class="actions">' + (confirmBar || btn('newCase', 'حالة جديدة', '', 'ghost') + btn('loadSample', 'الحالة النموذجية', '', 'ghost') + btn('openExport', 'تصدير الحالة', '', 'ghost') + btn('openImport', 'استيراد حالة', '', 'ghost')) + '</div></header>' +
      kpis(R) +
      '<nav class="steps" aria-label="مراحل التقييم">' + TABS.map(function (t, i) { return '<button type="button" data-action="tab" data-tab="' + t[0] + '"' + (state.tab === t[0] ? ' aria-current="page"' : '') + '><span class="n">' + (i + 1) + '</span>' + t[1] + '</button>'; }).join('') + '</nav>' +
      '<main class="view">' + (TAB_FN[state.tab] || tabCase)(R) + '</main>' + datalist() + modal() +
      (state.ui.toast ? '<div class="toast" role="status">' + esc(state.ui.toast) + '</div>' : '');
    Array.prototype.forEach.call(root.querySelectorAll('.scroll'), function (el, i) { if (scrolls[i]) el.scrollLeft = scrolls[i]; });
    if (fp) {
      var el = root.querySelector('[data-path="' + (window.CSS && CSS.escape ? CSS.escape(fp) : fp) + '"]');
      if (el) { el.focus({ preventScroll: true }); try { if (ss !== null) el.setSelectionRange(ss, se); } catch (e) { /* not text */ } }
    }
    save();
  }

  var pending = false;
  function scheduleRender() { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; render(); }); }
  var toastTimer;
  function toast(msg) { state.ui.toast = msg; render(); clearTimeout(toastTimer); toastTimer = setTimeout(function () { state.ui.toast = ''; render(); }, 2600); }

  function copyText(text, okMsg) {
    var done = function () { toast(okMsg || 'تم النسخ'); };
    var fallback = function () {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta); toast(ok ? (okMsg || 'تم النسخ') : 'تعذر النسخ التلقائي؛ حدد النص وانسخه يدوياً');
    };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  }

  function tableToTSV(id) {
    var t = document.getElementById(id); if (!t) return '';
    return Array.prototype.map.call(t.rows, function (tr) {
      return Array.prototype.map.call(tr.cells, function (td) {
        if (td.classList.contains('rowact')) return null;
        var ins = td.querySelectorAll('input:not([type=checkbox]), select');
        var cb = td.querySelector('input[type=checkbox]');
        var txt = cb && !ins.length ? (cb.checked ? '✓' : '') : ins.length ? Array.prototype.map.call(ins, function (x) { return x.tagName === 'SELECT' ? x.options[x.selectedIndex].text : x.value; }).join(' ') : td.innerText;
        return txt.replace(/[\t\n]+/g, ' ').trim();
      }).filter(function (x) { return x !== null; }).join('\t');
    }).join('\n');
  }

  function reportText() {
    var el = document.getElementById('report');
    return el ? el.innerText.replace(/\n{3,}/g, '\n\n') : '';
  }

  // -------------------------------------------------------------- actions
  var actions = {
    tab: function (d) { state.tab = d.tab; try { history.replaceState(null, '', '#' + d.tab); } catch (e) { /* frame */ } render(); window.scrollTo(0, 0); },
    addRow: function (d) { var l = get(d.list); if (!Array.isArray(l)) { set(d.list, []); l = get(d.list); } l.push(TPL[d.tpl]()); render(); },
    delRow: function (d) { var l = get(d.list); l.splice(+d.i, 1); render(); },
    newCase: function (d) { if (!d.confirmed) { state.ui.confirm = 'newCase'; return render(); } state.ui.confirm = null; state.model = S.empty(); state.tab = 'case'; toast('بدأت حالة جديدة'); },
    loadSample: function (d) { if (!d.confirmed) { state.ui.confirm = 'loadSample'; return render(); } state.ui.confirm = null; state.model = S.sample(); toast('تم تحميل الحالة النموذجية'); },
    cancelConfirm: function () { state.ui.confirm = null; render(); },
    openPaste: function (d) { state.ui.modal = { type: 'paste', target: d.target, kind: d.kind }; render(); var t = document.getElementById('paste-text'); if (t) t.focus(); },
    doPaste: function () {
      var md = state.ui.modal, text = (document.getElementById('paste-text') || {}).value || '';
      var res = E.importRows(text, md.kind);
      var list = get(md.target) || [];
      res.rows.forEach(function (r) { var tpl = TPL[md.kind === 'rent' ? 'rentComp' : md.kind === 'sales' ? 'saleComp' : 'capComp'](); list.push(Object.assign(tpl, r, { adj: Object.assign(tpl.adj || {}, r.adj || {}) })); });
      set(md.target, list);
      state.ui.modal = null;
      toast('أضيف ' + res.rows.length + ' صف' + (res.skipped ? ' · تجاهل ' + res.skipped + ' صف بدون قيمة صالحة' : ''));
    },
    openExport: function () { state.ui.modal = { type: 'export' }; render(); },
    copyExport: function () { copyText(JSON.stringify(state.model, null, 1), 'تم نسخ الحالة'); },
    downloadExport: function () {
      var blob = new Blob([JSON.stringify(state.model, null, 1)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (state.model.case.name || 'valuation').replace(/[\\/:*?"<>|]/g, '_') + '.json';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    openImport: function () { state.ui.modal = { type: 'import' }; render(); },
    doImport: function () {
      var text = (document.getElementById('import-text') || {}).value || '';
      try {
        var m = JSON.parse(text);
        if (!m || !m.case || !m.income) throw new Error('shape');
        var base = S.sample();
        Object.keys(base).forEach(function (k) { if (m[k] === undefined) m[k] = base[k]; });
        state.model = m; state.ui.modal = null; toast('تم استيراد الحالة');
      } catch (e) { toast('الملف ليس حالة صالحة من هذه الأداة'); }
    },
    closeModal: function () { state.ui.modal = null; render(); },
    bgClose: function (d, el, ev) { if (ev.target === el) { state.ui.modal = null; render(); } },
    copyTable: function (d) { copyText(tableToTSV(d.table), 'تم نسخ الجدول — الصقه في Excel'); },
    copyReport: function () { copyText(reportText(), 'تم نسخ الملخص'); },
    print: function () { window.print(); },
    useDiscount: function () { var v = E.computeCapRate(state.model).methods.buildup.discount; if (isNum(v)) { state.model.dcf.discountRate = v.toFixed(2); toast('تم تحديث معدل الخصم إلى ' + v.toFixed(2) + '%'); } }
  };

  // --------------------------------------------------------------- events
  root.addEventListener('input', function (e) {
    var t = e.target;
    if (!t.dataset || !t.dataset.path || t.type === 'checkbox') return;
    set(t.dataset.path, t.value);
    scheduleRender();
  });
  root.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'import-file' && t.files && t.files[0]) {
      var fr = new FileReader();
      fr.onload = function () { var ta = document.getElementById('import-text'); if (ta) ta.value = fr.result; };
      fr.readAsText(t.files[0]);
      return;
    }
    if (!t.dataset || !t.dataset.path) return;
    set(t.dataset.path, t.type === 'checkbox' ? t.checked : t.value);
    render();
  });
  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-action]');
    if (!b || !actions[b.dataset.action]) return;
    actions[b.dataset.action](b.dataset, b, e);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.ui.modal) { state.ui.modal = null; render(); } });

  // migrate older saved cases missing newer keys
  (function migrate() {
    var base = S.sample();
    Object.keys(base).forEach(function (k) { if (state.model[k] === undefined) state.model[k] = base[k]; });
    ['sens', 'cap', 'dcf', 'recon', 'direct', 'benchmark'].forEach(function (k) { Object.keys(base[k]).forEach(function (kk) { if (state.model[k][kk] === undefined) state.model[k][kk] = clone(base[k][kk]); }); });
  })();

  render();
})();
