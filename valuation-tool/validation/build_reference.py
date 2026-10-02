"""
Independent reference model of the sample case, written as a live-formula Excel workbook.

Inputs are typed here by hand from the sample case (already cleaned: Arabic digits, monthly rents,
per-m2 rents are entered as plain numbers). Every calculation is an Excel formula, so the workbook
shares no code with src/engine.js. LibreOffice recalculates it, and compare.py checks the tool
against the recalculated values.

Usage:  python3 validation/build_reference.py  ->  validation/reference-sample.xlsx
"""
from openpyxl import Workbook
from openpyxl.utils import get_column_letter as L
from openpyxl.styles import Font
import os

wb = Workbook()
ws = wb.active
ws.title = "Model"
ws.sheet_view.rightToLeft = True
names = {}          # name -> absolute cell address
row = [1]


def put(name, value, label=None, col=2):
    r = row[0]
    ws.cell(r, 1, label or name)
    c = ws.cell(r, col, value)
    names[name] = f"$%s$%d" % (L(col), r)
    row[0] += 1
    return names[name]


def f(expr):
    """Formula with {name} placeholders."""
    return "=" + expr.format(**names)


def header(text):
    ws.cell(row[0], 1, text).font = Font(bold=True)
    row[0] += 1


# ------------------------------------------------------------------ evidence blocks
def evidence(title, key, rows, value_formula, min_n=5, k=1.5):
    """rows: list of dicts written into columns B.. ; value_formula(r) -> formula for adjusted value."""
    header(title)
    first = row[0]
    for i, rw in enumerate(rows):
        r = row[0]
        ws.cell(r, 1, rw["label"])
        for j, (fld, v) in enumerate(rw["cells"]):
            ws.cell(r, 2 + j, v)
        ws.cell(r, 9, "=" + value_formula(r))
        row[0] += 1
    last = row[0] - 1
    rng = f"$I${first}:$I${last}"
    put(key + "_n", f"=COUNT({rng})")
    put(key + "_q1", f"=_xlfn.QUARTILE.INC({rng},1)")
    put(key + "_q3", f"=_xlfn.QUARTILE.INC({rng},3)")
    put(key + "_lo", f("{%s_q1}-%s*({%s_q3}-{%s_q1})" % (key, k, key, key)))
    put(key + "_hi", f("{%s_q3}+%s*({%s_q3}-{%s_q1})" % (key, k, key, key)))
    # column J: value kept after outlier exclusion (text "" is ignored by MEDIAN)
    for r in range(first, last + 1):
        ws.cell(r, 10, f('IF(AND({%s_n}>=%d,OR($I%d<{%s_lo},$I%d>{%s_hi})),"",$I%d)' % (key, min_n, r, key, r, key, r)))
    return put(key, f"=MEDIAN($J${first}:$J${last})", key + " (median after exclusion)")


# rental comps: B rent, C months-per-year multiplier, D basis(1=total,0=per m2), E area, F adj %
def rent_val(r):
    return f"IF($D{r}=1,$B{r}*$C{r}/$E{r},$B{r}*$C{r})*(1+$F{r}/100)"


retail = [("طريق أنس بن مالك", 170000, 1, 1, 160, -2), ("الأمير سلطان", 9500, 12, 1, 100, -3),
          ("الياسمين", 180000, 1, 1, 170, 3), ("الملك فهد", 1150, 1, 0, None, -8), ("النرجس", 310000, 1, 1, 150, 0)]
office = [("برج الملقا", 84000, 1, 1, 125, -3), ("أعمال الياسمين", 5200, 12, 1, 100, 5),
          ("الملك عبدالعزيز", 700, 1, 0, None, -4), ("الصحافة", 66000, 1, 1, 110, 2)]
mk = lambda xs: [{"label": x[0], "cells": list(zip("rent mult basis area adj".split(), x[1:]))} for x in xs]
evidence("مقارنات إيجار المعارض", "rate_retail", mk(retail), rent_val)
evidence("مقارنات إيجار المكاتب", "rate_office", mk(office), rent_val)


# cap-rate comps: B price, C NOI, D stated %, E adj points
def cap_val(r):
    return f"IF(AND(ISNUMBER($B{r}),$B{r}>0),$C{r}/$B{r}*100,$D{r})+$E{r}"


