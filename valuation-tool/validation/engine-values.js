// Prints the engine's results for the sample case as JSON (compared against the reference workbook).
const E = require('../src/engine.js');
const S = require('../src/sample.js');
const r = E.runAll(S.sample());
const cat = (c) => r.rent.byCategory[c];
const out = {
  rent_rate_retail: cat('معارض').indicated,
  rent_rate_office: cat('مكاتب').indicated,
  pgi: r.noi.pgi, vacancy: r.noi.vacancyLoss, collection: r.noi.collectionLoss, egi: r.noi.egi, opex: r.noi.opex, noi: r.noi.noi,
  cap_rate: r.cap.selected,
  market_noi: r.direct.marketNoi, lease_adj: r.direct.leaseAdj, direct_value: r.direct.value,
  dcf_pv_cf: r.dcf.pvCF, dcf_exit_noi: r.dcf.exitNOI, dcf_pv_reversion: r.dcf.pvRev, dcf_value: r.dcf.value,
  sales_rate: r.sales.rate, sales_value: r.sales.value,
  final_weighted: r.recon.weighted
};
r.dcf.rows.forEach((y) => { out['dcf_noi_y' + y.year] = y.noi; out['dcf_cf_y' + y.year] = y.cf; });
r.direct.leaseDetail.years.forEach((y) => { out['lease_diff_y' + y.year] = y.diff; });
console.log(JSON.stringify(out, null, 1));
