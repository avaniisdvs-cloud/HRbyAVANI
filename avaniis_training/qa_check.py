#!/usr/bin/env python3
"""Universal QA validator for all AVANIIS training documents"""
import sys, re, os

def qa(filepath):
    if not os.path.exists(filepath):
        print(f"FILE NOT FOUND: {filepath}"); return False
    with open(filepath) as f: c = f.read()
    fname = os.path.basename(filepath)
    checks = [
        ("10 sections s1-s10",          all(f'id="s{i}"' in c for i in range(1,11))),
        ("3-chain dependency map",       all(x in c for x in ["CHAIN A","CHAIN B","CHAIN C"])),
        ("6+ type/feature cards",        c.count("type-card") >= 6),
        ("2+ swimlane flows",            c.count("sw-head") >= 2),
        ("4+ SVG elements",              c.count("<svg") >= 4),
        ("All SVGs have viewBox",        len(re.findall(r'viewBox="', c)) >= 4),
        ("3 screen mockups A/B/C",       all(f"Mockup {x}" in c for x in ["A","B","C"])),
        ("8 ARIA intelligence cards",    c.count("aria-card") >= 8),
        ("8 ARIA dependency checks",     c.count("aria-checks") >= 8),
        ("4 operational scenarios",      c.count("sc-card") >= 4),
        ("4 troubleshooting cards",      c.count("ts-card") >= 4),
        ("ROLE_MAP JS defined",          "ROLE_MAP" in c),
        ("setRole hides DOM sections",   "style.display" in c),
        ("IntersectionObserver nav",     "IntersectionObserver" in c),
        ("@media print CSS",             "@media print" in c),
        ("@media mobile 640px",          "max-width:640px" in c.replace(" ","")),
        ("Zero CDN dependencies",        "cdnjs" not in c and "jsdelivr" not in c),
        ("No context-stroke",            "context-stroke" not in c),
        ("All SVG tags balanced",        c.count("<svg") == c.count("</svg>")),
        ("All div tags balanced",        c.count("<div") == c.count("</div>")),
        ("No placeholder [TBD] text",    "[TBD]" not in c and "Lorem ipsum" not in c),
        ("Brand navy --n defined",       "--n:#0A1628" in c.replace(" ","")),
        ("Brand gold --g defined",       "--g:#C9A84C" in c.replace(" ","")),
        ("File size > 80KB",             len(c.encode()) > 80000),
        ("File size < 250KB",            len(c.encode()) < 256000),
    ]
    passed = sum(1 for _,v in checks if v)
    total  = len(checks)
    fails  = [l for l,v in checks if not v]
    print(f"\n{'='*55}")
    print(f"  QA REPORT: {fname}")
    print(f"  Score: {passed}/{total} = {round(passed/total*100)}%")
    print(f"{'='*55}")
    for label, val in checks:
        print(f"  {'✅' if val else '❌'}  {label}")
    if fails:
        print(f"\n  FAILURES ({len(fails)}):")
        for f in fails: print(f"    ✗ {f}")
        print("\n  STATUS: NEEDS_REVISION — fix failures and rerun")
        return False
    else:
        print(f"\n  STATUS: ALL PASS — document certified ✓")
        return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 qa_check.py outputs/FILENAME.html")
        sys.exit(1)
    ok = qa(sys.argv[1])
    sys.exit(0 if ok else 1)