caps = [("العقيق", 31500000, 2330000, None, 0), ("الياسمين", 24000000, 1850000, None, -0.25),
        ("الملقا", 38000000, 2810000, None, 0), ("الملك فهد", None, None, 7.1, 0.25),
        ("النرجس", 19800000, 1540000, None, 0), ("السليمانية", 12000000, 1290000, None, 0)]
evidence("أدلة معدل الرسملة", "cap", [{"label": c[0], "cells": list(zip("p n s a".split(), c[1:]))} for c in caps], cap_val)


# sales comps: B price, C area, D adj %
def sale_val(r):
    return f"$B{r}/$C{r}*(1+$D{r}/100)"


sales = [("العقيق", 31500000, 4500, 2), ("الياسمين", 24000000, 3600, 5), ("الملقا", 38000000, 5400, 2),
         ("النرجس", 19800000, 2850, -2), ("الملك فهد", 52000000, 4300, -10)]
evidence("المقارنات البيعية", "sale_rate", [{"label": s[0], "cells": list(zip("p a j".split(), s[1:]))} for s in sales], sale_val)

# ------------------------------------------------------------------ assumptions
header("الافتراضات")
put("gla", 3780); put("vac", 0.07); put("coll", 0.02); put("other", 60000)
put("mgmt", 0.05); put("maint_m2", 35); put("fixed_opex", 25000 + 90000 + 120000); put("reserve", 0.02)
put("g2", 0.0); put("g3", 0.025); put("eg", 0.025)
put("disc", 0.0975); put("exit_spread", 0.0025); put("sell", 0.025); put("post_adj", -120000)
put("w_direct", 0.5); put("w_dcf", 0.3); put("w_sales", 0.2)
put("cap_frac", f("{cap}/100"))

units = [  # label, category-rate key, units, area, occupied, contract, lease years, esc, every, void m, leasing m
    ("معارض", "rate_retail", 6, 150, 6, 150000, 4, 0.05, 2, 3, 1),
    ("مكاتب", "rate_office", 24, 120, 20, 72000, 2, 0.0, 1, 4, 1),
]
header("جدول الوحدات")
for i, u in enumerate(units):
    p = "u%d_" % i
    put(p + "n", u[2]); put(p + "occ", u[4]); put(p + "contract", u[5]); put(p + "L", u[6])
    put(p + "esc", u[7]); put(p + "every", u[8]); put(p + "void", u[9]); put(p + "letm", u[10])
    put(p + "mkt", f("{%s}*%d" % (u[1], u[3])), u[0] + " market rent per unit")


# ------------------------------------------------------------------ yearly blocks
def block(tag, years, growth, force_market, with_capex):
    header("سنوات: " + tag)
    top = row[0]
    rows = ["t", "rev", "exp"] + ["pgi%d" % i for i in range(len(units))] + ["void%d" % i for i in range(len(units))] + \
           ["let%d" % i for i in range(len(units))] + ["pgi", "vacl", "colll", "voidl", "oth", "egi", "opex", "noi", "capex", "letc", "cf"]
    at = {k: top + j for j, k in enumerate(rows)}
    for k, rr in at.items():
        ws.cell(rr, 1, tag + ":" + k)
    for t in range(1, years + 1):
        c = L(1 + t)
        cell = lambda k: "%s%d" % (c, at[k])
        prev = lambda k: "%s%d" % (L(t), at[k])
        ws[cell("t")] = t
        if growth:
            ws[cell("rev")] = 1 if t == 1 else f("%s*(1+IF(%d=2,{g2},{g3}))" % (prev("rev"), t))
            ws[cell("exp")] = f("(1+{eg})^(%d-1)" % t)
        else:
            ws[cell("rev")] = 1
            ws[cell("exp")] = 1
        for i in range(len(units)):
            p = "u%d_" % i
            n = units[i][2]
            mkt = "{%smkt}*%s" % (p, cell("rev"))
            if force_market:
                ws[cell("pgi%d" % i)] = f("%d*%s" % (n, mkt))
                ws[cell("void%d" % i)] = 0
                ws[cell("let%d" % i)] = 0
            else:
                contract = "{%scontract}*(1+{%sesc})^INT((%d-1)/{%severy})" % (p, p, t, p)
                ws[cell("pgi%d" % i)] = f("IF(%d<={%sL},{%socc}*%s+(%d-{%socc})*%s,%d*%s)" % (t, p, p, contract, n, p, mkt, n, mkt))
                ws[cell("void%d" % i)] = f("IF(%d={%sL}+1,{%socc}*%s*{%svoid}/12,0)" % (t, p, p, mkt, p))
                ws[cell("let%d" % i)] = f("IF(%d={%sL}+1,{%socc}*%s*{%sletm}/12,0)" % (t, p, p, mkt, p))
        s = lambda k: "+".join(cell(k + str(i)) for i in range(len(units)))
        ws[cell("pgi")] = "=" + s("pgi")
        ws[cell("vacl")] = f("%s*{vac}" % cell("pgi"))
        ws[cell("colll")] = f("(%s-%s)*{coll}" % (cell("pgi"), cell("vacl")))
        ws[cell("voidl")] = "=" + s("void")
        ws[cell("oth")] = f("{other}*%s" % cell("rev"))
        ws[cell("egi")] = "=%s-%s-%s-%s+%s" % (cell("pgi"), cell("vacl"), cell("colll"), cell("voidl"), cell("oth"))
        ws[cell("opex")] = f("({mgmt}+{reserve})*%s+({maint_m2}*{gla}+{fixed_opex})*%s" % (cell("egi"), cell("exp")))
        ws[cell("noi")] = "=%s-%s" % (cell("egi"), cell("opex"))
        ws[cell("capex")] = (450000 if t == 5 else 0) if with_capex else 0
        ws[cell("letc")] = "=" + s("let")
        ws[cell("cf")] = "=%s-%s-%s" % (cell("noi"), cell("capex"), cell("letc"))
    row[0] = top + len(rows) + 1
    return lambda k, t: "$%s$%d" % (L(1 + t), at[k])


