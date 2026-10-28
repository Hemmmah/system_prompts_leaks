"""
Recalculates the reference workbook with LibreOffice and compares every result line with the tool.

Pass criterion (set before running): each line differs by at most 0.01 (one halala for money;
rates are compared the same way in their own units) or 1e-9 relative, whichever is larger.

Usage:  python3 validation/build_reference.py && python3 validation/compare.py
"""
import json, os, subprocess, sys, tempfile
from openpyxl import load_workbook

here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, "reference-sample.xlsx")
names = dict(line.rstrip("\n").split("\t") for line in open(src + ".names"))

tmp = tempfile.mkdtemp()
subprocess.run(["soffice", "--headless", "--calc", "--convert-to", "xlsx", "--outdir", tmp, src],
               check=True, capture_output=True)
ws = load_workbook(os.path.join(tmp, "reference-sample.xlsx"), data_only=True)["Model"]

engine = json.loads(subprocess.run(["node", os.path.join(here, "engine-values.js")], check=True,
                                   capture_output=True, text=True).stdout)

rows, failed = [], 0
for key, tool in engine.items():
    if key not in names:
        rows.append((key, tool, None, None, "لا مقابل في النموذج"))
        continue
    ref = ws[names[key].replace("$", "")].value
    if not isinstance(ref, (int, float)):
        rows.append((key, tool, ref, None, "خطأ في النموذج")); failed += 1; continue
    diff = tool - ref
    ok = abs(diff) <= max(0.01, 1e-9 * abs(ref))
    failed += 0 if ok else 1
    rows.append((key, tool, ref, diff, "مطابق" if ok else "مختلف"))

w = max(len(r[0]) for r in rows)
for key, tool, ref, diff, status in rows:
    fmt = lambda x: "%18.4f" % x if isinstance(x, (int, float)) else "%18s" % x
    print("%-*s %s %s %s  %s" % (w, key, fmt(tool), fmt(ref), fmt(diff) if diff is not None else " " * 18, status))
compared = sum(1 for r in rows if r[3] is not None)
print("\nقورن %d بنداً؛ مختلف: %d" % (compared, failed))
sys.exit(1 if failed else 0)