dcf = block("DCF", 11, growth=True, force_market=False, with_capex=True)
ng = block("حسب العقود بلا نمو", 6, growth=False, force_market=False, with_capex=False)
mkb = block("سوقي بلا نمو", 6, growth=False, force_market=True, with_capex=False)

# ------------------------------------------------------------------ results
header("النتائج")
put("rent_rate_retail", "={rate_retail}".format(**names)); put("rent_rate_office", "={rate_office}".format(**names))
for k, key in [("pgi", "pgi"), ("vacancy", "vacl"), ("collection", "colll"), ("egi", "egi"), ("opex", "opex"), ("noi", "noi")]:
    put(k, "=" + dcf(key, 1))
put("cap_rate", "={cap}".format(**names))
put("market_noi", "=" + mkb("noi", 1))
H = 5  # last lease (4 years) + reversion year
for t in range(1, H + 2):
    put("lease_diff_y%d" % t, "=%s-%s-%s" % (ng("noi", t), ng("letc", t), mkb("noi", t)))
terms = "+".join(f("{lease_diff_y%d}/(1+{cap_frac})^%d" % (t, t))[1:] for t in range(1, H + 1))
put("lease_adj", "=" + terms + f("+{lease_diff_y6}/{cap_frac}/(1+{cap_frac})^5")[1:])
put("direct_value", f("{market_noi}/{cap_frac}+{lease_adj}+{post_adj}"))
for t in range(1, 11):
    put("dcf_noi_y%d" % t, "=" + dcf("noi", t))
    put("dcf_cf_y%d" % t, "=" + dcf("cf", t))
put("dcf_pv_cf", "=" + "+".join(f("{dcf_cf_y%d}/(1+{disc})^%d" % (t, t))[1:] for t in range(1, 11)))
put("dcf_exit_noi", "=" + dcf("noi", 11))
put("dcf_pv_reversion", f("{dcf_exit_noi}/({cap_frac}+{exit_spread})*(1-{sell})/(1+{disc})^10"))
put("dcf_value", f("{dcf_pv_cf}+{dcf_pv_reversion}"))
put("sales_rate", "={sale_rate}".format(**names))
put("sales_value", f("{sale_rate}*{gla}"))
put("final_weighted", f("{w_direct}*{direct_value}+{w_dcf}*{dcf_value}+{w_sales}*{sales_value}"))

ws.column_dimensions["A"].width = 34
out = os.path.join(os.path.dirname(__file__), "reference-sample.xlsx")
wb.save(out)
with open(out + ".names", "w") as fh:
    for k, v in names.items():
        fh.write("%s\t%s\n" % (k, v))
print("wrote", out, len(names), "named cells")
